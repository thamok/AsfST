/**
 * Apex Abstraction Layer
 * 
 * Converts parsed AST into an AI-friendly abstract representation that:
 * 1. Condenses code by removing method bodies and boilerplate
 * 2. Enriches with schema information (field types, validation rules)
 * 3. Tracks "touches" - what SObjects/fields each method reads/writes
 * 4. Provides constraint information (validation rules, required fields)
 * 5. Estimates token count for LLM context budgeting
 * 
 * The output format is designed to be easily "stepped through" by AI models.
 */

import { schemaRegistry } from './schema-registry.js';
import { parseCode, parseFile } from './parser.js';
import { getComplexityRating } from './complexity.js';
import { SymbolTable } from './symbol-table.js';

/**
 * Approximate tokens per character for estimation
 * GPT models average ~4 chars per token for code
 */
const CHARS_PER_TOKEN = 4;

/**
 * Create an abstract representation of an Apex file
 * @param {Object} parsedResult - Result from parser
 * @param {Object} options - Abstraction options
 * @returns {Object} Abstract representation
 */
async function createAbstraction(parsedResult, options = {}) {
  const {
    includeMethodBodies = false,
    maxMethodBodyLines = 10,
    resolveSchema = true,
    includeValidationRules = true,
    targetMethod = null, // Focus on specific method
    contextDepth = 2,    // How deep to trace dependencies
    resolveSymbols = true, // Resolve types via symbol table
  } = options;

  // Load schema if needed
  if (resolveSchema) {
    await schemaRegistry.loadFromCache();
  }

  // Build symbol table for type resolution
  const symbolTable = new SymbolTable(parsedResult);
  if (resolveSymbols) {
    symbolTable.buildFromParsedResult();
  }

  const abstraction = {
    // Metadata
    meta: {
      file: parsedResult.file || 'unknown',
      type: parsedResult.type,
      name: parsedResult.name,
      generatedAt: new Date().toISOString(),
    },
    
    // Class signature
    signature: buildSignature(parsedResult),
    
    // Condensed methods with touches
    methods: buildMethodAbstractions(parsedResult, {
      includeMethodBodies,
      maxMethodBodyLines,
      resolveSchema,
      targetMethod,
      symbolTable,
    }),
    
    // Condensed constructors
    constructors: buildConstructorAbstractions(parsedResult),
    
    // Fields and properties
    state: buildStateAbstraction(parsedResult),
    
    // All SObjects touched by this class
    touches: aggregateTouches(parsedResult, resolveSchema, symbolTable),
    
    // Constraints from validation rules
    constraints: includeValidationRules ? 
      await buildConstraints(parsedResult, resolveSchema) : [],
    
    // Inner types
    innerTypes: buildInnerTypeAbstractions(parsedResult),
    
    // Complexity summary
    complexity: {
      total: parsedResult.complexity,
      rating: getComplexityRating(parsedResult.complexity),
      hotspots: findComplexityHotspots(parsedResult),
    },
    
    // Symbol table info for debugging/inspection
    symbols: resolveSymbols ? symbolTable.getTypeSummary() : null,
    
    // Token estimation
    tokens: null, // Calculated after serialization
  };

  return abstraction;
}

/**
 * Build the class/interface/trigger signature
 */
function buildSignature(parsed) {
  const sig = {
    modifiers: parsed.modifiers || [],
    annotations: (parsed.annotations || []).map(a => a.name),
  };

  if (parsed.extends) {
    sig.extends = parsed.extends;
  }

  if (parsed.implements?.length > 0) {
    sig.implements = parsed.implements;
  }

  // Trigger-specific
  if (parsed.type === 'trigger') {
    sig.object = parsed.object;
    sig.events = parsed.events;
  }

  return sig;
}

/**
 * Build method abstractions with touches
 */
function buildMethodAbstractions(parsed, options) {
  const methods = [];
  
  for (const method of (parsed.methods || [])) {
    // Skip if targeting specific method
    if (options.targetMethod && method.name !== options.targetMethod) {
      continue;
    }

    const abstraction = {
      name: method.name,
      signature: buildMethodSignature(method),
      complexity: {
        score: method.complexity,
        rating: getComplexityRating(method.complexity).level,
      },
      touches: buildMethodTouches(method, options.resolveSchema, options.symbolTable),
    };

    // Add annotations if present
    if (method.annotations?.length > 0) {
      abstraction.annotations = method.annotations.map(a => a.name);
    }

    // Optionally include condensed body
    if (options.includeMethodBodies && method.body) {
      abstraction.bodyPreview = condenseMethodBody(method.body, options.maxMethodBodyLines);
    }

    methods.push(abstraction);
  }

  return methods;
}

/**
 * Build a human-readable method signature
 */
function buildMethodSignature(method) {
  const modifiers = method.modifiers?.join(' ') || '';
  const returnType = method.returnType || 'void';
  const params = (method.parameters || [])
    .map(p => `${p.type} ${p.name}`)
    .join(', ');
  
  return `${modifiers} ${returnType} ${method.name}(${params})`.trim();
}

/**
 * Build touches for a method - what SObjects/fields it reads/writes
 */
function buildMethodTouches(method, resolveSchema, symbolTable) {
  const touches = {
    reads: [],   // SOQL queries
    writes: [],  // DML operations
    fields: new Set(),
    objects: new Set(),
  };

  // Process SOQL queries (reads)
  for (const query of (method.soql || [])) {
    const read = {
      object: query.object,
      fields: query.fields?.filter(f => typeof f === 'string') || [],
      line: query.line,
    };

    // Add subqueries
    const subqueries = query.fields?.filter(f => typeof f === 'object' && f.subquery) || [];
    if (subqueries.length > 0) {
      read.subqueries = subqueries.map(s => s.subquery);
    }

    touches.reads.push(read);
    touches.objects.add(query.object);
    read.fields.forEach(f => touches.fields.add(`${query.object}.${f}`));

    // Enrich with schema if available
    if (resolveSchema && query.object) {
      const schema = schemaRegistry.getObject(query.object);
      if (schema) {
        read.schemaInfo = {
          label: schema.label,
          isStandard: schema.isStandard || false,
        };
        
        // Add field type information
        read.fieldTypes = {};
        for (const field of read.fields) {
          const fieldInfo = schemaRegistry.getField(query.object, field);
          if (fieldInfo) {
            read.fieldTypes[field] = {
              type: fieldInfo.type,
              required: fieldInfo.required,
              description: fieldInfo.description,
            };
          }
        }
      }
    }
  }

  // Process DML operations (writes)
  for (const dml of (method.dml || [])) {
    const write = {
      operation: dml.type,
      target: dml.target,
      line: dml.line,
    };

    // Try to resolve the target type via symbol table
    let inferredObject = null;
    if (symbolTable) {
      const symbol = symbolTable.resolveSymbol(dml.target);
      if (symbol && symbol.type) {
        inferredObject = symbolTable.extractBaseType(symbol.type);
        write.resolved = symbol;
      }
      
      // If not resolved, try pattern-based inference from SOQL queries
      if (!inferredObject && method.soql) {
        for (const query of method.soql) {
          const targetLower = dml.target.toLowerCase();
          const objectLower = query.object.toLowerCase();
          
          // Check naming patterns
          if (targetLower.includes(objectLower) || 
              targetLower.includes('to' + objectLower) ||
              (objectLower === 'account' && targetLower.includes('accounts'))) {
            inferredObject = query.object;
            write.inferredPattern = true;
            break;
          }
        }
      }
    }
    
    // Fallback to pattern-based inference
    if (!inferredObject) {
      inferredObject = inferObjectFromTarget(dml.target);
    }
    
    if (inferredObject) {
      write.object = inferredObject;
      touches.objects.add(inferredObject);
      
      // Enrich with schema info
      if (resolveSchema) {
        const schema = schemaRegistry.getObject(inferredObject);
        if (schema) {
          write.schemaInfo = {
            label: schema.label,
            isStandard: schema.isStandard || false,
          };
        }
      }
    }

    touches.writes.push(write);
  }

  // Convert sets to arrays
  touches.fields = Array.from(touches.fields);
  touches.objects = Array.from(touches.objects);

  return touches;
}

/**
 * Try to infer SObject type from a variable name
 */
function inferObjectFromTarget(target) {
  if (!target) return null;
  
  // Common patterns: accounts, accountList, accList, lstAccount
  const patterns = [
    /^([A-Z][a-z]+)s$/,           // "Accounts" -> "Account"
    /^([a-z]+)List$/i,            // "accountList" -> "account"
    /^lst([A-Z][a-z]+)/,          // "lstAccount" -> "Account"
    /^([A-Z][a-z]+)Records$/,     // "AccountRecords" -> "Account"
    /^new\s+([A-Z][a-z]+)/,       // "new Account" -> "Account"
  ];

  for (const pattern of patterns) {
    const match = target.match(pattern);
    if (match) {
      const name = match[1];
      // Capitalize first letter
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }

  return null;
}

/**
 * Build constructor abstractions
 */
function buildConstructorAbstractions(parsed) {
  return (parsed.constructors || []).map(ctor => ({
    signature: buildConstructorSignature(ctor, parsed.name),
    complexity: ctor.complexity,
    touches: buildMethodTouches(ctor, false),
  }));
}

/**
 * Build constructor signature
 */
function buildConstructorSignature(ctor, className) {
  const modifiers = ctor.modifiers?.join(' ') || '';
  const params = (ctor.parameters || [])
    .map(p => `${p.type} ${p.name}`)
    .join(', ');
  
  return `${modifiers} ${className}(${params})`.trim();
}

/**
 * Build state abstraction (fields and properties)
 */
function buildStateAbstraction(parsed) {
  const state = {
    fields: [],
    properties: [],
  };

  for (const field of (parsed.fields || [])) {
    state.fields.push({
      name: field.name,
      type: field.type,
      modifiers: field.modifiers,
      initialValue: field.initialValue ? '(initialized)' : null,
    });
  }

  for (const prop of (parsed.properties || [])) {
    state.properties.push({
      name: prop.name,
      type: prop.type,
      modifiers: prop.modifiers,
      accessors: {
        get: prop.getter,
        set: prop.setter,
      },
    });
  }

  return state;
}

/**
 * Aggregate all touches across the entire class
 */
function aggregateTouches(parsed, resolveSchema, symbolTable) {
  const allObjects = new Set();
  const allFields = new Set();
  const operations = {
    queries: [],
    dml: [],
  };

  // From methods
  for (const method of (parsed.methods || [])) {
    for (const query of (method.soql || [])) {
      allObjects.add(query.object);
      (query.fields || []).forEach(f => {
        if (typeof f === 'string') {
          allFields.add(`${query.object}.${f}`);
        }
      });
      operations.queries.push({
        method: method.name,
        object: query.object,
        line: query.line,
      });
    }
    
    for (const dml of (method.dml || [])) {
      let inferredObject = null;
      
      // Try symbol table resolution first
      if (symbolTable) {
        const resolved = symbolTable.resolveFieldAccess(dml.target);
        if (resolved && resolved.baseType) {
          inferredObject = resolved.baseType;
        }
      }
      
      // Fallback to pattern-based
      if (!inferredObject) {
        inferredObject = inferObjectFromTarget(dml.target);
      }
      
      operations.dml.push({
        method: method.name,
        operation: dml.type,
        target: dml.target,
        object: inferredObject,
        line: dml.line,
      });
      
      if (inferredObject) {
        allObjects.add(inferredObject);
      }
    }
  }

  // From constructors
  for (const ctor of (parsed.constructors || [])) {
    for (const query of (ctor.soql || [])) {
      allObjects.add(query.object);
    }
    for (const dml of (ctor.dml || [])) {
      operations.dml.push({
        method: '(constructor)',
        operation: dml.type,
        target: dml.target,
        line: dml.line,
      });
    }
  }

  // From trigger body
  if (parsed.type === 'trigger') {
    allObjects.add(parsed.object);
    for (const query of (parsed.soql || [])) {
      allObjects.add(query.object);
    }
  }

  const result = {
    objects: Array.from(allObjects).filter(Boolean),
    fields: Array.from(allFields),
    operations,
  };

  // Enrich with schema summaries
  if (resolveSchema) {
    result.objectSchemas = {};
    for (const objName of result.objects) {
      const schema = schemaRegistry.getObject(objName);
      if (schema) {
        result.objectSchemas[objName] = {
          label: schema.label,
          isStandard: schema.isStandard || false,
          fieldCount: schema.fields?.size || 0,
          hasValidationRules: (schema.validationRules?.length || 0) > 0,
          availableFields: Array.from(schema.fields?.keys() || []),
        };
      }
    }
  }

  return result;
}

/**
 * Build constraints from validation rules
 */
async function buildConstraints(parsed, resolveSchema) {
  if (!resolveSchema) return [];

  const constraints = [];
  const touches = aggregateTouches(parsed, false);

  for (const objName of touches.objects) {
    const rules = schemaRegistry.getValidationRules(objName);
    for (const rule of rules) {
      if (rule.active) {
        constraints.push({
          object: objName,
          rule: rule.name,
          errorMessage: rule.errorMessage,
          condition: rule.errorConditionFormula?.substring(0, 200), // Truncate long formulas
        });
      }
    }
  }

  return constraints;
}

/**
 * Build inner type abstractions
 */
function buildInnerTypeAbstractions(parsed) {
  return (parsed.innerClasses || []).map(inner => ({
    name: inner.name,
    type: inner.type,
    modifiers: inner.modifiers,
    values: inner.values, // For enums
    fieldCount: inner.fields?.length || 0,
    methodCount: inner.methods?.length || 0,
  }));
}

/**
 * Find complexity hotspots (methods with high complexity)
 */
function findComplexityHotspots(parsed) {
  const hotspots = [];

  for (const method of (parsed.methods || [])) {
    if (method.complexity > 10) {
      hotspots.push({
        name: method.name,
        complexity: method.complexity,
        rating: getComplexityRating(method.complexity).level,
        line: method.line,
      });
    }
  }

  return hotspots.sort((a, b) => b.complexity - a.complexity);
}

/**
 * Condense a method body to key lines
 */
function condenseMethodBody(body, maxLines) {
  if (!body) return null;
  
  const lines = body.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('//') && !l.startsWith('*'));
  
  if (lines.length <= maxLines) {
    return lines.join('\n');
  }

  // Take first few and last few lines
  const half = Math.floor(maxLines / 2);
  const first = lines.slice(0, half);
  const last = lines.slice(-half);
  
  return [...first, '  // ... truncated ...', ...last].join('\n');
}

/**
 * Estimate token count for the abstraction
 */
function estimateTokens(abstraction) {
  const json = JSON.stringify(abstraction);
  return Math.ceil(json.length / CHARS_PER_TOKEN);
}

/**
 * Format abstraction as LLM-friendly YAML-like text
 */
function formatForLLM(abstraction) {
  const lines = [];
  const { meta, signature, methods, state, touches, constraints, complexity } = abstraction;

  // Header
  lines.push(`# ${meta.type}: ${meta.name}`);
  lines.push(`# File: ${meta.file}`);
  lines.push('');

  // Signature
  lines.push('## Signature');
  if (signature.modifiers?.length > 0) {
    lines.push(`Modifiers: ${signature.modifiers.join(', ')}`);
  }
  if (signature.annotations?.length > 0) {
    lines.push(`Annotations: ${signature.annotations.map(a => '@' + a).join(', ')}`);
  }
  if (signature.extends) {
    lines.push(`Extends: ${signature.extends}`);
  }
  if (signature.implements?.length > 0) {
    lines.push(`Implements: ${signature.implements.join(', ')}`);
  }
  if (signature.object) {
    lines.push(`Trigger On: ${signature.object}`);
    lines.push(`Events: ${signature.events?.join(', ')}`);
  }
  lines.push('');

  // State
  if (state.fields?.length > 0 || state.properties?.length > 0) {
    lines.push('## State');
    for (const field of (state.fields || [])) {
      const mods = field.modifiers?.join(' ') || '';
      lines.push(`  - ${mods} ${field.type} ${field.name}`.trim());
    }
    for (const prop of (state.properties || [])) {
      const accessors = [];
      if (prop.accessors?.get) accessors.push('get');
      if (prop.accessors?.set) accessors.push('set');
      lines.push(`  - ${prop.type} ${prop.name} { ${accessors.join('; ')} }`);
    }
    lines.push('');
  }

   // Methods
   if (methods?.length > 0) {
     lines.push('## Methods');
     for (const method of methods) {
       lines.push(`### ${method.name}`);
       lines.push(`Signature: ${method.signature}`);
       lines.push(`Complexity: ${method.complexity.score} (${method.complexity.rating})`);
       
       if (method.annotations?.length > 0) {
         lines.push(`Annotations: ${method.annotations.map(a => '@' + a).join(', ')}`);
       }

       // Touches - now with enriched type information
       if (method.touches.reads?.length > 0) {
         lines.push('Reads:');
         for (const read of method.touches.reads) {
           let readLine = `  - ${read.object}`;
           
           // Add field types if available
           if (read.fieldTypes && Object.keys(read.fieldTypes).length > 0) {
             const fieldInfo = read.fields.map(f => {
               const ftype = read.fieldTypes[f];
               if (ftype) {
                 return `${f} (${ftype.type}${ftype.required ? ', required' : ''})`;
               }
               return f;
             });
             readLine += `: [${fieldInfo.join(', ')}]`;
           } else {
             readLine += `: [${read.fields.join(', ')}]`;
           }
           
           lines.push(readLine);
         }
       }
       if (method.touches.writes?.length > 0) {
         lines.push('Writes:');
         for (const write of method.touches.writes) {
           let writeLine = `  - ${write.operation}`;
           if (write.object) {
             writeLine += ` ${write.target} (${write.object})`;
           } else {
             writeLine += ` ${write.target}`;
           }
           lines.push(writeLine);
         }
       }
       lines.push('');
     }
   }

   // Object Touches Summary
   if (touches.objects?.length > 0) {
     lines.push('## Objects Touched');
     for (const obj of touches.objects) {
       const schema = touches.objectSchemas?.[obj];
       if (schema) {
         let objLine = `  - ${obj} (${schema.label}, ${schema.isStandard ? 'Standard' : 'Custom'})`;
         if (schema.availableFields?.length > 0) {
           const fieldPreview = schema.availableFields.slice(0, 5).join(', ');
           const more = schema.availableFields.length > 5 ? `, +${schema.availableFields.length - 5} more` : '';
           objLine += `\n    Fields: ${fieldPreview}${more}`;
         }
         lines.push(objLine);
       } else {
         lines.push(`  - ${obj}`);
       }
     }
     lines.push('');
   }

  // Constraints
  if (constraints?.length > 0) {
    lines.push('## Constraints (Validation Rules)');
    for (const constraint of constraints) {
      lines.push(`  - ${constraint.object}.${constraint.rule}: "${constraint.errorMessage}"`);
    }
    lines.push('');
  }

  // Complexity Summary
  lines.push('## Complexity');
  lines.push(`Total: ${complexity.total} (${complexity.rating.level})`);
  if (complexity.hotspots?.length > 0) {
    lines.push('Hotspots:');
    for (const hotspot of complexity.hotspots) {
      lines.push(`  - ${hotspot.name} (line ${hotspot.line}): ${hotspot.complexity}`);
    }
  }

  return lines.join('\n');
}

/**
 * Create abstraction from file path
 */
async function abstractFile(filePath, options = {}) {
  const parsed = await parseFile(filePath);
  const abstraction = await createAbstraction(parsed, options);
  abstraction.tokens = estimateTokens(abstraction);
  return abstraction;
}

/**
 * Create abstraction from code string
 */
async function abstractCode(code, options = {}) {
  const parsed = parseCode(code, options);
  const abstraction = await createAbstraction(parsed, options);
  abstraction.tokens = estimateTokens(abstraction);
  return abstraction;
}

export {
  createAbstraction,
  abstractFile,
  abstractCode,
  formatForLLM,
  estimateTokens,
};

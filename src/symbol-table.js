/**
 * Symbol Table Module
 * 
 * Builds and maintains a symbol table during AST traversal to:
 * 1. Track variable declarations and their types
 * 2. Resolve identifier references to their type definitions
 * 3. Build method parameter contexts for type inference
 * 4. Track scope chain for local vs class-level variables
 */

class SymbolTable {
  constructor(parsedResult) {
    this.parsedResult = parsedResult;
    this.scopes = [new Map()]; // Stack of scopes
    this.classScope = new Map(); // Class-level declarations
    this.methodScopes = new Map(); // Per-method local scopes
    this.typeResolutions = new Map(); // Cache of resolved types
    this.resolvedFields = new Map(); // Track field accesses with resolved types
  }

  /**
   * Get the current scope (top of stack)
   */
  currentScope() {
    return this.scopes[this.scopes.length - 1];
  }

  /**
   * Push a new scope (entering a block/method)
   */
  pushScope() {
    this.scopes.push(new Map());
  }

  /**
   * Pop a scope (exiting a block/method)
   */
  popScope() {
    if (this.scopes.length > 1) {
      this.scopes.pop();
    }
  }

  /**
   * Add a symbol to the current scope
   */
  addSymbol(name, type, metadata = {}) {
    this.currentScope().set(name, {
      name,
      type,
      ...metadata,
    });
  }

  /**
   * Resolve a symbol by name, walking up the scope chain
   */
  resolveSymbol(name) {
    // Walk from current scope up to class scope
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) {
        return this.scopes[i].get(name);
      }
    }

    // Check class-level symbols (fields, methods)
    if (this.classScope.has(name)) {
      return this.classScope.get(name);
    }

    return null;
  }

  /**
   * Add a class-level field symbol
   */
  addField(field) {
    this.classScope.set(field.name, {
      name: field.name,
      type: field.type,
      modifiers: field.modifiers,
      kind: 'field',
    });
  }

  /**
   * Add a class-level method symbol
   */
  addMethod(method) {
    this.classScope.set(method.name, {
      name: method.name,
      type: method.returnType,
      returnType: method.returnType,
      parameters: method.parameters || [],
      modifiers: method.modifiers,
      kind: 'method',
    });
  }

  /**
   * Create a method local scope with parameters
   */
  createMethodScope(method) {
    const scopeName = method.name;
    const methodScope = new Map();

    // Add parameters to the method scope
    if (method.parameters) {
      for (const param of method.parameters) {
        methodScope.set(param.name, {
          name: param.name,
          type: param.type,
          kind: 'parameter',
        });
      }
    }

    this.methodScopes.set(scopeName, methodScope);
    return methodScope;
  }

  /**
   * Extract base type from type string (handles generics, arrays)
   * E.g., "List<Account>" -> "Account", "Account[]" -> "Account"
   */
  extractBaseType(typeStr) {
    if (!typeStr) return null;

    // Remove array notation
    let base = typeStr.replace(/\[\]$/, '');

    // Extract from generic: List<Account> -> Account
    const match = base.match(/^[A-Za-z.]+<([A-Za-z0-9_]+)>$/);
    if (match) {
      return match[1];
    }

    // Return the type as-is if no generic
    return base;
  }

  /**
   * Resolve the type of a SOQL query result (the object being queried)
   */
  resolveSOQLType(soqlQuery) {
    if (soqlQuery.object) {
      return soqlQuery.object; // Account, Contact, etc.
    }
    return null;
  }

  /**
   * Track a field access and resolve its object type
   * @param {string} fieldPath - e.g., "acc.Industry" or just "Industry"
   * @param {Object} context - current method or block context
   * @returns {Object} - { object, field, type }
   */
  resolveFieldAccess(fieldPath, context = null) {
    if (!fieldPath) return null;

    // Check if it's already cached
    const cacheKey = `${fieldPath}:${context}`;
    if (this.resolvedFields.has(cacheKey)) {
      return this.resolvedFields.get(cacheKey);
    }

    const parts = fieldPath.split('.');
    let resolution = null;

    if (parts.length === 1) {
      // Just a field name - try to infer from context
      resolution = this._inferFieldType(parts[0], context);
    } else if (parts.length === 2) {
      // Variable.field pattern: acc.Industry
      const varName = parts[0];
      const fieldName = parts[1];
      const symbol = this.resolveSymbol(varName);

      if (symbol) {
        const baseType = this.extractBaseType(symbol.type);
        resolution = {
          variable: varName,
          variableType: symbol.type,
          baseType,
          field: fieldName,
          path: fieldPath,
        };
      }
    } else {
      // Nested: acc.Parent.Industry
      // Start with first part
      const varName = parts[0];
      const symbol = this.resolveSymbol(varName);
      if (symbol) {
        resolution = {
          variable: varName,
          variableType: symbol.type,
          baseType: this.extractBaseType(symbol.type),
          nestedPath: parts.slice(1).join('.'),
          path: fieldPath,
        };
      }
    }

    if (resolution) {
      this.resolvedFields.set(cacheKey, resolution);
    }

    return resolution;
  }

  /**
   * Infer field type from local context
   */
  _inferFieldType(fieldName, context) {
    // This would be populated by type inference from SOQL queries, etc.
    // For now, return null - can be enhanced with flow-sensitive analysis
    return null;
  }

  /**
   * Build the symbol table from parsed result
   */
  buildFromParsedResult() {
    // Add all fields
    if (this.parsedResult.fields) {
      for (const field of this.parsedResult.fields) {
        this.addField(field);
      }
    }

    // Add all methods
    if (this.parsedResult.methods) {
      for (const method of this.parsedResult.methods) {
        this.addMethod(method);
      }
    }

    // Add constructors as callable
    if (this.parsedResult.constructors) {
      for (const ctor of this.parsedResult.constructors) {
        this.classScope.set('ctor', {
          name: this.parsedResult.name || 'Constructor',
          returnType: this.parsedResult.name,
          parameters: ctor.parameters || [],
          kind: 'constructor',
        });
      }
    }
  }

  /**
   * Analyze method touches and resolve types
   */
  analyzeMethodTypes(method) {
    const typeInfo = {
      methodName: method.name,
      parameters: method.parameters || [],
      localVariables: [],
      resolvedAccesses: [],
    };

    // Create local scope for this method
    const methodScope = this.createMethodScope(method);

    // Track SOQL queries and their result types - infer variable assignments
    const soqlResultTypes = new Map();
    if (method.soql) {
      for (const query of method.soql) {
        // SOQL queries typically assign to a variable
        // Track that the variable has type matching the query object
        const objectType = query.object;
        typeInfo.queryTypes = typeInfo.queryTypes || [];
        typeInfo.queryTypes.push({
          object: objectType,
          fields: query.fields || [],
        });
        
        // Store query result type for later DML inference
        soqlResultTypes.set(objectType, `List<${objectType}>`);
      }
    }

    // Track DML operations and what they operate on
    if (method.dml) {
      for (const dml of method.dml) {
        let resolved = this.resolveFieldAccess(dml.target);
        
        // If not resolved, try to infer from SOQL patterns
        if (!resolved && dml.target) {
          // Common pattern: toDelete or similar variable names
          // Check if there was a SOQL query targeting the right object
          for (const query of method.soql || []) {
            const targetLower = dml.target.toLowerCase();
            const objectLower = query.object.toLowerCase();
            
            // Check for naming patterns
            if (targetLower.includes(objectLower) || 
                targetLower.includes('to' + objectLower) ||
                (objectLower === 'account' && targetLower.includes('accounts'))) {
              resolved = {
                inferred: true,
                pattern: 'soql_result',
                baseType: query.object,
                variableType: `List<${query.object}>`,
              };
              break;
            }
          }
        }
        
        typeInfo.dmlOperations = typeInfo.dmlOperations || [];
        typeInfo.dmlOperations.push({
          operation: dml.type,
          target: dml.target,
          resolved,
        });
      }
    }

    return typeInfo;
  }

  /**
   * Get all resolved field accesses for a method
   */
  getFieldAccessesForMethod(methodName) {
    const accesses = [];
    for (const [key, value] of this.resolvedFields) {
      if (key.includes(methodName)) {
        accesses.push(value);
      }
    }
    return accesses;
  }

  /**
   * Build a type summary for LLM context
   */
  getTypeSummary() {
    return {
      classFields: Array.from(this.classScope.values())
        .filter(s => s.kind === 'field'),
      classMethods: Array.from(this.classScope.values())
        .filter(s => s.kind === 'method'),
      resolvedFieldAccesses: Array.from(this.resolvedFields.values()),
    };
  }
}

export { SymbolTable };

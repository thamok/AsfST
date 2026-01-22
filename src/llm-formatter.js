/**
 * LLM Context Formatter
 * 
 * Formats abstracted Apex code into optimized representations for LLM consumption:
 * 1. Semantic format - focuses on what the code does semantically
 * 2. Constraint format - emphasizes data model constraints and validations
 * 3. Impact format - shows blast radius and dependencies
 */

import { TypeResolver } from './type-resolver.js';
import { schemaRegistry } from './schema-registry.js';

/**
 * Format abstraction as semantic context for AI understanding
 * Focuses on "intent" rather than mechanics
 */
function formatAsSemanticContext(abstraction) {
  const lines = [];
  const { meta, signature, methods, state, touches, symbols } = abstraction;

  // Header
  lines.push(`# Semantic Analysis: ${meta.name}`);
  lines.push(`Type: ${meta.type} | File: ${meta.file}`);
  lines.push('');

  // Class purpose/intent
  lines.push('## What this class does');
  lines.push(buildClassPurpose(meta, methods, touches));
  lines.push('');

  // Data model accessed
  lines.push('## Data Model');
  if (touches.objects?.length > 0) {
    lines.push('Objects accessed:');
    for (const obj of touches.objects) {
      const schema = touches.objectSchemas?.[obj];
      lines.push(`  - ${obj}: ${schema?.label || '(unknown)'}`);
    }
  }
  lines.push('');

  // Operations performed
  lines.push('## Operations');
  if (touches.operations?.queries?.length > 0) {
    lines.push('Queries:');
    for (const q of touches.operations.queries) {
      lines.push(`  - In ${q.method}: read ${q.object}`);
    }
  }
  if (touches.operations?.dml?.length > 0) {
    lines.push('Mutations:');
    for (const d of touches.operations.dml) {
      lines.push(`  - In ${d.method}: ${d.operation} ${d.object || d.target}`);
    }
  }
  lines.push('');

  // Method breakdown
  lines.push('## Methods');
  for (const method of methods) {
    lines.push(`### ${method.name}()`);
    lines.push(`Complexity: ${method.complexity.score} (${method.complexity.rating})`);
    
    if (method.touches.objects?.length > 0) {
      lines.push(`Touches: ${method.touches.objects.join(', ')}`);
    }
    if (method.touches.reads?.length > 0) {
      lines.push(`Queries: ${method.touches.reads.length}`);
    }
    if (method.touches.writes?.length > 0) {
      lines.push(`DML operations: ${method.touches.writes.length}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format as constraint-focused context
 * Emphasizes what fields are accessed and their constraints
 */
function formatAsConstraintContext(abstraction, typeResolver) {
  const lines = [];
  const { meta, methods, touches } = abstraction;

  lines.push(`# Constraint Model: ${meta.name}`);
  lines.push('');

  // Object schemas with field details
  if (touches.objects?.length > 0) {
    lines.push('## SObjects');
    for (const obj of touches.objects) {
      const schema = touches.objectSchemas?.[obj];
      if (schema) {
        lines.push(`### ${obj}`);
        lines.push(`  Standard: ${schema.isStandard ? 'Yes' : 'No'}`);
        lines.push(`  Fields available: ${schema.fieldCount}`);
        
        // Show field types accessed in this object
        const fieldsAccessed = abstraction.methods
          .flatMap(m => m.touches.reads || [])
          .filter(r => r.object === obj)
          .flatMap(r => r.fields || []);
        
        if (fieldsAccessed.length > 0) {
          lines.push(`  Fields used:`);
          for (const field of fieldsAccessed) {
            const fieldInfo = schemaRegistry.getField(obj, field);
            if (fieldInfo) {
              lines.push(`    - ${field}: ${fieldInfo.type}${fieldInfo.required ? ' (required)' : ''}`);
            } else {
              lines.push(`    - ${field}: ?`);
            }
          }
        }
        lines.push('');
      }
    }
  }

  // Validation rules that might be triggered
  if (touches.operations?.dml?.length > 0) {
    lines.push('## Validation Rules');
    lines.push('Potential validation triggers on mutations:');
    for (const dml of touches.operations.dml) {
      if (dml.object) {
        const rules = schemaRegistry.getValidationRules(dml.object);
        if (rules.length > 0) {
          lines.push(`  ${dml.object} (on ${dml.operation}):`);
          for (const rule of rules) {
            if (rule.active) {
              lines.push(`    - ${rule.name}: "${rule.errorMessage}"`);
            }
          }
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format as impact analysis
 * Shows what could be affected by changes to this code
 */
function formatAsImpactContext(abstraction) {
  const lines = [];
  const { meta, touches, complexity } = abstraction;

  lines.push(`# Impact Analysis: ${meta.name}`);
  lines.push('');

  lines.push('## Risk Assessment');
  lines.push(`Complexity: ${complexity.rating.level}`);
  lines.push(`Total cyclomatic: ${complexity.total}`);
  lines.push('');

  if (complexity.hotspots?.length > 0) {
    lines.push('High complexity methods:');
    for (const spot of complexity.hotspots) {
      lines.push(`  - ${spot.name} (line ${spot.line}): ${spot.complexity}`);
    }
    lines.push('');
  }

  lines.push('## Data Affected');
  for (const obj of touches.objects || []) {
    const schema = touches.objectSchemas?.[obj];
    const isModified = (touches.operations?.dml || []).some(d => d.object === obj);
    
    const status = isModified ? 'MODIFIED' : 'READ';
    lines.push(`  ${status}: ${obj} (${schema?.label || '?'})`);
  }
  lines.push('');

  lines.push('## Operations');
  if (touches.operations?.queries?.length > 0) {
    lines.push(`SOQL Queries: ${touches.operations.queries.length}`);
  }
  if (touches.operations?.dml?.length > 0) {
    lines.push(`DML Operations: ${touches.operations.dml.length}`);
    for (const op of ['insert', 'update', 'delete', 'upsert']) {
      const count = touches.operations.dml.filter(d => d.operation === op).length;
      if (count > 0) {
        lines.push(`  - ${op}: ${count}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Build a natural language description of what the class does
 */
function buildClassPurpose(meta, methods, touches) {
  const parts = [];

  // Based on methods
  if (methods.length > 0) {
    const queryCount = methods.filter(m => m.touches.reads?.length > 0).length;
    const mutateCount = methods.filter(m => m.touches.writes?.length > 0).length;

    if (queryCount > 0) {
      parts.push(`retrieves data from ${touches.objects?.join(', ') || 'Salesforce'}`);
    }
    if (mutateCount > 0) {
      parts.push(`modifies records in ${touches.objects?.join(', ') || 'Salesforce'}`);
    }
  }

  if (parts.length === 0) {
    parts.push('provides functionality related to ' + (touches.objects?.[0] || 'data management'));
  }

  return `This ${meta.type} ${parts.join(' and ')}.`;
}

export {
  formatAsSemanticContext,
  formatAsConstraintContext,
  formatAsImpactContext,
};

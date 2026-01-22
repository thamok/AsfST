/**
 * Type Resolver Module
 * 
 * Advanced type resolution for:
 * 1. Method call chains (e.g., database.query() returns List<SObject>)
 * 2. Variable assignments and their inferred types
 * 3. Flow-sensitive type tracking within methods
 * 4. SOQL result type inference
 * 5. Generic type instantiation
 */

class TypeResolver {
  constructor(symbolTable, schemaRegistry) {
    this.symbolTable = symbolTable;
    this.schemaRegistry = schemaRegistry;
    this.typeInferences = new Map(); // Variable -> inferred type
    this.methodReturnTypes = new Map(); // Method signature -> return type
    this.flowTypes = new Map(); // Line-specific type info
  }

  /**
   * Resolve type of a method call expression
   * E.g., Database.insert(accounts) -> Database method returns List<SaveResult>
   */
  resolveMethodCallType(methodName, targetType, args = []) {
    // Standard Salesforce method returns
    const standardMethods = {
      'Database.insert': 'List<Database.SaveResult>',
      'Database.update': 'List<Database.SaveResult>',
      'Database.delete': 'List<Database.DeleteResult>',
      'Database.query': 'List<SObject>',
      'Database.countQuery': 'Integer',
      'System.debug': 'void',
    };

    const key = `${targetType}.${methodName}`;
    return standardMethods[key] || 'Object';
  }

  /**
   * Infer type from variable assignment
   * Tracks patterns like:
   *   List<Account> accounts = [SELECT ... FROM Account]
   *   Account acc = accounts[0]
   *   var result = Database.insert(...)
   */
  inferAssignmentType(varName, rightHandSide) {
    // SOQL query result - returns List<Object>
    if (rightHandSide.isSOQLQuery) {
      return `List<${rightHandSide.object || 'SObject'}>`;
    }

    // Method call result
    if (rightHandSide.isMethodCall) {
      return this.resolveMethodCallType(
        rightHandSide.methodName,
        rightHandSide.targetType,
        rightHandSide.arguments
      );
    }

    // Direct instantiation: new Account()
    if (rightHandSide.isInstantiation) {
      return rightHandSide.type;
    }

    // List/Map access: accounts[0]
    if (rightHandSide.isArrayAccess && rightHandSide.fromVariable) {
      const sourceType = this.typeInferences.get(rightHandSide.fromVariable);
      if (sourceType) {
        // Extract element type from List<T>
        const match = sourceType.match(/^List<(.+)>$/);
        return match ? match[1] : 'Object';
      }
    }

    return rightHandSide.declaredType || 'Object';
  }

  /**
   * Build type inference for a method
   * Walk through local variable assignments and track types
   */
  buildMethodTypeMap(method) {
    const typeMap = new Map();

    // Add parameters
    if (method.parameters) {
      for (const param of method.parameters) {
        typeMap.set(param.name, param.type);
      }
    }

    // Add inferred local types (simplified - would need full AST walk)
    // This is a placeholder for more sophisticated type inference
    if (method.complexity > 5) {
      // For complex methods, track important variable types
      typeMap.set('_method_complexity', method.complexity);
    }

    return typeMap;
  }

  /**
   * Resolve the DML target type
   * Determines what object a DML operation is acting on
   * E.g., update accounts -> infer type of 'accounts' -> List<Account>
   */
  resolveDMLTargetType(target, methodTypeMap) {
    if (!target) return null;

    // Check local type map first
    if (methodTypeMap && methodTypeMap.has(target)) {
      return methodTypeMap.get(target);
    }

    // Check symbol table
    const symbol = this.symbolTable.resolveSymbol(target);
    if (symbol) {
      return symbol.type;
    }

    return null;
  }

  /**
   * Build field constraint info from schema and type resolution
   */
  getFieldConstraints(objectName, fieldName) {
    const field = this.schemaRegistry.getField(objectName, fieldName);
    if (!field) return null;

    return {
      name: fieldName,
      type: field.type,
      required: field.required,
      unique: field.unique,
      length: field.length,
      precision: field.precision,
      scale: field.scale,
      referenceTo: field.referenceTo,
      isPicklist: field.type === 'Picklist',
      picklistValues: field.picklistValues || [],
      description: field.description,
    };
  }

  /**
   * Annotate a DML operation with type information
   */
  annotateDMLOperation(dml, methodContext) {
    const typeMap = this.buildMethodTypeMap(methodContext);
    const targetType = this.resolveDMLTargetType(dml.target, typeMap);
    
    // Extract base object type
    let objectType = null;
    if (targetType) {
      objectType = this.symbolTable.extractBaseType(targetType);
    }

    return {
      operation: dml.type,
      target: dml.target,
      targetType,
      objectType,
      constraints: objectType ? this.getObjectConstraints(objectType) : null,
    };
  }

  /**
   * Get all constraints for an object
   */
  getObjectConstraints(objectName) {
    const obj = this.schemaRegistry.getObject(objectName);
    if (!obj) return null;

    return {
      name: objectName,
      label: obj.label,
      isStandard: obj.isStandard,
      fields: Array.from(obj.fields?.values() || []),
      validationRules: obj.validationRules || [],
      canCreate: true, // Simplified - in reality would check permissions
      canUpdate: true,
      canDelete: true,
    };
  }

  /**
   * Trace method dependencies
   * Resolve what other methods a method calls
   */
  traceMethodDependencies(method, allMethods) {
    const dependencies = [];
    
    // This would require more sophisticated analysis
    // For now, return empty - can be enhanced with AST analysis
    
    return dependencies;
  }

  /**
   * Build enriched context for code generation
   * Combines type info, schema info, and constraints
   */
  buildEnrichedContext(method, objectTouches) {
    return {
      method: {
        name: method.name,
        signature: method.signature,
        parameters: method.parameters || [],
        returnType: method.returnType,
      },
      
      // Type information
      types: {
        parameters: new Map((method.parameters || []).map(p => [p.name, p.type])),
        dmlOperations: (method.dml || []).map(d => 
          this.annotateDMLOperation(d, method)
        ),
        soqlQueries: (method.soql || []).map(q => ({
          object: q.object,
          fields: q.fields || [],
          constraints: this.getObjectConstraints(q.object),
        })),
      },

      // Schema constraints
      constraints: {
        objects: objectTouches.map(obj => ({
          name: obj,
          info: this.getObjectConstraints(obj),
        })),
      },

      // Complexity
      complexity: method.complexity,
    };
  }
}

export { TypeResolver };

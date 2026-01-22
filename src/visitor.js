/**
 * ApexVisitor - Visitor pattern implementation for Apex AST traversal
 * 
 * Extracts structured metadata from Apex code including:
 * - Class/Interface/Trigger declarations with modifiers
 * - Method signatures with parameters and return types
 * - Field declarations
 * - SOQL queries and DML operations
 * - Cyclomatic complexity calculations
 */

import { calculateComplexity, calculateMethodComplexity } from './complexity.js';

/**
 * Node types that contribute to cyclomatic complexity
 */
const COMPLEXITY_NODES = new Set([
  'if_statement',
  'else_clause', // but not simple else
  'for_statement',
  'enhanced_for_statement',
  'while_statement',
  'do_statement',
  'catch_clause',
  'ternary_expression',
  'switch_expression',
  'when_clause',
]);

/**
 * Binary operators that contribute to complexity
 */
const COMPLEXITY_OPERATORS = new Set(['&&', '||', '??']);

/**
 * DML operation types in Apex
 */
const DML_TYPES = new Set([
  'insert',
  'update', 
  'delete',
  'undelete',
  'upsert',
  'merge',
]);

class ApexVisitor {
  constructor(sourceCode, tree) {
    this.sourceCode = sourceCode;
    this.tree = tree;
    this.rootNode = tree.rootNode;
    
    // Results
    this.result = {
      name: null,
      type: null, // class, interface, trigger, enum
      modifiers: [],
      extends: null,
      implements: [],
      annotations: [],
      fields: [],
      properties: [],
      methods: [],
      innerClasses: [],
      constructors: [],
      soql: [],
      dml: [],
      complexity: 0,
      errors: [],
    };
  }

  /**
   * Main entry point - visit the entire tree
   */
  visit() {
    // Check for parse errors
    if (this.rootNode.hasError) {
      this.collectErrors(this.rootNode);
    }
    
    // Find the main declaration (class, interface, trigger, or enum)
    for (const child of this.rootNode.namedChildren) {
      switch (child.type) {
        case 'class_declaration':
          this.visitClassDeclaration(child);
          break;
        case 'interface_declaration':
          this.visitInterfaceDeclaration(child);
          break;
        case 'trigger_declaration':
          this.visitTriggerDeclaration(child);
          break;
        case 'enum_declaration':
          this.visitEnumDeclaration(child);
          break;
      }
    }
    
    // Calculate total complexity
    this.result.complexity = calculateComplexity(this.rootNode);
    
    return this.result;
  }

  /**
   * Collect parse errors from the tree
   */
  collectErrors(node) {
    if (node.type === 'ERROR' || node.isMissing) {
      this.result.errors.push({
        type: node.isMissing ? 'missing' : 'error',
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
        text: node.text.substring(0, 50),
      });
    }
    
    for (const child of node.children) {
      if (child.hasError) {
        this.collectErrors(child);
      }
    }
  }

  /**
   * Visit a class declaration
   */
  visitClassDeclaration(node) {
    this.result.type = 'class';
    
    for (const child of node.namedChildren) {
      switch (child.type) {
        case 'modifiers':
          this.result.modifiers = this.extractModifiers(child);
          this.result.annotations = this.extractAnnotations(child);
          break;
        case 'identifier':
          this.result.name = child.text;
          break;
        case 'superclass':
          this.result.extends = this.extractTypeName(child.namedChildren[0]);
          break;
        case 'interfaces':
          this.result.implements = this.extractInterfaces(child);
          break;
        case 'class_body':
          this.visitClassBody(child);
          break;
      }
    }
  }

  /**
   * Visit an interface declaration
   */
  visitInterfaceDeclaration(node) {
    this.result.type = 'interface';
    
    for (const child of node.namedChildren) {
      switch (child.type) {
        case 'modifiers':
          this.result.modifiers = this.extractModifiers(child);
          this.result.annotations = this.extractAnnotations(child);
          break;
        case 'identifier':
          this.result.name = child.text;
          break;
        case 'extends_interfaces':
          this.result.extends = this.extractInterfaces(child);
          break;
        case 'interface_body':
          this.visitInterfaceBody(child);
          break;
      }
    }
  }

  /**
   * Visit a trigger declaration
   */
  visitTriggerDeclaration(node) {
    this.result.type = 'trigger';
    
    for (const child of node.namedChildren) {
      switch (child.type) {
        case 'identifier':
          if (!this.result.name) {
            this.result.name = child.text;
          } else if (!this.result.object) {
            this.result.object = child.text;
          }
          break;
        case 'trigger_event':
          if (!this.result.events) {
            this.result.events = [];
          }
          this.result.events.push(child.text);
          break;
        case 'trigger_body':
        case 'block':
          this.visitTriggerBody(child);
          break;
      }
    }
  }

  /**
   * Visit an enum declaration
   */
  visitEnumDeclaration(node) {
    this.result.type = 'enum';
    this.result.values = [];
    
    for (const child of node.namedChildren) {
      switch (child.type) {
        case 'modifiers':
          this.result.modifiers = this.extractModifiers(child);
          break;
        case 'identifier':
          this.result.name = child.text;
          break;
        case 'enum_body':
          for (const enumChild of child.namedChildren) {
            if (enumChild.type === 'enum_constant') {
              const identifier = enumChild.namedChildren.find(c => c.type === 'identifier');
              if (identifier) {
                this.result.values.push(identifier.text);
              }
            }
          }
          break;
      }
    }
  }

  /**
   * Visit a class body
   */
  visitClassBody(node) {
    for (const child of node.namedChildren) {
      switch (child.type) {
        case 'field_declaration':
          this.visitFieldDeclaration(child);
          break;
        case 'method_declaration':
          this.visitMethodDeclaration(child);
          break;
        case 'constructor_declaration':
          this.visitConstructorDeclaration(child);
          break;
        case 'class_declaration':
          this.visitInnerClass(child);
          break;
        case 'interface_declaration':
          this.visitInnerInterface(child);
          break;
        case 'enum_declaration':
          this.visitInnerEnum(child);
          break;
        case 'property_declaration':
          this.visitPropertyDeclaration(child);
          break;
        case 'static_initializer':
          this.visitStaticInitializer(child);
          break;
      }
    }
  }

  /**
   * Visit an interface body
   */
  visitInterfaceBody(node) {
    for (const child of node.namedChildren) {
      if (child.type === 'method_declaration') {
        this.visitMethodDeclaration(child, true);
      }
    }
  }

  /**
   * Visit a trigger body
   */
  visitTriggerBody(node) {
    // Extract SOQL and DML from trigger body
    this.walkForQueriesAndDML(node);
  }

  /**
   * Visit a field declaration
   */
  visitFieldDeclaration(node) {
    const field = {
      name: null,
      type: null,
      modifiers: [],
      annotations: [],
      line: node.startPosition.row + 1,
      initialValue: null,
    };
    
    for (const child of node.namedChildren) {
      switch (child.type) {
        case 'modifiers':
          field.modifiers = this.extractModifiers(child);
          field.annotations = this.extractAnnotations(child);
          break;
        case 'type_identifier':
        case 'generic_type':
        case 'array_type':
        case 'void_type':
          field.type = this.extractTypeName(child);
          break;
        case 'variable_declarator':
          field.name = this.extractVariableName(child);
          const initializer = child.namedChildren.find(c => 
            c.type !== 'identifier' && c.type !== 'assignment_operator'
          );
          if (initializer) {
            field.initialValue = initializer.text;
          }
          break;
      }
    }
    
    this.result.fields.push(field);
  }

  /**
   * Visit a property declaration
   */
  visitPropertyDeclaration(node) {
    const property = {
      name: null,
      type: null,
      modifiers: [],
      annotations: [],
      line: node.startPosition.row + 1,
      getter: false,
      setter: false,
    };
    
    for (const child of node.namedChildren) {
      switch (child.type) {
        case 'modifiers':
          property.modifiers = this.extractModifiers(child);
          property.annotations = this.extractAnnotations(child);
          break;
        case 'type_identifier':
        case 'generic_type':
        case 'array_type':
          property.type = this.extractTypeName(child);
          break;
        case 'identifier':
          property.name = child.text;
          break;
        case 'accessor_list':
          for (const accessor of child.namedChildren) {
            if (accessor.type === 'accessor_declaration') {
              const accessorType = accessor.namedChildren.find(c => 
                c.type === 'get' || c.type === 'set'
              );
              if (accessorType?.type === 'get') property.getter = true;
              if (accessorType?.type === 'set') property.setter = true;
            }
          }
          break;
      }
    }
    
    this.result.properties.push(property);
  }

  /**
   * Visit a method declaration
   */
  visitMethodDeclaration(node, isInterface = false) {
    const method = {
      name: null,
      returnType: null,
      modifiers: [],
      annotations: [],
      parameters: [],
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      complexity: 0,
      soql: [],
      dml: [],
      isAbstract: false,
    };
    
    for (const child of node.namedChildren) {
      switch (child.type) {
        case 'modifiers':
          method.modifiers = this.extractModifiers(child);
          method.annotations = this.extractAnnotations(child);
          method.isAbstract = method.modifiers.includes('abstract');
          break;
        case 'type_identifier':
        case 'generic_type':
        case 'array_type':
        case 'void_type':
          method.returnType = this.extractTypeName(child);
          break;
        case 'identifier':
          method.name = child.text;
          break;
        case 'formal_parameters':
          method.parameters = this.extractParameters(child);
          break;
        case 'block':
          // Calculate method complexity and find SOQL/DML
          method.complexity = calculateMethodComplexity(child);
          this.walkForQueriesAndDML(child, method);
          break;
      }
    }
    
    // Interface methods are implicitly abstract
    if (isInterface) {
      method.isAbstract = true;
    }
    
    this.result.methods.push(method);
  }

  /**
   * Visit a constructor declaration
   */
  visitConstructorDeclaration(node) {
    const constructor = {
      name: null,
      modifiers: [],
      annotations: [],
      parameters: [],
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      complexity: 0,
      soql: [],
      dml: [],
    };
    
    for (const child of node.namedChildren) {
      switch (child.type) {
        case 'modifiers':
          constructor.modifiers = this.extractModifiers(child);
          constructor.annotations = this.extractAnnotations(child);
          break;
        case 'identifier':
          constructor.name = child.text;
          break;
        case 'formal_parameters':
          constructor.parameters = this.extractParameters(child);
          break;
        case 'constructor_body':
        case 'block':
          constructor.complexity = calculateMethodComplexity(child);
          this.walkForQueriesAndDML(child, constructor);
          break;
      }
    }
    
    this.result.constructors.push(constructor);
  }

  /**
   * Visit an inner class
   */
  visitInnerClass(node) {
    const visitor = new ApexVisitor(this.sourceCode, { rootNode: node });
    visitor.visitClassDeclaration(node);
    this.result.innerClasses.push(visitor.result);
  }

  /**
   * Visit an inner interface
   */
  visitInnerInterface(node) {
    const visitor = new ApexVisitor(this.sourceCode, { rootNode: node });
    visitor.visitInterfaceDeclaration(node);
    this.result.innerClasses.push(visitor.result);
  }

  /**
   * Visit an inner enum
   */
  visitInnerEnum(node) {
    const visitor = new ApexVisitor(this.sourceCode, { rootNode: node });
    visitor.visitEnumDeclaration(node);
    this.result.innerClasses.push(visitor.result);
  }

  /**
   * Visit a static initializer block
   */
  visitStaticInitializer(node) {
    const block = node.namedChildren.find(c => c.type === 'block');
    if (block) {
      this.walkForQueriesAndDML(block);
    }
  }

  /**
   * Walk tree to find SOQL queries and DML statements
   */
  walkForQueriesAndDML(node, target = this.result) {
    if (!node) return;
    
    switch (node.type) {
      case 'query_expression':
        const query = this.extractSOQLQuery(node);
        target.soql.push(query);
        if (target !== this.result) {
          this.result.soql.push(query);
        }
        break;
        
      case 'dml_expression':
        const dml = this.extractDMLOperation(node);
        target.dml.push(dml);
        if (target !== this.result) {
          this.result.dml.push(dml);
        }
        break;
    }
    
    for (const child of node.namedChildren) {
      this.walkForQueriesAndDML(child, target);
    }
  }

  /**
   * Extract SOQL query information
   */
  extractSOQLQuery(node) {
    const query = {
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      query: node.text,
      fields: [],
      object: null,
    };
    
    // Find the SOQL body
    const soqlBody = node.namedChildren.find(c => c.type === 'soql_query_body');
    if (soqlBody) {
      // Extract fields from SELECT clause
      const selectClause = soqlBody.namedChildren.find(c => c.type === 'select_clause');
      if (selectClause) {
        query.fields = this.extractSOQLFields(selectClause);
      }
      
      // Extract object from FROM clause
      const fromClause = soqlBody.namedChildren.find(c => c.type === 'from_clause');
      if (fromClause) {
        const storageId = fromClause.namedChildren.find(c => c.type === 'storage_identifier');
        if (storageId) {
          query.object = storageId.text;
        }
      }
    }
    
    return query;
  }

  /**
   * Extract fields from SOQL SELECT clause
   */
  extractSOQLFields(selectClause) {
    const fields = [];
    
    for (const child of selectClause.namedChildren) {
      if (child.type === 'field_identifier') {
        fields.push(child.text);
      } else if (child.type === 'alias_expression') {
        const fieldId = child.namedChildren.find(c => c.type === 'field_identifier');
        if (fieldId) fields.push(fieldId.text);
      } else if (child.type === 'subquery') {
        fields.push({ subquery: child.text });
      } else if (child.type === 'function_expression') {
        fields.push({ function: child.text });
      }
    }
    
    return fields;
  }

  /**
   * Extract DML operation information
   */
  extractDMLOperation(node) {
    const dml = {
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      type: null,
      target: null,
    };
    
    for (const child of node.namedChildren) {
      if (child.type === 'dml_type') {
        const dmlTypeNode = child.namedChildren[0];
        if (dmlTypeNode) {
          dml.type = dmlTypeNode.type;
        }
      } else if (child.type === 'identifier' || child.type === 'array_creation_expression') {
        dml.target = child.text;
      }
    }
    
    return dml;
  }

  /**
   * Extract modifiers from a modifiers node
   */
  extractModifiers(node) {
    const modifiers = [];
    
    for (const child of node.namedChildren) {
      if (child.type === 'modifier') {
        // The modifier contains the actual modifier type as a child
        const modifierNode = child.namedChildren[0];
        if (modifierNode && modifierNode.type !== 'annotation') {
          modifiers.push(modifierNode.text);
        }
      }
    }
    
    return modifiers;
  }

  /**
   * Extract annotations from a modifiers node
   * Annotations can be direct children of modifiers or inside modifier nodes
   */
  extractAnnotations(node) {
    const annotations = [];
    
    for (const child of node.namedChildren) {
      // Annotations can be direct children of modifiers
      if (child.type === 'annotation') {
        annotations.push(this.parseAnnotation(child));
      }
      // Or inside a modifier node
      else if (child.type === 'modifier') {
        const annotationNode = child.namedChildren.find(c => c.type === 'annotation');
        if (annotationNode) {
          annotations.push(this.parseAnnotation(annotationNode));
        }
      }
    }
    
    return annotations;
  }

  /**
   * Parse a single annotation node
   */
  parseAnnotation(annotationNode) {
    const annotation = {
      name: null,
      parameters: null,
    };
    
    for (const annChild of annotationNode.namedChildren) {
      if (annChild.type === 'identifier') {
        annotation.name = annChild.text;
      } else if (annChild.type === 'annotation_argument_list') {
        annotation.parameters = annChild.text;
      }
    }
    
    return annotation;
  }

  /**
   * Extract type name from various type nodes
   */
  extractTypeName(node) {
    if (!node) return null;
    
    switch (node.type) {
      case 'type_identifier':
        return node.text;
      case 'void_type':
        return 'void';
      case 'generic_type':
        const baseType = node.namedChildren.find(c => c.type === 'type_identifier');
        const typeArgs = node.namedChildren.find(c => c.type === 'type_arguments');
        if (baseType && typeArgs) {
          return `${baseType.text}${typeArgs.text}`;
        }
        return node.text;
      case 'array_type':
        const elementType = node.namedChildren[0];
        return elementType ? `${this.extractTypeName(elementType)}[]` : node.text;
      default:
        return node.text;
    }
  }

  /**
   * Extract variable name from a variable declarator
   */
  extractVariableName(node) {
    const identifier = node.namedChildren.find(c => c.type === 'identifier');
    return identifier ? identifier.text : null;
  }

  /**
   * Extract interfaces from an interfaces node
   */
  extractInterfaces(node) {
    const interfaces = [];
    
    for (const child of node.namedChildren) {
      if (child.type === 'type_identifier' || child.type === 'generic_type') {
        interfaces.push(this.extractTypeName(child));
      } else if (child.type === 'type_list') {
        // Interfaces are wrapped in a type_list
        for (const typeChild of child.namedChildren) {
          if (typeChild.type === 'type_identifier' || typeChild.type === 'generic_type') {
            interfaces.push(this.extractTypeName(typeChild));
          }
        }
      }
    }
    
    return interfaces;
  }

  /**
   * Extract parameters from formal_parameters node
   */
  extractParameters(node) {
    const parameters = [];
    
    for (const child of node.namedChildren) {
      if (child.type === 'formal_parameter') {
        const param = {
          name: null,
          type: null,
          modifiers: [],
        };
        
        for (const paramChild of child.namedChildren) {
          switch (paramChild.type) {
            case 'modifiers':
              param.modifiers = this.extractModifiers(paramChild);
              break;
            case 'type_identifier':
            case 'generic_type':
            case 'array_type':
              param.type = this.extractTypeName(paramChild);
              break;
            case 'identifier':
              param.name = paramChild.text;
              break;
          }
        }
        
        parameters.push(param);
      }
    }
    
    return parameters;
  }
}

export { ApexVisitor };

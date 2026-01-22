/**
 * Reference Resolver
 * 
 * Builds and maintains bidirectional references between code elements:
 * - Method calls: A calls B
 * - Class dependencies: A uses B
 * - Field accesses: Method reads/writes field
 * - Type relationships: A implements B, A extends B
 * 
 * Creates a complete reference map for impact analysis and context scoping
 */

class ReferenceResolver {
  constructor(semanticGraph, allParsedClasses = [], sourceCodeMap = new Map()) {
    this.graph = semanticGraph;
    this.allClasses = new Map(); // className -> parsed class
    this.sourceCodeMap = sourceCodeMap; // fileName -> sourceCode text
    this.references = new Map(); // Detailed reference tracking
    this.callGraph = new Map(); // method -> [called methods]
    this.reverseCallGraph = new Map(); // method -> [methods that call it]
    
    // Build the reference maps
    this._indexClasses(allParsedClasses);
    this._resolveAllReferences();
  }

  /**
   * Index all classes by name for quick lookup
   */
  _indexClasses(parsedClasses) {
    for (const cls of parsedClasses) {
      this.allClasses.set(cls.name, cls);
    }
  }

  /**
   * Resolve all references in the graph
   */
  _resolveAllReferences() {
    // For each method, find what it calls
    for (const [className, parsed] of this.allClasses) {
      for (const method of (parsed.methods || [])) {
        this._resolveMethodCalls(parsed.name, method, parsed);
        this._resolveFieldAccesses(parsed.name, method);
        this._resolveSObjectInteractions(parsed.name, method);
      }
    }
  }

  /**
   * Resolve method calls within a method
   * Pattern: className.methodName(...) or this.methodName(...) 
   */
  _resolveMethodCalls(className, method, parsedClass) {
    const methodKey = `${className}.${method.name}`;
    const calledMethods = [];

    // Extract method calls from the method body
    const extractedCalls = this._extractMethodCallsFromAST(className, method, parsedClass);
    
    // Initialize call graph entries
    if (!this.callGraph.has(methodKey)) {
      this.callGraph.set(methodKey, []);
    }
    if (!this.reverseCallGraph.has(methodKey)) {
      this.reverseCallGraph.set(methodKey, []);
    }

    // Add extracted calls to graph
    for (const call of extractedCalls) {
      this.callGraph.get(methodKey).push(call.targetMethod);
      
      // Also update reverse call graph
      if (!this.reverseCallGraph.has(call.targetMethod)) {
        this.reverseCallGraph.set(call.targetMethod, []);
      }
      this.reverseCallGraph.get(call.targetMethod).push(methodKey);
      
      // Add edge to semantic graph
      try {
        const fromId = this.graph.nodeId('method', methodKey);
        const toId = this.graph.nodeId('method', call.targetMethod);
        if (this.graph.nodes.has(fromId) && this.graph.nodes.has(toId)) {
          this.graph.addEdge(fromId, toId, 'calls', {
            line: call.line,
            arguments: call.arguments,
          });
        }
      } catch (e) {
        // Target method might not exist in graph
      }
    }
  }

  /**
   * Extract method calls from source code using pattern matching
   * Supports: this.method(), ClassName.method(), method()
   */
  _extractMethodCallsFromAST(className, method, parsedClass) {
    const calls = [];
    
    // Get source code for this method
    const sourceCode = this.sourceCodeMap.get(parsedClass.file || 'unknown');
    if (!sourceCode || method.line === undefined) {
      return calls;
    }

    try {
      // Extract the method body text (between line numbers)
      const methodLines = sourceCode.split('\n');
      const startLine = Math.max(0, method.line); // Skip declaration line
      const endLine = Math.min(methodLines.length, method.endLine || method.line + 50);
      const methodBody = methodLines.slice(startLine, endLine).join('\n');

      // Pattern 1: this.methodName(...)
      const thisCallPattern = /this\.(\w+)\s*\(/g;
      let match;
      while ((match = thisCallPattern.exec(methodBody)) !== null) {
        const calledMethodName = match[1];
        // Don't add self-calls
        if (calledMethodName === method.name) continue;
        
        // Look for method in same class
        const targetMethod = `${className}.${calledMethodName}`;
        if (this.allClasses.get(className)?.methods?.some(m => m.name === calledMethodName)) {
          calls.push({
            targetMethod,
            type: 'instance',
            line: method.line + methodBody.substring(0, match.index).split('\n').length - 1,
            arguments: this._extractMethodArguments(methodBody, match.index),
          });
        }
      }

      // Pattern 2: ClassName.staticMethod(...) - only for other classes
      const staticCallPattern = /(\w+)\.(\w+)\s*\(/g;
      while ((match = staticCallPattern.exec(methodBody)) !== null) {
        const calleeClassName = match[1];
        const calledMethodName = match[2];
        
        // Skip if it's the same class (already handled by Pattern 1)
        if (calleeClassName === className || calleeClassName === 'this') {
          continue;
        }
        
        // Check if this class exists
        if (this.allClasses.has(calleeClassName)) {
          const targetClass = this.allClasses.get(calleeClassName);
          if (targetClass.methods?.some(m => m.name === calledMethodName)) {
            const targetMethod = `${calleeClassName}.${calledMethodName}`;
            calls.push({
              targetMethod,
              type: 'static',
              line: method.line + methodBody.substring(0, match.index).split('\n').length - 1,
              arguments: this._extractMethodArguments(methodBody, match.index),
            });
          }
        }
      }

      // Pattern 3: Unqualified method calls (local methods) - more specific
      // Use word boundary to avoid matching inside method names
      const localCallPattern = /(?:^|[^\w.])(\w+)\s*\(/gm;
      while ((match = localCallPattern.exec(methodBody)) !== null) {
        const calledMethodName = match[1];
        
        // Skip if it's self reference
        if (calledMethodName === method.name) continue;
        
        // Filter common built-ins
        if (!this._isBuiltInMethod(calledMethodName)) {
          if (this.allClasses.get(className)?.methods?.some(m => m.name === calledMethodName)) {
            const targetMethod = `${className}.${calledMethodName}`;
            calls.push({
              targetMethod,
              type: 'local',
              line: method.line + methodBody.substring(0, match.index).split('\n').length - 1,
              arguments: this._extractMethodArguments(methodBody, match.index),
            });
          }
        }
      }
    } catch (e) {
      // Silently fail if extraction doesn't work
    }

    // Deduplicate calls and remove self-calls
    const seen = new Set();
    return calls.filter(call => {
      const key = call.targetMethod;
      if (seen.has(key)) return false;
      seen.add(key);
      
      // Don't add self-calls
      return call.targetMethod !== `${className}.${method.name}`;
    });
  }

  /**
   * Extract method arguments as string
   */
  _extractMethodArguments(methodBody, callIndex) {
    const openParen = methodBody.indexOf('(', callIndex);
    if (openParen === -1) return '';
    
    let depth = 1;
    let index = openParen + 1;
    let args = '';
    
    while (index < methodBody.length && depth > 0) {
      const char = methodBody[index];
      if (char === '(') depth++;
      else if (char === ')') depth--;
      
      if (depth > 0) args += char;
      index++;
    }
    
    return args.trim();
  }

  /**
   * Check if a method name is a built-in or framework method
   */
  _isBuiltInMethod(methodName) {
    const builtIns = new Set([
      // Common Apex methods
      'system', 'debug', 'assert', 'assertEquals', 'assertNotEquals',
      'print', 'println', 'valueOf', 'parse', 'format',
      // List/Collection methods
      'add', 'remove', 'get', 'set', 'size', 'contains', 'clear', 'sort',
      // String methods
      'substring', 'length', 'trim', 'split', 'replace', 'toUpperCase', 'toLowerCase',
      // Common suffixes that indicate built-ins
      'toString', 'equals', 'hashCode', 'clone', 'wait', 'notify',
    ]);
    
    return builtIns.has(methodName.toLowerCase());
  }

  /**
   * Resolve field accesses (reads and writes)
   */
  _resolveFieldAccesses(className, method) {
    const accessesData = {
      methodName: `${className}.${method.name}`,
      reads: [],
      writes: [],
    };

    // Track which fields are accessed
    // This would need detailed AST walking in production
    
    if (this.references.has(`${className}.${method.name}`)) {
      const ref = this.references.get(`${className}.${method.name}`);
      ref.fieldAccesses = accessesData;
    } else {
      this.references.set(`${className}.${method.name}`, { fieldAccesses: accessesData });
    }
  }

  /**
   * Resolve SObject interactions (SOQL, DML)
   */
  _resolveSObjectInteractions(className, method) {
    const interactions = {
      queries: [],
      mutations: [],
    };

    // Track SOQL queries
    for (const query of (method.soql || [])) {
      interactions.queries.push({
        object: query.object,
        fields: query.fields,
        type: 'read',
      });
    }

    // Track DML operations
    for (const dml of (method.dml || [])) {
      interactions.mutations.push({
        operation: dml.type,
        object: dml.inferredType || dml.target,
        line: dml.line,
      });
    }

    const methodKey = `${className}.${method.name}`;
    if (!this.references.has(methodKey)) {
      this.references.set(methodKey, {});
    }
    this.references.get(methodKey).sobjectInteractions = interactions;
  }

  /**
   * Get all references for a method
   */
  getMethodReferences(className, methodName) {
    const methodKey = `${className}.${methodName}`;
    return this.references.get(methodKey) || {};
  }

  /**
   * Get backward references: what calls this method?
   */
  getCallers(className, methodName) {
    const methodKey = `${className}.${methodName}`;
    return this.reverseCallGraph.get(methodKey) || [];
  }

  /**
   * Get forward references: what does this method call?
   */
  getCallees(className, methodName) {
    const methodKey = `${className}.${methodName}`;
    return this.callGraph.get(methodKey) || [];
  }

  /**
   * Find all methods that access a specific field
   */
  findFieldAccessors(className, fieldName) {
    const accessors = [];

    for (const [methodKey, refs] of this.references) {
      if (refs.fieldAccesses) {
        if (refs.fieldAccesses.reads.includes(fieldName) ||
            refs.fieldAccesses.writes.includes(fieldName)) {
          accessors.push({ method: methodKey, type: 'accessor' });
        }
      }
    }

    return accessors;
  }

  /**
   * Find all methods that interact with an SObject
   */
  findSObjectUsers(objectName) {
    const users = [];

    for (const [methodKey, refs] of this.references) {
      if (refs.sobjectInteractions) {
        const interactions = refs.sobjectInteractions;
        
        // Check queries
        for (const query of interactions.queries) {
          if (query.object === objectName) {
            users.push({ method: methodKey, type: 'read', object: objectName });
          }
        }
        
        // Check mutations
        for (const mutation of interactions.mutations) {
          if (mutation.object === objectName) {
            users.push({ method: methodKey, type: mutation.operation, object: objectName });
          }
        }
      }
    }

    return users;
  }

  /**
   * Build impact map: if I change X, what is affected?
   */
  buildImpactMap(target) {
    const impact = {
      target,
      directImpact: [],
      indirectImpact: [],
      riskLevel: 'low',
    };

    const [className, methodName] = target.split('.');

    // Direct impact: methods that call this method
    const callers = this.getCallers(className, methodName);
    impact.directImpact = callers;

    // Indirect impact: callers of callers
    const indirectSet = new Set();
    for (const caller of callers) {
      const [callerClass, callerMethod] = caller.split('.');
      const callersCaller = this.getCallers(callerClass, callerMethod);
      callersCaller.forEach(c => indirectSet.add(c));
    }
    impact.indirectImpact = Array.from(indirectSet);

    // Risk level based on impact scope
    const totalImpact = impact.directImpact.length + impact.indirectImpact.length;
    if (totalImpact > 10) impact.riskLevel = 'critical';
    else if (totalImpact > 5) impact.riskLevel = 'high';
    else if (totalImpact > 2) impact.riskLevel = 'medium';

    return impact;
  }

  /**
   * Get all methods that interact with given SObjects
   */
  getSObjectAccessPath(objectName) {
    return this.findSObjectUsers(objectName);
  }

  /**
   * Trace a path through method calls from source to target
   */
  traceCallPath(fromMethod, toMethod) {
    const [fromClass, fromName] = fromMethod.split('.');
    const [toClass, toName] = toMethod.split('.');

    // Use BFS to find shortest path
    const queue = [[fromMethod]];
    const visited = new Set();

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (current === toMethod) {
        return path;
      }

      if (visited.has(current)) continue;
      visited.add(current);

      const callees = this.getCallees(...current.split('.'));
      for (const callee of callees) {
        queue.push([...path, callee]);
      }
    }

    return null; // No path found
  }

  /**
   * Serialize all references to JSON
   */
  toJSON() {
    return {
      callGraph: Object.fromEntries(this.callGraph),
      reverseCallGraph: Object.fromEntries(this.reverseCallGraph),
      references: Object.fromEntries(this.references),
      stats: {
        methodCount: this.references.size,
        callEdges: Array.from(this.callGraph.values()).reduce((sum, arr) => sum + arr.length, 0),
      },
    };
  }
}

export { ReferenceResolver };

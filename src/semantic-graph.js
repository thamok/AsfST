/**
 * Semantic Dependency Graph
 * 
 * Models a Directed Acyclic Graph (DAG) of dependencies between:
 * - Classes, Triggers, Interfaces
 * - Methods and their callers
 * - Fields and their accessors
 * - SObjects and their relationships
 * 
 * This enables:
 * 1. Forward dependencies: "What does this method call?"
 * 2. Backward dependencies: "What calls this method?"
 * 3. Impact analysis: "What breaks if I change this field?"
 * 4. Context radius: "What's relevant for understanding this code?"
 */

class SemanticGraph {
  constructor(parsedResults = []) {
    // Node store: nodeName -> { id, type, name, metadata, hash }
    this.nodes = new Map();
    
    // Edge store: edgeName -> { from, to, type, metadata }
    this.edges = new Map();
    
    // Reverse indexes for fast lookup
    this.outgoing = new Map(); // node -> [edges from this node]
    this.incoming = new Map(); // node -> [edges to this node]
    
    // Metadata stores
    this.classNodes = new Map(); // className -> node details
    this.methodNodes = new Map(); // className.methodName -> node details
    this.fieldNodes = new Map(); // className.fieldName -> node details
    this.objectNodes = new Map(); // SObjectName -> node details
    
    // Build graph from initial parsed results
    if (parsedResults && parsedResults.length > 0) {
      for (const parsed of parsedResults) {
        this.addClassNode(parsed);
      }
    }
  }

  /**
   * Generate unique ID for a node
   */
  nodeId(type, ...parts) {
    return `${type}:${parts.join('.')}`;
  }

  /**
   * Generate unique ID for an edge
   */
  edgeId(from, to, type) {
    return `${from}-${type}->${to}`;
  }

  /**
   * Add a node to the graph
   */
  addNode(type, name, metadata = {}) {
    const id = this.nodeId(type, name);
    
    if (!this.nodes.has(id)) {
      this.nodes.set(id, {
        id,
        type,
        name,
        metadata,
        createdAt: Date.now(),
      });
      
      // Initialize adjacency lists
      if (!this.outgoing.has(id)) {
        this.outgoing.set(id, []);
      }
      if (!this.incoming.has(id)) {
        this.incoming.set(id, []);
      }
    }
    
    return id;
  }

  /**
   * Add an edge between nodes
   */
  addEdge(fromId, toId, edgeType, metadata = {}) {
    // Ensure nodes exist
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) {
      throw new Error(`Cannot add edge: nodes ${fromId} or ${toId} do not exist`);
    }

    const edgeId = this.edgeId(fromId, toId, edgeType);
    
    if (!this.edges.has(edgeId)) {
      const edge = {
        id: edgeId,
        from: fromId,
        to: toId,
        type: edgeType,
        metadata,
        weight: 1,
      };
      
      this.edges.set(edgeId, edge);
      
      // Update adjacency lists
      this.outgoing.get(fromId).push(edge);
      this.incoming.get(toId).push(edge);
    }
  }

  /**
   * Add a class node and its contents
   */
  addClassNode(parsedClass) {
    const className = parsedClass.name;
    const classId = this.addNode('class', className, {
      file: parsedClass.file,
      type: parsedClass.type, // class, interface, trigger
      modifiers: parsedClass.modifiers,
      implements: parsedClass.implements,
      extends: parsedClass.extends,
    });

    this.classNodes.set(className, classId);

    // Add method nodes
    for (const method of (parsedClass.methods || [])) {
      this.addMethodNode(classId, method, parsedClass);
    }

    // Add field nodes
    for (const field of (parsedClass.fields || [])) {
      this.addFieldNode(classId, field);
    }

    // Add SObject references (from SOQL and DML)
    this.addSObjectReferences(classId, parsedClass);

    return classId;
  }

  /**
   * Add a method node and its relationships
   */
  addMethodNode(classId, method, parentClass) {
    const methodName = method.name;
    const methodId = this.addNode('method', `${parentClass.name}.${methodName}`, {
      returnType: method.returnType,
      parameters: method.parameters,
      modifiers: method.modifiers,
      complexity: method.complexity,
      line: method.line,
    });

    this.methodNodes.set(`${parentClass.name}.${methodName}`, methodId);

    // Create edge: class contains method
    this.addEdge(classId, methodId, 'contains', { kind: 'method' });

    // Track field accesses within method
    this.addFieldAccessesInMethod(methodId, method, parentClass.name);

    // Track SOQL queries
    this.addSOQLReferences(methodId, method);

    // Track DML operations
    this.addDMLReferences(methodId, method);

    return methodId;
  }

  /**
   * Add a field node
   */
  addFieldNode(classId, field) {
    const fieldName = field.name;
    const fieldId = this.addNode('field', `${this.nodes.get(classId).name}.${fieldName}`, {
      type: field.type,
      modifiers: field.modifiers,
      initialValue: field.initialValue,
    });

    // Create edge: class contains field
    this.addEdge(classId, fieldId, 'contains', { kind: 'field' });

    return fieldId;
  }

  /**
   * Add SObject nodes and references
   */
  addSObjectReferences(classId, parsedClass) {
    const objectsReferenced = new Set();

    // Collect from methods
    for (const method of (parsedClass.methods || [])) {
      for (const query of (method.soql || [])) {
        objectsReferenced.add(query.object);
      }
      for (const dml of (method.dml || [])) {
        // Try to infer object type
        if (dml.inferredType) {
          objectsReferenced.add(dml.inferredType);
        }
      }
    }

    // Add nodes and edges
    for (const objectName of objectsReferenced) {
      const objectId = this.addNode('sobject', objectName, {
        standard: true, // Simplified; should check schema
      });

      this.objectNodes.set(objectName, objectId);

      // Edge: class accesses SObject
      this.addEdge(classId, objectId, 'accesses', { kind: 'sobject' });
    }
  }

  /**
   * Track field accesses within a method
   */
  addFieldAccessesInMethod(methodId, method, className) {
    // This would require detailed field tracking from the parser
    // For now, we track at the class/method level
    // In a full implementation, track individual field.reads and field.writes
  }

  /**
   * Add SOQL query references
   */
  addSOQLReferences(methodId, method) {
    for (const query of (method.soql || [])) {
      const objectId = this.addNode('sobject', query.object);
      
      // Edge: method reads from SObject
      this.addEdge(methodId, objectId, 'reads', {
        fields: query.fields,
        line: query.line,
      });

      // Track field accesses
      for (const field of (query.fields || [])) {
        if (typeof field === 'string') {
          const fieldId = this.addNode('sfield', `${query.object}.${field}`, {
            object: query.object,
            field: field,
          });

          this.addEdge(methodId, fieldId, 'accesses_field', { mode: 'read' });
        }
      }
    }
  }

  /**
   * Add DML operation references
   */
  addDMLReferences(methodId, method) {
    for (const dml of (method.dml || [])) {
      if (dml.object) {
        const objectId = this.addNode('sobject', dml.object);

        // Edge: method writes to SObject
        this.addEdge(methodId, objectId, dml.type, {
          target: dml.target,
          line: dml.line,
        });
      }
    }
  }

  /**
   * Find all forward dependencies (what does node A depend on?)
   */
  getForwardDependencies(nodeId, depth = 1, visited = new Set()) {
    if (visited.has(nodeId) || depth === 0) {
      return [];
    }

    visited.add(nodeId);
    const dependencies = [];

    const outgoing = this.outgoing.get(nodeId) || [];
    for (const edge of outgoing) {
      const toNode = this.nodes.get(edge.to);
      dependencies.push({
        node: toNode,
        edge: edge,
      });

      // Recurse
      if (depth > 1) {
        const nested = this.getForwardDependencies(edge.to, depth - 1, visited);
        dependencies.push(...nested);
      }
    }

    return dependencies;
  }

  /**
   * Find all backward dependencies (what depends on node A?)
   */
  getBackwardDependencies(nodeId, depth = 1, visited = new Set()) {
    if (visited.has(nodeId) || depth === 0) {
      return [];
    }

    visited.add(nodeId);
    const dependents = [];

    const incoming = this.incoming.get(nodeId) || [];
    for (const edge of incoming) {
      const fromNode = this.nodes.get(edge.from);
      dependents.push({
        node: fromNode,
        edge: edge,
      });

      // Recurse
      if (depth > 1) {
        const nested = this.getBackwardDependencies(edge.from, depth - 1, visited);
        dependents.push(...nested);
      }
    }

    return dependents;
  }

  /**
   * Calculate impact radius for a node (all affected nodes)
   */
  getImpactRadius(nodeId, depth = 2) {
    const forward = this.getForwardDependencies(nodeId, depth);
    const backward = this.getBackwardDependencies(nodeId, depth);

    return {
      node: this.nodes.get(nodeId),
      dependsOn: forward,
      dependents: backward,
      impact: {
        direct: forward.length + backward.length,
        scope: new Set([...forward, ...backward].map(d => d.node.id)).size,
      },
    };
  }

  /**
   * Get context radius for a node (scoped dependencies for AI consumption)
   * Returns nodes within N hops that are relevant for understanding this node
   */
  getContextRadius(nodeId, depth = 2) {
    const forward = this.getForwardDependencies(nodeId, depth);
    const backward = this.getBackwardDependencies(nodeId, depth);

    // Combine and deduplicate
    const contextNodes = new Map();
    contextNodes.set(nodeId, this.nodes.get(nodeId));

    for (const dep of [...forward, ...backward]) {
      contextNodes.set(dep.node.id, dep.node);
    }

    return {
      targetNode: this.nodes.get(nodeId),
      contextSize: contextNodes.size,
      nodes: Array.from(contextNodes.values()),
      edges: this.getEdgesBetween(Array.from(contextNodes.keys())),
      depth: depth,
    };
  }

  /**
   * Get all edges between a set of nodes
   */
  getEdgesBetween(nodeIds) {
    const nodeSet = new Set(nodeIds);
    const edges = [];

    for (const edge of this.edges.values()) {
      if (nodeSet.has(edge.from) && nodeSet.has(edge.to)) {
        edges.push(edge);
      }
    }

    return edges;
  }

  /**
   * Find all paths between two nodes
   */
  findPaths(fromId, toId, maxDepth = 5) {
    const paths = [];
    const visited = new Set();

    const dfs = (current, target, path) => {
      if (path.length > maxDepth) return;
      if (current === target) {
        paths.push([...path]);
        return;
      }

      visited.add(current);

      const outgoing = this.outgoing.get(current) || [];
      for (const edge of outgoing) {
        if (!visited.has(edge.to)) {
          path.push(edge);
          dfs(edge.to, target, path);
          path.pop();
        }
      }

      visited.delete(current);
    };

    dfs(fromId, toId, []);
    return paths;
  }

  /**
   * Detect circular dependencies (cycles in the graph)
   */
  detectCycles() {
    const cycles = [];
    const visited = new Set();
    const recStack = new Set();

    const dfs = (node, path) => {
      visited.add(node);
      recStack.add(node);

      const outgoing = this.outgoing.get(node) || [];
      for (const edge of outgoing) {
        if (!visited.has(edge.to)) {
          dfs(edge.to, [...path, edge]);
        } else if (recStack.has(edge.to)) {
          // Found cycle
          cycles.push([...path, edge]);
        }
      }

      recStack.delete(node);
    };

    for (const [nodeId] of this.nodes) {
      if (!visited.has(nodeId)) {
        dfs(nodeId, []);
      }
    }

    return cycles;
  }

  /**
   * Serialize graph to JSON with optional context radius
   */
  toJSON(options = {}) {
    const { includeContextRadius, contextNodeId, contextDepth = 2 } = options;

    const json = {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      stats: {
        nodeCount: this.nodes.size,
        edgeCount: this.edges.size,
        cycles: this.detectCycles().length,
      },
    };

    if (includeContextRadius && contextNodeId) {
      json.contextRadius = this.getContextRadius(contextNodeId, contextDepth);
    }

    return json;
  }

  /**
   * Get graph statistics
   */
  getStats() {
    return {
      totalNodes: this.nodes.size,
      nodesByType: this._groupBy(
        Array.from(this.nodes.values()),
        n => n.type
      ),
      totalEdges: this.edges.size,
      edgesByType: this._groupBy(
        Array.from(this.edges.values()),
        e => e.type
      ),
      cycleCount: this.detectCycles().length,
      singleNodeCycles: this._findSelfLoops().length,
    };
  }

  /**
   * Find self-loops (node points to itself)
   */
  _findSelfLoops() {
    const loops = [];
    for (const edge of this.edges.values()) {
      if (edge.from === edge.to) {
        loops.push(edge);
      }
    }
    return loops;
  }

  /**
   * Group array by function
   */
  _groupBy(arr, fn) {
    const result = {};
    for (const item of arr) {
      const key = fn(item);
      if (!result[key]) result[key] = 0;
      result[key]++;
    }
    return result;
  }
}

export { SemanticGraph };

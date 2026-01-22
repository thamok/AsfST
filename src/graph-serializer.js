/**
 * Graph Serializer
 * 
 * Converts semantic graphs to efficient JSON representations optimized for LLM consumption:
 * 1. Full graph export (all nodes and edges)
 * 2. Context radius export (scoped subgraph for focused analysis)
 * 3. Impact analysis export (ripple effects of changes)
 * 4. Compressed formats for token efficiency
 * 
 * Key design: Serialize only what's needed for the AI task at hand
 */

class GraphSerializer {
  constructor(graph) {
    this.graph = graph;
  }

  /**
   * Serialize full graph for comprehensive analysis
   */
  serializeFullGraph() {
    const nodes = Array.from(this.graph.nodes.values());
    const edges = Array.from(this.graph.edges.values());

    return {
      metadata: {
        type: 'full_graph',
        timestamp: new Date().toISOString(),
        nodeCount: nodes.length,
        edgeCount: edges.length,
      },
      nodes: nodes.map(n => this._serializeNode(n)),
      edges: edges.map(e => this._serializeEdge(e)),
      stats: this.graph.getStats(),
    };
  }

  /**
   * Serialize context radius around a specific node
   * This is the most common use case: "show me the relevant code for this method"
   */
  serializeContextRadius(targetNodeId, depth = 2) {
    const context = this.graph.getContextRadius(targetNodeId, depth);
    const contextNodeIds = new Set(context.nodes.map(n => n.id));

    // Filter edges to only those between context nodes
    const relevantEdges = context.edges.filter(e => 
      contextNodeIds.has(e.from) && contextNodeIds.has(e.to)
    );

    return {
      metadata: {
        type: 'context_radius',
        timestamp: new Date().toISOString(),
        targetNode: context.targetNode.id,
        depth: depth,
        nodeCount: context.nodes.length,
        edgeCount: relevantEdges.length,
      },
      targetNode: this._serializeNode(context.targetNode),
      nodes: context.nodes.map(n => this._serializeNode(n)),
      edges: relevantEdges.map(e => this._serializeEdge(e)),
    };
  }

  /**
   * Serialize impact analysis: what breaks if I change this?
   */
  serializeImpactAnalysis(targetNodeId, depth = 3) {
    const backward = this.graph.getBackwardDependencies(targetNodeId, depth);
    const forward = this.graph.getForwardDependencies(targetNodeId, depth);

    const impactedNodeIds = new Set([
      targetNodeId,
      ...backward.map(d => d.node.id),
      ...forward.map(d => d.node.id),
    ]);

    // Get edges between impacted nodes
    const impactEdges = Array.from(this.graph.edges.values()).filter(e =>
      impactedNodeIds.has(e.from) && impactedNodeIds.has(e.to)
    );

    const impactedNodes = Array.from(impactedNodeIds)
      .map(id => this.graph.nodes.get(id))
      .filter(n => n !== undefined);

    return {
      metadata: {
        type: 'impact_analysis',
        timestamp: new Date().toISOString(),
        targetNode: targetNodeId,
        depth: depth,
        nodeCount: impactedNodes.length,
        edgeCount: impactEdges.length,
      },
      targetNode: this._serializeNode(this.graph.nodes.get(targetNodeId)),
      dependents: backward.map(d => ({
        node: this._serializeNode(d.node),
        edgeType: d.edge.type,
      })),
      dependencies: forward.map(d => ({
        node: this._serializeNode(d.node),
        edgeType: d.edge.type,
      })),
      nodes: impactedNodes.map(n => this._serializeNode(n)),
      edges: impactEdges.map(e => this._serializeEdge(e)),
    };
  }

  /**
   * Serialize as compact format for token efficiency
   * Omits metadata, uses shorter field names
   */
  serializeCompact(targetNodeId, depth = 2) {
    const context = this.graph.getContextRadius(targetNodeId, depth);
    const contextNodeIds = new Set(context.nodes.map(n => n.id));
    const relevantEdges = context.edges.filter(e =>
      contextNodeIds.has(e.from) && contextNodeIds.has(e.to)
    );

    // Create id->index mapping for even more compaction
    const nodeIndex = new Map();
    const nodes = context.nodes.map((n, i) => {
      nodeIndex.set(n.id, i);
      return [n.id, n.type, n.name];
    });

    const edges = relevantEdges.map(e => [
      nodeIndex.get(e.from),
      nodeIndex.get(e.to),
      e.type,
    ]);

    return {
      t: 'ctx', // type
      d: depth,
      n: nodes, // nodes
      e: edges, // edges
    };
  }

  /**
   * Serialize as semantic outline - high-level structure for navigation
   */
  serializeSemanticOutline(depth = 1) {
    // Group nodes by type
    const nodesByType = {};
    for (const node of this.graph.nodes.values()) {
      if (!nodesByType[node.type]) {
        nodesByType[node.type] = [];
      }
      nodesByType[node.type].push(node);
    }

    // Build relationships
    const outline = {
      classes: [],
      methods: [],
      fields: [],
      sobjects: [],
    };

    // Serialize classes with their methods and fields
    for (const classNode of (nodesByType['class'] || [])) {
      const classEntry = {
        name: classNode.name,
        methods: [],
        fields: [],
      };

      // Find all children
      for (const edge of this.graph.outgoing.get(classNode.id) || []) {
        const child = this.graph.nodes.get(edge.to);
        if (edge.type === 'contains') {
          if (child.type === 'method') {
            classEntry.methods.push(child.name);
          } else if (child.type === 'field') {
            classEntry.fields.push(child.name);
          }
        }
      }

      outline.classes.push(classEntry);
    }

    // Serialize standalone SObjects
    for (const sobjectNode of (nodesByType['sobject'] || [])) {
      outline.sobjects.push(sobjectNode.name);
    }

    return {
      metadata: {
        type: 'semantic_outline',
        timestamp: new Date().toISOString(),
      },
      outline,
    };
  }

  /**
   * Serialize for call graph visualization
   * Shows method call relationships only
   */
  serializeCallGraph() {
    const callEdges = Array.from(this.graph.edges.values()).filter(e => e.type === 'calls');
    const methodNodes = Array.from(this.graph.nodes.values()).filter(n => n.type === 'method');

    // Only include methods that have call relationships
    const methodsInCalls = new Set();
    callEdges.forEach(e => {
      methodsInCalls.add(e.from);
      methodsInCalls.add(e.to);
    });

    const relevantMethods = methodNodes.filter(m => methodsInCalls.has(m.id));

    return {
      metadata: {
        type: 'call_graph',
        timestamp: new Date().toISOString(),
        methodCount: relevantMethods.length,
        callCount: callEdges.length,
      },
      methods: relevantMethods.map(m => this._serializeNode(m)),
      calls: callEdges.map(e => ({
        from: e.from,
        to: e.to,
        metadata: e.metadata,
      })),
    };
  }

  /**
   * Serialize for data flow analysis
   * Shows read/write relationships with SObjects
   */
  serializeDataFlow() {
    const readEdges = Array.from(this.graph.edges.values()).filter(e => e.type === 'reads');
    const writeEdges = Array.from(this.graph.edges.values()).filter(e =>
      ['insert', 'update', 'delete', 'upsert'].includes(e.type)
    );

    const allEdges = [...readEdges, ...writeEdges];
    const affectedNodeIds = new Set();

    allEdges.forEach(e => {
      affectedNodeIds.add(e.from);
      affectedNodeIds.add(e.to);
    });

    const affectedNodes = Array.from(affectedNodeIds)
      .map(id => this.graph.nodes.get(id))
      .filter(n => n !== undefined);

    return {
      metadata: {
        type: 'data_flow',
        timestamp: new Date().toISOString(),
        nodeCount: affectedNodes.length,
        edgeCount: allEdges.length,
      },
      nodes: affectedNodes.map(n => this._serializeNode(n)),
      reads: readEdges.map(e => ({
        from: e.from,
        to: e.to,
        fields: e.metadata?.fields || [],
      })),
      writes: writeEdges.map(e => ({
        from: e.from,
        to: e.to,
        operation: e.type,
      })),
    };
  }

  /**
   * Estimate token count for serialized output
   */
  estimateTokens(serialized) {
    const json = JSON.stringify(serialized);
    // Rough estimate: 4 chars per token for code
    return Math.ceil(json.length / 4);
  }

  /**
   * Get token efficiency score (0-100)
   * Higher is better (more data per token)
   */
  getEfficiencyScore(serialized, fullGraphSize = null) {
    const json = JSON.stringify(serialized);
    const size = json.length;

    if (fullGraphSize === null) {
      const fullGraph = this.serializeFullGraph();
      fullGraphSize = JSON.stringify(fullGraph).length;
    }

    const ratio = (fullGraphSize - size) / fullGraphSize;
    return Math.round(ratio * 100);
  }

  /**
   * Serialize a single node
   */
  _serializeNode(node) {
    return {
      id: node.id,
      type: node.type,
      name: node.name,
      metadata: node.metadata || {},
    };
  }

  /**
   * Serialize a single edge
   */
  _serializeEdge(edge) {
    return {
      from: edge.from,
      to: edge.to,
      type: edge.type,
      metadata: edge.metadata || {},
    };
  }
}

export { GraphSerializer };

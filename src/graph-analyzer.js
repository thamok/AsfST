/**
 * Graph Analyzer
 * 
 * Provides insights about code dependencies and complexity:
 * 1. Impact radius: what breaks if I change this?
 * 2. Hotspot detection: what's most critical?
 * 3. Call path tracing: how does flow work?
 * 4. Dependency metrics: coupling, complexity scoring
 * 5. Risk assessment: change impact scoring
 */

class GraphAnalyzer {
  constructor(graph, referenceResolver = null) {
    this.graph = graph;
    this.resolver = referenceResolver;
  }

  /**
   * Analyze impact of changing a node
   * Returns risk level and affected methods/classes
   */
  analyzeImpact(nodeId, depth = 3) {
    const node = this.graph.nodes.get(nodeId);
    if (!node) {
      return { error: `Node not found: ${nodeId}` };
    }

    // Get all nodes affected by change
    const backward = this.graph.getBackwardDependencies(nodeId, depth);
    const forward = this.graph.getForwardDependencies(nodeId, depth);

    // Calculate risk metrics
    const affectedCount = backward.length + forward.length;
    const riskScore = this._calculateRiskScore(node.type, affectedCount);

    return {
      target: {
        id: node.id,
        type: node.type,
        name: node.name,
      },
      impact: {
        directDependents: backward.length,
        directDependencies: forward.length,
        totalAffected: affectedCount,
        riskScore: riskScore,
        riskLevel: this._riskScoreTolevel(riskScore),
      },
      dependents: backward.slice(0, 10).map(d => ({
        id: d.node.id,
        name: d.node.name,
        type: d.node.type,
        edgeType: d.edge.type,
      })),
      dependencies: forward.slice(0, 10).map(d => ({
        id: d.node.id,
        name: d.node.name,
        type: d.node.type,
        edgeType: d.edge.type,
      })),
    };
  }

  /**
   * Find hotspots: most-depended-on nodes
   */
  findHotspots(limit = 10) {
    const nodeMetrics = [];

    for (const node of this.graph.nodes.values()) {
      const incomingEdges = this.graph.incoming.get(node.id) || [];
      const outgoingEdges = this.graph.outgoing.get(node.id) || [];
      const dependents = this.graph.getBackwardDependencies(node.id, 1);

      const metric = {
        id: node.id,
        name: node.name,
        type: node.type,
        inDegree: incomingEdges.length,
        outDegree: outgoingEdges.length,
        dependentCount: dependents.length,
        criticalityScore: this._calculateCriticalityScore(node, incomingEdges, outgoingEdges),
      };

      nodeMetrics.push(metric);
    }

    // Sort by criticality
    return nodeMetrics
      .sort((a, b) => b.criticalityScore - a.criticalityScore)
      .slice(0, limit);
  }

  /**
   * Trace a call path between two methods
   */
  traceCallPath(fromNodeId, toNodeId, maxDepth = 5) {
    const paths = this.graph.findPaths(fromNodeId, toNodeId, maxDepth);

    if (paths.length === 0) {
      return {
        found: false,
        fromNode: this.graph.nodes.get(fromNodeId),
        toNode: this.graph.nodes.get(toNodeId),
      };
    }

    // Find shortest path
    const shortestPath = paths.reduce((shortest, current) =>
      current.length < shortest.length ? current : shortest
    );

    const pathNodes = [fromNodeId, ...shortestPath.map(e => e.to)];
    const nodes = pathNodes.map(id => this.graph.nodes.get(id));

    return {
      found: true,
      shortestPathLength: shortestPath.length,
      allPathsCount: paths.length,
      path: nodes.map(n => ({
        id: n.id,
        name: n.name,
        type: n.type,
      })),
      edges: shortestPath.map(e => ({
        from: e.from,
        to: e.to,
        type: e.type,
      })),
    };
  }

  /**
   * Analyze class cohesion
   * How well are methods/fields within a class related?
   */
  analyzeClassCohesion(className) {
    const classId = this.graph.nodeId('class', className);
    const classNode = this.graph.nodes.get(classId);

    if (!classNode) {
      return { error: `Class not found: ${className}` };
    }

    // Find all methods and fields in class
    const containsEdges = this.graph.outgoing.get(classId) || [];
    const members = containsEdges.map(e => this.graph.nodes.get(e.to));

    const methods = members.filter(m => m.type === 'method');
    const fields = members.filter(m => m.type === 'field');

    // Calculate cohesion: how many methods use the same fields?
    const fieldUsage = this._calculateFieldUsage(classId, methods, fields);
    const cohesionScore = this._calculateCohesionScore(methods, fieldUsage);

    return {
      className,
      methodCount: methods.length,
      fieldCount: fields.length,
      cohesionScore: cohesionScore,
      cohesionLevel: this._scoreTolevel(cohesionScore, ['low', 'medium', 'high']),
      fieldUsage: fieldUsage.slice(0, 10),
      methodInterdependency: this._calculateMethodInterdependency(classId, methods),
    };
  }

  /**
   * Identify coupling between classes
   */
  findClassCoupling(limit = 10) {
    const classes = Array.from(this.graph.nodes.values()).filter(n => n.type === 'class');
    const couplingMetrics = [];

    for (const classNode of classes) {
      const outgoing = this.graph.outgoing.get(classNode.id) || [];
      const accessEdges = outgoing.filter(e => e.type === 'accesses');

      const coupledClasses = new Set();
      for (const edge of accessEdges) {
        const targetNode = this.graph.nodes.get(edge.to);
        if (targetNode.type === 'sobject') {
          coupledClasses.add(targetNode.name);
        }
      }

      couplingMetrics.push({
        className: classNode.name,
        coupledTo: Array.from(coupledClasses),
        couplingCount: coupledClasses.size,
        couplingScore: coupledClasses.size,
      });
    }

    return couplingMetrics
      .sort((a, b) => b.couplingScore - a.couplingScore)
      .slice(0, limit);
  }

  /**
   * Detect potential issues: dead code, cycles, unused fields
   */
  detectIssues() {
    const issues = {
      deadMethods: [],
      unusedFields: [],
      cycles: [],
      highComplexity: [],
    };

    // Dead methods: no incoming edges, not called
    const methodNodes = Array.from(this.graph.nodes.values()).filter(n => n.type === 'method');
    for (const method of methodNodes) {
      const incoming = this.graph.incoming.get(method.id) || [];
      const hasCallers = incoming.some(e => e.type === 'calls');

      if (!hasCallers && incoming.length === 1) {
        // Only has 'contains' edge from class
        issues.deadMethods.push({
          method: method.name,
          id: method.id,
        });
      }
    }

    // Unused fields: no accessors
    const fieldNodes = Array.from(this.graph.nodes.values()).filter(n => n.type === 'field');
    for (const field of fieldNodes) {
      const incoming = this.graph.incoming.get(field.id) || [];
      if (incoming.length === 1) {
        // Only has 'contains' edge from class
        issues.unusedFields.push({
          field: field.name,
          id: field.id,
        });
      }
    }

    // Cycles
    const cycles = this.graph.detectCycles();
    issues.cycles = cycles.slice(0, 5);

    return issues;
  }

  /**
   * Generate complexity report
   */
  generateComplexityReport() {
    const methodNodes = Array.from(this.graph.nodes.values())
      .filter(n => n.type === 'method')
      .map(m => ({
        ...m,
        complexity: m.metadata?.complexity || 0,
        parameters: m.metadata?.parameters?.length || 0,
      }))
      .sort((a, b) => b.complexity - a.complexity);

    const avgComplexity =
      methodNodes.reduce((sum, m) => sum + m.complexity, 0) / methodNodes.length;
    const maxComplexity = methodNodes[0]?.complexity || 0;

    return {
      methodCount: methodNodes.length,
      avgComplexity: Math.round(avgComplexity * 100) / 100,
      maxComplexity,
      mostComplex: methodNodes.slice(0, 10),
      complexityDistribution: this._calculateDistribution(
        methodNodes.map(m => m.complexity)
      ),
    };
  }

  /**
   * ============ Helper Methods ============
   */

  _calculateRiskScore(nodeType, affectedCount) {
    const baseScore = {
      class: 10,
      method: 5,
      field: 3,
      sobject: 20,
    }[nodeType] || 5;

    // Scale by number affected
    const impactMultiplier = Math.min(affectedCount / 5, 3);
    return Math.round(baseScore * impactMultiplier);
  }

  _riskScoreTolevel(score) {
    if (score >= 30) return 'critical';
    if (score >= 15) return 'high';
    if (score >= 5) return 'medium';
    return 'low';
  }

  _calculateCriticalityScore(node, incomingEdges, outgoingEdges) {
    // Higher score = more critical
    const inDegreeWeight = incomingEdges.length * 2;
    const outDegreeWeight = outgoingEdges.length * 1;
    const typeWeight = { class: 3, method: 2, field: 1, sobject: 4 }[node.type] || 1;

    return (inDegreeWeight + outDegreeWeight) * typeWeight;
  }

  _calculateFieldUsage(classId, methods, fields) {
    const usage = fields.map(field => ({
      fieldName: field.name,
      usedByMethods: methods.filter(m => {
        const edges = this.graph.outgoing.get(m.id) || [];
        return edges.some(e => e.to === field.id);
      }).length,
    }));

    return usage.sort((a, b) => b.usedByMethods - a.usedByMethods);
  }

  _calculateCohesionScore(methods, fieldUsage) {
    if (methods.length === 0) return 0;
    if (fieldUsage.length === 0) return 0;

    const avgFieldUsage = fieldUsage.reduce((sum, f) => sum + f.usedByMethods, 0) / fieldUsage.length;
    const cohesion = (avgFieldUsage / methods.length) * 100;

    return Math.min(cohesion, 100);
  }

  _calculateMethodInterdependency(classId, methods) {
    if (methods.length === 0) return 0;

    let callCount = 0;
    for (const method of methods) {
      const callEdges = (this.graph.outgoing.get(method.id) || []).filter(e => e.type === 'calls');
      callCount += callEdges.length;
    }

    const maxPossibleCalls = methods.length * (methods.length - 1);
    return maxPossibleCalls > 0 ? Math.round((callCount / maxPossibleCalls) * 100) : 0;
  }

  _calculateDistribution(values) {
    if (values.length === 0) return {};

    const sorted = values.sort((a, b) => a - b);
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)],
      q1: sorted[Math.floor(sorted.length / 4)],
      q3: sorted[Math.floor((sorted.length * 3) / 4)],
    };
  }

  _scoreTolevel(score, levels) {
    if (score < 33) return levels[0];
    if (score < 66) return levels[1];
    return levels[2];
  }
}

export { GraphAnalyzer };

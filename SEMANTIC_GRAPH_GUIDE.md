# Semantic Graph Implementation Guide

## Overview

The semantic graph system transforms AsfST from a syntax-based code parser into a **compiler-like intermediate representation** that models code dependencies as a Directed Acyclic Graph (DAG). This enables sophisticated analysis for impact prediction, hotspot detection, and AI-friendly context extraction.

### Key Difference from Previous Approach

**Before (Symbol Table)**: "What type is this variable?"
- Syntactic enrichment only
- Type resolution for fields/variables
- Schema constraint visibility

**Now (Semantic Graph)**: "What depends on what, and what breaks if I change it?"
- True dependency modeling with graph traversal
- Bidirectional edges (forward/backward relationships)
- Impact radius calculation
- Context scoping for AI consumption

## Architecture

### Core Components

#### 1. SemanticGraph (DAG Foundation)
**File**: `src/semantic-graph.js`

Models all code dependencies as a directed graph:

```
Node Types:
  - class: Java class or Apex class
  - method: Class method or function
  - field: Instance or class field
  - sobject: Salesforce object (Account, Contact, etc.)
  - sfield: SObject field (Account.Name, Contact.Email, etc.)

Edge Types:
  - contains: Class contains method/field
  - calls: Method calls another method
  - reads: Method reads from SObject (SOQL)
  - insert/update/delete/upsert: DML operations
  - accesses: Class accesses SObject
  - accesses_field: Method reads/writes field
  - implements: Class implements interface
  - extends: Class extends parent
```

**Key Methods**:
```javascript
// Building
addClassNode(parsedClass)          // Add class with methods/fields
addMethodNode(classId, method)     // Add method to class
addSObjectReferences(classId)      // Add SObject dependencies

// Traversal
getForwardDependencies(nodeId)     // What does this depend on?
getBackwardDependencies(nodeId)    // What depends on this?
getContextRadius(nodeId, depth)    // N-hop relevant subgraph

// Analysis
getImpactRadius(nodeId)            // Full impact scope
detectCycles()                     // Find circular dependencies
findPaths(fromId, toId)           // Trace paths between nodes
```

#### 2. ReferenceResolver (Method Call Detection)
**File**: `src/reference-resolver.js`

Builds bidirectional reference maps by analyzing method bodies:

```javascript
// Extracts:
- this.method() calls (instance methods)
- ClassName.method() calls (static methods)
- Unqualified calls (local methods)
- Field accesses
- SOQL queries
- DML operations

// Maintains:
callGraph: method → [callees]
reverseCallGraph: method → [callers]
references: method → {fieldAccesses, sobjectInteractions, ...}
```

**Key Methods**:
```javascript
_extractMethodCallsFromAST(className, method)  // Find method calls
_resolveFieldAccesses(className, method)       // Track field usage
_resolveSObjectInteractions(className, method) // Map SOQL/DML
buildImpactMap(targetMethod)                  // What breaks?
findFieldAccessors(className, fieldName)      // Who uses this field?
findSObjectUsers(objectName)                  // Who touches this object?
```

#### 3. GraphSerializer (AI-Friendly Output)
**File**: `src/graph-serializer.js`

Converts graphs to optimized formats for LLM consumption:

```javascript
// Serialization Formats

1. Full Graph
   - All nodes and edges
   - Complete graph statistics
   - Use case: Comprehensive analysis

2. Context Radius
   - N-hop relevant subgraph around target
   - 81% token reduction vs full graph
   - Use case: Focused analysis of specific method/class

3. Impact Analysis
   - Forward + backward dependencies
   - Direct/indirect impact visualization
   - Use case: Change impact prediction

4. Compact Format
   - Minimal representation
   - 97% token reduction
   - Use case: Token-constrained scenarios

5. Call Graph
   - Method-to-method calls only
   - Use case: Control flow analysis

6. Data Flow
   - SOQL reads and DML writes
   - Use case: Data dependency analysis

7. Semantic Outline
   - High-level structure summary
   - Classes with methods/fields
   - Use case: Code navigation
```

**Example Usage**:
```javascript
const serializer = new GraphSerializer(graph);

// Full graph
const full = serializer.serializeFullGraph();

// Context around a method (most common)
const context = serializer.serializeContextRadius(methodId, depth=2);
// Reduces from 5405 bytes → 1049 bytes (81% smaller)

// Compact format (ultra-efficient)
const compact = serializer.serializeCompact(methodId, depth=2);
// Reduces from 5405 bytes → 178 bytes (97% smaller)

// Token estimates
const tokens = serializer.estimateTokens(output);
const efficiency = serializer.getEfficiencyScore(output);
```

#### 4. GraphAnalyzer (Insights & Metrics)
**File**: `src/graph-analyzer.js`

Provides sophisticated code analysis:

```javascript
// Impact Analysis
analyzeImpact(nodeId)              // Change impact scoring
                                   // Returns: risk level, affected nodes

// Hotspot Detection
findHotspots(limit=10)             // Find most critical code
                                   // Scores by in-degree, out-degree, type

// Cohesion Analysis
analyzeClassCohesion(className)    // Method/field relationships
                                   // Returns: cohesion %, interdependency

// Coupling Analysis
findClassCoupling(limit=10)        // Class interdependencies
                                   // Returns: coupled objects/classes

// Issue Detection
detectIssues()                     // Find code smells
                                   // Returns: dead methods, unused fields, cycles

// Complexity Analysis
generateComplexityReport()         // Method complexity metrics
                                   // Returns: avg/max complexity, distribution

// Path Tracing
traceCallPath(fromMethod, toMethod) // Shortest call path
                                    // Returns: path nodes and edges
```

## CLI Commands

### 1. graph - Build Semantic Dependency Graph
```bash
./asfst graph <file> [options]

Options:
  --format [json|yaml|compact]    Output format (default: json)
  --include-context              Include context radius
  --context-depth N              Context hop depth (1-5)

Examples:
  ./asfst graph AccountHandler.cls
  ./asfst graph AccountHandler.cls --format compact --include-context
  ./asfst graph AccountHandler.cls --format yaml --context-depth 3

Output:
  - Full graph with all nodes/edges
  - Graph statistics and metrics
  - Optional: context radius subgraph
```

### 2. hotspots - Identify Critical Code Elements
```bash
./asfst hotspots <file> [options]

Options:
  --format [table|json|yaml]      Output format (default: table)
  --limit N                       Number of hotspots (default: 10)

Examples:
  ./asfst hotspots AccountHandler.cls --format table
  ./asfst hotspots AccountHandler.cls --limit 20 --format json

Output:
  - Methods/fields most depended on
  - Criticality scores
  - In-degree/out-degree metrics
```

### 3. issues - Detect Code Quality Issues
```bash
./asfst issues <file> [options]

Options:
  --format [summary|json|yaml]    Output format (default: summary)

Examples:
  ./asfst issues AccountHandler.cls
  ./asfst issues AccountHandler.cls --format json

Output:
  - Dead methods (no callers)
  - Unused fields (no accessors)
  - Circular dependencies
  - Issue counts and locations
```

### 4. complexity-report - Generate Complexity Analysis
```bash
./asfst complexity-report <file> [options]

Options:
  --format [summary|json|yaml]    Output format (default: summary)

Examples:
  ./asfst complexity-report AccountHandler.cls
  ./asfst complexity-report AccountHandler.cls --format json

Output:
  - Average/max complexity scores
  - Most complex methods
  - Complexity distribution (min/q1/median/q3/max)
```

## Usage Examples

### Use Case 1: Understand a Method's Dependencies
```javascript
const methodId = graph.nodeId('method', 'AccountHandler.updateIndustry');
const context = serializer.serializeContextRadius(methodId, depth=2);
// Shows: what the method depends on, what depends on it (within 2 hops)
```

### Use Case 2: Predict Change Impact
```javascript
const impact = analyzer.analyzeImpact(methodId);
console.log(`Changing this method affects ${impact.impact.totalAffected} elements`);
console.log(`Risk level: ${impact.impact.riskLevel}`);
```

### Use Case 3: Find Most Critical Code
```bash
./asfst hotspots AccountHandler.cls --format table
# Shows methods/fields most depended on - good candidates for:
# - Refactoring (break into pieces)
# - Testing (ensure reliability)
# - Documentation (most important)
```

### Use Case 4: Identify Code Smells
```bash
./asfst issues AccountHandler.cls
# Dead methods → candidates for removal
# Unused fields → candidates for removal
# Cycles → refactor to break dependency
```

## Data Format Examples

### Full Graph Output
```json
{
  "metadata": {
    "type": "full_graph",
    "nodeCount": 15,
    "edgeCount": 17
  },
  "nodes": [
    {
      "id": "class:AccountHandler",
      "type": "class",
      "name": "AccountHandler",
      "metadata": {"file": "AccountHandler.cls"}
    },
    {
      "id": "method:AccountHandler.updateIndustry",
      "type": "method",
      "name": "AccountHandler.updateIndustry",
      "metadata": {"returnType": "void", "parameters": [...]}
    }
  ],
  "edges": [
    {
      "from": "class:AccountHandler",
      "to": "method:AccountHandler.updateIndustry",
      "type": "contains"
    }
  ],
  "stats": {
    "nodesByType": {"class": 1, "method": 5, "sobject": 1},
    "edgesByType": {"contains": 9, "reads": 2},
    "cycles": 0
  }
}
```

### Context Radius Output (Compact)
```json
{
  "metadata": {
    "type": "context_radius",
    "depth": 2,
    "nodeCount": 8,
    "edgeCount": 7
  },
  "targetNode": {
    "id": "method:AccountHandler.updateIndustry",
    "type": "method",
    "name": "AccountHandler.updateIndustry"
  },
  "nodes": [...],
  "edges": [...]
}
```

### Impact Analysis Output
```json
{
  "target": {
    "id": "class:AccountHandler",
    "name": "AccountHandler",
    "type": "class"
  },
  "impact": {
    "directDependents": 0,
    "directDependencies": 17,
    "totalAffected": 17,
    "riskScore": 30,
    "riskLevel": "critical"
  },
  "dependents": [],
  "dependencies": [
    {
      "id": "method:AccountHandler.updateIndustry",
      "name": "AccountHandler.updateIndustry",
      "type": "method",
      "edgeType": "contains"
    }
  ]
}
```

## Performance Metrics

### Token Efficiency
- **Full Graph**: 1352 tokens for 15 nodes
- **Context Radius**: 262 tokens (81% reduction)
- **Compact Format**: 45 tokens (97% reduction)

### Compression Ratios
- Context radius: 81% smaller than full graph
- Compact format: 97% smaller than full graph
- Data flow view: ~50% of full graph

### Scalability
- Handles 100+ classes efficiently
- O(n) node lookup, O(1) edge lookup
- BFS/DFS traversal scales to deep dependency trees

## Integration with LLM Context

### Pattern: Scoped Analysis
```javascript
// Step 1: Get context around target
const context = serializer.serializeContextRadius(methodId, depth=2);

// Step 2: Send to LLM with query
const llmPrompt = `
  Here's the code context for method ${method.name}:
  ${JSON.stringify(context)}
  
  Question: What is the risk of changing this method?
`;

// LLM now has:
// - The target method
// - What it depends on (2 hops)
// - What depends on it (2 hops)
// - All relationships between these elements
```

### Pattern: Impact Analysis
```javascript
// Get impact without full graph
const impact = serializer.serializeImpactAnalysis(nodeId, depth=3);

// LLM sees:
// - All direct dependents (methods calling this)
// - All direct dependencies (methods called)
// - Ripple effects (2-3 hops)
```

## Testing

### Unit Tests
```bash
node test-semantic-graph.js       # DAG construction & traversal
node test-serializer-analyzer.js  # Serialization & analysis
```

### Test Coverage
- Graph construction from parsed Apex
- Node/edge creation and validation
- Forward/backward dependency traversal
- Context radius calculation
- Serialization to all formats
- Analysis metrics (hotspots, cohesion, coupling, issues)

## Future Enhancements

### Phase 2: Advanced Analysis
- [ ] Flow-sensitive analysis (track values through code)
- [ ] Taint analysis (track data sensitive operations)
- [ ] Null pointer analysis
- [ ] Type inference improvements

### Phase 3: LLM Integration
- [ ] Automatic context selection based on query
- [ ] Iterative context expansion
- [ ] Problem-aware context optimization

### Phase 4: Performance
- [ ] Graph caching/persistence
- [ ] Incremental updates (on file change)
- [ ] Large codebase optimization

## References

- **Symbol Table** (`src/symbol-table.js`): Type resolution at declaration
- **Parser** (`src/parser.js`): AST extraction from source
- **Visitor** (`src/visitor.js`): Tree-sitter traversal
- **Abstraction** (`src/abstraction.js`): High-level code representation

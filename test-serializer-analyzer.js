#!/usr/bin/env node

/**
 * Test Graph Serializer and Analyzer
 * Validates serialization formats and analysis features
 */

import fs from 'fs';
import { parseFile } from './src/parser.js';
import { SemanticGraph } from './src/semantic-graph.js';
import { ReferenceResolver } from './src/reference-resolver.js';
import { GraphSerializer } from './src/graph-serializer.js';
import { GraphAnalyzer } from './src/graph-analyzer.js';

const testFile = './tests/fixtures/SampleClass.cls';

async function runTests() {
  console.log('🔍 Testing Graph Serializer & Analyzer\n');

  // Setup
  const sourceCode = fs.readFileSync(testFile, 'utf8');
  const parsed = await parseFile(testFile);
  const graph = new SemanticGraph([parsed]);
  const sourceCodeMap = new Map([[parsed.file, sourceCode]]);
  const resolver = new ReferenceResolver(graph, [parsed], sourceCodeMap);

  const serializer = new GraphSerializer(graph);
  const analyzer = new GraphAnalyzer(graph, resolver);

  // Test 1: Full graph serialization
  console.log('1️⃣  Full Graph Serialization');
  const fullGraph = serializer.serializeFullGraph();
  console.log(`   ✓ Nodes: ${fullGraph.nodes.length}`);
  console.log(`   ✓ Edges: ${fullGraph.edges.length}`);
  console.log(`   ✓ Size: ${JSON.stringify(fullGraph).length} bytes`);
  console.log(`   ✓ Tokens (~): ${serializer.estimateTokens(fullGraph)}\n`);

  // Test 2: Context radius serialization
  console.log('2️⃣  Context Radius Serialization');
  if (graph.methodNodes.size > 0) {
    const methodId = graph.methodNodes.values().next().value;
    const contextRadius = serializer.serializeContextRadius(methodId, 2);
    console.log(`   ✓ Context nodes: ${contextRadius.nodes.length}`);
    console.log(`   ✓ Context edges: ${contextRadius.edges.length}`);
    console.log(`   ✓ Size: ${JSON.stringify(contextRadius).length} bytes`);
    console.log(`   ✓ Efficiency: ${serializer.getEfficiencyScore(contextRadius, JSON.stringify(fullGraph).length)}% reduction\n`);
  }

  // Test 3: Impact analysis serialization
  console.log('3️⃣  Impact Analysis Serialization');
  if (graph.classNodes.size > 0) {
    const classId = graph.classNodes.values().next().value;
    const impactAnalysis = serializer.serializeImpactAnalysis(classId, 2);
    console.log(`   ✓ Impacted nodes: ${impactAnalysis.nodes.length}`);
    console.log(`   ✓ Dependents: ${impactAnalysis.dependents.length}`);
    console.log(`   ✓ Dependencies: ${impactAnalysis.dependencies.length}`);
    console.log(`   ✓ Size: ${JSON.stringify(impactAnalysis).length} bytes\n`);
  }

  // Test 4: Compact format
  console.log('4️⃣  Compact Serialization (Token Efficient)');
  if (graph.methodNodes.size > 0) {
    const methodId = graph.methodNodes.values().next().value;
    const compact = serializer.serializeCompact(methodId, 2);
    const compactSize = JSON.stringify(compact).length;
    const fullSize = JSON.stringify(fullGraph).length;
    console.log(`   ✓ Compact size: ${compactSize} bytes`);
    console.log(`   ✓ Full size: ${fullSize} bytes`);
    console.log(`   ✓ Reduction: ${Math.round((1 - compactSize / fullSize) * 100)}%\n`);
  }

  // Test 5: Semantic outline
  console.log('5️⃣  Semantic Outline');
  const outline = serializer.serializeSemanticOutline();
  console.log(`   ✓ Classes: ${outline.outline.classes.length}`);
  console.log(`   ✓ SObjects: ${outline.outline.sobjects.length}`);
  if (outline.outline.classes[0]) {
    const firstClass = outline.outline.classes[0];
    console.log(`   ✓ ${firstClass.name}: ${firstClass.methods.length} methods, ${firstClass.fields.length} fields`);
  }
  console.log();

  // Test 6: Call graph
  console.log('6️⃣  Call Graph Serialization');
  const callGraph = serializer.serializeCallGraph();
  console.log(`   ✓ Methods in graph: ${callGraph.methods.length}`);
  console.log(`   ✓ Call edges: ${callGraph.calls.length}\n`);

  // Test 7: Data flow
  console.log('7️⃣  Data Flow Serialization');
  const dataFlow = serializer.serializeDataFlow();
  console.log(`   ✓ Affected nodes: ${dataFlow.nodes.length}`);
  console.log(`   ✓ Read operations: ${dataFlow.reads.length}`);
  console.log(`   ✓ Write operations: ${dataFlow.writes.length}\n`);

  // Test 8: Impact analysis
  console.log('8️⃣  Impact Analysis');
  if (graph.classNodes.size > 0) {
    const classId = graph.classNodes.values().next().value;
    const impact = analyzer.analyzeImpact(classId, 2);
    console.log(`   ✓ Target: ${impact.target.name}`);
    console.log(`   ✓ Direct dependents: ${impact.impact.directDependents}`);
    console.log(`   ✓ Direct dependencies: ${impact.impact.directDependencies}`);
    console.log(`   ✓ Risk level: ${impact.impact.riskLevel}\n`);
  }

  // Test 9: Hotspots
  console.log('9️⃣  Hotspot Detection');
  const hotspots = analyzer.findHotspots(5);
  console.log(`   ✓ Found ${hotspots.length} hotspots:`);
  hotspots.slice(0, 3).forEach((hs, i) => {
    console.log(`     ${i + 1}. ${hs.name} (score: ${hs.criticalityScore})`);
  });
  console.log();

  // Test 10: Class cohesion
  console.log('🔟 Class Cohesion Analysis');
  const classCohesion = analyzer.analyzeClassCohesion(parsed.name);
  if (!classCohesion.error) {
    console.log(`   ✓ Class: ${classCohesion.className}`);
    console.log(`   ✓ Methods: ${classCohesion.methodCount}`);
    console.log(`   ✓ Fields: ${classCohesion.fieldCount}`);
    console.log(`   ✓ Cohesion: ${classCohesion.cohesionScore}% (${classCohesion.cohesionLevel})\n`);
  }

  // Test 11: Class coupling
  console.log('1️⃣1️⃣  Class Coupling Analysis');
  const coupling = analyzer.findClassCoupling(3);
  console.log(`   ✓ Found ${coupling.length} classes with coupling`);
  coupling.forEach((c, i) => {
    console.log(`     ${i + 1}. ${c.className} → ${c.coupledTo.join(', ')}`);
  });
  console.log();

  // Test 12: Issue detection
  console.log('1️⃣2️⃣  Issue Detection');
  const issues = analyzer.detectIssues();
  console.log(`   ✓ Dead methods: ${issues.deadMethods.length}`);
  console.log(`   ✓ Unused fields: ${issues.unusedFields.length}`);
  console.log(`   ✓ Cycles: ${issues.cycles.length}\n`);

  // Test 13: Complexity report
  console.log('1️⃣3️⃣  Complexity Report');
  const complexity = analyzer.generateComplexityReport();
  console.log(`   ✓ Methods: ${complexity.methodCount}`);
  console.log(`   ✓ Avg complexity: ${complexity.avgComplexity}`);
  console.log(`   ✓ Max complexity: ${complexity.maxComplexity}`);
  if (complexity.mostComplex.length > 0) {
    console.log(`   ✓ Most complex: ${complexity.mostComplex[0].name}`);
  }
  console.log();

  // Test 14: Call path tracing
  console.log('1️⃣4️⃣  Call Path Tracing');
  if (graph.methodNodes.size >= 2) {
    const methods = Array.from(graph.methodNodes.values());
    const from = methods[0];
    const to = methods[methods.length - 1];
    const path = analyzer.traceCallPath(from, to, 5);
    if (path.found) {
      console.log(`   ✓ Path found from ${path.path[0].name} to ${path.path[path.path.length - 1].name}`);
      console.log(`   ✓ Length: ${path.shortestPathLength} hops`);
      console.log(`   ✓ Total paths: ${path.allPathsCount}`);
    } else {
      console.log(`   ✓ No call path found (expected for independent methods)\n`);
    }
  }
  console.log();

  console.log('✅ All tests completed!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err.message);
  console.error(err);
  process.exit(1);
});

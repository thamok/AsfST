#!/usr/bin/env node

/**
 * Test the Semantic Graph implementation
 * Validates:
 * - DAG construction from parsed classes
 * - Forward/backward dependency traversal
 * - Reference resolution with method calls
 * - Context radius calculation
 * - Impact analysis
 */

import fs from 'fs';
import { parseFile } from './src/parser.js';
import { SemanticGraph } from './src/semantic-graph.js';
import { ReferenceResolver } from './src/reference-resolver.js';

const testFile = './tests/fixtures/SampleClass.cls';

async function runTests() {
  console.log('🔍 Testing Semantic Graph Implementation\n');

  // Read source code for reference resolution
  const sourceCode = fs.readFileSync(testFile, 'utf8');

  // Parse the file
  console.log(`1️⃣  Parsing ${testFile}...`);
  const parsed = await parseFile(testFile);
  console.log(`   ✓ Found ${parsed.methods?.length || 0} methods`);
  console.log(`   ✓ Found ${parsed.fields?.length || 0} fields`);
  console.log(`   ✓ Class: ${parsed.name}\n`);

  // Build semantic graph
  console.log('2️⃣  Building Semantic Graph (DAG)...');
  const graph = new SemanticGraph([parsed]);
  console.log(`   ✓ Added ${graph.nodes.size} nodes`);
  console.log(`   ✓ Added ${graph.edges.size} edges`);

  // Get graph stats
  const stats = graph.getStats();
  console.log('\n📊 Graph Statistics:');
  console.log(`   Total Nodes: ${stats.totalNodes}`);
  console.log(`   Node Types:`, stats.nodesByType);
  console.log(`   Total Edges: ${stats.totalEdges}`);
  console.log(`   Edge Types:`, stats.edgesByType);
  console.log(`   Cycles Detected: ${stats.cycleCount}`);

  // Build reference resolver
  console.log('\n3️⃣  Resolving References (Method Calls)...');
  const sourceCodeMap = new Map([[parsed.file, sourceCode]]);
  const resolver = new ReferenceResolver(graph, [parsed], sourceCodeMap);

  const refStats = resolver.toJSON();
  console.log(`   ✓ Methods in call graph: ${Object.keys(refStats.callGraph).length}`);
  console.log(`   ✓ Call edges: ${refStats.stats.callEdges}`);

  // Display call graph
  console.log('\n📞 Call Graph:');
  for (const [method, callees] of Object.entries(refStats.callGraph)) {
    if (callees.length > 0) {
      console.log(`   ${method} →`);
      callees.forEach(callee => console.log(`     └─ ${callee}`));
    }
  }

  // Test forward dependencies
  console.log('\n4️⃣  Testing Forward Dependencies...');
  const methods = parsed.methods || [];
  if (methods.length > 0) {
    const method = methods[0];
    const methodId = graph.nodeId('method', `${parsed.name}.${method.name}`);
    
    if (graph.nodes.has(methodId)) {
      const forward = graph.getForwardDependencies(methodId, 1);
      console.log(`   ${parsed.name}.${method.name} depends on:`);
      forward.forEach(dep => {
        console.log(`     └─ ${dep.node.name} (via ${dep.edge.type})`);
      });
    }
  }

  // Test backward dependencies
  console.log('\n5️⃣  Testing Backward Dependencies...');
  if (methods.length > 1) {
    const method = methods[1];
    const methodId = graph.nodeId('method', `${parsed.name}.${method.name}`);
    
    if (graph.nodes.has(methodId)) {
      const backward = graph.getBackwardDependencies(methodId, 1);
      console.log(`   Methods that depend on ${parsed.name}.${method.name}:`);
      if (backward.length > 0) {
        backward.forEach(dep => {
          console.log(`     └─ ${dep.node.name} (via ${dep.edge.type})`);
        });
      } else {
        console.log('     (none found)');
      }
    }
  }

  // Test context radius
  console.log('\n6️⃣  Testing Context Radius...');
  if (methods.length > 0) {
    const method = methods[0];
    const methodId = graph.nodeId('method', `${parsed.name}.${method.name}`);
    
    if (graph.nodes.has(methodId)) {
      const context = graph.getContextRadius(methodId, 2);
      console.log(`   Context for ${parsed.name}.${method.name} (depth=2):`);
      console.log(`     Target: ${context.targetNode.name}`);
      console.log(`     Context Size: ${context.contextSize} nodes`);
      console.log(`     Nodes in context:`);
      context.nodes.slice(0, 5).forEach(node => {
        console.log(`       - ${node.name} (${node.type})`);
      });
      if (context.nodes.length > 5) {
        console.log(`       ... and ${context.nodes.length - 5} more`);
      }
    }
  }

  // Test impact analysis
  console.log('\n7️⃣  Testing Impact Analysis...');
  if (methods.length > 0) {
    const method = methods[0];
    const impactMap = resolver.buildImpactMap(`${parsed.name}.${method.name}`);
    console.log(`   Impact of changing ${parsed.name}.${method.name}:`);
    console.log(`     Direct Impact: ${impactMap.directImpact.length} methods`);
    console.log(`     Indirect Impact: ${impactMap.indirectImpact.length} methods`);
    console.log(`     Risk Level: ${impactMap.riskLevel}`);
  }

  // Test SObject interactions
  console.log('\n8️⃣  Testing SObject Interactions...');
  const sobjectUsers = {};
  for (const method of methods) {
    const refs = resolver.getMethodReferences(parsed.name, method.name);
    if (refs.sobjectInteractions) {
      const interactions = refs.sobjectInteractions;
      if (interactions.queries.length > 0 || interactions.mutations.length > 0) {
        console.log(`   ${method.name}:`);
        interactions.queries.forEach(q => {
          console.log(`     ├─ READ: ${q.object} (fields: ${q.fields?.join(', ') || 'none'})`);
        });
        interactions.mutations.forEach(m => {
          console.log(`     └─ ${m.operation.toUpperCase()}: ${m.object}`);
        });
      }
    }
  }

  // Serialize and check JSON output
  console.log('\n9️⃣  Testing Serialization...');
  const graphJson = graph.toJSON({
    includeContextRadius: true,
    contextNodeId: graph.methodNodes.get(`${parsed.name}.${methods[0]?.name}` || ''),
    contextDepth: 2,
  });
  console.log(`   ✓ Graph serialized`);
  console.log(`   ✓ JSON size: ${JSON.stringify(graphJson).length} bytes`);
  console.log(`   ✓ Nodes in JSON: ${graphJson.nodes.length}`);
  console.log(`   ✓ Edges in JSON: ${graphJson.edges.length}`);
  if (graphJson.contextRadius) {
    console.log(`   ✓ Context Radius included: ${graphJson.contextRadius.contextSize} nodes`);
  }

  // Test cycle detection
  console.log('\n🔟 Testing Cycle Detection...');
  const cycles = graph.detectCycles();
  console.log(`   Cycles found: ${cycles.length}`);
  if (cycles.length > 0) {
    cycles.slice(0, 3).forEach((cycle, i) => {
      console.log(`   Cycle ${i + 1}:`);
      cycle.forEach(edge => {
        console.log(`     ${edge.from} -> ${edge.to}`);
      });
    });
  }

  console.log('\n✅ All tests completed!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});

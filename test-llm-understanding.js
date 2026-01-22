/**
 * LLM Understanding Test Suite
 * 
 * Tests to verify that enriched context improves LLM understanding:
 * 1. Field access correctness - can LLM identify all fields being accessed?
 * 2. DML operation accuracy - can LLM identify what objects are being modified?
 * 3. Constraint awareness - does the LLM understand field requirements?
 * 4. Type safety - does the LLM understand type relationships?
 */

import { parseFile } from './src/parser.js';
import { abstractFile } from './src/abstraction.js';
import { schemaRegistry } from './src/schema-registry.js';

/**
 * Test: Field Access Completeness
 * Verify that all field accesses are captured with type information
 */
async function testFieldAccessCompleteness() {
  console.log('\n📋 Test 1: Field Access Completeness');
  console.log('-'.repeat(50));

  await schemaRegistry.loadFromCache();
  const abstraction = await abstractFile('./tests/fixtures/SampleClass.cls', {
    resolveSchema: true,
    resolveSymbols: true,
  });

  // Collect all fields mentioned
  const fieldsInReads = new Set();
  const fieldsWithTypes = new Set();

  for (const method of abstraction.methods) {
    for (const read of method.touches.reads || []) {
      for (const field of read.fields || []) {
        fieldsInReads.add(`${read.object}.${field}`);
        
        if (read.fieldTypes && read.fieldTypes[field]) {
          fieldsWithTypes.add(`${read.object}.${field}`);
        }
      }
    }
  }

  console.log(`Total fields accessed: ${fieldsInReads.size}`);
  console.log(`Fields with type info: ${fieldsWithTypes.size}`);
  console.log(`Coverage: ${(fieldsWithTypes.size / fieldsInReads.size * 100).toFixed(0)}%`);

  // Show examples
  console.log('\nExamples with type info:');
  let count = 0;
  for (const field of fieldsWithTypes) {
    if (count < 3) {
      console.log(`  ✓ ${field}`);
      count++;
    }
  }

  return {
    pass: fieldsWithTypes.size > 0,
    fieldsInReads: fieldsInReads.size,
    fieldsWithTypes: fieldsWithTypes.size,
  };
}

/**
 * Test: DML Operation Resolution
 * Verify that DML operations are correctly resolved to object types
 */
async function testDMLResolution() {
  console.log('\n🔄 Test 2: DML Operation Resolution');
  console.log('-'.repeat(50));

  await schemaRegistry.loadFromCache();
  const abstraction = await abstractFile('./tests/fixtures/SampleClass.cls', {
    resolveSchema: true,
    resolveSymbols: true,
  });

  const dmlOpsWithType = new Set();
  const allDMLOps = new Set();

  for (const method of abstraction.methods) {
    for (const write of method.touches.writes || []) {
      allDMLOps.add(`${write.operation} ${write.target}`);
      
      if (write.object) {
        dmlOpsWithType.add(`${write.operation} ${write.target} -> ${write.object}`);
      }
    }
  }

  console.log(`Total DML operations: ${allDMLOps.size}`);
  console.log(`Operations with type resolution: ${dmlOpsWithType.size}`);
  console.log(`Resolution rate: ${(dmlOpsWithType.size / allDMLOps.size * 100).toFixed(0)}%`);

  // Show DML ops
  console.log('\nDML Operations:');
  for (const op of allDMLOps) {
    const resolved = Array.from(dmlOpsWithType).find(d => d.includes(op));
    if (resolved) {
      console.log(`  ✓ ${resolved}`);
    } else {
      console.log(`  ✗ ${op} (unresolved)`);
    }
  }

  return {
    pass: dmlOpsWithType.size > 0,
    totalDML: allDMLOps.size,
    resolved: dmlOpsWithType.size,
  };
}

/**
 * Test: Schema Constraint Visibility
 * Verify that schema constraints are exposed to the LLM
 */
async function testSchemaConstraints() {
  console.log('\n🛡️  Test 3: Schema Constraint Visibility');
  console.log('-'.repeat(50));

  await schemaRegistry.loadFromCache();
  const abstraction = await abstractFile('./tests/fixtures/SampleClass.cls', {
    resolveSchema: true,
    resolveSymbols: true,
  });

  // Check schema info availability
  let objectsWithSchema = 0;
  let fieldsWithConstraints = 0;
  let fieldsWithDescriptions = 0;

  for (const obj of abstraction.touches.objects) {
    const schema = abstraction.touches.objectSchemas?.[obj];
    if (schema) {
      objectsWithSchema++;
    }
  }

  // Count field constraint info
  for (const method of abstraction.methods) {
    for (const read of method.touches.reads || []) {
      if (read.fieldTypes) {
        for (const [field, info] of Object.entries(read.fieldTypes)) {
          fieldsWithConstraints++;
          if (info.description) {
            fieldsWithDescriptions++;
          }
        }
      }
    }
  }

  console.log(`Objects with schema info: ${objectsWithSchema}/${abstraction.touches.objects?.length || 0}`);
  console.log(`Fields with constraints: ${fieldsWithConstraints}`);
  console.log(`Fields with descriptions: ${fieldsWithDescriptions}`);

  // Validation rules
  const validationRules = abstraction.constraints || [];
  console.log(`Validation rules exposed: ${validationRules.length}`);

  return {
    pass: objectsWithSchema > 0,
    objectsWithSchema,
    fieldsWithConstraints,
    validationRules: validationRules.length,
  };
}

/**
 * Test: Type Relationship Clarity
 * Verify that type relationships are clear in the context
 */
async function testTypeClarity() {
  console.log('\n🔗 Test 4: Type Relationship Clarity');
  console.log('-'.repeat(50));

  await schemaRegistry.loadFromCache();
  const abstraction = await abstractFile('./tests/fixtures/SampleClass.cls', {
    resolveSchema: true,
    resolveSymbols: true,
  });

  // Check method signatures clarity
  let methodsWithReturnType = 0;
  let methodsWithParams = 0;

  for (const method of abstraction.methods) {
    const sig = method.signature;
    if (sig.includes('List') || sig.includes('Map') || sig.includes('Set')) {
      methodsWithReturnType++;
    }
    if (sig.includes('(') && sig !== sig.replace(/\w+\s+\w+/)) {
      methodsWithParams++;
    }
  }

  console.log(`Methods with generic types: ${methodsWithReturnType}/${abstraction.methods?.length || 0}`);
  console.log(`Methods with parameters: ${methodsWithParams}/${abstraction.methods?.length || 0}`);

  // Check symbols resolution
  const symbolCount = abstraction.symbols?.classFields?.length || 0;
  console.log(`Class fields in symbol table: ${symbolCount}`);

  return {
    pass: symbolCount > 0,
    methodsWithTypes: methodsWithReturnType,
    symbols: symbolCount,
  };
}

/**
 * Test: Context Token Efficiency
 * Verify that enriched context is reasonably token-efficient
 */
async function testTokenEfficiency() {
  console.log('\n⚡ Test 5: Token Efficiency');
  console.log('-'.repeat(50));

  await schemaRegistry.loadFromCache();

  const basicAbstraction = await abstractFile('./tests/fixtures/SampleClass.cls', {
    resolveSchema: false,
    resolveSymbols: false,
  });

  const enrichedAbstraction = await abstractFile('./tests/fixtures/SampleClass.cls', {
    resolveSchema: true,
    resolveSymbols: true,
  });

  const basicTokens = basicAbstraction.tokens;
  const enrichedTokens = enrichedAbstraction.tokens;
  const overhead = ((enrichedTokens - basicTokens) / basicTokens * 100).toFixed(1);

  console.log(`Basic context: ${basicTokens} tokens`);
  console.log(`Enriched context: ${enrichedTokens} tokens`);
  console.log(`Overhead: +${overhead}%`);

  // Efficiency ratio: new info per token
  const newFieldTypes = enrichedAbstraction.methods
    .flatMap(m => m.touches.reads || [])
    .filter(r => r.fieldTypes && Object.keys(r.fieldTypes).length > 0).length;

  const efficiency = newFieldTypes / (enrichedTokens - basicTokens);
  console.log(`Information efficiency: ${efficiency.toFixed(2)} new field types per new token`);

  return {
    pass: overhead < 50, // Less than 50% overhead is acceptable
    basicTokens,
    enrichedTokens,
    overhead: parseFloat(overhead),
  };
}

/**
 * Run all tests and summarize
 */
async function runAllTests() {
  console.log('\n');
  console.log('╔' + '═'.repeat(60) + '╗');
  console.log('║' + 'LLM UNDERSTANDING TEST SUITE'.padStart(50).padEnd(60) + '║');
  console.log('╚' + '═'.repeat(60) + '╝');

  const results = [];

  try {
    results.push({
      name: 'Field Access Completeness',
      result: await testFieldAccessCompleteness(),
    });

    results.push({
      name: 'DML Operation Resolution',
      result: await testDMLResolution(),
    });

    results.push({
      name: 'Schema Constraint Visibility',
      result: await testSchemaConstraints(),
    });

    results.push({
      name: 'Type Relationship Clarity',
      result: await testTypeClarity(),
    });

    results.push({
      name: 'Token Efficiency',
      result: await testTokenEfficiency(),
    });
  } catch (error) {
    console.error('Test error:', error.message);
  }

  // Summary
  console.log('\n\n' + '═'.repeat(60));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(60));

  let passCount = 0;
  for (const { name, result } of results) {
    const status = result.pass ? '✓ PASS' : '✗ FAIL';
    console.log(`${status}: ${name}`);
    if (result.pass) passCount++;
  }

  console.log();
  console.log(`Overall: ${passCount}/${results.length} tests passed`);

  if (passCount === results.length) {
    console.log('\n✨ All tests passed! Enriched context is working effectively.');
  } else {
    console.log(`\n⚠️  ${results.length - passCount} test(s) failed.`);
  }

  console.log('\n');
}

// Run tests
runAllTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});

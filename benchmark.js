#!/usr/bin/env node

/**
 * Benchmark Script
 * 
 * Compares LLM context quality with and without symbol resolution/enrichment.
 * Tests:
 * 1. Context completeness (how much relevant info is included)
 * 2. Accuracy of type resolution
 * 3. Field constraint coverage
 * 4. Token efficiency
 */

import { parseFile } from './src/parser.js';
import { abstractFile, formatForLLM } from './src/abstraction.js';
import { formatAsSemanticContext, formatAsConstraintContext, formatAsImpactContext } from './src/llm-formatter.js';
import { schemaRegistry } from './src/schema-registry.js';
import fs from 'fs';

const TEST_FILE = process.argv[2] || './tests/fixtures/SampleClass.cls';

async function benchmark() {
  console.log('AsfST LLM Context Benchmark');
  console.log('='.repeat(60));
  console.log();

  // Load schema once
  await schemaRegistry.loadFromCache();

  // Run benchmarks
  console.log(`Analyzing: ${TEST_FILE}`);
  console.log('');

  // 1. Without enrichment (symbol resolution disabled)
  console.log('1. Context WITHOUT Symbol Resolution');
  console.log('-'.repeat(60));
  const abstractionBasic = await abstractFile(TEST_FILE, {
    resolveSymbols: false,
    resolveSchema: true,
  });
  const contextBasic = formatForLLM(abstractionBasic);
  const tokensBasic = abstractionBasic.tokens;

  console.log(`Token count: ${tokensBasic}`);
  console.log(`Objects identified: ${abstractionBasic.touches.objects?.length || 0}`);
  console.log(`Methods: ${abstractionBasic.methods?.length || 0}`);
  
  // Count field type info in output
  const fieldTypesBasic = (contextBasic.match(/\(/g) || []).length;
  console.log(`Field type annotations: ${fieldTypesBasic}`);
  console.log();

  // 2. With enrichment (symbol resolution enabled)
  console.log('2. Context WITH Symbol Resolution & Enrichment');
  console.log('-'.repeat(60));
  const abstractionEnriched = await abstractFile(TEST_FILE, {
    resolveSymbols: true,
    resolveSchema: true,
  });
  const contextEnriched = formatForLLM(abstractionEnriched);
  const tokensEnriched = abstractionEnriched.tokens;

  console.log(`Token count: ${tokensEnriched}`);
  console.log(`Objects identified: ${abstractionEnriched.touches.objects?.length || 0}`);
  console.log(`Methods: ${abstractionEnriched.methods?.length || 0}`);
  
  // Count field type info in output
  const fieldTypesEnriched = (contextEnriched.match(/\(/g) || []).length;
  console.log(`Field type annotations: ${fieldTypesEnriched}`);
  
  // Check for resolved symbols
  const symbolsCount = abstractionEnriched.symbols?.classFields?.length || 0;
  console.log(`Resolved class fields: ${symbolsCount}`);
  console.log();

  // 3. Semantic context (intent-focused)
  console.log('3. Semantic Context (Intent-Focused)');
  console.log('-'.repeat(60));
  const semanticContext = formatAsSemanticContext(abstractionEnriched);
  const semanticTokens = Math.ceil(semanticContext.length / 4);
  console.log(`Token count: ${semanticTokens}`);
  console.log('Preview:');
  console.log(semanticContext.split('\n').slice(0, 10).join('\n'));
  console.log();

  // 4. Constraint context (validation-focused)
  console.log('4. Constraint Context (Validation-Focused)');
  console.log('-'.repeat(60));
  const constraintContext = formatAsConstraintContext(abstractionEnriched);
  const constraintTokens = Math.ceil(constraintContext.length / 4);
  console.log(`Token count: ${constraintTokens}`);
  console.log('Preview:');
  console.log(constraintContext.split('\n').slice(0, 10).join('\n'));
  console.log();

  // 5. Impact analysis (risk-focused)
  console.log('5. Impact Analysis (Risk-Focused)');
  console.log('-'.repeat(60));
  const impactContext = formatAsImpactContext(abstractionEnriched);
  const impactTokens = Math.ceil(impactContext.length / 4);
  console.log(`Token count: ${impactTokens}`);
  console.log('Preview:');
  console.log(impactContext.split('\n').slice(0, 10).join('\n'));
  console.log();

  // 6. Summary comparison
  console.log('SUMMARY COMPARISON');
  console.log('='.repeat(60));
  console.log();
  console.log('Context Type                | Tokens    | Field Types | Improvement');
  console.log('-'.repeat(60));
  console.log(
    `Basic (no symbols)         | ${tokensBasic.toString().padEnd(9)} | ${fieldTypesBasic.toString().padEnd(11)} | baseline`
  );
  console.log(
    `Enriched (with symbols)    | ${tokensEnriched.toString().padEnd(9)} | ${fieldTypesEnriched.toString().padEnd(11)} | +${((fieldTypesEnriched - fieldTypesBasic) / fieldTypesBasic * 100).toFixed(0)}% fields`
  );
  console.log(
    `Semantic format            | ${semanticTokens.toString().padEnd(9)} | ${'-'.padEnd(11)} | concise`
  );
  console.log(
    `Constraint format          | ${constraintTokens.toString().padEnd(9)} | ${'-'.padEnd(11)} | focus`
  );
  console.log(
    `Impact format              | ${impactTokens.toString().padEnd(9)} | ${'-'.padEnd(11)} | risk`
  );
  console.log();

  // 7. Quality metrics
  console.log('QUALITY METRICS');
  console.log('='.repeat(60));
  console.log();
  
  // Count DML operations with type info
  const dmlWithType = abstractionEnriched.methods
    .flatMap(m => m.touches.writes || [])
    .filter(w => w.object).length;
  const totalDML = abstractionEnriched.methods
    .flatMap(m => m.touches.writes || []).length;
  
  console.log(`DML operations with resolved type: ${dmlWithType}/${totalDML}`);

  // Count SOQL queries with field types
  const soqlWithFieldTypes = abstractionEnriched.methods
    .flatMap(m => m.touches.reads || [])
    .filter(r => r.fieldTypes && Object.keys(r.fieldTypes).length > 0).length;
  const totalSOQL = abstractionEnriched.methods
    .flatMap(m => m.touches.reads || []).length;
  
  console.log(`SOQL queries with field type info: ${soqlWithFieldTypes}/${totalSOQL}`);

  // Validation rules coverage
  const objectsWithValidation = Object.values(abstractionEnriched.touches.objectSchemas || {})
    .filter(s => s.hasValidationRules).length;
  
  console.log(`Objects with validation rules: ${objectsWithValidation}/${abstractionEnriched.touches.objects?.length || 0}`);

  console.log();
  console.log('Benchmark complete!');
}

benchmark().catch(err => {
  console.error('Benchmark failed:', err.message);
  process.exit(1);
});

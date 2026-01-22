/**
 * Unit tests for the Abstraction Layer
 */

import { abstractFile, abstractCode, formatForLLM, estimateTokens } from '../src/abstraction.js';
import { SchemaRegistry, CORE_SALES_CLOUD_OBJECTS } from '../src/schema-registry.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(__dirname, 'fixtures');

describe('Abstraction Layer', () => {
  describe('abstractFile', () => {
    test('should create abstraction from class file', async () => {
      const abstraction = await abstractFile(
        path.join(fixturesPath, 'SampleClass.cls'),
        { resolveSchema: true }
      );

      expect(abstraction.meta.name).toBe('AccountHandler');
      expect(abstraction.meta.type).toBe('class');
      expect(abstraction.meta.file).toBe('SampleClass.cls');
      expect(abstraction.methods).toBeInstanceOf(Array);
      expect(abstraction.tokens).toBeGreaterThan(0);
    });

    test('should create abstraction from trigger file', async () => {
      const abstraction = await abstractFile(
        path.join(fixturesPath, 'SampleTrigger.trigger'),
        { resolveSchema: true }
      );

      expect(abstraction.meta.name).toBe('AccountTrigger');
      expect(abstraction.meta.type).toBe('trigger');
      expect(abstraction.signature.object).toBe('Account');
      expect(abstraction.signature.events).toContain('before insert');
    });

    test('should filter to specific method when targetMethod is set', async () => {
      const abstraction = await abstractFile(
        path.join(fixturesPath, 'SampleClass.cls'),
        { targetMethod: 'getAccountsByIndustry' }
      );

      expect(abstraction.methods).toHaveLength(1);
      expect(abstraction.methods[0].name).toBe('getAccountsByIndustry');
    });
  });

  describe('abstractCode', () => {
    test('should create abstraction from code string', async () => {
      const code = `
        public class SimpleClass {
          public void doQuery() {
            List<Account> accounts = [SELECT Id, Name FROM Account];
            update accounts;
          }
        }
      `;
      
      const abstraction = await abstractCode(code, { resolveSchema: true });

      expect(abstraction.meta.name).toBe('SimpleClass');
      expect(abstraction.methods).toHaveLength(1);
      expect(abstraction.methods[0].touches.reads).toHaveLength(1);
      expect(abstraction.methods[0].touches.writes).toHaveLength(1);
    });
  });

  describe('Signature extraction', () => {
    test('should extract class modifiers and annotations', async () => {
      const abstraction = await abstractFile(
        path.join(fixturesPath, 'SampleClass.cls')
      );

      expect(abstraction.signature.modifiers).toContain('public');
      expect(abstraction.signature.modifiers).toContain('with sharing');
      expect(abstraction.signature.annotations).toContain('isTest');
      expect(abstraction.signature.implements).toContain('IHandler');
      expect(abstraction.signature.implements).toContain('Serializable');
    });

    test('should extract trigger signature', async () => {
      const abstraction = await abstractFile(
        path.join(fixturesPath, 'SampleTrigger.trigger')
      );

      expect(abstraction.signature.object).toBe('Account');
      expect(abstraction.signature.events).toHaveLength(5);
    });
  });

  describe('Method abstractions', () => {
    test('should build method signatures correctly', async () => {
      const abstraction = await abstractFile(
        path.join(fixturesPath, 'SampleClass.cls')
      );

      const method = abstraction.methods.find(m => m.name === 'getAccountsByIndustry');
      expect(method).toBeDefined();
      expect(method.signature).toContain('List<Account>');
      expect(method.signature).toContain('String industry');
      expect(method.signature).toContain('Boolean includeChildren');
    });

    test('should track method complexity', async () => {
      const abstraction = await abstractFile(
        path.join(fixturesPath, 'SampleClass.cls')
      );

      for (const method of abstraction.methods) {
        expect(method.complexity).toBeDefined();
        expect(method.complexity.score).toBeGreaterThanOrEqual(1);
        expect(method.complexity.rating).toBeDefined();
      }
    });
  });

  describe('Touches tracking', () => {
    test('should track SOQL reads with fields', async () => {
      const abstraction = await abstractFile(
        path.join(fixturesPath, 'SampleClass.cls')
      );

      const method = abstraction.methods.find(m => m.name === 'getAccountsByIndustry');
      expect(method.touches.reads.length).toBeGreaterThan(0);
      
      const read = method.touches.reads[0];
      expect(read.object).toBe('Account');
      expect(read.fields).toContain('Id');
      expect(read.fields).toContain('Name');
    });

    test('should track DML writes', async () => {
      const abstraction = await abstractFile(
        path.join(fixturesPath, 'SampleClass.cls')
      );

      const method = abstraction.methods.find(m => m.name === 'updateIndustry');
      expect(method.touches.writes.length).toBeGreaterThan(0);
      expect(method.touches.writes[0].operation).toBe('update');
    });

    test('should aggregate objects across all methods', async () => {
      const abstraction = await abstractFile(
        path.join(fixturesPath, 'SampleClass.cls')
      );

      expect(abstraction.touches.objects).toContain('Account');
      expect(abstraction.touches.operations.queries.length).toBeGreaterThan(0);
      expect(abstraction.touches.operations.dml.length).toBeGreaterThan(0);
    });
  });

  describe('State abstraction', () => {
    test('should extract fields', async () => {
      const abstraction = await abstractFile(
        path.join(fixturesPath, 'SampleClass.cls')
      );

      expect(abstraction.state.fields.length).toBeGreaterThan(0);
      
      const constantField = abstraction.state.fields.find(f => f.name === 'DEFAULT_INDUSTRY');
      expect(constantField).toBeDefined();
      expect(constantField.type).toBe('String');
      expect(constantField.modifiers).toContain('static');
      expect(constantField.modifiers).toContain('final');
    });
  });

  describe('Complexity tracking', () => {
    test('should calculate total complexity', async () => {
      const abstraction = await abstractFile(
        path.join(fixturesPath, 'SampleClass.cls')
      );

      expect(abstraction.complexity.total).toBeGreaterThan(0);
      expect(abstraction.complexity.rating).toBeDefined();
    });

    test('should identify complexity hotspots', async () => {
      const abstraction = await abstractFile(
        path.join(fixturesPath, 'SampleClass.cls')
      );

      // Hotspots are methods with complexity > 10
      // Our sample may or may not have them
      expect(abstraction.complexity.hotspots).toBeInstanceOf(Array);
    });
  });

  describe('Inner types', () => {
    test('should extract inner classes and enums', async () => {
      const abstraction = await abstractFile(
        path.join(fixturesPath, 'SampleClass.cls')
      );

      expect(abstraction.innerTypes.length).toBeGreaterThan(0);
      
      const processResult = abstraction.innerTypes.find(t => t.name === 'ProcessResult');
      expect(processResult).toBeDefined();
      expect(processResult.type).toBe('class');
      
      const statusEnum = abstraction.innerTypes.find(t => t.name === 'Status');
      expect(statusEnum).toBeDefined();
      expect(statusEnum.type).toBe('enum');
      expect(statusEnum.values).toContain('PENDING');
    });
  });
});

describe('LLM Format', () => {
  test('should format abstraction for LLM consumption', async () => {
    const abstraction = await abstractFile(
      path.join(fixturesPath, 'SampleClass.cls')
    );

    const formatted = formatForLLM(abstraction);

    expect(formatted).toContain('# class: AccountHandler');
    expect(formatted).toContain('## Signature');
    expect(formatted).toContain('## Methods');
    expect(formatted).toContain('## Complexity');
    expect(formatted).toContain('Modifiers:');
  });

  test('should include trigger-specific info in LLM format', async () => {
    const abstraction = await abstractFile(
      path.join(fixturesPath, 'SampleTrigger.trigger')
    );

    const formatted = formatForLLM(abstraction);

    expect(formatted).toContain('# trigger: AccountTrigger');
    expect(formatted).toContain('Trigger On: Account');
    expect(formatted).toContain('Events:');
  });
});

describe('Token Estimation', () => {
  test('should estimate tokens for abstraction', async () => {
    const abstraction = await abstractFile(
      path.join(fixturesPath, 'SampleClass.cls')
    );

    expect(abstraction.tokens).toBeGreaterThan(0);
    expect(abstraction.tokens).toBeLessThan(10000); // Sanity check
  });

  test('should estimate fewer tokens for focused method', async () => {
    const fullAbstraction = await abstractFile(
      path.join(fixturesPath, 'SampleClass.cls')
    );

    const focusedAbstraction = await abstractFile(
      path.join(fixturesPath, 'SampleClass.cls'),
      { targetMethod: 'updateIndustry' }
    );

    expect(focusedAbstraction.tokens).toBeLessThan(fullAbstraction.tokens);
  });
});

describe('Schema Registry', () => {
  let registry;

  beforeEach(() => {
    registry = new SchemaRegistry();
  });

  test('should have core Sales Cloud objects', () => {
    expect(CORE_SALES_CLOUD_OBJECTS).toContain('Account');
    expect(CORE_SALES_CLOUD_OBJECTS).toContain('Contact');
    expect(CORE_SALES_CLOUD_OBJECTS).toContain('Opportunity');
    expect(CORE_SALES_CLOUD_OBJECTS).toContain('Lead');
    expect(CORE_SALES_CLOUD_OBJECTS).toContain('Case');
  });

  test('should create standard object stubs', async () => {
    await registry.loadFromCache();
    
    const account = registry.getObject('Account');
    expect(account).toBeDefined();
    expect(account.name).toBe('Account');
    expect(account.isStandard).toBe(true);
    expect(account.fields.size).toBeGreaterThan(0);
  });

  test('should get field info', async () => {
    await registry.loadFromCache();
    
    const field = registry.getField('Account', 'Name');
    expect(field).toBeDefined();
    expect(field.name).toBe('Name');
  });

  test('should identify core objects', () => {
    expect(registry.isCoreObject('Account')).toBe(true);
    expect(registry.isCoreObject('CustomObject__c')).toBe(false);
  });
});

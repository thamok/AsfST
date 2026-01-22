/**
 * Unit tests for the Apex Parser
 */

import { parseFile, parseCode, parseSOQL } from '../src/parser.js';
import { calculateComplexity, getComplexityRating, analyzeComplexity } from '../src/complexity.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(__dirname, 'fixtures');

describe('Parser', () => {
  describe('parseFile', () => {
    test('should parse a class file successfully', async () => {
      const result = await parseFile(path.join(fixturesPath, 'SampleClass.cls'));
      
      expect(result.name).toBe('AccountHandler');
      expect(result.type).toBe('class');
      expect(result.fileType).toBe('class');
      expect(result.file).toBe('SampleClass.cls');
    });

    test('should parse a trigger file successfully', async () => {
      const result = await parseFile(path.join(fixturesPath, 'SampleTrigger.trigger'));
      
      expect(result.name).toBe('AccountTrigger');
      expect(result.type).toBe('trigger');
      expect(result.fileType).toBe('trigger');
      expect(result.object).toBe('Account');
      expect(result.events).toContain('before insert');
      expect(result.events).toContain('after update');
    });

    test('should throw error for non-existent file', async () => {
      await expect(parseFile('nonexistent.cls')).rejects.toThrow('File not found');
    });

    test('should throw error for unsupported extension', async () => {
      await expect(parseFile(path.join(fixturesPath, 'SampleClass.cls')
        .replace('.cls', '.txt'))).rejects.toThrow();
    });
  });

  describe('parseCode', () => {
    test('should parse a simple class', () => {
      const code = `
        public class SimpleClass {
          public void doSomething() {}
        }
      `;
      const result = parseCode(code);
      
      expect(result.name).toBe('SimpleClass');
      expect(result.type).toBe('class');
      expect(result.modifiers).toContain('public');
      expect(result.methods).toHaveLength(1);
      expect(result.methods[0].name).toBe('doSomething');
    });

    test('should extract class modifiers correctly', () => {
      const code = `
        public with sharing class SecureClass {}
      `;
      const result = parseCode(code);
      
      expect(result.modifiers).toContain('public');
      expect(result.modifiers).toContain('with sharing');
    });

    test('should extract interfaces', () => {
      const code = `
        public class MyClass implements Comparable, Schedulable {}
      `;
      const result = parseCode(code);
      
      expect(result.implements).toContain('Comparable');
      expect(result.implements).toContain('Schedulable');
    });

    test('should extract annotations', () => {
      const code = `
        @isTest
        public class TestClass {}
      `;
      const result = parseCode(code);
      
      expect(result.annotations).toHaveLength(1);
      expect(result.annotations[0].name).toBe('isTest');
    });

    test('should extract superclass', () => {
      const code = `
        public class ChildClass extends ParentClass {}
      `;
      const result = parseCode(code);
      
      expect(result.extends).toBe('ParentClass');
    });
  });

  describe('Method extraction', () => {
    test('should extract method signatures', () => {
      const code = `
        public class MyClass {
          public String getName(Integer id, Boolean active) {
            return 'test';
          }
        }
      `;
      const result = parseCode(code);
      
      expect(result.methods).toHaveLength(1);
      const method = result.methods[0];
      expect(method.name).toBe('getName');
      expect(method.returnType).toBe('String');
      expect(method.modifiers).toContain('public');
      expect(method.parameters).toHaveLength(2);
      expect(method.parameters[0].name).toBe('id');
      expect(method.parameters[0].type).toBe('Integer');
      expect(method.parameters[1].name).toBe('active');
      expect(method.parameters[1].type).toBe('Boolean');
    });

    test('should extract generic return types', () => {
      const code = `
        public class MyClass {
          public List<Account> getAccounts() { return null; }
          public Map<Id, Contact> getContacts() { return null; }
        }
      `;
      const result = parseCode(code);
      
      expect(result.methods[0].returnType).toBe('List<Account>');
      expect(result.methods[1].returnType).toBe('Map<Id, Contact>');
    });

    test('should extract void methods', () => {
      const code = `
        public class MyClass {
          public void doNothing() {}
        }
      `;
      const result = parseCode(code);
      
      expect(result.methods[0].returnType).toBe('void');
    });
  });

  describe('Field extraction', () => {
    test('should extract field declarations', () => {
      const code = `
        public class MyClass {
          private String name;
          public static final Integer MAX = 100;
        }
      `;
      const result = parseCode(code);
      
      expect(result.fields).toHaveLength(2);
      expect(result.fields[0].name).toBe('name');
      expect(result.fields[0].type).toBe('String');
      expect(result.fields[0].modifiers).toContain('private');
      
      expect(result.fields[1].name).toBe('MAX');
      expect(result.fields[1].modifiers).toContain('public');
      expect(result.fields[1].modifiers).toContain('static');
      expect(result.fields[1].modifiers).toContain('final');
      expect(result.fields[1].initialValue).toBe('100');
    });
  });

  describe('Constructor extraction', () => {
    test('should extract constructors', () => {
      const code = `
        public class MyClass {
          public MyClass() {}
          public MyClass(String name) {}
        }
      `;
      const result = parseCode(code);
      
      expect(result.constructors).toHaveLength(2);
      expect(result.constructors[0].name).toBe('MyClass');
      expect(result.constructors[0].parameters).toHaveLength(0);
      expect(result.constructors[1].parameters).toHaveLength(1);
    });
  });

  describe('SOQL extraction', () => {
    test('should extract SOQL queries', () => {
      const code = `
        public class MyClass {
          public void query() {
            List<Account> accs = [SELECT Id, Name FROM Account WHERE Active__c = true];
          }
        }
      `;
      const result = parseCode(code);
      
      expect(result.soql).toHaveLength(1);
      expect(result.soql[0].object).toBe('Account');
      expect(result.soql[0].fields).toContain('Id');
      expect(result.soql[0].fields).toContain('Name');
    });

    test('should extract SOQL from methods', () => {
      const code = `
        public class MyClass {
          public void query() {
            List<Contact> cons = [SELECT Id FROM Contact];
          }
        }
      `;
      const result = parseCode(code);
      
      expect(result.methods[0].soql).toHaveLength(1);
      expect(result.methods[0].soql[0].object).toBe('Contact');
    });

    test('should handle subqueries', async () => {
      const result = await parseFile(path.join(fixturesPath, 'SampleClass.cls'));
      
      const methodWithSubquery = result.methods.find(m => m.name === 'getAccountsByIndustry');
      expect(methodWithSubquery).toBeDefined();
      
      const queryWithSubquery = methodWithSubquery.soql.find(q => 
        q.fields.some(f => typeof f === 'object' && f.subquery)
      );
      expect(queryWithSubquery).toBeDefined();
    });
  });

  describe('DML extraction', () => {
    test('should extract DML operations', () => {
      const code = `
        public class MyClass {
          public void dml() {
            insert new Account(Name = 'Test');
            update accounts;
            delete oldRecords;
          }
        }
      `;
      const result = parseCode(code);
      
      expect(result.dml).toHaveLength(3);
      expect(result.dml.map(d => d.type)).toContain('insert');
      expect(result.dml.map(d => d.type)).toContain('update');
      expect(result.dml.map(d => d.type)).toContain('delete');
    });

    test('should track DML in methods', () => {
      const code = `
        public class MyClass {
          public void save(Account acc) {
            update acc;
          }
        }
      `;
      const result = parseCode(code);
      
      expect(result.methods[0].dml).toHaveLength(1);
      expect(result.methods[0].dml[0].type).toBe('update');
    });
  });

  describe('Inner classes and enums', () => {
    test('should extract inner classes', async () => {
      const result = await parseFile(path.join(fixturesPath, 'SampleClass.cls'));
      
      expect(result.innerClasses.length).toBeGreaterThan(0);
      
      const processResult = result.innerClasses.find(c => c.name === 'ProcessResult');
      expect(processResult).toBeDefined();
      expect(processResult.type).toBe('class');
    });

    test('should extract inner enums', async () => {
      const result = await parseFile(path.join(fixturesPath, 'SampleClass.cls'));
      
      const statusEnum = result.innerClasses.find(c => c.name === 'Status');
      expect(statusEnum).toBeDefined();
      expect(statusEnum.type).toBe('enum');
      expect(statusEnum.values).toContain('PENDING');
      expect(statusEnum.values).toContain('COMPLETED');
    });
  });

  describe('Interface parsing', () => {
    test('should parse interfaces', () => {
      const code = `
        public interface IHandler {
          void handle(Object obj);
          String getName();
        }
      `;
      const result = parseCode(code);
      
      expect(result.type).toBe('interface');
      expect(result.name).toBe('IHandler');
      expect(result.methods).toHaveLength(2);
      expect(result.methods[0].isAbstract).toBe(true);
    });
  });

  describe('Trigger parsing', () => {
    test('should parse trigger events', async () => {
      const result = await parseFile(path.join(fixturesPath, 'SampleTrigger.trigger'));
      
      expect(result.events).toHaveLength(5);
      expect(result.events).toContain('before insert');
      expect(result.events).toContain('before update');
      expect(result.events).toContain('after insert');
      expect(result.events).toContain('after update');
      expect(result.events).toContain('before delete');
    });

    test('should extract trigger SOQL and DML', async () => {
      const result = await parseFile(path.join(fixturesPath, 'SampleTrigger.trigger'));
      
      expect(result.soql.length).toBeGreaterThan(0);
      expect(result.dml.length).toBeGreaterThan(0);
      expect(result.dml.some(d => d.type === 'insert')).toBe(true);
    });
  });
});

describe('Complexity', () => {
  describe('calculateComplexity', () => {
    test('should calculate base complexity as 1', () => {
      const code = `
        public class Simple {
          public void nothing() {}
        }
      `;
      const result = parseCode(code);
      expect(result.methods[0].complexity).toBe(1);
    });

    test('should count if statements', () => {
      const code = `
        public class MyClass {
          public void check(Boolean a) {
            if (a) {
              System.debug('yes');
            }
          }
        }
      `;
      const result = parseCode(code);
      expect(result.methods[0].complexity).toBe(2); // 1 base + 1 if
    });

    test('should count for loops', () => {
      const code = `
        public class MyClass {
          public void loop(List<String> items) {
            for (String s : items) {
              System.debug(s);
            }
          }
        }
      `;
      const result = parseCode(code);
      expect(result.methods[0].complexity).toBe(2); // 1 base + 1 for
    });

    test('should count logical operators', () => {
      const code = `
        public class MyClass {
          public void check(Boolean a, Boolean b, Boolean c) {
            if (a && b || c) {
              System.debug('complex');
            }
          }
        }
      `;
      const result = parseCode(code);
      // 1 base + 1 if + 2 logical operators (&&, ||)
      expect(result.methods[0].complexity).toBe(4);
    });

    test('should count nested structures', () => {
      const code = `
        public class MyClass {
          public void nested(List<Account> accounts) {
            for (Account acc : accounts) {
              if (acc.Name != null) {
                if (acc.Active__c) {
                  System.debug(acc.Name);
                }
              }
            }
          }
        }
      `;
      const result = parseCode(code);
      // 1 base + 1 for + 2 if
      expect(result.methods[0].complexity).toBe(4);
    });
  });

  describe('getComplexityRating', () => {
    test('should return low for complexity <= 5', () => {
      expect(getComplexityRating(1).level).toBe('low');
      expect(getComplexityRating(5).level).toBe('low');
    });

    test('should return moderate for complexity 6-10', () => {
      expect(getComplexityRating(6).level).toBe('moderate');
      expect(getComplexityRating(10).level).toBe('moderate');
    });

    test('should return high for complexity 11-20', () => {
      expect(getComplexityRating(11).level).toBe('high');
      expect(getComplexityRating(20).level).toBe('high');
    });

    test('should return very-high for complexity 21-50', () => {
      expect(getComplexityRating(21).level).toBe('very-high');
      expect(getComplexityRating(50).level).toBe('very-high');
    });

    test('should return critical for complexity > 50', () => {
      expect(getComplexityRating(51).level).toBe('critical');
      expect(getComplexityRating(100).level).toBe('critical');
    });
  });

  describe('analyzeComplexity', () => {
    test('should analyze sample class complexity', async () => {
      const result = await parseFile(path.join(fixturesPath, 'SampleClass.cls'));
      const analysis = analyzeComplexity(result);
      
      expect(analysis.total).toBeGreaterThan(0);
      expect(analysis.methodCount).toBeGreaterThan(0);
      expect(analysis.methods).toBeInstanceOf(Array);
      expect(analysis.totalRating).toBeDefined();
    });

    test('should identify high complexity methods', async () => {
      const result = await parseFile(path.join(fixturesPath, 'SampleClass.cls'));
      const analysis = analyzeComplexity(result);
      
      // Methods with complexity > 10 should be flagged
      for (const method of analysis.highComplexityMethods) {
        expect(method.complexity).toBeGreaterThan(10);
      }
    });
  });
});

describe('parseSOQL', () => {
  test('should validate correct SOQL', () => {
    const result = parseSOQL('SELECT Id, Name FROM Account');
    expect(result.valid).toBe(true);
  });

  test('should detect invalid SOQL', () => {
    // Tree-sitter is lenient with some errors, use clearly broken syntax
    const result = parseSOQL('SELECT FROM'); // missing fields and object
    expect(result.valid).toBe(false);
  });
});

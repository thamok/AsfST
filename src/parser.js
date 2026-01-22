
import fse from 'fs-extra';
import path from 'path';
import { parse } from 'apex-parser';

const CACHE_DIR = '.asfst-cache';
const SYMBOL_TABLE_DIR = '.asfst-symbols';

async function parseMetadata() {
  console.log('Starting metadata parsing...');

  await fse.ensureDir(SYMBOL_TABLE_DIR);
  await fse.emptyDir(SYMBOL_TABLE_DIR);

  await parseDirectory(CACHE_DIR);

  console.log('Metadata parsing complete. Symbol table created at .asfst-symbols');
}

async function parseDirectory(directory) {
  const items = await fse.readdir(directory);

  for (const item of items) {
    const itemPath = path.join(directory, item);
    const stat = await fse.stat(itemPath);

    if (stat.isDirectory()) {
      await parseDirectory(itemPath);
    } else {
      await processFile(itemPath);
    }
  }
}

async function processFile(filePath) {
  if (filePath.endsWith('.json')) {
    const content = await fse.readJson(filePath);
    if (content.CustomObject) {
      await parseCustomObject(filePath, content.CustomObject);
    }
  } else if (filePath.endsWith('.cls')) {
    const content = await fse.readFile(filePath, 'utf-8');
    await parseApexClass(filePath, content);
  }
}

async function parseApexClass(filePath, apexCode) {
  const className = path.basename(filePath, '.cls');
  try {
    const rawAst = parse(apexCode, { ast: true });
    if (!rawAst.class) {
      console.error(`Failed to find class declaration in ${className}.cls`);
      return;
    }
    const transformedAst = transformApexAst(rawAst.class[0]);
    const symbolFilePath = path.join(SYMBOL_TABLE_DIR, `${className}.json`);
    await fse.writeJson(symbolFilePath, transformedAst, { spaces: 2 });
  } catch (e) {
    console.error(`Failed to parse ${className}.cls:`, e.message);
  }
}

function walk(node, visitor) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (visitor[node.type]) {
    visitor[node.type](node);
  }

  for (const key in node) {
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(item => walk(item, visitor));
      } else if (child && typeof child === 'object') {
        walk(child, visitor);
      }
    }
  }
}

function findDependencies(node) {
  const dependencies = new Set();
  walk(node, {
    soqlExpression: (soqlNode) => {
      if (soqlNode.from && soqlNode.from.name) {
        const objectName = soqlNode.from.name;
        dependencies.add(`SObject.${objectName}`);
        if (soqlNode.select && soqlNode.select.fields) {
          for (const field of soqlNode.select.fields) {
            if (field.name) {
              dependencies.add(`SObjectField.${objectName}.${field.name}`);
            }
          }
        }
      }
    }
  });
  return dependencies;
}

function transformApexAst(classNode) {
  const symbol = {
    name: classNode.name,
    type: 'ApexClass',
    dependencies: [...findDependencies(classNode)],
    methods: [],
    properties: [],
    innerClasses: [],
  };

  if (classNode.body) {
    for (const member of classNode.body) {
      switch (member.type) {
        case 'method':
          symbol.methods.push(transformMethod(member));
          break;
        case 'property':
          symbol.properties.push(transformProperty(member));
          break;
        case 'class':
          symbol.innerClasses.push(transformApexAst(member));
          break;
      }
    }
  }

  return symbol;
}

function transformMethod(methodNode) {
  return {
    name: methodNode.name,
    parameters: methodNode.parameters?.map(p => ({
      name: p.name,
      type: p.type,
    })) || [],
    returnType: methodNode.returnType,
    modifiers: methodNode.modifiers?.map(m => m.name) || [],
  };
}

function transformProperty(propertyNode) {
  return {
    name: propertyNode.name,
    type: propertyNode.type,
    modifiers: propertyNode.modifiers?.map(m => m.name) || [],
  };
}

async function parseCustomObject(filePath, customObject) {
  const objectName = path.basename(filePath, '.json');
  const symbol = {
    name: objectName,
    fields: [],
    validationRules: [],
  };

  if (customObject.fields) {
    const fields = Array.isArray(customObject.fields) ? customObject.fields : [customObject.fields];
    for (const field of fields) {
      symbol.fields.push({
        name: field.fullName,
        type: field.type,
        required: field.required === 'true',
        fieldLevelSecurity: field.fieldLevelSecurity,
      });
    }
  }

  if (customObject.validationRules) {
    const rules = Array.isArray(customObject.validationRules) ? customObject.validationRules : [customObject.validationRules];
    for (const rule of rules) {
      symbol.validationRules.push({
        name: rule.fullName,
        active: rule.active === 'true',
        errorConditionFormula: rule.errorConditionFormula,
        errorMessage: rule.errorMessage,
      });
    }
  }

  const symbolFilePath = path.join(SYMBOL_TABLE_DIR, `${objectName}.json`);
  await fse.writeJson(symbolFilePath, symbol, { spaces: 2 });
}


export { parseMetadata };

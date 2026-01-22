
import fse from 'fs-extra';
import path from 'path';

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
    } else if (itemPath.endsWith('.json')) {
      await processFile(itemPath);
    }
  }
}

async function processFile(filePath) {
  const content = await fse.readJson(filePath);

  if (content.CustomObject) {
    await parseCustomObject(filePath, content.CustomObject);
  }
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

/**
 * Apex Parser Module
 * 
 * Parses Apex code using tree-sitter-sfapex and returns structured AST data
 * including class/method signatures, SOQL queries, DML operations, and complexity metrics.
 */

import Parser from 'tree-sitter';
import TsSfApex from 'tree-sitter-sfapex';
import fse from 'fs-extra';
import path from 'path';
import { ApexVisitor } from './visitor.js';

// Create singleton parser instances for each language
const apexParser = new Parser();
apexParser.setLanguage(TsSfApex.apex);

const soqlParser = new Parser();
soqlParser.setLanguage(TsSfApex.soql);

const soslParser = new Parser();
soslParser.setLanguage(TsSfApex.sosl);

/**
 * Parse an Apex file and extract structured metadata
 * @param {string} filePath - Path to the .cls or .trigger file
 * @param {Object} options - Parser options
 * @param {boolean} options.includeRawTree - Include the raw AST tree in output
 * @returns {Promise<Object>} Parsed file metadata
 */
async function parseFile(filePath, options = {}) {
  const absolutePath = path.resolve(filePath);
  
  if (!await fse.pathExists(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }
  
  const code = await fse.readFile(absolutePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  
  // Determine file type
  let fileType;
  if (ext === '.cls') {
    fileType = 'class';
  } else if (ext === '.trigger') {
    fileType = 'trigger';
  } else {
    throw new Error(`Unsupported file extension: ${ext}. Expected .cls or .trigger`);
  }
  
  const result = parseCode(code, { ...options, fileType });
  result.file = fileName;
  result.path = absolutePath;
  
  return result;
}

/**
 * Parse Apex code string and extract structured metadata
 * @param {string} code - Apex source code
 * @param {Object} options - Parser options
 * @param {string} options.fileType - 'class' or 'trigger'
 * @param {boolean} options.includeRawTree - Include the raw AST tree in output
 * @returns {Object} Parsed code metadata
 */
function parseCode(code, options = {}) {
  const { fileType = 'class', includeRawTree = false } = options;
  
  const tree = apexParser.parse(code);
  const visitor = new ApexVisitor(code, tree);
  const result = visitor.visit();
  
  result.fileType = fileType;
  
  if (includeRawTree) {
    result.rawTree = serializeTree(tree.rootNode);
  }
  
  return result;
}

/**
 * Parse a SOQL query string
 * @param {string} query - SOQL query string
 * @returns {Object} Parsed SOQL structure
 */
function parseSOQL(query) {
  const tree = soqlParser.parse(query);
  return {
    valid: !tree.rootNode.hasError,
    tree: serializeTree(tree.rootNode),
  };
}

/**
 * Parse a SOSL query string
 * @param {string} query - SOSL query string
 * @returns {Object} Parsed SOSL structure
 */
function parseSOSL(query) {
  const tree = soslParser.parse(query);
  return {
    valid: !tree.rootNode.hasError,
    tree: serializeTree(tree.rootNode),
  };
}

/**
 * Serialize a tree-sitter node to a plain object
 * @param {Object} node - Tree-sitter node
 * @param {number} maxDepth - Maximum depth to serialize
 * @returns {Object} Serialized node
 */
function serializeTree(node, maxDepth = 10) {
  if (maxDepth <= 0) {
    return { type: node.type, truncated: true };
  }
  
  const result = {
    type: node.type,
    startPosition: node.startPosition,
    endPosition: node.endPosition,
  };
  
  if (node.namedChildCount === 0) {
    result.text = node.text;
  } else {
    result.children = node.namedChildren.map(child => 
      serializeTree(child, maxDepth - 1)
    );
  }
  
  return result;
}

export { 
  parseFile, 
  parseCode, 
  parseSOQL, 
  parseSOSL,
  apexParser,
  soqlParser,
  soslParser,
};

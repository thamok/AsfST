/**
 * Cyclomatic Complexity Calculator for Apex Code
 * 
 * Calculates cyclomatic complexity based on control flow structures:
 * - if/else statements
 * - for/while/do-while loops
 * - switch/when expressions
 * - catch clauses
 * - ternary expressions
 * - logical operators (&&, ||, ??)
 * 
 * McCabe's Cyclomatic Complexity = E - N + 2P
 * Simplified: 1 + number of decision points
 */

/**
 * Node types that add to cyclomatic complexity
 */
const DECISION_NODES = new Set([
  'if_statement',
  'for_statement',
  'enhanced_for_statement',
  'while_statement',
  'do_statement',
  'catch_clause',
  'ternary_expression',
  'when_clause', // switch/case in Apex
]);

/**
 * Additional node types to count in else-if chains
 */
const ELSE_IF_NODES = new Set([
  'else_clause', // Only count if it contains an if_statement
]);

/**
 * Binary operators that add to complexity
 */
const COMPLEXITY_OPERATORS = new Set(['&&', '||', '??']);

/**
 * Calculate cyclomatic complexity for an entire AST
 * @param {Object} rootNode - Tree-sitter root node
 * @returns {number} Cyclomatic complexity score
 */
function calculateComplexity(rootNode) {
  let complexity = 1; // Base complexity
  
  const walk = (node) => {
    // Count decision nodes
    if (DECISION_NODES.has(node.type)) {
      complexity++;
    }
    
    // Count else-if chains (else followed by if)
    if (node.type === 'else_clause') {
      const hasNestedIf = node.namedChildren.some(c => c.type === 'if_statement');
      if (hasNestedIf) {
        // The nested if will be counted, so we don't add here
      } else if (node.namedChildren.length > 0) {
        // Plain else with a block - doesn't add complexity
      }
    }
    
    // Count logical operators in binary expressions
    if (node.type === 'binary_expression') {
      const operator = node.children.find(c => !c.isNamed);
      if (operator && COMPLEXITY_OPERATORS.has(operator.text)) {
        complexity++;
      }
    }
    
    // Recurse
    for (const child of node.namedChildren) {
      walk(child);
    }
  };
  
  walk(rootNode);
  return complexity;
}

/**
 * Calculate cyclomatic complexity for a method body
 * @param {Object} blockNode - Tree-sitter block node (method body)
 * @returns {number} Cyclomatic complexity score
 */
function calculateMethodComplexity(blockNode) {
  if (!blockNode) return 1;
  return calculateComplexity(blockNode);
}

/**
 * Get complexity rating based on score
 * @param {number} complexity - Cyclomatic complexity score
 * @returns {Object} Rating with level and description
 */
function getComplexityRating(complexity) {
  if (complexity <= 5) {
    return {
      level: 'low',
      description: 'Simple, low risk',
      color: 'green',
    };
  } else if (complexity <= 10) {
    return {
      level: 'moderate',
      description: 'Moderate complexity, low risk',
      color: 'yellow',
    };
  } else if (complexity <= 20) {
    return {
      level: 'high',
      description: 'Complex, moderate risk',
      color: 'orange',
    };
  } else if (complexity <= 50) {
    return {
      level: 'very-high',
      description: 'Very complex, high risk',
      color: 'red',
    };
  } else {
    return {
      level: 'critical',
      description: 'Untestable, very high risk',
      color: 'darkred',
    };
  }
}

/**
 * Analyze complexity of all methods in a parsed result
 * @param {Object} parsedResult - Result from ApexVisitor
 * @returns {Object} Complexity analysis summary
 */
function analyzeComplexity(parsedResult) {
  const methodComplexities = parsedResult.methods.map(m => ({
    name: m.name,
    complexity: m.complexity,
    rating: getComplexityRating(m.complexity),
    line: m.line,
  }));
  
  const constructorComplexities = parsedResult.constructors.map(c => ({
    name: `${c.name}(constructor)`,
    complexity: c.complexity,
    rating: getComplexityRating(c.complexity),
    line: c.line,
  }));
  
  const allMethods = [...methodComplexities, ...constructorComplexities];
  
  const totalComplexity = parsedResult.complexity;
  const averageComplexity = allMethods.length > 0 
    ? allMethods.reduce((sum, m) => sum + m.complexity, 0) / allMethods.length 
    : 0;
  
  const highComplexityMethods = allMethods.filter(m => m.complexity > 10);
  
  return {
    total: totalComplexity,
    totalRating: getComplexityRating(totalComplexity),
    average: Math.round(averageComplexity * 100) / 100,
    methodCount: allMethods.length,
    methods: methodComplexities,
    constructors: constructorComplexities,
    highComplexityMethods,
    recommendations: generateRecommendations(parsedResult, allMethods),
  };
}

/**
 * Generate complexity reduction recommendations
 * @param {Object} parsedResult - Parsed result
 * @param {Array} methods - Methods with complexity scores
 * @returns {Array} List of recommendations
 */
function generateRecommendations(parsedResult, methods) {
  const recommendations = [];
  
  // Class-level recommendations
  if (parsedResult.complexity > 50) {
    recommendations.push({
      type: 'class',
      severity: 'high',
      message: `Class "${parsedResult.name}" has very high complexity (${parsedResult.complexity}). Consider splitting into smaller classes.`,
    });
  }
  
  // Method-level recommendations
  for (const method of methods) {
    if (method.complexity > 20) {
      recommendations.push({
        type: 'method',
        severity: 'high',
        message: `Method "${method.name}" at line ${method.line} has complexity ${method.complexity}. Consider refactoring into smaller methods.`,
      });
    } else if (method.complexity > 10) {
      recommendations.push({
        type: 'method',
        severity: 'medium',
        message: `Method "${method.name}" at line ${method.line} has moderate complexity (${method.complexity}). Consider simplifying.`,
      });
    }
  }
  
  // Too many methods
  if (methods.length > 20) {
    recommendations.push({
      type: 'class',
      severity: 'medium',
      message: `Class "${parsedResult.name}" has ${methods.length} methods. Consider splitting responsibilities.`,
    });
  }
  
  return recommendations;
}

export { 
  calculateComplexity, 
  calculateMethodComplexity, 
  getComplexityRating,
  analyzeComplexity,
};

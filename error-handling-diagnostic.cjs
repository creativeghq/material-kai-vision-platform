// Error Handling Pattern Diagnostic Script
// This script analyzes error handling patterns in the codebase

const fs = require('fs');
const path = require('path');

// Patterns to look for
const patterns = {
  simpleRethrow: /catch\s*\([^)]*\)\s*\{\s*[^}]*throw\s+error;?\s*\}/g,
  genericErrorWrap: /throw\s+new\s+Error\(`[^`]*\$\{error\.message\}`\)/g,
  consoleErrorOnly: /console\.error\([^)]*\);\s*throw\s+error;/g,
  missingContext: /catch\s*\([^)]*\)\s*\{\s*[^}]*throw\s+new\s+Error\(['"`][^'"`]*['"`]\)/g,
  inconsistentLogging: /console\.(error|warn|log)\([^)]*error[^)]*\)/g
};

function analyzeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const results = {};
    
    for (const [patternName, regex] of Object.entries(patterns)) {
      const matches = content.match(regex) || [];
      if (matches.length > 0) {
        results[patternName] = matches.length;
      }
    }
    
    return results;
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error.message);
    return {};
  }
}

function scanDirectory(dirPath) {
  const results = {};
  
  function scanRecursive(currentPath) {
    const items = fs.readdirSync(currentPath);
    
    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        scanRecursive(fullPath);
      } else if (stat.isFile() && (item.endsWith('.ts') || item.endsWith('.js'))) {
        const analysis = analyzeFile(fullPath);
        if (Object.keys(analysis).length > 0) {
          results[fullPath] = analysis;
        }
      }
    }
  }
  
  scanRecursive(dirPath);
  return results;
}

// Analyze the src directory
console.log('🔍 Analyzing error handling patterns in src/ directory...\n');

const results = scanDirectory('./src');
const summary = {
  simpleRethrow: 0,
  genericErrorWrap: 0,
  consoleErrorOnly: 0,
  missingContext: 0,
  inconsistentLogging: 0
};

console.log('📊 Error Handling Pattern Analysis Results:\n');

for (const [filePath, patterns] of Object.entries(results)) {
  console.log(`📄 ${filePath}:`);
  for (const [pattern, count] of Object.entries(patterns)) {
    console.log(`  - ${pattern}: ${count} occurrences`);
    summary[pattern] += count;
  }
  console.log('');
}

console.log('📈 Summary Across All Files:');
console.log('================================');
for (const [pattern, total] of Object.entries(summary)) {
  if (total > 0) {
    console.log(`${pattern}: ${total} total occurrences`);
  }
}

// Specific diagnostic checks
console.log('\n🎯 Diagnostic Validation:');
console.log('==========================');

if (summary.simpleRethrow > 10) {
  console.log('✅ CONFIRMED: High number of simple re-throws without context');
}

if (summary.genericErrorWrap > 5) {
  console.log('✅ CONFIRMED: Generic error wrapping pattern detected');
}

if (summary.missingContext > 5) {
  console.log('✅ CONFIRMED: Errors thrown without preserving original context');
}

if (summary.inconsistentLogging > 15) {
  console.log('✅ CONFIRMED: Inconsistent error logging patterns');
}

console.log('\n🔧 Recommendations:');
console.log('===================');
console.log('1. Standardize error handling with consistent context preservation');
console.log('2. Implement structured error logging with operation context');
console.log('3. Create custom error classes for different error types');
console.log('4. Add error correlation IDs for better debugging');
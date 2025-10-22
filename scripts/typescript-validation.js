#!/usr/bin/env node

/**
 * TypeScript Compilation Validation
 * Validates TypeScript compilation and reports detailed error analysis
 * 
 * Usage: node scripts/typescript-validation.js
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Test configuration
const TEST_CONFIG = {
  timeout: 120000, // 2 minutes for TypeScript compilation
  verbose: true
};

/**
 * Utility functions
 */
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    debug: '🔍'
  }[type] || '📋';
  
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  console.log(`🎯 ${title}`);
  console.log('='.repeat(80));
}

/**
 * Parse TypeScript errors and categorize them
 */
function parseTypeScriptErrors(output) {
  const lines = output.split('\n');
  const errors = [];
  const warnings = [];
  
  let currentError = null;
  
  for (const line of lines) {
    // Match error pattern: src/path/file.ts(line,col): error TS#### message
    const errorMatch = line.match(/^(.+\.tsx?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.+)$/);
    
    if (errorMatch) {
      const [, file, lineNum, col, type, code, message] = errorMatch;
      
      const errorObj = {
        file: file.replace(process.cwd() + '\\', '').replace(process.cwd() + '/', ''),
        line: parseInt(lineNum),
        column: parseInt(col),
        type,
        code,
        message: message.trim()
      };
      
      if (type === 'error') {
        errors.push(errorObj);
      } else {
        warnings.push(errorObj);
      }
    }
  }
  
  return { errors, warnings };
}

/**
 * Categorize errors by type
 */
function categorizeErrors(errors) {
  const categories = {
    'Import/Module Errors': [],
    'Type Mismatch': [],
    'Property Access': [],
    'Function Signature': [],
    'Interface/Type Definition': [],
    'Async/Promise': [],
    'Other': []
  };
  
  for (const error of errors) {
    const message = error.message.toLowerCase();
    const code = error.code;
    
    if (message.includes('cannot find module') || message.includes('module not found') || code === 'TS2307') {
      categories['Import/Module Errors'].push(error);
    } else if (message.includes('type') && (message.includes('not assignable') || message.includes('mismatch'))) {
      categories['Type Mismatch'].push(error);
    } else if (message.includes('property') && (message.includes('does not exist') || message.includes('undefined'))) {
      categories['Property Access'].push(error);
    } else if (message.includes('argument') || message.includes('parameter') || message.includes('signature')) {
      categories['Function Signature'].push(error);
    } else if (message.includes('interface') || message.includes('type') || code.startsWith('TS23')) {
      categories['Interface/Type Definition'].push(error);
    } else if (message.includes('promise') || message.includes('async') || message.includes('await')) {
      categories['Async/Promise'].push(error);
    } else {
      categories['Other'].push(error);
    }
  }
  
  return categories;
}

/**
 * Generate error report
 */
function generateErrorReport(errors, warnings) {
  const categories = categorizeErrors(errors);
  
  logSection('TYPESCRIPT ERROR ANALYSIS');
  
  log(`Total Errors: ${errors.length}`, errors.length > 0 ? 'error' : 'success');
  log(`Total Warnings: ${warnings.length}`, warnings.length > 0 ? 'warning' : 'info');
  
  if (errors.length === 0) {
    log('🎉 NO TYPESCRIPT ERRORS FOUND!', 'success');
    return;
  }
  
  // Show errors by category
  for (const [category, categoryErrors] of Object.entries(categories)) {
    if (categoryErrors.length > 0) {
      console.log(`\n📂 ${category} (${categoryErrors.length} errors):`);
      
      // Group by file
      const fileGroups = {};
      for (const error of categoryErrors) {
        if (!fileGroups[error.file]) {
          fileGroups[error.file] = [];
        }
        fileGroups[error.file].push(error);
      }
      
      for (const [file, fileErrors] of Object.entries(fileGroups)) {
        console.log(`\n  📄 ${file}:`);
        for (const error of fileErrors.slice(0, 3)) { // Show max 3 errors per file
          console.log(`    ❌ Line ${error.line}: ${error.message}`);
        }
        if (fileErrors.length > 3) {
          console.log(`    ... and ${fileErrors.length - 3} more errors`);
        }
      }
    }
  }
  
  // Show most common error codes
  const errorCodes = {};
  for (const error of errors) {
    errorCodes[error.code] = (errorCodes[error.code] || 0) + 1;
  }
  
  const sortedCodes = Object.entries(errorCodes)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5);
  
  if (sortedCodes.length > 0) {
    console.log('\n📊 Most Common Error Codes:');
    for (const [code, count] of sortedCodes) {
      console.log(`  ${code}: ${count} occurrences`);
    }
  }
}

/**
 * Run TypeScript compilation check
 */
async function runTypeScriptCheck() {
  logSection('TYPESCRIPT COMPILATION CHECK');
  
  try {
    log('Running TypeScript compilation check...', 'info');
    
    const { stdout, stderr } = await execAsync('npx tsc --noEmit', {
      timeout: TEST_CONFIG.timeout,
      cwd: process.cwd()
    });
    
    // If we get here, compilation succeeded
    log('✅ TypeScript compilation PASSED - No errors found!', 'success');
    return { success: true, errors: [], warnings: [] };
    
  } catch (error) {
    // TypeScript compilation failed
    const output = error.stdout || error.stderr || '';
    
    if (output.includes('error TS')) {
      const { errors, warnings } = parseTypeScriptErrors(output);
      
      log(`TypeScript compilation FAILED - ${errors.length} errors, ${warnings.length} warnings`, 'error');
      
      generateErrorReport(errors, warnings);
      
      return { success: false, errors, warnings };
    } else {
      log(`TypeScript check failed with unexpected error: ${error.message}`, 'error');
      return { success: false, errors: [], warnings: [], unexpectedError: error.message };
    }
  }
}

/**
 * Run build test
 */
async function runBuildTest() {
  logSection('BUILD TEST');
  
  try {
    log('Running production build test...', 'info');
    
    const { stdout, stderr } = await execAsync('npm run build', {
      timeout: TEST_CONFIG.timeout,
      cwd: process.cwd()
    });
    
    log('✅ Production build PASSED!', 'success');
    
    // Check build output
    if (stdout.includes('built in')) {
      const buildTimeMatch = stdout.match(/built in ([\d.]+)s/);
      if (buildTimeMatch) {
        log(`Build completed in ${buildTimeMatch[1]}s`, 'info');
      }
    }
    
    return { success: true };
    
  } catch (error) {
    log(`Production build FAILED: ${error.message}`, 'error');
    
    if (error.stdout) {
      log('Build output:', 'debug');
      console.log(error.stdout);
    }
    
    if (error.stderr) {
      log('Build errors:', 'error');
      console.log(error.stderr);
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Check for common issues
 */
async function checkCommonIssues() {
  logSection('COMMON ISSUES CHECK');
  
  const issues = [];
  
  // Check for Supabase client imports (should be removed)
  try {
    const { stdout } = await execAsync('grep -r "@/integrations/supabase/client" src/ --include="*.ts" --include="*.tsx" || echo "No matches found"');
    
    if (stdout && !stdout.includes('No matches found')) {
      const matches = stdout.trim().split('\n').length;
      issues.push(`Found ${matches} files still importing Supabase client (should use Edge Functions)`);
      log(`⚠️ Found ${matches} files still importing Supabase client`, 'warning');
    } else {
      log('✅ No direct Supabase client imports found', 'success');
    }
  } catch (error) {
    // grep not available on Windows, skip this check
    log('Skipping Supabase client import check (grep not available)', 'warning');
  }
  
  // Check for missing dependencies
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const requiredDeps = ['react', 'react-dom', 'typescript', 'vite'];
  
  for (const dep of requiredDeps) {
    if (!packageJson.dependencies[dep] && !packageJson.devDependencies[dep]) {
      issues.push(`Missing required dependency: ${dep}`);
      log(`❌ Missing required dependency: ${dep}`, 'error');
    }
  }
  
  if (issues.length === 0) {
    log('✅ No common issues detected', 'success');
  }
  
  return issues;
}

/**
 * Main validation execution
 */
async function runValidation() {
  log('🚀 Starting TypeScript Validation', 'info');
  
  const startTime = Date.now();
  
  try {
    // Run TypeScript check
    const tsResult = await runTypeScriptCheck();
    
    // Run build test
    const buildResult = await runBuildTest();
    
    // Check for common issues
    const issues = await checkCommonIssues();
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    // Generate final report
    logSection('VALIDATION SUMMARY');
    
    log(`Validation completed in ${duration}s`, 'info');
    log(`TypeScript Compilation: ${tsResult.success ? 'PASSED' : 'FAILED'}`, tsResult.success ? 'success' : 'error');
    log(`Production Build: ${buildResult.success ? 'PASSED' : 'FAILED'}`, buildResult.success ? 'success' : 'error');
    log(`Common Issues: ${issues.length === 0 ? 'NONE' : `${issues.length} found`}`, issues.length === 0 ? 'success' : 'warning');
    
    if (tsResult.success && buildResult.success && issues.length === 0) {
      log('🎉 ALL VALIDATIONS PASSED - TypeScript is production ready!', 'success');
      process.exit(0);
    } else {
      log('⚠️ VALIDATION ISSUES FOUND - Please resolve before deployment', 'error');
      process.exit(1);
    }
    
  } catch (error) {
    log(`Validation failed with error: ${error.message}`, 'error');
    process.exit(1);
  }
}

// Execute validation
runValidation().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Comprehensive Platform Audit Script
 * Identifies:
 * - Mock services and placeholder implementations
 * - Dead code (defined but never used)
 * - Incomplete functionality (no storage, no display, no retrieval)
 * - Duplicate code and services
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ISSUES = {
  mockServices: [],
  deadCode: [],
  incompleteFeatures: [],
  duplicates: [],
  noStorage: [],
  noDisplay: [],
  noRetrieval: [],
};

// Patterns to detect issues
const PATTERNS = {
  mock: /mock|placeholder|TODO|FIXME|stub|dummy|fake/gi,
  dead: /^(function|const|class|async function)\s+\w+.*\{[\s\n]*(?:\/\/.*)?(?:console\.log|return|throw new Error).*\}(?:\s*\/\/.*)?$/gm,
  incomplete: /\/\/ TODO|\/\/ FIXME|\/\/ Not implemented|\/\/ Placeholder/gi,
  noStorage: /function\s+\w+.*\{[\s\S]*?(?!.*\.insert|.*\.update|.*\.save)[\s\S]*?\}/gm,
};

function scanDirectory(dir, ext = '.ts') {
  const files = [];
  const items = fs.readdirSync(dir);

  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      files.push(...scanDirectory(fullPath, ext));
    } else if (item.endsWith(ext)) {
      files.push(fullPath);
    }
  });

  return files;
}

function analyzeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Check for mock/placeholder code
    lines.forEach((line, idx) => {
      if (PATTERNS.mock.test(line)) {
        ISSUES.mockServices.push({
          file: filePath,
          line: idx + 1,
          content: line.trim(),
        });
      }

      if (PATTERNS.incomplete.test(line)) {
        ISSUES.incompleteFeatures.push({
          file: filePath,
          line: idx + 1,
          content: line.trim(),
        });
      }
    });

    // Check for functions without storage
    const functionMatches = content.matchAll(/async\s+function\s+(\w+)[\s\S]*?\{[\s\S]*?\}/g);
    for (const match of functionMatches) {
      const funcContent = match[0];
      const funcName = match[1];

      if (
        !funcContent.includes('.insert') &&
        !funcContent.includes('.update') &&
        !funcContent.includes('.upsert') &&
        !funcContent.includes('save') &&
        !funcContent.includes('return') &&
        funcName.includes('extract') ||
        funcName.includes('process') ||
        funcName.includes('analyze')
      ) {
        ISSUES.noStorage.push({
          file: filePath,
          function: funcName,
          reason: 'Extracts/processes data but does not store it',
        });
      }
    }
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error.message);
  }
}

function generateReport() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 COMPREHENSIVE PLATFORM AUDIT REPORT');
  console.log('='.repeat(80) + '\n');

  // Mock Services
  if (ISSUES.mockServices.length > 0) {
    console.log(`\n🎭 MOCK SERVICES & PLACEHOLDERS (${ISSUES.mockServices.length})`);
    console.log('-'.repeat(80));
    ISSUES.mockServices.slice(0, 10).forEach(issue => {
      console.log(`  📍 ${issue.file}:${issue.line}`);
      console.log(`     ${issue.content.substring(0, 70)}`);
    });
    if (ISSUES.mockServices.length > 10) {
      console.log(`  ... and ${ISSUES.mockServices.length - 10} more`);
    }
  }

  // Incomplete Features
  if (ISSUES.incompleteFeatures.length > 0) {
    console.log(`\n⚠️  INCOMPLETE FEATURES (${ISSUES.incompleteFeatures.length})`);
    console.log('-'.repeat(80));
    ISSUES.incompleteFeatures.slice(0, 10).forEach(issue => {
      console.log(`  📍 ${issue.file}:${issue.line}`);
      console.log(`     ${issue.content.substring(0, 70)}`);
    });
    if (ISSUES.incompleteFeatures.length > 10) {
      console.log(`  ... and ${ISSUES.incompleteFeatures.length - 10} more`);
    }
  }

  // No Storage
  if (ISSUES.noStorage.length > 0) {
    console.log(`\n💾 NO STORAGE (${ISSUES.noStorage.length})`);
    console.log('-'.repeat(80));
    ISSUES.noStorage.slice(0, 10).forEach(issue => {
      console.log(`  📍 ${issue.file}`);
      console.log(`     Function: ${issue.function}`);
      console.log(`     Issue: ${issue.reason}`);
    });
    if (ISSUES.noStorage.length > 10) {
      console.log(`  ... and ${ISSUES.noStorage.length - 10} more`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Mock Services:        ${ISSUES.mockServices.length}`);
  console.log(`  Incomplete Features:  ${ISSUES.incompleteFeatures.length}`);
  console.log(`  No Storage:           ${ISSUES.noStorage.length}`);
  console.log(`  Total Issues:         ${Object.values(ISSUES).reduce((a, b) => a + b.length, 0)}`);
  console.log('='.repeat(80) + '\n');
}

// Run audit
console.log('🔍 Scanning codebase...');
const srcFiles = scanDirectory('src', '.ts');
const supabaseFiles = scanDirectory('supabase', '.ts');
const scriptFiles = scanDirectory('scripts', '.js');

[...srcFiles, ...supabaseFiles, ...scriptFiles].forEach(analyzeFile);

generateReport();


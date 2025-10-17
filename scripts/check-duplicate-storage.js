#!/usr/bin/env node

/**
 * Check for Duplicate Storage in Functions
 * 
 * This script identifies functions that store data in multiple tables
 * (dual storage) which may be unnecessary duplication.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.join(__dirname, '..');

// Functions to check for dual storage
const FUNCTIONS_TO_CHECK = [
  'svbrdf-extractor',
  'material-recognition',
  'voice-to-material',
  'pdf-integration-health',
  'huggingface-model-trainer',
];

function findTableReferences(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const pattern = /\.from\(['"`]([^'"`]+)['"`]\)/g;
    const tables = new Set();
    
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const tableName = match[1];
      // Filter out obvious non-table names
      if (tableName.length > 2 && !tableName.includes('_') === false) {
        tables.add(tableName);
      }
    }
    
    return Array.from(tables);
  } catch (error) {
    return [];
  }
}

function checkDuplicateStorage() {
  console.log('🔍 Checking for Duplicate Storage\n');
  console.log('=' .repeat(80));
  
  const results = [];
  
  for (const functionName of FUNCTIONS_TO_CHECK) {
    const functionPath = path.join(
      WORKSPACE_ROOT,
      'supabase',
      'functions',
      functionName,
      'index.ts'
    );
    
    if (!fs.existsSync(functionPath)) {
      continue;
    }
    
    const tables = findTableReferences(functionPath);
    
    // Filter to only storage-related tables
    const storageTables = tables.filter(t => 
      t.includes('results') || 
      t.includes('jobs') || 
      t.includes('analytics') ||
      t.includes('logs') ||
      t.includes('metrics')
    );
    
    if (storageTables.length > 1) {
      results.push({
        function: functionName,
        tables: storageTables,
        isDuplicate: true,
      });
    } else if (storageTables.length === 1) {
      results.push({
        function: functionName,
        tables: storageTables,
        isDuplicate: false,
      });
    }
  }
  
  // Print results
  console.log('\n📊 STORAGE ANALYSIS\n');
  
  for (const result of results) {
    if (result.isDuplicate) {
      console.log(`⚠️  DUAL STORAGE: ${result.function}`);
    } else {
      console.log(`✅ SINGLE STORAGE: ${result.function}`);
    }
    
    for (const table of result.tables) {
      console.log(`   → ${table}`);
    }
    console.log('');
  }
  
  // Summary
  const dualStorageCount = results.filter(r => r.isDuplicate).length;
  
  console.log('=' .repeat(80));
  console.log(`\n📈 SUMMARY: ${dualStorageCount} functions with dual storage\n`);
  
  if (dualStorageCount > 0) {
    console.log('⚠️  RECOMMENDATION: Review dual storage implementations');
    console.log('   Consider consolidating to a single storage table per function.\n');
  }
  
  return results;
}

checkDuplicateStorage();


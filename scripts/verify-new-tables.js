#!/usr/bin/env node

/**
 * Verify New Tables Created in Phase 2 Step 1
 * 
 * This script checks if the newly created tables are actually being used
 * by the functions that were supposed to use them.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.join(__dirname, '..');

// New tables created in Phase 2 Step 1
const NEW_TABLES = [
  { table: 'hybrid_analysis_results', function: 'hybrid-material-analysis' },
  { table: 'spaceformer_analysis_results', function: 'spaceformer-analysis' },
  { table: 'svbrdf_extraction_results', function: 'svbrdf-extractor' },
  { table: 'ocr_results', function: 'ocr-processing' },
  { table: 'voice_conversion_results', function: 'voice-to-material' },
  { table: 'pdf_integration_health_results', function: 'pdf-integration-health' },
];

function searchInFile(filePath, searchTerm) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.includes(searchTerm);
  } catch (error) {
    return false;
  }
}

function findFunctionFile(functionName) {
  const functionsDir = path.join(WORKSPACE_ROOT, 'supabase', 'functions');
  const functionPath = path.join(functionsDir, functionName, 'index.ts');
  
  if (fs.existsSync(functionPath)) {
    return functionPath;
  }
  return null;
}

function verifyTableUsage() {
  console.log('🔍 Verifying New Tables Usage\n');
  console.log('=' .repeat(80));
  
  const results = [];
  
  for (const { table, function: functionName } of NEW_TABLES) {
    const functionPath = findFunctionFile(functionName);
    
    if (!functionPath) {
      results.push({
        table,
        function: functionName,
        status: '❌ FUNCTION NOT FOUND',
        used: false,
      });
      continue;
    }
    
    const isUsed = searchInFile(functionPath, table);
    
    results.push({
      table,
      function: functionName,
      status: isUsed ? '✅ USED' : '❌ NOT USED',
      used: isUsed,
    });
  }
  
  // Print results
  console.log('\n📊 VERIFICATION RESULTS\n');
  
  for (const result of results) {
    console.log(`${result.status}`);
    console.log(`  Table: ${result.table}`);
    console.log(`  Function: ${result.function}`);
    console.log('');
  }
  
  // Summary
  const usedCount = results.filter(r => r.used).length;
  const totalCount = results.length;
  
  console.log('=' .repeat(80));
  console.log(`\n📈 SUMMARY: ${usedCount}/${totalCount} tables are being used\n`);
  
  if (usedCount < totalCount) {
    console.log('⚠️  WARNING: Some newly created tables are NOT being used!');
    console.log('   These tables should be removed to keep the database clean.\n');
    
    const unusedTables = results.filter(r => !r.used);
    console.log('Unused tables:');
    for (const table of unusedTables) {
      console.log(`  - ${table.table}`);
    }
  }
  
  return results;
}

verifyTableUsage();


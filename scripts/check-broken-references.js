#!/usr/bin/env node

/**
 * Check for Broken Database References
 * 
 * This script identifies code that references non-existent database tables
 * which would cause runtime errors.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.join(__dirname, '..');

// Tables that don't exist in the database
const NON_EXISTENT_TABLES = [
  'api_access_control',
  'image_text_associations',
  'knowledge_entries',
  'material_knowledge',
  'material_metafield_values',
  'material_relationships',
  'mivaa_api_keys',
  'mivaa_api_usage_summary',
  'mivaa_batch_jobs',
  'mivaa_batch_jobs_summary',
  'mivaa_processing_results',
  'mivaa_processing_results_summary',
  'mivaa_rag_documents',
  'mivaa_service_health_metrics',
  'pdf_document_structure',
  'pdf_documents',
  'pdf_extracted_images',
  'pdf_material_correlations',
  'pdf_processing_tiles',
  'profiles',
  'semantic_similarity_cache',
  'user_roles',
  'visual_search_history',
];

function searchFilesForReferences(dir, pattern) {
  const results = [];
  
  function walk(currentPath) {
    try {
      const files = fs.readdirSync(currentPath);
      
      for (const file of files) {
        const filePath = path.join(currentPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          if (!file.includes('node_modules') && !file.includes('.git')) {
            walk(filePath);
          }
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            
            lines.forEach((line, index) => {
              if (pattern.test(line) && line.includes('.from(')) {
                results.push({
                  file: filePath.replace(WORKSPACE_ROOT, ''),
                  line: index + 1,
                  code: line.trim(),
                });
              }
            });
          } catch (error) {
            // Skip files that can't be read
          }
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  }
  
  walk(dir);
  return results;
}

function checkBrokenReferences() {
  console.log('🔍 Checking for Broken Database References\n');
  console.log('=' .repeat(80));
  
  // Create regex pattern for all non-existent tables
  const tablePattern = NON_EXISTENT_TABLES.join('|');
  const pattern = new RegExp(`\\.from\\(['"\`](${tablePattern})['"\`]\\)`);
  
  // Search in supabase functions and src
  const functionsDir = path.join(WORKSPACE_ROOT, 'supabase', 'functions');
  const srcDir = path.join(WORKSPACE_ROOT, 'src');
  
  const functionsResults = searchFilesForReferences(functionsDir, pattern);
  const srcResults = searchFilesForReferences(srcDir, pattern);
  
  const allResults = [...functionsResults, ...srcResults];
  
  console.log('\n📊 BROKEN REFERENCES FOUND\n');
  
  if (allResults.length === 0) {
    console.log('✅ NO BROKEN REFERENCES FOUND!');
    console.log('\nThe code does NOT reference any non-existent tables.');
    console.log('This means the non-existent tables are truly unused.\n');
  } else {
    console.log(`⚠️  FOUND ${allResults.length} BROKEN REFERENCES:\n`);
    
    for (const result of allResults) {
      console.log(`❌ ${result.file}:${result.line}`);
      console.log(`   ${result.code}`);
      console.log('');
    }
  }
  
  console.log('=' .repeat(80));
  console.log(`\n📈 SUMMARY: ${allResults.length} broken references\n`);
  
  return allResults;
}

checkBrokenReferences();


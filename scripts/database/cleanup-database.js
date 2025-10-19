#!/usr/bin/env node

/**
 * COMPREHENSIVE DATABASE & STORAGE CLEANUP SCRIPT
 * 
 * This script clears all test data from the database and storage while preserving:
 * - User accounts and authentication
 * - Workspaces and permissions
 * - API keys and configuration
 * - System settings
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY);

// Tables to KEEP
const TABLES_TO_KEEP = [
  'workspaces',
  'workspace_members', 
  'workspace_permissions',
  'api_keys',
  'material_kai_keys',
  'rate_limit_rules',
  'category_validation_rules',
  'material_metadata_fields',
  'ml_models',
  'crewai_agents',
  'material_agents',
  'internal_networks',
  'api_endpoints',
  'material_categories',
];

// Tables to CLEAR
const TABLES_TO_CLEAR = [
  'documents', 'document_chunks', 'document_embeddings', 'document_images',
  'document_vectors', 'document_layout_analysis', 'document_processing_status',
  'document_quality_metrics', 'embeddings', 'processed_documents', 'uploaded_files',
  'pdf_processing_results', 'pdf_integration_health_results', 'processing_jobs',
  'processing_queue', 'processing_results', 'processing_metrics',
  'knowledge_base_entries', 'knowledge_relationships', 'enhanced_knowledge_base',
  'materials_catalog', 'material_properties', 'material_images',
  'material_knowledge_extraction', 'material_style_analysis', 'material_visual_analysis',
  'scraped_materials_temp', 'recognition_results', 'property_analysis_results',
  'style_analysis_results', 'spaceformer_analysis_results', 'svbrdf_extraction_results',
  'hybrid_analysis_results', 'voice_conversion_results', 'ocr_results',
  'visual_search_embeddings', 'visual_search_queries', 'visual_search_batch_jobs',
  'visual_search_analysis', 'visual_analysis_queue', 'ml_training_jobs',
  'moodboards', 'moodboard_items', 'scraping_sessions', 'scraping_pages',
  'generation_3d', 'analytics_events', 'api_usage_logs', 'mivaa_api_usage_logs',
  'jwt_tokens_log', 'search_analytics', 'quality_scoring_logs', 'query_intelligence',
  'response_quality_metrics', 'retrieval_quality_metrics', 'embedding_stability_metrics',
  'health_check',
];

async function runQuery(query) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ query })
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Query failed: ${response.statusText} - ${text}`);
  }
  
  return response.json();
}

async function clearTable(tableName) {
  try {
    const { count: beforeCount } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });
    
    if (beforeCount === 0) {
      console.log(`   ✓ ${tableName}: already empty`);
      return { table: tableName, rowsDeleted: 0, status: 'empty' };
    }
    
    const { error } = await supabase
      .from(tableName)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (error) throw error;
    
    console.log(`   ✅ ${tableName}: deleted ${beforeCount} rows`);
    return { table: tableName, rowsDeleted: beforeCount, status: 'success' };
    
  } catch (error) {
    console.log(`   ❌ ${tableName}: ${error.message}`);
    return { table: tableName, error: error.message, status: 'error' };
  }
}

async function cleanup() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║        🧹 COMPREHENSIVE DATABASE CLEANUP                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  const results = {
    timestamp: new Date().toISOString(),
    tables: { kept: [], cleared: [] },
    storage: {},
    summary: {
      tablesKept: 0,
      tablesCleared: 0,
      totalRowsDeleted: 0,
      storageFilesDeleted: 0,
      storageSizeDeleted: 0,
      errors: 0
    }
  };
  
  // Step 1: Get storage stats BEFORE deletion
  console.log('📊 Step 1: Checking storage buckets...\n');
  
  try {
    const storageQuery = `
      SELECT bucket_id, COUNT(*) as file_count, 
             SUM((metadata->>'size')::bigint) as total_size 
      FROM storage.objects 
      GROUP BY bucket_id 
      ORDER BY bucket_id;
    `;
    
    const { data: storageStats } = await supabase.rpc('exec_sql', { query: storageQuery });
    
    if (storageStats && storageStats.length > 0) {
      console.log('📦 Storage buckets found:');
      storageStats.forEach(bucket => {
        const sizeMB = (bucket.total_size / 1024 / 1024).toFixed(2);
        console.log(`   📁 ${bucket.bucket_id}: ${bucket.file_count} files (${sizeMB} MB)`);
        results.summary.storageFilesDeleted += parseInt(bucket.file_count);
        results.summary.storageSizeDeleted += parseInt(bucket.total_size);
      });
      results.storage.before = storageStats;
    } else {
      console.log('   ℹ️  No files in storage');
    }
  } catch (error) {
    console.log(`   ⚠️  Could not query storage: ${error.message}`);
  }
  
  // Step 2: Clear database tables
  console.log('\n🗑️  Step 2: Clearing database tables...\n');
  
  for (const table of TABLES_TO_CLEAR) {
    const result = await clearTable(table);
    results.tables.cleared.push(result);
    if (result.status === 'success' || result.status === 'empty') {
      results.summary.tablesCleared++;
      results.summary.totalRowsDeleted += result.rowsDeleted || 0;
    } else {
      results.summary.errors++;
    }
  }
  
  // Step 3: Delete all storage files using SQL
  console.log('\n🗑️  Step 3: Deleting all storage files...\n');
  
  try {
    const deleteQuery = 'DELETE FROM storage.objects;';
    await supabase.rpc('exec_sql', { query: deleteQuery });
    
    const sizeMB = (results.summary.storageSizeDeleted / 1024 / 1024).toFixed(2);
    console.log(`   ✅ Deleted ${results.summary.storageFilesDeleted} files (${sizeMB} MB) from all buckets`);
    results.storage.deleted = true;
  } catch (error) {
    console.log(`   ❌ Error deleting storage files: ${error.message}`);
    results.storage.error = error.message;
    results.summary.errors++;
  }
  
  // Step 4: Mark kept tables
  TABLES_TO_KEEP.forEach(table => {
    results.tables.kept.push({ table, status: 'preserved' });
    results.summary.tablesKept++;
  });
  
  // Print summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    ✅ CLEANUP COMPLETE                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`📊 Database:`);
  console.log(`   ✅ Tables Kept: ${results.summary.tablesKept}`);
  console.log(`   🗑️  Tables Cleared: ${results.summary.tablesCleared}`);
  console.log(`   📉 Total Rows Deleted: ${results.summary.totalRowsDeleted}`);
  
  console.log(`\n📦 Storage:`);
  console.log(`   🗑️  Files Deleted: ${results.summary.storageFilesDeleted}`);
  console.log(`   💾 Size Freed: ${(results.summary.storageSizeDeleted / 1024 / 1024).toFixed(2)} MB`);
  
  if (results.summary.errors > 0) {
    console.log(`\n❌ Errors: ${results.summary.errors}`);
  }
  
  // Save results
  const fs = await import('fs');
  const resultsFile = `cleanup-results-${Date.now()}.json`;
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\n📁 Detailed results saved to: ${resultsFile}\n`);
  
  console.log('🎉 Database is now clean and ready for fresh testing!\n');
}

cleanup().catch(console.error);


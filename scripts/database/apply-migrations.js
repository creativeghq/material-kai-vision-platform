/**
 * Apply Database Migrations Script
 * 
 * This script applies SQL migrations to the Supabase database.
 * It reads migration files from supabase/migrations/ and executes them in order.
 * 
 * Usage:
 *   node scripts/database/apply-migrations.js
 *   node scripts/database/apply-migrations.js --dry-run
 *   node scripts/database/apply-migrations.js --file 20251220_001_add_background_job_id_to_scraping_sessions.sql
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: Missing required environment variables');
  console.error('   Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================================================
// Parse command line arguments
// ============================================================================

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const specificFile = args.find(arg => arg.startsWith('--file='))?.split('=')[1];

// ============================================================================
// Get migration files
// ============================================================================

const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations');

function getMigrationFiles() {
  try {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql'))
      .filter(file => file !== 'README.md')
      .sort(); // Sort alphabetically (which sorts by date due to naming convention)
    
    if (specificFile) {
      return files.filter(file => file === specificFile);
    }
    
    return files;
  } catch (error) {
    console.error('❌ Error reading migrations directory:', error.message);
    process.exit(1);
  }
}

// ============================================================================
// Apply migration
// ============================================================================

async function applyMigration(filename) {
  const filepath = join(MIGRATIONS_DIR, filename);
  
  console.log(`\n📄 Processing: ${filename}`);
  
  try {
    // Read migration file
    const sql = readFileSync(filepath, 'utf8');
    
    if (isDryRun) {
      console.log('   🔍 DRY RUN - Would execute:');
      console.log('   ' + sql.split('\n').slice(0, 5).join('\n   ') + '\n   ...');
      return { success: true, dryRun: true };
    }
    
    // Execute migration
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      // Try direct execution if RPC fails
      console.log('   ⚠️  RPC failed, trying direct execution...');
      
      // Split SQL into individual statements
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      
      for (const statement of statements) {
        const { error: execError } = await supabase.rpc('exec', { query: statement });
        if (execError) {
          throw execError;
        }
      }
    }
    
    console.log('   ✅ Migration applied successfully');
    return { success: true };
    
  } catch (error) {
    console.error('   ❌ Error applying migration:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Verify migration
// ============================================================================

async function verifyMigrations() {
  console.log('\n🔍 Verifying migrations...\n');
  
  const checks = [
    {
      name: 'scraping_sessions.background_job_id',
      query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'scraping_sessions' 
          AND column_name = 'background_job_id'
      `
    },
    {
      name: 'data_import_jobs.background_job_id',
      query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'data_import_jobs' 
          AND column_name = 'background_job_id'
      `
    },
    {
      name: 'webhook_calls table',
      query: `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'webhook_calls'
      `
    },
    {
      name: 'background_jobs.last_heartbeat',
      query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'background_jobs' 
          AND column_name = 'last_heartbeat'
      `
    }
  ];
  
  for (const check of checks) {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: check.query });
    
    if (error || !data || data.length === 0) {
      console.log(`   ❌ ${check.name}: NOT FOUND`);
    } else {
      console.log(`   ✅ ${check.name}: OK`);
    }
  }
}

// ============================================================================
// Main execution
// ============================================================================

async function main() {
  console.log('🚀 Database Migration Tool');
  console.log('==========================\n');
  
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }
  
  const migrationFiles = getMigrationFiles();
  
  if (migrationFiles.length === 0) {
    console.log('ℹ️  No migration files found');
    return;
  }
  
  console.log(`📋 Found ${migrationFiles.length} migration(s):\n`);
  migrationFiles.forEach((file, index) => {
    console.log(`   ${index + 1}. ${file}`);
  });
  
  // Apply migrations
  const results = [];
  for (const file of migrationFiles) {
    const result = await applyMigration(file);
    results.push({ file, ...result });
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Migration Summary');
  console.log('='.repeat(50) + '\n');
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\n❌ Failed migrations:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.file}: ${r.error}`);
    });
  }
  
  // Verify if not dry run
  if (!isDryRun && successful > 0) {
    await verifyMigrations();
  }
  
  console.log('\n✨ Done!\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});



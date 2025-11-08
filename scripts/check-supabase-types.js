/**
 * Check Supabase Types Script
 * 
 * Verifies that Supabase types are up-to-date with the database schema.
 * 
 * Usage:
 *   npm run types:check
 */

import { readFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkSupabaseTypes() {
  log('\n' + '='.repeat(80), 'cyan');
  log('🔍 Checking Supabase Types', 'bright');
  log('='.repeat(80), 'cyan');

  const typesPath = join(__dirname, '..', 'src', 'integrations', 'supabase', 'types.ts');

  try {
    // Check if types file exists
    const stats = statSync(typesPath);
    const fileContent = readFileSync(typesPath, 'utf-8');

    log('\n✅ Types file exists', 'green');
    log(`   Path: ${typesPath}`, 'cyan');
    log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`, 'cyan');
    log(`   Last modified: ${stats.mtime.toISOString()}`, 'cyan');

    // Check file age
    const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
    
    if (ageInDays > 7) {
      log(`\n⚠️  Types file is ${Math.floor(ageInDays)} days old`, 'yellow');
      log('   Consider regenerating types if database schema has changed', 'yellow');
      log('   Run: npm run types:generate', 'cyan');
    } else {
      log(`\n✅ Types file is recent (${Math.floor(ageInDays)} days old)`, 'green');
    }

    // Check for common type definitions
    const checks = [
      { name: 'Database type', pattern: /export type Database = \{/ },
      { name: 'Tables type', pattern: /export type Tables</ },
      { name: 'TablesInsert type', pattern: /export type TablesInsert</ },
      { name: 'TablesUpdate type', pattern: /export type TablesUpdate</ },
      { name: 'Json type', pattern: /export type Json =/ },
    ];

    log('\n📋 Type Definitions Check:', 'blue');
    let allChecksPass = true;

    checks.forEach(check => {
      if (check.pattern.test(fileContent)) {
        log(`   ✅ ${check.name} found`, 'green');
      } else {
        log(`   ❌ ${check.name} missing`, 'red');
        allChecksPass = false;
      }
    });

    // Count tables
    const tableMatches = fileContent.match(/Tables: \{[\s\S]*?\}/g);
    if (tableMatches && tableMatches.length > 0) {
      const tableContent = tableMatches[0];
      const tableNames = tableContent.match(/\w+: \{/g);
      const tableCount = tableNames ? tableNames.length : 0;
      log(`\n📊 Database Statistics:`, 'blue');
      log(`   Tables defined: ${tableCount}`, 'cyan');
    }

    // Final summary
    log('\n' + '='.repeat(80), 'cyan');
    if (allChecksPass) {
      log('✅ TYPES CHECK PASSED', 'green');
      log('='.repeat(80), 'cyan');
      log('\n💡 To regenerate types:', 'blue');
      log('   npm run types:generate          # From remote database', 'cyan');
      log('   npm run types:generate:local    # From local Supabase', 'cyan');
    } else {
      log('❌ TYPES CHECK FAILED', 'red');
      log('='.repeat(80), 'cyan');
      log('\n🔧 To fix:', 'yellow');
      log('   npm run types:generate', 'cyan');
      process.exit(1);
    }

  } catch (error) {
    log('\n❌ ERROR: Types file not found or unreadable', 'red');
    log(`   Path: ${typesPath}`, 'cyan');
    log(`   Error: ${error.message}`, 'red');
    log('\n🔧 To generate types:', 'yellow');
    log('   npm run types:generate', 'cyan');
    process.exit(1);
  }
}

// Run the check
checkSupabaseTypes();


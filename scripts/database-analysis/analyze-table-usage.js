#!/usr/bin/env node

/**
 * Database Table Usage Analysis Script
 *
 * This script analyzes the entire codebase to identify which database tables
 * are actually used by the application code vs. which tables exist in the database.
 *
 * It searches for:
 * - .from('table_name') calls in TypeScript/JavaScript files
 * - Table references in Supabase Edge Functions
 * - Table definitions in TypeScript types
 * - SQL queries and table references
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const WORKSPACE_ROOT = process.cwd();
const SEARCH_PATTERNS = [
  /\.from\(['"`]([^'"`]+)['"`]\)/g,           // .from('table_name')
  /\.table\(['"`]([^'"`]+)['"`]\)/g,          // .table('table_name')
  /FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,       // SQL FROM clauses
  /INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi, // SQL INSERT
  /UPDATE\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,     // SQL UPDATE
  /DELETE\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi, // SQL DELETE
];

const EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.vercel',
  '.ruru',
  '.roopm'
];

const INCLUDE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.sql', '.py'];

// Database tables from our previous analysis
const DATABASE_TABLES = [
  'analytics_events', 'api_access_control', 'api_endpoints', 'api_keys', 'api_usage_logs',
  'category_validation_rules', 'crewai_agents', 'document_chunks', 'document_images',
  'document_layout_analysis', 'document_processing_status', 'document_quality_metrics',
  'documents', 'embeddings', 'enhanced_knowledge_base', 'generation_3d', 'health_check',
  'image_text_associations', 'images', 'internal_networks', 'jwt_tokens_log',
  'knowledge_base_entries', 'knowledge_entries', 'knowledge_relationships',
  'material_agents', 'material_categories', 'material_images', 'material_kai_keys',
  'material_knowledge', 'material_knowledge_extraction', 'material_metadata_fields',
  'material_metafield_values', 'material_properties', 'material_relationships',
  'material_style_analysis', 'material_visual_analysis', 'materials_catalog',
  'mivaa_api_keys', 'mivaa_api_usage_logs', 'mivaa_api_usage_summary',
  'mivaa_batch_jobs', 'mivaa_batch_jobs_summary', 'mivaa_processing_results',
  'mivaa_processing_results_summary', 'mivaa_rag_documents', 'mivaa_service_health_metrics',
  'ml_models', 'moodboard_items', 'moodboards', 'pdf_document_structure', 'pdf_documents',
  'pdf_extracted_images', 'pdf_material_correlations', 'pdf_processing_results',
  'pdf_processing_tiles', 'processed_documents', 'processing_jobs', 'processing_queue',
  'processing_results', 'profiles', 'property_analysis_results', 'query_intelligence',
  'rate_limit_rules', 'recognition_results', 'scraped_materials_temp', 'scraping_pages',
  'scraping_sessions', 'search_analytics', 'semantic_similarity_cache', 'uploaded_files',
  'user_roles', 'visual_analysis_queue', 'visual_search_analysis', 'visual_search_batch_jobs',
  'visual_search_embeddings', 'visual_search_history', 'visual_search_queries',
  'workspace_members', 'workspace_permissions', 'workspaces'
];

class TableUsageAnalyzer {
  constructor() {
    this.usedTables = new Set();
    this.tableReferences = new Map(); // table -> [file paths]
    this.scannedFiles = 0;
    this.totalFiles = 0;
  }

  /**
   * Recursively scan directory for files
   */
  scanDirectory(dirPath, files = []) {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        if (!EXCLUDE_DIRS.includes(item)) {
          this.scanDirectory(fullPath, files);
        }
      } else if (stat.isFile()) {
        const ext = path.extname(item);
        if (INCLUDE_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
    
    return files;
  }

  /**
   * Analyze a single file for table references
   */
  analyzeFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(WORKSPACE_ROOT, filePath);
      
      // Search for table references using all patterns
      for (const pattern of SEARCH_PATTERNS) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const tableName = match[1].toLowerCase();
          
          // Filter out obvious non-table names
          if (this.isValidTableName(tableName)) {
            this.usedTables.add(tableName);
            
            if (!this.tableReferences.has(tableName)) {
              this.tableReferences.set(tableName, []);
            }
            this.tableReferences.get(tableName).push(relativePath);
          }
        }
      }
      
      this.scannedFiles++;
      if (this.scannedFiles % 100 === 0) {
        console.log(`Scanned ${this.scannedFiles}/${this.totalFiles} files...`);
      }
    } catch (error) {
      console.warn(`Error reading file ${filePath}:`, error.message);
    }
  }

  /**
   * Check if a string looks like a valid table name
   */
  isValidTableName(name) {
    // Must be a reasonable length and contain only valid characters
    if (!name || name.length < 2 || name.length > 50) return false;
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) return false;

    // Exclude common false positives
    const excludeList = [
      'select', 'insert', 'update', 'delete', 'create', 'drop', 'alter',
      'table', 'index', 'view', 'function', 'procedure', 'trigger',
      'database', 'schema', 'column', 'row', 'data', 'value', 'result',
      'error', 'success', 'response', 'request', 'payload', 'body',
      'params', 'options', 'config', 'settings', 'metadata', 'info',
      // Additional false positives from analysis
      'access', 'agent', 'actual', 'accuracy', 'expected', 'test', 'tests',
      'user', 'users', 'admin', 'public', 'private', 'temp', 'temporary',
      'cache', 'session', 'token', 'auth', 'login', 'logout', 'register',
      'password', 'email', 'name', 'title', 'description', 'content',
      'type', 'status', 'state', 'action', 'method', 'path', 'url',
      'id', 'uuid', 'key', 'value', 'item', 'items', 'list', 'array',
      'object', 'string', 'number', 'boolean', 'date', 'time', 'timestamp'
    ];

    // Only include names that are likely to be actual database tables
    // Must contain underscore or be longer than 8 characters (typical table naming)
    const isLikelyTableName = name.includes('_') || name.length > 8;

    return !excludeList.includes(name.toLowerCase()) && isLikelyTableName;
  }

  /**
   * Generate analysis report
   */
  generateReport() {
    const usedTablesArray = Array.from(this.usedTables).sort();
    const unusedTables = DATABASE_TABLES.filter(table => 
      !usedTablesArray.includes(table.toLowerCase())
    );

    const report = {
      summary: {
        totalDatabaseTables: DATABASE_TABLES.length,
        tablesFoundInCode: usedTablesArray.length,
        unusedTables: unusedTables.length,
        filesScanned: this.scannedFiles
      },
      usedTables: usedTablesArray.map(table => ({
        name: table,
        references: this.tableReferences.get(table) || [],
        referenceCount: (this.tableReferences.get(table) || []).length
      })),
      unusedTables: unusedTables,
      detailedReferences: Object.fromEntries(this.tableReferences)
    };

    return report;
  }

  /**
   * Run the complete analysis
   */
  async run() {
    console.log('🔍 Starting database table usage analysis...');
    console.log(`📁 Workspace: ${WORKSPACE_ROOT}`);
    
    // Scan for all files
    console.log('📋 Scanning for files...');
    const files = this.scanDirectory(WORKSPACE_ROOT);
    this.totalFiles = files.length;
    console.log(`📄 Found ${this.totalFiles} files to analyze`);
    
    // Analyze each file
    console.log('🔎 Analyzing files for table references...');
    for (const file of files) {
      this.analyzeFile(file);
    }
    
    // Generate report
    console.log('📊 Generating analysis report...');
    const report = this.generateReport();
    
    // Save report
    const reportPath = path.join(WORKSPACE_ROOT, 'scripts/database-analysis/table-usage-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 DATABASE TABLE USAGE ANALYSIS REPORT');
    console.log('='.repeat(60));
    console.log(`📋 Total database tables: ${report.summary.totalDatabaseTables}`);
    console.log(`✅ Tables found in code: ${report.summary.tablesFoundInCode}`);
    console.log(`❌ Unused tables: ${report.summary.unusedTables}`);
    console.log(`📄 Files scanned: ${report.summary.filesScanned}`);
    
    if (report.unusedTables.length > 0) {
      console.log('\n🗑️  UNUSED TABLES (candidates for removal):');
      report.unusedTables.forEach(table => {
        console.log(`   - ${table}`);
      });
    }
    
    console.log(`\n📄 Full report saved to: ${reportPath}`);
    console.log('='.repeat(60));
    
    return report;
  }
}

// Run the analysis
console.log('Script starting...');
console.log('import.meta.url:', import.meta.url);
console.log('process.argv[1]:', process.argv[1]);

const analyzer = new TableUsageAnalyzer();
analyzer.run().catch(console.error);

export default TableUsageAnalyzer;

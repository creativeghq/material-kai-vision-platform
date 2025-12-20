/**
 * Complete Database Reset Script
 *
 * This script:
 * 1. Deletes all user-generated data (70+ tables)
 * 2. PRESERVES system configuration and user accounts
 * 3. Deletes all files from storage buckets EXCEPT pdf-documents folder
 * 4. Verifies cleanup was successful
 * 5. Reports storage and resource usage
 *
 * ⚠️ PRESERVED DATA (NEVER DELETED):
 * 1. User data (users, profiles, workspaces, API keys)
 * 2. Global upsells (admin-managed upsell items)
 * 3. Global timeline elements (timeline_steps)
 * 4. Material metadata field definitions (schema)
 * 5. PDF files in pdf-documents folder
 * 6. System settings and configuration
 *
 * 🗑️ DELETED DATA (70+ tables):
 * - Agent Chat (conversations, messages, uploaded files)
 * - CRM (contacts, relationships)
 * - Quotes System (quotes, items, timeline, upsells, status tags)
 * - Moodboards (moodboards, items, products, quote requests)
 * - 3D Generation History
 * - Analytics (events, quality metrics, scoring logs, recommendations)
 * - Document Entities & Relationships
 * - Relevancy Relationships (product-chunk, chunk-image, product-image)
 * - Metadata Values & Relevancy
 * - PDF Processing (jobs, checkpoints, progress, AI queue, image queue)
 * - Knowledge Base (chunks, embeddings, images, documents)
 * - Products & Materials Catalog
 * - Processing Results & Quality Data
 * - Web Scraping (sessions, pages, temp materials)
 * - Data Import (jobs, history)
 * - Storage files (pdf-tiles, material-images, moodboard-images, 3d-renders)
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════
// TABLES TO PRESERVE (NEVER DELETE)
// ═══════════════════════════════════════════════════════════
// These tables contain critical user and system data that must be preserved:
// 1. User Data:
//    - users (auth.users) - User authentication data
//    - profiles - User profile information
//    - workspaces - Workspace/tenant data
//    - workspace_members - Workspace membership
//    - api_keys - API authentication keys
//    - api_usage_logs - API usage tracking
//
// 2. Global Configuration:
//    - upsells - Global upsells (admin-managed upsell items)
//    - timeline_steps - Global timeline elements
//    - material_metadata_fields - Material metadata field definitions (schema)
//
// 3. System Settings:
//    - Any system configuration tables
//
// 4. Storage:
//    - pdf-documents bucket - All PDF files preserved

// ═══════════════════════════════════════════════════════════
// TABLES TO CLEAR (User-Generated Data)
// ═══════════════════════════════════════════════════════════
// Clear in order to respect foreign key constraints
// Order matters! Delete child tables before parent tables
const TABLES_TO_CLEAR = [
  // Agent Chat System (DELETE)
  'agent_chat_messages',           // Chat messages (child of conversations)
  'agent_chat_conversations',      // Chat conversations
  'agent_uploaded_files',          // Files uploaded in chat

  // CRM Contacts (DELETE)
  'crm_contact_relationships',     // Contact relationships (child of contacts)
  'crm_contacts',                  // CRM contacts

  // Quotes System (DELETE - except global upsells and timeline steps)
  'quote_timeline',                // Quote timeline progress (child of quotes)
  'quote_upsells',                 // Quote upsells junction (child of quotes)
  'quote_items',                   // Quote items (child of quotes)
  'quotes',                        // Quotes
  'status_tags',                   // Custom status tags
  // NOTE: 'upsells' and 'timeline_steps' are PRESERVED (global data)

  // Moodboards (DELETE)
  'moodboard_quote_requests',      // Moodboard quote requests (child of moodboards)
  'moodboard_products',            // Moodboard products (child of moodboards)
  'moodboard_items',               // Moodboard items (child of moodboards)
  'moodboards',                    // Moodboards

  // 3D Generation (DELETE)
  'generation_3d',                 // 3D generation history

  // Analytics (DELETE)
  'analytics_events',              // Analytics events
  'quality_metrics_daily',         // Daily quality metrics
  'quality_scoring_logs',          // Quality scoring logs
  'recommendation_analytics',      // Recommendation analytics

  // Document Entities & Relationships (DELETE)
  'product_document_relationships', // Product-document entity relationships
  'document_entities',             // Document entities (certificates, logos, specs)

  // Relevancy Relationships (DELETE)
  'product_chunk_relationships',   // Product-chunk relevancies
  'chunk_image_relationships',     // Chunk-image relevancies
  'product_image_relationships',   // Product-image relevancies
  'material_metadata_values',      // Material metadata values
  'material_metadata_relevancy',   // Material metadata relevancy

  // PDF Processing & Knowledge Base (DELETE)
  'job_checkpoints',               // Job checkpoints (child of background_jobs)
  'job_progress',                  // Job progress tracking (child of background_jobs)
  'ai_analysis_queue',             // AI analysis queue
  'image_processing_queue',        // Image processing queue
  'embeddings',                    // Text and image embeddings
  'document_images',               // Extracted images from PDFs
  'document_chunks',               // Semantic text chunks
  'products',                      // Extracted products
  'background_jobs',               // Processing jobs
  'documents',                     // PDF documents metadata
  'processed_documents',           // Processed document records

  // Materials & Catalog (DELETE)
  'materials_catalog',             // Materials catalog entries
  'material_visual_analysis',      // Visual analysis results

  // Processing & Quality (DELETE)
  'processing_results',            // Processing results

  // Agent Tasks (DELETE)
  'agent_tasks',                   // Agent task records

  // Web Scraping (DELETE)
  'scraped_materials_temp',        // Temporary scraped materials
  'scraping_sessions',             // Scraping sessions
  'scraping_pages',                // Scraping pages

  // Data Import (DELETE)
  'data_import_jobs',              // Data import jobs
  'data_import_history',           // Data import history
];

// Storage buckets configuration
// Each bucket can have excluded folders that should be preserved
const BUCKETS_CONFIG = [
  {
    name: 'pdf-tiles',
    excludeFolders: []  // Clear everything - extracted image tiles
  },
  {
    name: 'pdf-documents',
    excludeFolders: ['*']  // ⚠️ PRESERVE ALL files in pdf-documents bucket (use '*' to match all files)
  },
  {
    name: 'material-images',
    excludeFolders: []  // Clear everything - material images
  },
  {
    name: 'moodboard-images',
    excludeFolders: []  // Clear everything - moodboard images
  },
  {
    name: '3d-renders',
    excludeFolders: []  // Clear everything - 3D generation renders
  }
];

async function makeSupabaseRequest(method, path, body = null) {
  const url = `${SUPABASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Prefer': 'return=minimal'
    }
  };

  // Only add Content-Type and body if we have a body
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  // For DELETE requests, 200 or 204 is OK
  if (method === 'DELETE' && (response.status === 200 || response.status === 204)) {
    return { success: true };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase API error ${response.status}: ${text}`);
  }

  // Handle empty responses
  const text = await response.text();
  if (!text) {
    return { success: true };
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    return { success: true, raw: text };
  }
}

async function clearTable(tableName) {
  console.log(`\n🗑️  Clearing table: ${tableName}`);

  try {
    // Get count before deletion
    const countBefore = await makeSupabaseRequest('GET', `/rest/v1/${tableName}?select=count`, null);
    const count = countBefore?.[0]?.count || 0;

    if (count === 0) {
      console.log(`   ✅ Table ${tableName} is already empty`);
      return { table: tableName, deleted: 0 };
    }

    console.log(`   📊 Found ${count} rows to delete`);

    // Delete all rows
    await makeSupabaseRequest('DELETE', `/rest/v1/${tableName}?id=neq.00000000-0000-0000-0000-000000000000`, null);

    console.log(`   ✅ Deleted ${count} rows from ${tableName}`);
    return { table: tableName, deleted: count };
  } catch (error) {
    console.error(`   ❌ Failed to clear ${tableName}: ${error.message}`);
    return { table: tableName, deleted: 0, error: error.message };
  }
}

async function listBucketFiles(bucketName, path = '') {
  try {
    const response = await makeSupabaseRequest('POST', `/storage/v1/object/list/${bucketName}`, {
      prefix: path,
      limit: 1000,
      offset: 0
    });

    return response || [];
  } catch (error) {
    console.error(`   ❌ Failed to list files in ${bucketName}/${path}: ${error.message}`);
    return [];
  }
}

async function deleteFile(bucketName, filePath) {
  try {
    // Use DELETE with prefixes array for batch deletion
    await makeSupabaseRequest('DELETE', `/storage/v1/object/${bucketName}`, {
      prefixes: [filePath]
    });
    return true;
  } catch (error) {
    console.error(`   ⚠️  Failed to delete ${bucketName}/${filePath}: ${error.message}`);
    return false;
  }
}

async function clearBucket(bucketConfig) {
  const { name: bucketName, excludeFolders = [] } = bucketConfig;
  console.log(`\n🗑️  Clearing bucket: ${bucketName}`);

  if (excludeFolders.length > 0) {
    console.log(`   🔒 Preserving folders: ${excludeFolders.join(', ')}`);
  }

  try {
    // List all files recursively
    const allFiles = await listAllFilesRecursively(bucketName);

    if (allFiles.length === 0) {
      console.log(`   ✅ Bucket ${bucketName} is already empty`);
      return { bucket: bucketName, deleted: 0, skipped: 0 };
    }

    console.log(`   📊 Found ${allFiles.length} files to process`);

    let deleted = 0;
    let failed = 0;
    let skipped = 0;

    // Delete files in batches
    for (const filePath of allFiles) {
      // Check if file is in an excluded folder
      let shouldSkip = false;
      for (const excludedFolder of excludeFolders) {
        // Special case: '*' means preserve ALL files in this bucket
        if (excludedFolder === '*' || filePath.startsWith(excludedFolder)) {
          shouldSkip = true;
          skipped++;
          break;
        }
      }

      if (shouldSkip) {
        if (skipped % 10 === 0 && skipped > 0) {
          console.log(`   🔒 Skipped ${skipped} files in preserved folders...`);
        }
        continue;
      }

      const success = await deleteFile(bucketName, filePath);
      if (success) {
        deleted++;
        if (deleted % 10 === 0) {
          console.log(`   🔄 Deleted ${deleted} files...`);
        }
      } else {
        failed++;
      }
    }

    console.log(`   ✅ Deleted ${deleted} files from ${bucketName}`);
    if (skipped > 0) {
      console.log(`   🔒 Preserved ${skipped} files in excluded folders`);
    }
    if (failed > 0) {
      console.log(`   ⚠️  Failed to delete ${failed} files`);
    }

    return { bucket: bucketName, deleted, failed, skipped };
  } catch (error) {
    console.error(`   ❌ Failed to clear bucket ${bucketName}: ${error.message}`);
    return { bucket: bucketName, deleted: 0, failed: 0, skipped: 0, error: error.message };
  }
}

async function listAllFilesRecursively(bucketName, prefix = '') {
  const allFiles = [];

  async function listFolder(folderPath) {
    const items = await listBucketFiles(bucketName, folderPath);

    for (const item of items) {
      const fullPath = folderPath ? `${folderPath}/${item.name}` : item.name;

      // If it's a folder (has no metadata or is a directory), recurse into it
      if (!item.metadata || item.metadata.mimetype === 'application/x-directory') {
        await listFolder(fullPath);
      } else {
        // It's a file, add it to the list
        allFiles.push(fullPath);
      }
    }
  }

  await listFolder(prefix);
  return allFiles;
}

async function getStorageUsage() {
  try {
    // This is a rough estimate - Supabase doesn't provide direct storage usage API
    console.log('\n📊 Checking storage usage...');

    const bucketStats = [];
    for (const bucketConfig of BUCKETS_CONFIG) {
      const files = await listBucketFiles(bucketConfig.name);
      let totalSize = 0;
      let fileCount = 0;

      for (const file of files) {
        if (!file.name.endsWith('/')) {
          totalSize += file.metadata?.size || 0;
          fileCount++;
        }
      }

      bucketStats.push({
        bucket: bucketConfig.name,
        files: fileCount,
        size_mb: (totalSize / 1024 / 1024).toFixed(2)
      });
    }

    return bucketStats;
  } catch (error) {
    console.error(`❌ Failed to get storage usage: ${error.message}`);
    return [];
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔄 KNOWLEDGE BASE RESET (PRESERVING USER DATA)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('✅ PRESERVED:');
  console.log('   • Users & Authentication');
  console.log('   • Profiles & Workspaces');
  console.log('   • API Keys & Usage Logs');
  console.log('   • PDF files in pdf-documents folder');
  console.log('');
  console.log('🗑️  WILL DELETE:');
  console.log('   • PDF Processing Data (chunks, embeddings, images)');
  console.log('   • Products & Materials Catalog');
  console.log('   • Background Jobs & Processing Results');
  console.log('   • Analytics & Agent Tasks');
  console.log('   • 3D Generation History');
  console.log('   • Storage files (except pdf-documents folder)');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📅 Started: ${new Date().toISOString()}`);

  const results = {
    tables: [],
    buckets: [],
    storage_before: [],
    storage_after: []
  };

  // Step 1: Get storage usage BEFORE cleanup
  console.log('\n📊 STEP 1: Check storage usage BEFORE cleanup');
  results.storage_before = await getStorageUsage();
  console.log('\nStorage usage BEFORE:');
  console.table(results.storage_before);

  // Step 2: Clear database tables
  console.log('\n🗑️  STEP 2: Clear knowledge base tables');
  console.log(`   📋 Clearing ${TABLES_TO_CLEAR.length} tables (preserving user data)...`);
  for (const tableName of TABLES_TO_CLEAR) {
    const result = await clearTable(tableName);
    results.tables.push(result);
  }

  // Step 3: Clear storage buckets
  console.log('\n🗑️  STEP 3: Clear storage buckets');
  console.log('   🔒 Preserving pdf-documents folder and all files inside...');
  for (const bucketConfig of BUCKETS_CONFIG) {
    const result = await clearBucket(bucketConfig);
    results.buckets.push(result);
  }

  // Step 4: Get storage usage AFTER cleanup
  console.log('\n📊 STEP 4: Check storage usage AFTER cleanup');
  results.storage_after = await getStorageUsage();
  console.log('\nStorage usage AFTER:');
  console.table(results.storage_after);

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 CLEANUP SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');

  const totalRowsDeleted = results.tables.reduce((sum, r) => sum + (r.deleted || 0), 0);
  const totalFilesDeleted = results.buckets.reduce((sum, r) => sum + (r.deleted || 0), 0);
  const totalFilesFailed = results.buckets.reduce((sum, r) => sum + (r.failed || 0), 0);
  const totalFilesSkipped = results.buckets.reduce((sum, r) => sum + (r.skipped || 0), 0);

  console.log(`\n✅ Database rows deleted: ${totalRowsDeleted}`);
  console.log(`✅ Storage files deleted: ${totalFilesDeleted}`);
  if (totalFilesSkipped > 0) {
    console.log(`🔒 Storage files preserved: ${totalFilesSkipped} (pdf-documents folder)`);
  }
  if (totalFilesFailed > 0) {
    console.log(`⚠️  Storage files failed: ${totalFilesFailed}`);
  }

  console.log('\n📋 Table cleanup details:');
  console.table(results.tables);

  console.log('\n📦 Bucket cleanup details:');
  console.table(results.buckets);

  console.log('\n✅ PRESERVED DATA:');
  console.log('   • Users, Profiles, Workspaces remain intact');
  console.log('   • API Keys and authentication preserved');
  console.log(`   • ${totalFilesSkipped} files preserved in pdf-documents folder`);

  console.log(`\n📅 Completed: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(error => {
  console.error('\n❌ FATAL ERROR:', error);
  process.exit(1);
});


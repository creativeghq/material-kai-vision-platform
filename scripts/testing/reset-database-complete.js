/**
 * Complete Database Reset Script
 * 
 * This script:
 * 1. Deletes all data from database tables
 * 2. Deletes all files from Supabase Storage buckets (keeps buckets)
 * 3. Verifies cleanup was successful
 * 4. Reports storage and resource usage
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

// Tables to clear (in order to respect foreign key constraints)
// ONLY knowledge base data - PRESERVE users, workspaces, auth data
const TABLES_TO_CLEAR = [
  'embeddings',           // Clear embeddings
  'document_images',      // Clear images
  'document_chunks',      // Clear chunks
  'products',             // Clear products
  'materials_catalog',    // Clear materials
  'background_jobs',      // Clear jobs
  'documents',            // Clear documents
  'knowledge_base_entries' // Clear knowledge base
  // PRESERVE: users, workspaces, profiles, auth.users, etc.
];

// Storage buckets to clear (files only, keep buckets)
const BUCKETS_TO_CLEAR = [
  'pdf-tiles',
  'pdf-documents',
  'material-images'
];

async function makeSupabaseRequest(method, path, body = null) {
  const url = `${SUPABASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  
  // For DELETE requests, empty response is OK
  if (method === 'DELETE' && response.status === 204) {
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
    await makeSupabaseRequest('DELETE', `/storage/v1/object/${bucketName}/${filePath}`, null);
    return true;
  } catch (error) {
    console.error(`   ⚠️  Failed to delete ${bucketName}/${filePath}: ${error.message}`);
    return false;
  }
}

async function clearBucket(bucketName) {
  console.log(`\n🗑️  Clearing bucket: ${bucketName}`);
  
  try {
    // List all files
    const files = await listBucketFiles(bucketName);
    
    if (files.length === 0) {
      console.log(`   ✅ Bucket ${bucketName} is already empty`);
      return { bucket: bucketName, deleted: 0 };
    }

    console.log(`   📊 Found ${files.length} files/folders to delete`);

    let deleted = 0;
    let failed = 0;

    // Delete files in batches
    for (const file of files) {
      const filePath = file.name;
      
      // Skip if it's a folder (ends with /)
      if (filePath.endsWith('/')) {
        continue;
      }

      const success = await deleteFile(bucketName, filePath);
      if (success) {
        deleted++;
        if (deleted % 10 === 0) {
          console.log(`   🔄 Deleted ${deleted}/${files.length} files...`);
        }
      } else {
        failed++;
      }
    }

    console.log(`   ✅ Deleted ${deleted} files from ${bucketName} (${failed} failed)`);
    return { bucket: bucketName, deleted, failed };
  } catch (error) {
    console.error(`   ❌ Failed to clear bucket ${bucketName}: ${error.message}`);
    return { bucket: bucketName, deleted: 0, error: error.message };
  }
}

async function getStorageUsage() {
  try {
    // This is a rough estimate - Supabase doesn't provide direct storage usage API
    console.log('\n📊 Checking storage usage...');
    
    const bucketStats = [];
    for (const bucketName of BUCKETS_TO_CLEAR) {
      const files = await listBucketFiles(bucketName);
      let totalSize = 0;
      let fileCount = 0;

      for (const file of files) {
        if (!file.name.endsWith('/')) {
          totalSize += file.metadata?.size || 0;
          fileCount++;
        }
      }

      bucketStats.push({
        bucket: bucketName,
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
  console.log('🔄 COMPLETE DATABASE RESET');
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
  console.log('\n🗑️  STEP 2: Clear database tables');
  for (const tableName of TABLES_TO_CLEAR) {
    const result = await clearTable(tableName);
    results.tables.push(result);
  }

  // Step 3: Clear storage buckets
  console.log('\n🗑️  STEP 3: Clear storage buckets');
  for (const bucketName of BUCKETS_TO_CLEAR) {
    const result = await clearBucket(bucketName);
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

  console.log(`\n✅ Database rows deleted: ${totalRowsDeleted}`);
  console.log(`✅ Storage files deleted: ${totalFilesDeleted}`);
  if (totalFilesFailed > 0) {
    console.log(`⚠️  Storage files failed: ${totalFilesFailed}`);
  }

  console.log('\nTable cleanup:');
  console.table(results.tables);

  console.log('\nBucket cleanup:');
  console.table(results.buckets);

  console.log(`\n📅 Completed: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(error => {
  console.error('\n❌ FATAL ERROR:', error);
  process.exit(1);
});


import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================
// PRESERVED (never deleted during platform reset):
//
// DB Tables:
//   - system_settings          ← /admin/system-settings config (quote expiration, PDF template, company details)
//   - upsells                  ← global admin-managed upsell catalogue
//   - timeline_steps           ← global project timeline steps
//   - kb_docs                  ← Knowledge Base documents
//   - kb_categories            ← KB categories
//   - kb_doc_attachments       ← KB product links
//   - kb_search_analytics      ← KB search analytics
//   - crm_companies            ← CRM companies
//   - crm_contacts             ← CRM contacts
//   - crm_contact_relationships← CRM relationships
//   - profiles / auth.users    ← user accounts
//
//   ── Credits & Billing (DO NOT TOUCH) ──
//   - user_credits             ← per-user credit balances
//   - credit_transactions      ← full credit debit/top-up history
//   - credit_packages          ← available credit package catalogue
//
//   ── Prompts (DO NOT TOUCH) ──
//   - prompts                  ← saved agent/system prompts (admin-managed)
//   - extraction_prompts       ← PDF extraction prompt configurations
//   - prompt_history           ← per-user prompt history
//
// Storage Buckets:
//   - quote-templates          ← cover.png / backcover.png / items-background.png uploaded via system settings
//   - profile-avatars          ← user avatar images ({userId}/avatar.ext)
//   - pdf-documents            ← original uploaded PDF files
// ============================================================

// Tables to clear (in order to respect foreign key constraints)
// Order matters! Delete child tables before parent tables
const TABLES_TO_CLEAR = [
  // Agent Chat System (DELETE)
  'agent_chat_messages',           // Chat messages (child of conversations)
  'agent_chat_conversations',      // Chat conversations
  'agent_uploaded_files',          // Files uploaded in chat

  // CRM Contacts - PRESERVED (users requested to keep contacts and companies)
  // 'crm_contact_relationships',     // Contact relationships (child of contacts) - PRESERVED
  // 'crm_contacts',                  // CRM contacts - PRESERVED
  // NOTE: crm_companies is also PRESERVED (not in this list)

  // Quotes System (DELETE - except global upsells and timeline steps)
  'quote_timeline',                // Quote timeline progress (child of quotes)
  'quote_upsells',                 // Quote upsells junction (child of quotes)
  'quote_items',                   // Quote items (child of quotes)
  'quote_requests',                // Quote requests (child of quotes)
  'quotes',                        // Quotes
  'status_tags',                   // Custom status tags
  // NOTE: 'upsells' and 'timeline_steps' are PRESERVED (global data)
  // NOTE: 'system_settings' is PRESERVED (platform config, PDF template, company details)

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
  'image_product_associations',    // Image-product associations (visual search)
  'product_chunk_relationships',   // Product-chunk relevancies
  'chunk_image_relationships',     // Chunk-image relevancies
  'product_image_relationships',   // Product-image relevancies
  'material_metadata_values',      // Material metadata values
  'material_metadata_relevancy',   // Material metadata relevancy

  // PDF Processing (DELETE)
  'job_checkpoints',               // Job checkpoints (child of background_jobs)
  'job_progress',                  // Job progress tracking (child of background_jobs)
  'ai_analysis_queue',             // AI analysis queue
  'image_processing_queue',        // Image processing queue
  'embeddings',                    // Text and image embeddings
  'product_tables',                // YOLO extracted tables (child of products)
  'product_layout_regions',        // YOLO layout regions (child of products)
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

  // ============================================================
  // PRESERVED TABLES - Knowledge Base & Documentation (kb_* tables)
  // These are NOT deleted during platform reset:
  // - kb_docs                  // Knowledge Base documents
  // - kb_categories            // KB document categories
  // - kb_doc_attachments       // KB product links/attachments
  // - kb_search_analytics      // KB search analytics
  // ============================================================
];

// ============================================================
// Storage buckets to clear (AI/processing-generated content only)
//
// PRESERVED buckets (NOT in this list):
//   - quote-templates   ← cover.png / backcover.png / items-background.png (admin uploads via system settings)
//   - profile-avatars   ← user avatar images ({userId}/avatar.ext)
//   - pdf-documents     ← original uploaded PDF files
// ============================================================
const BUCKETS_TO_CLEAR = ['pdf-tiles', 'material-images', 'moodboard-images', '3d-renders'];

/**
 * Recursively list every file path in a bucket folder (handles subdirectories).
 * Returns a flat array of full file paths suitable for storage.remove().
 *
 * Paginates using offset so buckets with >1000 files are fully enumerated.
 */
async function listAllFiles(bucketName: string, folderPath = ''): Promise<string[]> {
  const PAGE_SIZE = 1000;
  const filePaths: string[] = [];
  let offset = 0;

  while (true) {
    const { data: items, error } = await supabase.storage
      .from(bucketName)
      .list(folderPath || undefined, { limit: PAGE_SIZE, offset });

    if (error || !items || items.length === 0) break;

    for (const item of items) {
      const itemPath = folderPath ? `${folderPath}/${item.name}` : item.name;

      if (item.metadata == null) {
        // item.metadata is null for folders — recurse (folders are never paginated)
        const nested = await listAllFiles(bucketName, itemPath);
        filePaths.push(...nested);
      } else {
        filePaths.push(itemPath);
      }
    }

    // If fewer than PAGE_SIZE were returned we've reached the end
    if (items.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return filePaths;
}

/**
 * Reset Platform Edge Function
 * Clears all user-generated data while preserving system configuration.
 *
 * PRESERVED: system_settings, upsells, timeline_steps, kb_* tables,
 *            crm_companies, crm_contacts, profiles/auth.users,
 *            user_credits, credit_transactions, credit_packages,
 *            prompts, extraction_prompts, prompt_history,
 *            quote-templates bucket, pdf-documents bucket, profile-avatars bucket
 */
Deno.serve(withApiLogging('reset-platform', async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate request - requires admin or manager role
    // Secret key bypasses role check
    const auth = await authenticate(req, {
      allowedRoles: ['admin', 'manager'],
    });

    if (!auth.success && !isAdminAccess(auth)) {
      return new Response(
        JSON.stringify({ error: auth.error || 'Unauthorized' }),
        { status: auth.error?.includes('Required roles') ? 403 : 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!body.confirm) {
      return new Response(
        JSON.stringify({ error: 'Confirmation required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('🔄 Starting platform reset...');
    const results: any = {
      tables: [],
      storage: [],
    };
    let totalDeleted = 0;

    // STEP 1: Clear database tables
    console.log('\n🗑️  STEP 1: Clear database tables');
    for (const tableName of TABLES_TO_CLEAR) {
      try {
        console.log(`   Clearing ${tableName}...`);

        // Get count before deletion
        const { count } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });

        if (count === 0) {
          console.log(`   ✅ ${tableName} is already empty`);
          results.tables.push({ table: tableName, deleted: 0 });
          continue;
        }

        // Delete all rows
        const { error } = await supabase
          .from(tableName)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');

        if (error) {
          console.error(`   ❌ Failed to clear ${tableName}:`, error);
          results.tables.push({ table: tableName, deleted: 0, error: error.message });
        } else {
          console.log(`   ✅ Deleted ${count} rows from ${tableName}`);
          results.tables.push({ table: tableName, deleted: count });
          totalDeleted += count || 0;
        }
      } catch (error: any) {
        console.error(`   ❌ Error clearing ${tableName}:`, error);
        results.tables.push({ table: tableName, deleted: 0, error: error.message });
      }
    }

    // STEP 2: Clear storage buckets (AI/processing content only — NOT quote-templates or pdf-documents)
    console.log('\n🗑️  STEP 2: Clear storage buckets');

    for (const bucketName of BUCKETS_TO_CLEAR) {
      try {
        console.log(`   Clearing bucket: ${bucketName}...`);

        // Recursively list all files including those in subdirectories
        const allFiles = await listAllFiles(bucketName);

        if (allFiles.length === 0) {
          console.log(`   ✅ Bucket ${bucketName} is already empty`);
          results.storage.push({ bucket: bucketName, deleted: 0 });
          continue;
        }

        // Delete in batches of 100 (Supabase storage remove limit)
        const BATCH_SIZE = 100;
        let totalDeletedFromBucket = 0;
        let bucketError: string | undefined;

        for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
          const batch = allFiles.slice(i, i + BATCH_SIZE);
          const { error: deleteError } = await supabase.storage.from(bucketName).remove(batch);

          if (deleteError) {
            console.error(`   ❌ Failed to delete batch from ${bucketName}:`, deleteError);
            bucketError = deleteError.message;
          } else {
            totalDeletedFromBucket += batch.length;
          }
        }

        console.log(`   ✅ Deleted ${totalDeletedFromBucket} files from ${bucketName}`);
        results.storage.push({ bucket: bucketName, deleted: totalDeletedFromBucket, error: bucketError });
      } catch (error: any) {
        console.error(`   ❌ Error clearing bucket ${bucketName}:`, error);
        results.storage.push({ bucket: bucketName, deleted: 0, error: error.message });
      }
    }

    const totalStorageDeleted = results.storage.reduce((sum: number, r: any) => sum + (r.deleted || 0), 0);

    // STEP 3: Clear VECS collections (vector embeddings)
    console.log('\n🗑️  STEP 3: Clear VECS collections');
    results.vecs = [];

    // VECS collections to clear - these store image embeddings for visual search
    // Includes primary visual embeddings and specialized embeddings (color, texture, style, material)
    const vecsCollections = [
      'image_slig_embeddings',      // Primary visual embeddings (768D)
      'image_color_embeddings',     // Color-focused embeddings (768D)
      'image_texture_embeddings',   // Texture pattern embeddings (768D)
      'image_style_embeddings',     // Design style embeddings (768D)
      'image_material_embeddings'   // Material type embeddings (768D)
    ];
    for (const collection of vecsCollections) {
      try {
        console.log(`   Clearing vecs.${collection}...`);

        // Query VECS table directly (schema: vecs)
        const { count, error: countError } = await supabase
          .schema('vecs')
          .from(collection)
          .select('*', { count: 'exact', head: true });

        if (countError) {
          console.log(`   ⚠️ Could not count vecs.${collection}: ${countError.message}`);
          results.vecs.push({ collection, deleted: 0, error: countError.message });
          continue;
        }

        if (!count || count === 0) {
          console.log(`   ✅ vecs.${collection} is already empty`);
          results.vecs.push({ collection, deleted: 0 });
          continue;
        }

        // Delete all rows from VECS collection
        const { error: deleteError } = await supabase
          .schema('vecs')
          .from(collection)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');

        if (deleteError) {
          console.error(`   ❌ Failed to clear vecs.${collection}:`, deleteError);
          results.vecs.push({ collection, deleted: 0, error: deleteError.message });
        } else {
          console.log(`   ✅ Deleted ${count} rows from vecs.${collection}`);
          results.vecs.push({ collection, deleted: count });
        }
      } catch (error: any) {
        console.error(`   ❌ Error clearing vecs.${collection}:`, error);
        results.vecs.push({ collection, deleted: 0, error: error.message });
      }
    }

    const totalVecsDeleted = results.vecs.reduce((sum: number, r: any) => sum + (r.deleted || 0), 0);
    const successfulTables = results.tables.filter((r: any) => !r.error).length;
    const failedTables = results.tables.filter((r: any) => r.error).length;
    console.log(`✅ Platform reset complete. Tables: ${totalDeleted} rows across ${successfulTables}/${TABLES_TO_CLEAR.length} tables (${failedTables} errors), Storage: ${totalStorageDeleted} files, VECS: ${totalVecsDeleted} embeddings`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: `Deleted ${totalDeleted} rows from ${successfulTables}/${TABLES_TO_CLEAR.length} tables (${failedTables} failed), ${totalStorageDeleted} files from storage, and ${totalVecsDeleted} embeddings from VECS`,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('❌ Reset platform error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}));

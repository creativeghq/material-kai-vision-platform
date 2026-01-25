import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

/**
 * Reset Platform Edge Function
 * Clears all user-generated data while preserving system configuration
 */
Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify user is authenticated and is admin
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Check if user is admin (level 5) or manager (level 4+)
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role_id, roles(name, level)')
      .eq('user_id', user.id)
      .single();

    // Check if user has admin or manager role (level >= 4)
    if (!userProfile || !userProfile.roles || userProfile.roles.level < 4) {
      return new Response(
        JSON.stringify({ error: 'Admin or Manager access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json();
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

    // STEP 2: Clear storage buckets (except pdf-documents)
    console.log('\n🗑️  STEP 2: Clear storage buckets');
    const bucketsToClean = ['pdf-tiles', 'material-images', 'moodboard-images', '3d-renders'];

    for (const bucketName of bucketsToClean) {
      try {
        console.log(`   Clearing bucket: ${bucketName}...`);

        // List all files in bucket
        const { data: files, error: listError } = await supabase
          .storage
          .from(bucketName)
          .list();

        if (listError) {
          console.log(`   ⚠️ Bucket ${bucketName} not found or empty`);
          results.storage.push({ bucket: bucketName, deleted: 0, error: listError.message });
          continue;
        }

        if (!files || files.length === 0) {
          console.log(`   ✅ Bucket ${bucketName} is already empty`);
          results.storage.push({ bucket: bucketName, deleted: 0 });
          continue;
        }

        // Delete all files
        const filePaths = files.map(file => file.name);
        const { error: deleteError } = await supabase
          .storage
          .from(bucketName)
          .remove(filePaths);

        if (deleteError) {
          console.error(`   ❌ Failed to clear bucket ${bucketName}:`, deleteError);
          results.storage.push({ bucket: bucketName, deleted: 0, error: deleteError.message });
        } else {
          console.log(`   ✅ Deleted ${filePaths.length} files from ${bucketName}`);
          results.storage.push({ bucket: bucketName, deleted: filePaths.length });
        }
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
    console.log(`✅ Platform reset complete. Tables: ${totalDeleted} rows, Storage: ${totalStorageDeleted} files, VECS: ${totalVecsDeleted} embeddings`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: `Deleted ${totalDeleted} rows from ${TABLES_TO_CLEAR.length} tables, ${totalStorageDeleted} files from storage, and ${totalVecsDeleted} embeddings from VECS`,
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
});

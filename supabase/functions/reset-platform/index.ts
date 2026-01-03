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

  // CRM Contacts (DELETE)
  'crm_contact_relationships',     // Contact relationships (child of contacts)
  'crm_contacts',                  // CRM contacts

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
    console.log(`✅ Platform reset complete. Tables: ${totalDeleted} rows, Storage: ${totalStorageDeleted} files`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: `Deleted ${totalDeleted} rows from ${TABLES_TO_CLEAR.length} tables and ${totalStorageDeleted} files from storage`,
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


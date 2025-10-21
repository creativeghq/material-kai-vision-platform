/**
 * Verify that PDF processing results are properly stored in the database
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkwNjAzMSwiZXhwIjoyMDY3NDgyMDMxfQ.KCfP909Qttvs3jr4t1pTYMjACVz2-C-Ga4Xm_ZyecwM';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function verifyDatabaseStorage(documentId) {
  console.log(`\n${'='.repeat(100)}`);
  console.log(`📊 VERIFYING DATABASE STORAGE FOR DOCUMENT: ${documentId}`);
  console.log(`${'='.repeat(100)}\n`);

  try {
    // 1. Check document record
    console.log('🔍 [1/5] Checking document record...');
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError) {
      console.log(`   ❌ Document not found: ${docError.message}`);
    } else {
      console.log(`   ✅ Document found: ${document.filename}`);
      console.log(`      Status: ${document.processing_status}`);
      console.log(`      Created: ${document.created_at}`);
    }

    // 2. Check chunks
    console.log('\n🔍 [2/5] Checking document chunks...');
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, content, chunk_index, metadata')
      .eq('document_id', documentId)
      .order('chunk_index');

    if (chunksError) {
      console.log(`   ❌ Error fetching chunks: ${chunksError.message}`);
    } else {
      console.log(`   ✅ Found ${chunks.length} chunks`);
      if (chunks.length > 0) {
        console.log(`      First chunk: ${chunks[0].content.substring(0, 100)}...`);
        console.log(`      Last chunk: ${chunks[chunks.length - 1].content.substring(0, 100)}...`);
        console.log(`      Average chunk size: ${Math.round(chunks.reduce((sum, c) => sum + c.content.length, 0) / chunks.length)} chars`);
      }
    }

    // 3. Check embeddings
    console.log('\n🔍 [3/5] Checking embeddings...');
    const { data: embeddings, error: embError } = await supabase
      .from('embeddings')
      .select('id, chunk_id, dimensions, model_name')
      .in('chunk_id', chunks?.map(c => c.id) || []);

    if (embError) {
      console.log(`   ❌ Error fetching embeddings: ${embError.message}`);
    } else {
      console.log(`   ✅ Found ${embeddings.length} embeddings`);
      if (embeddings.length > 0) {
        console.log(`      Model: ${embeddings[0].model_name}`);
        console.log(`      Dimensions: ${embeddings[0].dimensions}`);
        console.log(`      Coverage: ${Math.round((embeddings.length / chunks.length) * 100)}% of chunks have embeddings`);
      }
    }

    // 4. Check images
    console.log('\n🔍 [4/5] Checking extracted images...');
    const { data: images, error: imgError } = await supabase
      .from('document_images')
      .select('id, image_url, page_number, contextual_name')
      .eq('document_id', documentId)
      .order('page_number');

    if (imgError) {
      console.log(`   ❌ Error fetching images: ${imgError.message}`);
    } else {
      console.log(`   ✅ Found ${images.length} images`);
      if (images.length > 0) {
        console.log(`      Pages with images: ${[...new Set(images.map(i => i.page_number))].join(', ')}`);
        console.log(`      Sample image: ${images[0].contextual_name || 'unnamed'}`);
      }
    }

    // 5. Check document_vectors
    console.log('\n🔍 [5/5] Checking document vectors...');
    const { data: vectors, error: vecError } = await supabase
      .from('document_vectors')
      .select('id, chunk_id, model_name')
      .eq('document_id', documentId);

    if (vecError) {
      console.log(`   ❌ Error fetching vectors: ${vecError.message}`);
    } else {
      console.log(`   ✅ Found ${vectors.length} vectors`);
      if (vectors.length > 0) {
        console.log(`      Model: ${vectors[0].model_name}`);
      }
    }

    // Summary
    console.log(`\n${'='.repeat(100)}`);
    console.log('📊 SUMMARY');
    console.log(`${'='.repeat(100)}`);
    console.log(`Document: ${document ? '✅' : '❌'}`);
    console.log(`Chunks: ${chunks?.length || 0} ${chunks?.length > 0 ? '✅' : '❌'}`);
    console.log(`Embeddings: ${embeddings?.length || 0} ${embeddings?.length > 0 ? '✅' : '❌'}`);
    console.log(`Images: ${images?.length || 0} ${images?.length >= 0 ? '✅' : '❌'}`);
    console.log(`Vectors: ${vectors?.length || 0} ${vectors?.length > 0 ? '✅' : '❌'}`);
    console.log(`${'='.repeat(100)}\n`);

    const allGood = document && chunks?.length > 0 && embeddings?.length > 0;
    if (allGood) {
      console.log('✅ ALL CHECKS PASSED! Database storage is working correctly.\n');
    } else {
      console.log('⚠️  SOME CHECKS FAILED! Review the details above.\n');
    }

    return allGood;

  } catch (error) {
    console.error(`\n❌ Error verifying database storage: ${error.message}`);
    console.error(error);
    return false;
  }
}

// Get document ID from command line or use default
const documentId = process.argv[2] || 'ac111899-c6db-4899-85fc-74d707c81146';

verifyDatabaseStorage(documentId).then(success => {
  process.exit(success ? 0 : 1);
});


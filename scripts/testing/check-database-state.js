#!/usr/bin/env node

/**
 * Check current database state
 * Verifies what data exists in the system
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkDatabaseState() {
  console.log('\n================================================================================');
  console.log('📊 DATABASE STATE CHECK');
  console.log('================================================================================\n');

  try {
    // Check documents
    console.log('📄 DOCUMENTS:');
    const { data: docs, error: docsError } = await supabase
      .from('documents')
      .select('id, filename, created_at')
      .limit(10);
    
    if (docsError) {
      console.log(`  ❌ Error: ${docsError.message}`);
    } else {
      console.log(`  ✅ Found ${docs?.length || 0} documents`);
      if (docs && docs.length > 0) {
        docs.forEach((doc, i) => {
          console.log(`     ${i+1}. ${doc.filename} (ID: ${doc.id})`);
        });
      }
    }

    // Check chunks
    console.log('\n📦 CHUNKS:');
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, document_id, content')
      .limit(5);
    
    if (chunksError) {
      console.log(`  ❌ Error: ${chunksError.message}`);
    } else {
      console.log(`  ✅ Found ${chunks?.length || 0} chunks`);
      if (chunks && chunks.length > 0) {
        chunks.forEach((chunk, i) => {
          const preview = chunk.content?.substring(0, 60).replace(/\n/g, ' ') || 'N/A';
          console.log(`     ${i+1}. ${preview}...`);
        });
      }
    }

    // Check images
    console.log('\n🖼️  IMAGES:');
    const { data: images, error: imagesError } = await supabase
      .from('document_images')
      .select('id, image_url, caption')
      .limit(5);
    
    if (imagesError) {
      console.log(`  ❌ Error: ${imagesError.message}`);
    } else {
      console.log(`  ✅ Found ${images?.length || 0} images`);
      if (images && images.length > 0) {
        images.forEach((img, i) => {
          console.log(`     ${i+1}. ${img.caption || 'No caption'}`);
        });
      }
    }

    // Check embeddings
    console.log('\n🔢 EMBEDDINGS:');
    const { data: embeddings, error: embeddingsError } = await supabase
      .from('document_vectors')
      .select('id, chunk_id')
      .limit(5);
    
    if (embeddingsError) {
      console.log(`  ❌ Error: ${embeddingsError.message}`);
    } else {
      console.log(`  ✅ Found ${embeddings?.length || 0} embeddings`);
    }

    // Check products
    console.log('\n📦 PRODUCTS:');
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, created_from_type')
      .limit(5);
    
    if (productsError) {
      console.log(`  ❌ Error: ${productsError.message}`);
    } else {
      console.log(`  ✅ Found ${products?.length || 0} products`);
      if (products && products.length > 0) {
        products.forEach((prod, i) => {
          console.log(`     ${i+1}. ${prod.name} (Type: ${prod.created_from_type})`);
        });
      }
    }

    // Summary
    console.log('\n================================================================================');
    console.log('📊 SUMMARY:');
    console.log('================================================================================');
    console.log(`  Documents:  ${docs?.length || 0}`);
    console.log(`  Chunks:     ${chunks?.length || 0}`);
    console.log(`  Images:     ${images?.length || 0}`);
    console.log(`  Embeddings: ${embeddings?.length || 0}`);
    console.log(`  Products:   ${products?.length || 0}`);
    console.log('================================================================================\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkDatabaseState();


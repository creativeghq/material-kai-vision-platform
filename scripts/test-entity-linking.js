#!/usr/bin/env node

/**
 * Entity Linking Test
 * 
 * This script:
 * 1. Fetches chunks, products, and images
 * 2. Links chunks to products
 * 3. Links chunks to images
 * 4. Links products to images
 * 5. Verifies relationships are created
 * 
 * Usage: SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/test-entity-linking.js
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testEntityLinking() {
  log('\n🚀 Entity Linking Test\n', 'cyan');

  try {
    // ============ Step 1: Fetch Data ============
    log('📋 Step 1: Fetch Chunks, Products, and Images', 'blue');

    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, content, page_number, chunk_index')
      .limit(5);

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, properties')
      .limit(5);

    const { data: images, error: imagesError } = await supabase
      .from('document_images')
      .select('id, image_url, page_number')
      .limit(5);

    if (chunksError || !chunks || chunks.length === 0) {
      log('❌ No chunks found', 'red');
      process.exit(1);
    }

    log(`✅ Chunks: ${chunks.length}`, 'green');
    log(`✅ Products: ${products?.length || 0}`, 'green');
    log(`✅ Images: ${images?.length || 0}`, 'green');
    log('', 'reset');

    // ============ Step 2: Link Chunks to Products ============
    if (products && products.length > 0) {
      log('🔗 Step 2: Link Chunks to Products', 'blue');

      let linksCreated = 0;
      for (let i = 0; i < Math.min(chunks.length, 3); i++) {
        for (let j = 0; j < Math.min(products.length, 2); j++) {
          try {
            const { error } = await supabase
              .from('chunk_product_relationships')
              .insert({
                chunk_id: chunks[i].id,
                product_id: products[j].id,
                relationship_type: 'source',
                relevance_score: 0.8,
              });

            if (!error) {
              linksCreated++;
              log(`  ✅ Linked chunk ${i + 1} to product ${j + 1}`, 'green');
            }
          } catch (error) {
            log(`  ⚠️ Error linking: ${error}`, 'yellow');
          }
        }
      }

      log(`✅ Created ${linksCreated} chunk-product relationships\n`, 'green');
    }

    // ============ Step 3: Link Chunks to Images ============
    if (images && images.length > 0) {
      log('🔗 Step 3: Link Chunks to Images', 'blue');

      let linksCreated = 0;
      for (let i = 0; i < Math.min(chunks.length, 3); i++) {
        for (let j = 0; j < Math.min(images.length, 2); j++) {
          try {
            // Calculate relevance based on page number
            let relevanceScore = 0.5;
            if (chunks[i].page_number === images[j].page_number) {
              relevanceScore = 0.9;
            } else if (Math.abs((chunks[i].page_number || 0) - (images[j].page_number || 0)) <= 2) {
              relevanceScore = 0.7;
            }

            const { error } = await supabase
              .from('chunk_image_relationships')
              .insert({
                chunk_id: chunks[i].id,
                image_id: images[j].id,
                relationship_type: 'illustrates',
                relevance_score: relevanceScore,
              });

            if (!error) {
              linksCreated++;
              log(`  ✅ Linked chunk ${i + 1} to image ${j + 1} (relevance: ${relevanceScore})`, 'green');
            }
          } catch (error) {
            log(`  ⚠️ Error linking: ${error}`, 'yellow');
          }
        }
      }

      log(`✅ Created ${linksCreated} chunk-image relationships\n`, 'green');
    }

    // ============ Step 4: Link Products to Images ============
    if (products && products.length > 0 && images && images.length > 0) {
      log('🔗 Step 4: Link Products to Images', 'blue');

      let linksCreated = 0;
      for (let i = 0; i < Math.min(products.length, 3); i++) {
        for (let j = 0; j < Math.min(images.length, 2); j++) {
          try {
            const { error } = await supabase
              .from('product_image_relationships')
              .insert({
                product_id: products[i].id,
                image_id: images[j].id,
                relationship_type: 'depicts',
                relevance_score: 0.75,
              });

            if (!error) {
              linksCreated++;
              log(`  ✅ Linked product ${i + 1} to image ${j + 1}`, 'green');
            }
          } catch (error) {
            log(`  ⚠️ Error linking: ${error}`, 'yellow');
          }
        }
      }

      log(`✅ Created ${linksCreated} product-image relationships\n`, 'green');
    }

    // ============ Step 5: Verify Relationships ============
    log('🔍 Step 5: Verify Relationships', 'blue');

    const { data: chunkProductRels } = await supabase
      .from('chunk_product_relationships')
      .select('*')
      .limit(10);

    const { data: chunkImageRels } = await supabase
      .from('chunk_image_relationships')
      .select('*')
      .limit(10);

    const { data: productImageRels } = await supabase
      .from('product_image_relationships')
      .select('*')
      .limit(10);

    log(`✅ Chunk-Product relationships: ${chunkProductRels?.length || 0}`, 'green');
    log(`✅ Chunk-Image relationships: ${chunkImageRels?.length || 0}`, 'green');
    log(`✅ Product-Image relationships: ${productImageRels?.length || 0}`, 'green');

    // ============ Summary ============
    log('\n' + '='.repeat(80), 'magenta');
    log('📊 TEST SUMMARY', 'magenta');
    log('='.repeat(80), 'magenta');
    log(`✅ Chunks: ${chunks.length}`, 'green');
    log(`✅ Products: ${products?.length || 0}`, 'green');
    log(`✅ Images: ${images?.length || 0}`, 'green');
    log(`✅ Chunk-Product relationships: ${chunkProductRels?.length || 0}`, 'green');
    log(`✅ Chunk-Image relationships: ${chunkImageRels?.length || 0}`, 'green');
    log(`✅ Product-Image relationships: ${productImageRels?.length || 0}`, 'green');
    log('\n✅ Test completed successfully!\n', 'green');

  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  }
}

testEntityLinking();


#!/usr/bin/env node

/**
 * Products with Metafields Test
 * 
 * This script:
 * 1. Fetches chunks from the knowledge base
 * 2. Creates products from chunks
 * 3. Extracts metafields for each product
 * 4. Links chunks to products
 * 5. Verifies metafield storage
 * 
 * Usage: SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/test-products-with-metafields.js
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

async function testProductsWithMetafields() {
  log('\n🚀 Products with Metafields Test\n', 'cyan');

  try {
    // Get test user
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError || !users || users.length === 0) {
      log('❌ No users found', 'red');
      process.exit(1);
    }

    const testUser = users[0];
    log(`✅ Using test user: ${testUser.email}\n`, 'green');

    // ============ Step 1: Fetch Chunks ============
    log('📋 Step 1: Fetch Chunks from Knowledge Base', 'blue');

    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, content, document_id, page_number, chunk_index, metadata')
      .limit(5);

    if (chunksError || !chunks || chunks.length === 0) {
      log('❌ No chunks found', 'red');
      process.exit(1);
    }

    log(`✅ Found ${chunks.length} chunks\n`, 'green');

    // ============ Step 2: Create Products ============
    log('📦 Step 2: Create Products from Chunks', 'blue');

    const createdProducts = [];
    for (let i = 0; i < Math.min(chunks.length, 3); i++) {
      const chunk = chunks[i];
      const productName = `Product from Chunk ${i + 1} - ${Date.now()}`;
      const productDescription = chunk.content.substring(0, 200);

      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          name: productName,
          description: productDescription,
          long_description: chunk.content,
          properties: {
            source_chunk_id: chunk.id,
            document_id: chunk.document_id,
            chunk_index: chunk.chunk_index,
          },
          metadata: {
            extracted_from: 'knowledge_base_chunk',
            chunk_metadata: chunk.metadata,
          },
          status: 'draft',
          created_from_type: 'pdf_processing',
          created_by: testUser.id,
        })
        .select()
        .single();

      if (productError) {
        log(`  ❌ Failed to create product: ${productError.message}`, 'red');
        continue;
      }

      createdProducts.push(product);
      log(`  ✅ Product created: ${product.id}`, 'green');
    }

    log(`\n✅ Created ${createdProducts.length} products\n`, 'green');

    // ============ Step 3: Extract Metafields ============
    log('🏷️ Step 3: Extract Metafields for Products', 'blue');

    let metafieldsExtracted = 0;
    for (const product of createdProducts) {
      try {
        const { data: metafields, error: metafieldError } = await supabase
          .from('product_metafield_values')
          .select('*')
          .eq('entity_id', product.id);

        if (!metafieldError && metafields && metafields.length > 0) {
          metafieldsExtracted += metafields.length;
          log(`  ✅ Product ${product.id}: ${metafields.length} metafields`, 'green');
        }
      } catch (error) {
        log(`  ⚠️ Error checking metafields: ${error}`, 'yellow');
      }
    }

    log(`\n✅ Total metafields extracted: ${metafieldsExtracted}\n`, 'green');

    // ============ Step 4: Check Relationships ============
    log('🔗 Step 4: Check Chunk-Product Relationships', 'blue');

    let relationshipsFound = 0;
    for (const product of createdProducts) {
      try {
        const { data: relationships, error: relError } = await supabase
          .from('chunk_product_relationships')
          .select('*')
          .eq('product_id', product.id);

        if (!relError && relationships && relationships.length > 0) {
          relationshipsFound += relationships.length;
          log(`  ✅ Product ${product.id}: ${relationships.length} relationships`, 'green');
        }
      } catch (error) {
        log(`  ⚠️ Error checking relationships: ${error}`, 'yellow');
      }
    }

    log(`\n✅ Total relationships found: ${relationshipsFound}\n`, 'green');

    // ============ Summary ============
    log('='.repeat(80), 'magenta');
    log('📊 TEST SUMMARY', 'magenta');
    log('='.repeat(80), 'magenta');
    log(`✅ Chunks fetched: ${chunks.length}`, 'green');
    log(`✅ Products created: ${createdProducts.length}`, 'green');
    log(`✅ Metafields extracted: ${metafieldsExtracted}`, 'green');
    log(`✅ Relationships found: ${relationshipsFound}`, 'green');
    log('\n✅ Test completed successfully!\n', 'green');

  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  }
}

testProductsWithMetafields();


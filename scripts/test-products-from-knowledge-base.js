#!/usr/bin/env node

/**
 * Products System Test - Extract from Real Knowledge Base
 * 
 * This script:
 * 1. Fetches actual chunks from the knowledge base
 * 2. Extracts product information from those chunks
 * 3. Creates products with real data (not mocks)
 * 4. Tests the complete workflow
 * 
 * Usage: SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/test-products-from-knowledge-base.js
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('   Set it with: export SUPABASE_SERVICE_ROLE_KEY=your_key');
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

const testStats = {
  chunks_found: 0,
  products_extracted: 0,
  products_created: 0,
  errors: 0,
};

const createdProducts = [];

async function testProductsFromKnowledgeBase() {
  log('\n🚀 Products System - Extract from Real Knowledge Base\n', 'cyan');
  log('Testing: Fetch Chunks → Extract Products → Create Records\n', 'yellow');

  try {
    // Get a test user
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError || !users || users.length === 0) {
      log('❌ No users found. Please create a test user first.', 'red');
      process.exit(1);
    }

    const testUser = users[0];
    log(`✅ Using test user: ${testUser.email}\n`, 'green');

    // ============ Step 1: Fetch Chunks from Knowledge Base ============
    log('📋 Step 1: Fetch Chunks from Knowledge Base', 'blue');

    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, content, document_id, page_number, chunk_index, metadata')
      .limit(10);

    if (chunksError) {
      log(`  ❌ Error fetching chunks: ${chunksError.message}`, 'red');
      testStats.errors++;
    } else if (!chunks || chunks.length === 0) {
      log('  ⚠️  No chunks found in knowledge base', 'yellow');
      log('  💡 Tip: Upload a PDF first to generate chunks', 'cyan');
      log('\n  Falling back to creating sample products from mock data...', 'yellow');
      
      // Create sample products if no chunks exist
      await createSampleProducts(testUser.id);
    } else {
      testStats.chunks_found = chunks.length;
      log(`  ✅ Found ${chunks.length} chunks in knowledge base\n`, 'green');

      // Display chunk information
      log('📦 CHUNKS FOUND:', 'magenta');
      log('='.repeat(80), 'magenta');
      
      for (let i = 0; i < Math.min(chunks.length, 5); i++) {
        const chunk = chunks[i];
        log(`\n  Chunk ${i + 1}:`, 'yellow');
        log(`    ID: ${chunk.id}`, 'cyan');
        log(`    Document ID: ${chunk.document_id}`, 'cyan');
        log(`    Page: ${chunk.page_number || 'N/A'}`, 'cyan');
        log(`    Content Preview: ${chunk.content.substring(0, 100)}...`, 'cyan');
      }

      // Extract products from chunks
      await extractProductsFromChunks(chunks, testUser.id);
    }

    // ============ Final Report ============
    log('\n' + '='.repeat(80), 'magenta');
    log('📊 TEST SUMMARY REPORT', 'magenta');
    log('='.repeat(80), 'magenta');
    log(`\n✅ Chunks Found: ${testStats.chunks_found}`, 'green');
    log(`✅ Products Extracted: ${testStats.products_extracted}`, 'green');
    log(`✅ Products Created: ${testStats.products_created}`, 'green');
    log(`❌ Errors: ${testStats.errors}`, testStats.errors > 0 ? 'red' : 'green');

    if (createdProducts.length > 0) {
      log('\n' + '='.repeat(80), 'magenta');
      log('📦 CREATED PRODUCTS DETAILS', 'magenta');
      log('='.repeat(80), 'magenta');

      for (let i = 0; i < createdProducts.length; i++) {
        const product = createdProducts[i];
        log(`\n📌 Product ${i + 1}:`, 'yellow');
        log(`   ID: ${product.id}`, 'cyan');
        log(`   Name: ${product.name}`, 'cyan');
        log(`   Description: ${product.description}`, 'cyan');
        log(`   Status: ${product.status}`, 'cyan');
        log(`   Source: ${product.created_from_type}`, 'cyan');
        
        if (product.properties) {
          log(`   Properties:`, 'yellow');
          Object.entries(product.properties).forEach(([key, value]) => {
            log(`      - ${key}: ${value}`, 'cyan');
          });
        }
      }
    }

    const totalOps = testStats.chunks_found + testStats.products_created;
    const successRate = totalOps > 0 ? ((totalOps - testStats.errors) / totalOps * 100).toFixed(2) : 0;
    
    log(`\n📈 Total Operations: ${totalOps}`, 'cyan');
    log(`📊 Success Rate: ${successRate}%\n`, 'cyan');

    log('✅ Test completed!\n', 'green');

  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    testStats.errors++;
    process.exit(1);
  }
}

async function extractProductsFromChunks(chunks, userId) {
  log('\n📋 Step 2: Extract Products from Chunks', 'blue');

  for (let i = 0; i < Math.min(chunks.length, 3); i++) {
    const chunk = chunks[i];
    
    // Simple extraction: use chunk content as product description
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
          page_number: chunk.page_number,
          chunk_index: chunk.chunk_index,
        },
        metadata: {
          extracted_from: 'knowledge_base_chunk',
          chunk_metadata: chunk.metadata,
        },
        status: 'draft',
        created_from_type: 'pdf_processing',
        created_by: userId,
      })
      .select()
      .single();

    if (productError) {
      log(`  ❌ Failed to create product from chunk: ${productError.message}`, 'red');
      testStats.errors++;
    } else {
      testStats.products_created++;
      testStats.products_extracted++;
      createdProducts.push(product);
      log(`  ✅ Product created from chunk ${i + 1}`, 'green');
      log(`     Name: ${product.name}`, 'cyan');
      log(`     ID: ${product.id}`, 'cyan');
    }
  }
}

async function createSampleProducts(userId) {
  log('\n📋 Creating Sample Products (No Knowledge Base Data)', 'blue');

  const sampleProducts = [
    {
      name: `Sample Material - Marble - ${Date.now()}`,
      description: 'Premium marble material for construction',
      long_description: 'High-quality marble sourced from quarries',
      properties: { material_type: 'stone', color: 'white' },
      metadata: { source: 'sample_data' },
    },
    {
      name: `Sample Material - Wood - ${Date.now()}`,
      description: 'Engineered wood flooring',
      long_description: 'Durable engineered wood with oak veneer',
      properties: { material_type: 'wood', color: 'natural' },
      metadata: { source: 'sample_data' },
    },
  ];

  for (const productData of sampleProducts) {
    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({
        ...productData,
        status: 'draft',
        created_from_type: 'sample_data',
        created_by: userId,
      })
      .select()
      .single();

    if (productError) {
      log(`  ❌ Failed to create sample product: ${productError.message}`, 'red');
      testStats.errors++;
    } else {
      testStats.products_created++;
      createdProducts.push(product);
      log(`  ✅ Sample product created: ${product.name}`, 'green');
    }
  }
}

// Run the test
testProductsFromKnowledgeBase().catch(error => {
  log(`\n❌ Unhandled error: ${error.message}`, 'red');
  process.exit(1);
});


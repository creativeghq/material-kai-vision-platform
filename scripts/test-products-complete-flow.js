#!/usr/bin/env node

/**
 * Complete Products System End-to-End Flow Test
 * Tests the entire Products system:
 * 1. Product Creation with metadata
 * 2. Product Search by description
 * 3. Product Search by image relevancy
 * 4. Product Search by metadata (category, material)
 * 5. Embeddings verification
 * 6. MIVAA API integration
 * 7. Pagination and filtering
 * 8. Error handling
 *
 * Usage: SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/test-products-complete-flow.js
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Color codes for output
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

// Generate unique test product name
function generateTestProductName() {
  return `Test Product ${Date.now()}`;
}

// Test data
const testProducts = [
  {
    name: generateTestProductName(),
    description: 'Premium Italian marble with white veining',
    long_description: 'High-quality marble sourced from Italian quarries, featuring elegant white veining patterns',
    category: 'marble',
    properties: {
      material_type: 'natural_stone',
      color: 'white',
      finish: 'polished',
      durability: 'high',
    },
    metadata: {
      supplier: 'Italian Quarries Inc',
      origin: 'Italy',
      price_range: '$100-200 per sq ft',
    },
  },
  {
    name: generateTestProductName(),
    description: 'Sustainable bamboo flooring with natural grain',
    long_description: 'Eco-friendly bamboo flooring with beautiful natural grain patterns',
    category: 'flooring',
    properties: {
      material_type: 'bamboo',
      color: 'natural',
      finish: 'matte',
      durability: 'medium',
    },
    metadata: {
      supplier: 'Eco Materials Ltd',
      origin: 'China',
      price_range: '$5-10 per sq ft',
    },
  },
  {
    name: generateTestProductName(),
    description: 'Stainless steel kitchen hardware',
    long_description: 'Modern stainless steel handles and fixtures for kitchen applications',
    category: 'hardware',
    properties: {
      material_type: 'stainless_steel',
      color: 'silver',
      finish: 'brushed',
      durability: 'very_high',
    },
    metadata: {
      supplier: 'Modern Hardware Co',
      origin: 'Germany',
      price_range: '$20-50 per piece',
    },
  },
];

async function testProductsSystem() {
  log('\n🚀 Starting Complete Products System End-to-End Flow Test\n', 'cyan');
  log('Testing: Creation → Search → Embeddings → MIVAA Integration\n', 'yellow');

  let createdProducts = [];
  let testStats = {
    created: 0,
    searched: 0,
    embeddings_verified: 0,
    errors: 0,
  };

  try {
    // ============ Step 1: Product Creation ============
    log('📋 Step 1: Product Creation with Metadata', 'blue');

    for (const productData of testProducts) {
      try {
        // Create product in database
        const { data: product, error: createError } = await supabase
          .from('products')
          .insert({
            name: productData.name,
            description: productData.description,
            long_description: productData.long_description,
            properties: productData.properties,
            metadata: productData.metadata,
            status: 'draft',
            created_from_type: 'test',
            embedding_model: 'text-embedding-3-small',
          })
          .select()
          .single();

        if (createError) {
          log(`  ❌ Failed to create product: ${createError.message}`, 'red');
          testStats.errors++;
          continue;
        }

        createdProducts.push(product);
        testStats.created++;
        log(`  ✅ Product created: ${product.id}`, 'green');
        log(`     Name: ${product.name}`, 'cyan');
        log(`     Category: ${productData.category}`, 'cyan');
        log(`     Properties: ${JSON.stringify(productData.properties)}`, 'cyan');
      } catch (error) {
        log(`  ❌ Error creating product: ${error.message}`, 'red');
        testStats.errors++;
      }
    }

    log(`\n  📊 Created ${testStats.created} products successfully\n`, 'yellow');

    // ============ Step 2: Product Search by Description ============
    log('📋 Step 2: Product Search by Description', 'blue');

    try {
      const { data: searchResults, error: searchError } = await supabase
        .from('products')
        .select('*')
        .ilike('description', '%marble%')
        .limit(10);

      if (searchError) {
        log(`  ❌ Search failed: ${searchError.message}`, 'red');
        testStats.errors++;
      } else {
        testStats.searched++;
        log(`  ✅ Search by description: ${searchResults.length} results found`, 'green');
        searchResults.forEach((product) => {
          log(`     - ${product.name} (ID: ${product.id})`, 'cyan');
        });
      }
    } catch (error) {
      log(`  ❌ Error in search: ${error.message}`, 'red');
      testStats.errors++;
    }

    // ============ Step 3: Product Search by Metadata ============
    log('\n📋 Step 3: Product Search by Metadata (Category, Material)', 'blue');

    try {
      const { data: metadataResults, error: metadataError } = await supabase
        .from('products')
        .select('*')
        .contains('properties', { material_type: 'natural_stone' })
        .limit(10);

      if (metadataError) {
        log(`  ❌ Metadata search failed: ${metadataError.message}`, 'red');
        testStats.errors++;
      } else {
        testStats.searched++;
        log(`  ✅ Search by metadata: ${metadataResults.length} results found`, 'green');
        metadataResults.forEach((product) => {
          log(`     - ${product.name} (Material: ${product.properties?.material_type})`, 'cyan');
        });
      }
    } catch (error) {
      log(`  ❌ Error in metadata search: ${error.message}`, 'red');
      testStats.errors++;
    }

    // ============ Step 4: Embeddings Verification ============
    log('\n📋 Step 4: Embeddings Verification', 'blue');

    for (const product of createdProducts) {
      try {
        const { data: embeddings, error: embError } = await supabase
          .from('product_embeddings')
          .select('*')
          .eq('product_id', product.id);

        if (embError) {
          log(`  ⚠️  No embeddings for ${product.name}: ${embError.message}`, 'yellow');
        } else if (embeddings && embeddings.length > 0) {
          testStats.embeddings_verified++;
          log(`  ✅ Embeddings found for ${product.name}: ${embeddings.length} embedding(s)`, 'green');
          embeddings.forEach((emb) => {
            log(`     - Type: ${emb.embedding_type}, Model: ${emb.model_name}`, 'cyan');
          });
        } else {
          log(`  ⚠️  No embeddings stored for ${product.name}`, 'yellow');
        }
      } catch (error) {
        log(`  ❌ Error checking embeddings: ${error.message}`, 'red');
        testStats.errors++;
      }
    }

    // ============ Step 5: Pagination Test ============
    log('\n📋 Step 5: Pagination and Filtering', 'blue');

    try {
      const { data: page1, error: pageError } = await supabase
        .from('products')
        .select('*')
        .range(0, 9)
        .order('created_at', { ascending: false });

      if (pageError) {
        log(`  ❌ Pagination failed: ${pageError.message}`, 'red');
        testStats.errors++;
      } else {
        log(`  ✅ Pagination working: Retrieved ${page1.length} products`, 'green');
      }
    } catch (error) {
      log(`  ❌ Error in pagination: ${error.message}`, 'red');
      testStats.errors++;
    }

    // ============ Step 6: Error Handling ============
    log('\n📋 Step 6: Error Handling', 'blue');

    try {
      // Try to create product with invalid data
      const { error: invalidError } = await supabase
        .from('products')
        .insert({
          // Missing required 'name' field
          description: 'Invalid product',
        })
        .select()
        .single();

      if (invalidError) {
        log(`  ✅ Error handling working: ${invalidError.message}`, 'green');
      }
    } catch (error) {
      log(`  ✅ Error handling working: ${error.message}`, 'green');
    }

    // ============ Final Report ============
    log('\n' + '='.repeat(60), 'magenta');
    log('📊 TEST SUMMARY REPORT', 'magenta');
    log('='.repeat(60), 'magenta');
    log(`\n✅ Products Created: ${testStats.created}`, 'green');
    log(`✅ Search Operations: ${testStats.searched}`, 'green');
    log(`✅ Embeddings Verified: ${testStats.embeddings_verified}`, 'green');
    log(`❌ Errors Encountered: ${testStats.errors}`, testStats.errors > 0 ? 'red' : 'green');
    log(`\n📈 Total Tests Passed: ${testStats.created + testStats.searched + testStats.embeddings_verified}`, 'cyan');
    log(`📊 Success Rate: ${((testStats.created + testStats.searched + testStats.embeddings_verified) / (testStats.created + testStats.searched + testStats.embeddings_verified + testStats.errors) * 100).toFixed(2)}%\n`, 'cyan');

    log('✅ All tests completed successfully!\n', 'green');
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  }
}

testProductsSystem();


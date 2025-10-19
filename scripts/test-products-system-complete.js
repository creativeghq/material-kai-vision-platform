#!/usr/bin/env node

/**
 * Complete Products System End-to-End Test
 * Tests: Shopping Cart → Quote Requests → Proposals → Commissions
 * 
 * Usage: SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/test-products-system-complete.js
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

const testStats = {
  products_created: 0,
  carts_created: 0,
  items_added: 0,
  quote_requests: 0,
  proposals_created: 0,
  moodboard_products: 0,
  commissions_tracked: 0,
  errors: 0,
};

// Store created products for display
const createdProducts = [];

async function testProductsSystem() {
  log('\n🚀 Complete Products System End-to-End Test\n', 'cyan');
  log('Testing: Products → Cart → Quote → Proposal → Commission\n', 'yellow');

  try {
    // Get a test user (or create one)
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError || !users || users.length === 0) {
      log('❌ No users found. Please create a test user first.', 'red');
      process.exit(1);
    }

    const testUser = users[0];
    log(`✅ Using test user: ${testUser.email}\n`, 'green');

    // ============ Step 0: Create Products ============
    log('📋 Step 0: Create Products with Metadata', 'blue');

    const testProductsData = [
      {
        name: `Premium Italian Marble - ${Date.now()}`,
        description: 'Premium Italian marble with white veining',
        long_description: 'High-quality marble sourced from Italian quarries, featuring elegant white veining patterns. Perfect for luxury interiors.',
        properties: {
          material_type: 'natural_stone',
          color: 'white',
          finish: 'polished',
          durability: 'high',
          hardness: '3-4 Mohs',
        },
        metadata: {
          supplier: 'Italian Quarries Inc',
          origin: 'Italy',
          price_range: '$100-200 per sq ft',
          availability: 'in_stock',
          certifications: ['ISO 9001', 'CE Marked'],
        },
      },
      {
        name: `Engineered Wood Flooring - ${Date.now()}`,
        description: 'Durable engineered wood with oak veneer',
        long_description: 'Premium engineered wood flooring with authentic oak veneer top layer. Resistant to moisture and temperature changes.',
        properties: {
          material_type: 'engineered_wood',
          color: 'natural_oak',
          finish: 'matte',
          durability: 'medium-high',
          thickness_mm: 14,
        },
        metadata: {
          supplier: 'European Wood Co',
          origin: 'Germany',
          price_range: '$40-80 per sq ft',
          availability: 'in_stock',
          warranty_years: 10,
        },
      },
      {
        name: `Ceramic Tile Collection - ${Date.now()}`,
        description: 'Modern ceramic tiles with matte finish',
        long_description: 'Contemporary ceramic tiles suitable for both walls and floors. Available in multiple colors and sizes.',
        properties: {
          material_type: 'ceramic',
          color: 'charcoal_gray',
          finish: 'matte',
          durability: 'high',
          water_absorption: 'low',
        },
        metadata: {
          supplier: 'Spanish Ceramics Ltd',
          origin: 'Spain',
          price_range: '$15-35 per sq ft',
          availability: 'in_stock',
          sizes_available: ['300x300mm', '600x600mm', '300x600mm'],
        },
      },
    ];

    for (const productData of testProductsData) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          name: productData.name,
          description: productData.description,
          long_description: productData.long_description,
          properties: productData.properties,
          metadata: productData.metadata,
          status: 'published',
          created_from_type: 'test',
          embedding_model: 'text-embedding-3-small',
          created_by: testUser.id,
        })
        .select()
        .single();

      if (productError) {
        log(`  ❌ Failed to create product: ${productError.message}`, 'red');
        testStats.errors++;
      } else {
        testStats.products_created++;
        createdProducts.push(product);
        log(`  ✅ Product created: ${product.id}`, 'green');
        log(`     Name: ${product.name}`, 'cyan');
        log(`     Description: ${product.description}`, 'cyan');
        log(`     Status: ${product.status}`, 'cyan');
        log(`     Properties: ${JSON.stringify(product.properties)}`, 'cyan');
        log(`     Metadata: ${JSON.stringify(product.metadata)}`, 'cyan');
      }
    }

    if (createdProducts.length === 0) {
      log('❌ Cannot proceed without products', 'red');
      process.exit(1);
    }

    // ============ Step 1: Create Shopping Cart ============
    log('📋 Step 1: Create Shopping Cart', 'blue');
    
    const { data: cart, error: cartError } = await supabase
      .from('shopping_carts')
      .insert({
        user_id: testUser.id,
        status: 'active',
        total_items: 0,
      })
      .select()
      .single();

    if (cartError) {
      log(`  ❌ Failed to create cart: ${cartError.message}`, 'red');
      testStats.errors++;
    } else {
      testStats.carts_created++;
      log(`  ✅ Cart created: ${cart.id}`, 'green');
    }

    if (!cart) {
      log('❌ Cannot proceed without cart', 'red');
      process.exit(1);
    }

    // ============ Step 2: Add Items to Cart ============
    log('\n📋 Step 2: Add Items to Cart', 'blue');

    const testItems = [
      { product: createdProducts[0], quantity: 2, unit_price: 150.00 },
      { product: createdProducts[1], quantity: 1, unit_price: 75.00 },
      { product: createdProducts[2], quantity: 3, unit_price: 25.00 },
    ];

    const cartItemsCreated = [];
    for (const item of testItems) {
      const { data: cartItem, error: itemError } = await supabase
        .from('cart_items')
        .insert({
          cart_id: cart.id,
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })
        .select()
        .single();

      if (itemError) {
        log(`  ❌ Failed to add item: ${itemError.message}`, 'red');
        testStats.errors++;
      } else {
        testStats.items_added++;
        cartItemsCreated.push(cartItem);
        log(`  ✅ Item added to cart`, 'green');
        log(`     Product: ${item.product.name}`, 'cyan');
        log(`     Product ID: ${item.product.id}`, 'cyan');
        log(`     Quantity: ${item.quantity}`, 'cyan');
        log(`     Unit Price: $${item.unit_price.toFixed(2)}`, 'cyan');
        log(`     Line Total: $${(item.unit_price * item.quantity).toFixed(2)}`, 'cyan');
      }
    }

    // ============ Step 3: Create Quote Request ============
    log('\n📋 Step 3: Create Quote Request', 'blue');

    const { data: quoteRequest, error: quoteError } = await supabase
      .from('quote_requests')
      .insert({
        user_id: testUser.id,
        cart_id: cart.id,
        status: 'pending',
        items_count: testItems.length,
        total_estimated: testItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0),
        notes: 'Test quote request for products system',
      })
      .select()
      .single();

    if (quoteError) {
      log(`  ❌ Failed to create quote request: ${quoteError.message}`, 'red');
      testStats.errors++;
    } else {
      testStats.quote_requests++;
      log(`  ✅ Quote request created: ${quoteRequest.id}`, 'green');
      log(`     Items: ${quoteRequest.items_count}`, 'cyan');
      log(`     Total: $${quoteRequest.total_estimated.toFixed(2)}`, 'cyan');
    }

    if (!quoteRequest) {
      log('❌ Cannot proceed without quote request', 'red');
      process.exit(1);
    }

    // ============ Step 4: Create Proposal ============
    log('\n📋 Step 4: Create Proposal', 'blue');

    const proposalItems = testItems.map(item => ({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.unit_price * item.quantity,
    }));

    const subtotal = proposalItems.reduce((sum, item) => sum + item.total, 0);
    const tax = subtotal * 0.1; // 10% tax
    const discount = 0;
    const total = subtotal + tax - discount;

    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .insert({
        quote_request_id: quoteRequest.id,
        user_id: testUser.id,
        status: 'draft',
        items: proposalItems,
        subtotal,
        tax,
        discount,
        total,
        notes: 'Test proposal for products system',
      })
      .select()
      .single();

    if (proposalError) {
      log(`  ❌ Failed to create proposal: ${proposalError.message}`, 'red');
      testStats.errors++;
    } else {
      testStats.proposals_created++;
      log(`  ✅ Proposal created: ${proposal.id}`, 'green');
      log(`     Subtotal: $${proposal.subtotal.toFixed(2)}`, 'cyan');
      log(`     Tax: $${proposal.tax.toFixed(2)}`, 'cyan');
      log(`     Total: $${proposal.total.toFixed(2)}`, 'cyan');
    }

    // ============ Step 5: Test Moodboard Products ============
    log('\n📋 Step 5: Test Moodboard Products', 'blue');

    // Get or create a test moodboard
    const { data: moodboards } = await supabase
      .from('moodboards')
      .select('id')
      .eq('user_id', testUser.id)
      .limit(1);

    if (moodboards && moodboards.length > 0) {
      const moodboardId = moodboards[0].id;

      const { data: moodboardProduct, error: mpError } = await supabase
        .from('moodboard_products')
        .insert({
          moodboard_id: moodboardId,
          product_id: '550e8400-e29b-41d4-a716-446655440001',
          position_x: 100,
          position_y: 200,
          notes: 'Test product in moodboard',
        })
        .select()
        .single();

      if (mpError) {
        log(`  ❌ Failed to add product to moodboard: ${mpError.message}`, 'red');
        testStats.errors++;
      } else {
        testStats.moodboard_products++;
        log(`  ✅ Product added to moodboard: ${moodboardProduct.id}`, 'green');
      }
    } else {
      log('  ⚠️  No moodboards found for user', 'yellow');
    }

    // ============ Step 6: Test Commission Tracking ============
    log('\n📋 Step 6: Test Commission Tracking', 'blue');

    if (moodboards && moodboards.length > 0) {
      const { data: commission, error: commError } = await supabase
        .from('moodboard_quote_requests')
        .insert({
          moodboard_id: moodboards[0].id,
          moodboard_creator_id: testUser.id,
          requester_id: testUser.id,
          quote_request_id: quoteRequest.id,
          commission_percentage: 10.0,
          commission_amount: total * 0.1,
          status: 'pending',
        })
        .select()
        .single();

      if (commError) {
        log(`  ❌ Failed to create commission: ${commError.message}`, 'red');
        testStats.errors++;
      } else {
        testStats.commissions_tracked++;
        log(`  ✅ Commission tracked: ${commission.id}`, 'green');
        log(`     Rate: ${commission.commission_percentage}%`, 'cyan');
        log(`     Amount: $${commission.commission_amount.toFixed(2)}`, 'cyan');
      }
    }

    // ============ Display Created Products ============
    log('\n' + '='.repeat(80), 'magenta');
    log('📦 CREATED PRODUCTS DETAILS', 'magenta');
    log('='.repeat(80), 'magenta');

    for (let i = 0; i < createdProducts.length; i++) {
      const product = createdProducts[i];
      log(`\n📌 Product ${i + 1}:`, 'yellow');
      log(`   ID: ${product.id}`, 'cyan');
      log(`   Name: ${product.name}`, 'cyan');
      log(`   Description: ${product.description}`, 'cyan');
      log(`   Long Description: ${product.long_description}`, 'cyan');
      log(`   Status: ${product.status}`, 'cyan');
      log(`   Created From Type: ${product.created_from_type}`, 'cyan');
      log(`   Embedding Model: ${product.embedding_model}`, 'cyan');
      log(`   Created At: ${product.created_at}`, 'cyan');
      log(`   Updated At: ${product.updated_at}`, 'cyan');

      if (product.properties) {
        log(`   Properties:`, 'yellow');
        Object.entries(product.properties).forEach(([key, value]) => {
          log(`      - ${key}: ${value}`, 'cyan');
        });
      }

      if (product.metadata) {
        log(`   Metadata:`, 'yellow');
        Object.entries(product.metadata).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            log(`      - ${key}: [${value.join(', ')}]`, 'cyan');
          } else {
            log(`      - ${key}: ${value}`, 'cyan');
          }
        });
      }
    }

    // ============ Display Cart Items ============
    log('\n' + '='.repeat(80), 'magenta');
    log('🛒 CART ITEMS DETAILS', 'magenta');
    log('='.repeat(80), 'magenta');

    for (let i = 0; i < cartItemsCreated.length; i++) {
      const item = cartItemsCreated[i];
      const product = createdProducts[i];
      const lineTotal = item.unit_price * item.quantity;

      log(`\n📦 Cart Item ${i + 1}:`, 'yellow');
      log(`   Item ID: ${item.id}`, 'cyan');
      log(`   Product: ${product.name}`, 'cyan');
      log(`   Product ID: ${item.product_id}`, 'cyan');
      log(`   Quantity: ${item.quantity}`, 'cyan');
      log(`   Unit Price: $${item.unit_price.toFixed(2)}`, 'cyan');
      log(`   Line Total: $${lineTotal.toFixed(2)}`, 'cyan');
    }

    // ============ Final Report ============
    log('\n' + '='.repeat(80), 'magenta');
    log('📊 TEST SUMMARY REPORT', 'magenta');
    log('='.repeat(80), 'magenta');
    log(`\n✅ Products Created: ${testStats.products_created}`, 'green');
    log(`✅ Carts Created: ${testStats.carts_created}`, 'green');
    log(`✅ Items Added: ${testStats.items_added}`, 'green');
    log(`✅ Quote Requests: ${testStats.quote_requests}`, 'green');
    log(`✅ Proposals Created: ${testStats.proposals_created}`, 'green');
    log(`✅ Moodboard Products: ${testStats.moodboard_products}`, 'green');
    log(`✅ Commissions Tracked: ${testStats.commissions_tracked}`, 'green');
    log(`❌ Errors: ${testStats.errors}`, testStats.errors > 0 ? 'red' : 'green');

    const totalTests = Object.values(testStats).reduce((a, b) => a + b, 0) - testStats.errors;
    log(`\n📈 Total Operations: ${totalTests}`, 'cyan');
    log(`📊 Success Rate: ${((totalTests / (totalTests + testStats.errors)) * 100).toFixed(2)}%\n`, 'cyan');

    log('✅ All tests completed!\n', 'green');
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  }
}

testProductsSystem();


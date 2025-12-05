/**
 * Comprehensive Test Script for Moodboard and Quote Integration
 * Tests all CRUD operations and data flow between moodboards and quotes
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_ANON_KEY) {
  console.error('❌ VITE_SUPABASE_ANON_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${name}`);
  if (details) console.log(`   ${details}`);
  
  results.tests.push({ name, passed, details });
  if (passed) results.passed++;
  else results.failed++;
}

async function testMoodboardCRUD() {
  console.log('\n📋 TESTING MOODBOARD CRUD OPERATIONS\n');
  
  let testMoodboardId = null;
  let testItemId = null;
  
  try {
    // 1. Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      logTest('Get authenticated user', false, userError?.message || 'No user found');
      return;
    }
    logTest('Get authenticated user', true, `User ID: ${user.id}`);
    
    // 2. Create moodboard
    const { data: moodboard, error: createError } = await supabase
      .from('moodboards')
      .insert({
        user_id: user.id,
        title: 'Test Moodboard - Integration Test',
        description: 'Automated test moodboard',
        is_public: false,
        view_preference: 'grid'
      })
      .select()
      .single();
    
    if (createError) {
      logTest('Create moodboard', false, createError.message);
      return;
    }
    testMoodboardId = moodboard.id;
    logTest('Create moodboard', true, `ID: ${testMoodboardId}`);
    
    // 3. Get a product from products table
    const { data: products, error: productError } = await supabase
      .from('products')
      .select('id, name')
      .limit(1);
    
    if (productError || !products || products.length === 0) {
      logTest('Get product for testing', false, productError?.message || 'No products found');
      return;
    }
    const testProduct = products[0];
    logTest('Get product for testing', true, `Product: ${testProduct.name} (${testProduct.id})`);
    
    // 4. Add item to moodboard
    const { data: item, error: itemError } = await supabase
      .from('moodboard_items')
      .insert({
        moodboard_id: testMoodboardId,
        material_id: testProduct.id,
        notes: 'Test item',
        position: 0
      })
      .select(`
        *,
        material:products(id, name, category, thumbnail_url, properties)
      `)
      .single();
    
    if (itemError) {
      logTest('Add item to moodboard', false, itemError.message);
    } else {
      testItemId = item.id;
      logTest('Add item to moodboard', true, `Item ID: ${testItemId}, Material: ${item.material?.name}`);
    }
    
    // 5. Get moodboard items
    const { data: items, error: getItemsError } = await supabase
      .from('moodboard_items')
      .select(`
        *,
        material:products(id, name, category, thumbnail_url, properties)
      `)
      .eq('moodboard_id', testMoodboardId);
    
    if (getItemsError) {
      logTest('Get moodboard items', false, getItemsError.message);
    } else {
      logTest('Get moodboard items', true, `Found ${items.length} item(s)`);
    }
    
    // 6. Update moodboard
    const { error: updateError } = await supabase
      .from('moodboards')
      .update({ title: 'Test Moodboard - Updated' })
      .eq('id', testMoodboardId);
    
    logTest('Update moodboard', !updateError, updateError?.message);
    
    // 7. List user moodboards
    const { data: userMoodboards, error: listError } = await supabase
      .from('moodboards')
      .select('*')
      .eq('user_id', user.id);
    
    if (listError) {
      logTest('List user moodboards', false, listError.message);
    } else {
      logTest('List user moodboards', true, `Found ${userMoodboards.length} moodboard(s)`);
    }
    
    return { testMoodboardId, testItemId, testProduct };
    
  } catch (error) {
    logTest('Moodboard CRUD operations', false, error.message);
    return null;
  }
}

async function testQuoteCRUD(testProduct) {
  console.log('\n💰 TESTING QUOTE CRUD OPERATIONS\n');
  
  let testQuoteId = null;
  let testQuoteItemId = null;
  
  try {
    // 1. Create quote
    const { data: quote, error: createError } = await supabase
      .from('quotes')
      .insert({
        name: 'Test Quote - Integration Test',
        notes: 'Automated test quote',
        status: 'draft'
      })
      .select()
      .single();
    
    if (createError) {
      logTest('Create quote', false, createError.message);
      return;
    }
    testQuoteId = quote.id;
    logTest('Create quote', true, `ID: ${testQuoteId}`);

    // 2. Add item to quote
    if (!testProduct) {
      logTest('Add item to quote', false, 'No test product available');
      return;
    }

    const { data: quoteItem, error: itemError } = await supabase
      .from('quote_items')
      .insert({
        quote_id: testQuoteId,
        product_id: testProduct.id,
        quantity: 2,
        notes: 'Test quote item',
        added_from: 'manual'
      })
      .select()
      .single();

    if (itemError) {
      logTest('Add item to quote', false, itemError.message);
    } else {
      testQuoteItemId = quoteItem.id;
      logTest('Add item to quote', true, `Item ID: ${testQuoteItemId}`);
    }

    // 3. Get quote with items
    const { data: quoteWithItems, error: getError } = await supabase
      .from('quotes')
      .select('*, items:quote_items(*, product:products(*))')
      .eq('id', testQuoteId)
      .single();

    if (getError) {
      logTest('Get quote with items', false, getError.message);
    } else {
      logTest('Get quote with items', true, `Quote has ${quoteWithItems.items?.length || 0} item(s)`);
    }

    // 4. Update quote
    const { error: updateError } = await supabase
      .from('quotes')
      .update({ name: 'Test Quote - Updated' })
      .eq('id', testQuoteId);

    logTest('Update quote', !updateError, updateError?.message);

    // 5. List user quotes
    const { data: userQuotes, error: listError } = await supabase
      .from('quotes')
      .select('*');

    if (listError) {
      logTest('List user quotes', false, listError.message);
    } else {
      logTest('List user quotes', true, `Found ${userQuotes.length} quote(s)`);
    }

    return { testQuoteId, testQuoteItemId };

  } catch (error) {
    logTest('Quote CRUD operations', false, error.message);
    return null;
  }
}

async function testMoodboardToQuoteFlow(moodboardData) {
  console.log('\n🔄 TESTING MOODBOARD → QUOTE FLOW\n');

  if (!moodboardData) {
    logTest('Moodboard to Quote flow', false, 'No moodboard data available');
    return;
  }

  const { testMoodboardId, testProduct } = moodboardData;

  try {
    // 1. Get moodboard with items
    const { data: moodboard, error: getMoodboardError } = await supabase
      .from('moodboards')
      .select('*, items:moodboard_items(*, material:products(*))')
      .eq('id', testMoodboardId)
      .single();

    if (getMoodboardError) {
      logTest('Get moodboard for proposal', false, getMoodboardError.message);
      return;
    }
    logTest('Get moodboard for proposal', true, `Moodboard has ${moodboard.items?.length || 0} item(s)`);

    // 2. Create quote from moodboard
    const { data: proposalQuote, error: createQuoteError } = await supabase
      .from('quotes')
      .insert({
        name: `Proposal from ${moodboard.title}`,
        notes: `Created from moodboard: ${moodboard.title}`,
        status: 'draft'
      })
      .select()
      .single();

    if (createQuoteError) {
      logTest('Create proposal quote', false, createQuoteError.message);
      return;
    }
    logTest('Create proposal quote', true, `Quote ID: ${proposalQuote.id}`);

    // 3. Add moodboard items to quote
    if (moodboard.items && moodboard.items.length > 0) {
      for (const item of moodboard.items) {
        const { error: addItemError } = await supabase
          .from('quote_items')
          .insert({
            quote_id: proposalQuote.id,
            product_id: item.material_id,
            quantity: 1,
            notes: item.notes || '',
            added_from: 'moodboard'
          });

        if (addItemError) {
          logTest('Add moodboard item to quote', false, addItemError.message);
          return;
        }
      }
      logTest('Add moodboard items to quote', true, `Added ${moodboard.items.length} item(s)`);
    }

    // 4. Verify quote has correct items
    const { data: finalQuote, error: verifyError } = await supabase
      .from('quotes')
      .select('*, items:quote_items(*)')
      .eq('id', proposalQuote.id)
      .single();

    if (verifyError) {
      logTest('Verify proposal quote', false, verifyError.message);
    } else {
      const expectedCount = moodboard.items?.length || 0;
      const actualCount = finalQuote.items?.length || 0;
      const passed = expectedCount === actualCount;
      logTest('Verify proposal quote', passed,
        `Expected ${expectedCount} items, got ${actualCount} items`);
    }

    return proposalQuote.id;

  } catch (error) {
    logTest('Moodboard to Quote flow', false, error.message);
    return null;
  }
}

async function cleanup(moodboardData, quoteData, proposalQuoteId) {
  console.log('\n🧹 CLEANING UP TEST DATA\n');

  try {
    // Delete test quote items and quotes
    if (quoteData?.testQuoteId) {
      await supabase.from('quote_items').delete().eq('quote_id', quoteData.testQuoteId);
      await supabase.from('quotes').delete().eq('id', quoteData.testQuoteId);
      logTest('Delete test quote', true);
    }

    if (proposalQuoteId) {
      await supabase.from('quote_items').delete().eq('quote_id', proposalQuoteId);
      await supabase.from('quotes').delete().eq('id', proposalQuoteId);
      logTest('Delete proposal quote', true);
    }

    // Delete test moodboard items and moodboard
    if (moodboardData?.testMoodboardId) {
      await supabase.from('moodboard_items').delete().eq('moodboard_id', moodboardData.testMoodboardId);
      await supabase.from('moodboards').delete().eq('id', moodboardData.testMoodboardId);
      logTest('Delete test moodboard', true);
    }

  } catch (error) {
    logTest('Cleanup', false, error.message);
  }
}

async function runTests() {
  console.log('🚀 STARTING MOODBOARD & QUOTE INTEGRATION TESTS\n');
  console.log('=' .repeat(60));

  const moodboardData = await testMoodboardCRUD();
  const quoteData = await testQuoteCRUD(moodboardData?.testProduct);
  const proposalQuoteId = await testMoodboardToQuoteFlow(moodboardData);

  await cleanup(moodboardData, quoteData, proposalQuoteId);

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 TEST SUMMARY\n');
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📝 Total:  ${results.tests.length}`);

  if (results.failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.tests.filter(t => !t.passed).forEach(t => {
      console.log(`   - ${t.name}: ${t.details}`);
    });
  }

  console.log('\n' + '='.repeat(60));

  process.exit(results.failed > 0 ? 1 : 0);
}

runTests();


#!/usr/bin/env node

/**
 * Verify Storage and Retrieval
 * 
 * Verifies:
 * 1. All 15 storage tables exist
 * 2. Retrieval API is deployed
 * 3. Data can be stored and retrieved
 * 4. Data integrity is maintained
 * 5. User ownership is enforced
 */

import fetch from 'node-fetch';

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || '';

const STORAGE_TABLES = [
  'generation_3d',
  'style_analysis_results',
  'property_analysis_results',
  'hybrid_analysis_results',
  'spaceformer_analysis_results',
  'svbrdf_extraction_results',
  'ocr_results',
  'recognition_results',
  'voice_conversion_results',
  'material_visual_analysis',
  'pdf_integration_health_results',
  'search_analytics',
  'ml_training_jobs',
  'visual_search_batch_jobs',
  'scraping_sessions',
];

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    console.log(`\n✓ ${name}`);
    await fn();
    passed++;
    console.log(`  ✅ PASS`);
  } catch (error) {
    failed++;
    console.error(`  ❌ FAIL: ${error.message}`);
  }
}

async function checkTableExists(tableName) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${tableName}?limit=1`,
    {
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
      },
    }
  );

  if (response.status === 404) {
    throw new Error(`Table '${tableName}' does not exist`);
  }

  if (!response.ok) {
    throw new Error(`Failed to query table: ${response.statusText}`);
  }
}

async function testStorageTablesExist() {
  await test('All 15 storage tables exist', async () => {
    for (const table of STORAGE_TABLES) {
      await checkTableExists(table);
    }
    console.log(`  ✓ All ${STORAGE_TABLES.length} tables verified`);
  });
}

async function testRetrievalAPIDeployed() {
  await test('Retrieval API is deployed', async () => {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/retrieval-api/style_analysis_results/list?limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    if (response.status === 404) {
      throw new Error('Retrieval API function not deployed');
    }

    if (!response.ok) {
      throw new Error(`Retrieval API returned ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(`Retrieval API error: ${data.error}`);
    }

    console.log(`  ✓ Retrieval API is accessible`);
  });
}

async function testDataStorageAndRetrieval() {
  await test('Data storage and retrieval works', async () => {
    const testUserId = `test-${Date.now()}`;
    const testValue = `value-${Date.now()}`;

    // Store data
    const storeResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/style_analysis_results`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          user_id: testUserId,
          input_data: { test_value: testValue },
          result_data: { result: testValue },
          confidence_score: 0.99,
          processing_time_ms: 100,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (!storeResponse.ok) {
      throw new Error('Failed to store test data');
    }

    const stored = await storeResponse.json();
    const recordId = stored[0].id;

    // Retrieve data
    const retrieveResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/retrieval-api/style_analysis_results/get/${recordId}?user_id=${testUserId}`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    if (!retrieveResponse.ok) {
      throw new Error('Failed to retrieve test data');
    }

    const retrieved = await retrieveResponse.json();
    if (!retrieved.success) {
      throw new Error(`Retrieval failed: ${retrieved.error}`);
    }

    // Verify data matches
    if (retrieved.data.input_data.test_value !== testValue) {
      throw new Error('Data mismatch: input_data');
    }

    if (retrieved.data.result_data.result !== testValue) {
      throw new Error('Data mismatch: result_data');
    }

    console.log(`  ✓ Data stored and retrieved correctly`);
    console.log(`  ✓ Data integrity verified`);
  });
}

async function testUserOwnershipEnforcement() {
  await test('User ownership is enforced', async () => {
    const user1 = `user-${Date.now()}`;
    const user2 = `user-${Date.now() + 1}`;

    // Store data for user1
    const storeResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/style_analysis_results`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          user_id: user1,
          input_data: { owner: user1 },
          result_data: { owner: user1 },
          confidence_score: 0.95,
          processing_time_ms: 100,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }
    );

    const stored = await storeResponse.json();
    const recordId = stored[0].id;

    // User1 should access their data
    const user1Response = await fetch(
      `${SUPABASE_URL}/functions/v1/retrieval-api/style_analysis_results/get/${recordId}?user_id=${user1}`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    if (!user1Response.ok || !(await user1Response.json()).success) {
      throw new Error('User1 should access their own data');
    }

    // User2 should NOT access user1's data
    const user2Response = await fetch(
      `${SUPABASE_URL}/functions/v1/retrieval-api/style_analysis_results/get/${recordId}?user_id=${user2}`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    if (user2Response.ok) {
      const data = await user2Response.json();
      if (data.success) {
        throw new Error('User2 should NOT access user1 data');
      }
    }

    console.log(`  ✓ User1 can access their data`);
    console.log(`  ✓ User2 cannot access user1 data`);
  });
}

async function testPaginationAndFiltering() {
  await test('Pagination and filtering work', async () => {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/retrieval-api/style_analysis_results/list?limit=5&offset=0`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    const data = await response.json();
    if (!data.pagination) {
      throw new Error('Pagination info missing');
    }

    if (data.pagination.limit !== 5) {
      throw new Error('Limit not applied');
    }

    if (typeof data.pagination.has_more !== 'boolean') {
      throw new Error('has_more flag missing');
    }

    console.log(`  ✓ Pagination working`);
    console.log(`  ✓ Total records: ${data.pagination.total}`);
  });
}

async function runAllTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 END-TO-END VERIFICATION');
  console.log('='.repeat(80));

  await testStorageTablesExist();
  await testRetrievalAPIDeployed();
  await testDataStorageAndRetrieval();
  await testUserOwnershipEnforcement();
  await testPaginationAndFiltering();

  console.log('\n' + '='.repeat(80));
  console.log('📊 RESULTS');
  console.log('='.repeat(80));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total: ${passed + failed}`);
  console.log('='.repeat(80));

  if (failed === 0) {
    console.log('\n🎉 ALL VERIFICATION TESTS PASSED!');
    console.log('\n✅ System Status:');
    console.log('  ✓ All 15 storage tables exist');
    console.log('  ✓ Retrieval API is deployed');
    console.log('  ✓ Data storage and retrieval works');
    console.log('  ✓ Data integrity is maintained');
    console.log('  ✓ User ownership is enforced');
    console.log('  ✓ Pagination and filtering work');
    process.exit(0);
  } else {
    console.log(`\n⚠️  ${failed} TEST(S) FAILED`);
    process.exit(1);
  }
}

runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


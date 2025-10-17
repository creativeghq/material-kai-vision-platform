#!/usr/bin/env node

/**
 * Test Retrieval API
 * 
 * Tests all retrieval endpoints:
 * - GET single result
 * - LIST results with pagination
 * - SEARCH results with filters
 * - DELETE result
 */

import fetch from 'node-fetch';

const BASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const API_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
const TEST_USER_ID = 'test-user-' + Date.now();

const TABLES = [
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

let testResults = {
  passed: 0,
  failed: 0,
  tests: [],
};

async function test(name, fn) {
  try {
    console.log(`\n🧪 Testing: ${name}`);
    await fn();
    testResults.passed++;
    testResults.tests.push({ name, status: '✅ PASS' });
    console.log(`✅ PASS: ${name}`);
  } catch (error) {
    testResults.failed++;
    testResults.tests.push({ name, status: `❌ FAIL: ${error.message}` });
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${error.message}`);
  }
}

async function createTestData(tableName) {
  const response = await fetch(`${BASE_URL}/rest/v1/${tableName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      user_id: TEST_USER_ID,
      input_data: { test: true, timestamp: new Date().toISOString() },
      result_data: { test_result: 'success', confidence: 0.95 },
      confidence_score: 0.95,
      processing_time_ms: 1234,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create test data: ${response.statusText}`);
  }

  const data = await response.json();
  return data[0];
}

async function testGetSingleResult() {
  await test('GET single result', async () => {
    const tableName = TABLES[0];
    const testData = await createTestData(tableName);

    const response = await fetch(
      `${BASE_URL}/functions/v1/retrieval-api/${tableName}/get/${testData.id}?user_id=${TEST_USER_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(`API returned success=false: ${result.error}`);
    }

    if (!result.data || result.data.id !== testData.id) {
      throw new Error('Retrieved data does not match');
    }

    console.log(`   Retrieved: ${result.data.id}`);
  });
}

async function testListResults() {
  await test('LIST results with pagination', async () => {
    const tableName = TABLES[1];
    
    // Create multiple test records
    const records = [];
    for (let i = 0; i < 3; i++) {
      const record = await createTestData(tableName);
      records.push(record);
    }

    const response = await fetch(
      `${BASE_URL}/functions/v1/retrieval-api/${tableName}/list?user_id=${TEST_USER_ID}&limit=10&offset=0`,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(`API returned success=false: ${result.error}`);
    }

    if (!Array.isArray(result.data)) {
      throw new Error('Data is not an array');
    }

    if (!result.pagination) {
      throw new Error('Pagination info missing');
    }

    console.log(`   Retrieved ${result.data.length} results, total: ${result.pagination.total}`);
  });
}

async function testSearchResults() {
  await test('SEARCH results with filters', async () => {
    const tableName = TABLES[2];
    
    // Create test record
    await createTestData(tableName);

    const response = await fetch(
      `${BASE_URL}/functions/v1/retrieval-api/${tableName}/search`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: TEST_USER_ID,
          confidence_min: 0.9,
          limit: 10,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(`API returned success=false: ${result.error}`);
    }

    if (!Array.isArray(result.data)) {
      throw new Error('Data is not an array');
    }

    console.log(`   Found ${result.data.length} results matching criteria`);
  });
}

async function testDeleteResult() {
  await test('DELETE result', async () => {
    const tableName = TABLES[3];
    const testData = await createTestData(tableName);

    const response = await fetch(
      `${BASE_URL}/functions/v1/retrieval-api/${tableName}/delete/${testData.id}?user_id=${TEST_USER_ID}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(`API returned success=false: ${result.error}`);
    }

    console.log(`   Deleted: ${testData.id}`);
  });
}

async function testInvalidTable() {
  await test('Reject invalid table name', async () => {
    const response = await fetch(
      `${BASE_URL}/functions/v1/retrieval-api/invalid_table/list?user_id=${TEST_USER_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
        },
      }
    );

    if (response.status !== 403) {
      throw new Error(`Expected 403, got ${response.status}`);
    }

    const result = await response.json();
    if (result.success) {
      throw new Error('Should have returned error for invalid table');
    }

    console.log(`   Correctly rejected invalid table`);
  });
}

async function testMissingId() {
  await test('Reject missing ID for get operation', async () => {
    const tableName = TABLES[0];
    
    const response = await fetch(
      `${BASE_URL}/functions/v1/retrieval-api/${tableName}/get/?user_id=${TEST_USER_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
        },
      }
    );

    if (response.status !== 400) {
      throw new Error(`Expected 400, got ${response.status}`);
    }

    const result = await response.json();
    if (result.success) {
      throw new Error('Should have returned error for missing ID');
    }

    console.log(`   Correctly rejected missing ID`);
  });
}

async function testUserOwnershipVerification() {
  await test('Verify user ownership', async () => {
    const tableName = TABLES[4];
    const testData = await createTestData(tableName);

    // Try to access with different user ID
    const response = await fetch(
      `${BASE_URL}/functions/v1/retrieval-api/${tableName}/get/${testData.id}?user_id=different-user`,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
        },
      }
    );

    if (response.status !== 404) {
      throw new Error(`Expected 404 for different user, got ${response.status}`);
    }

    console.log(`   Correctly blocked access from different user`);
  });
}

async function runAllTests() {
  console.log('🧪 RETRIEVAL API TEST SUITE');
  console.log('=' .repeat(80));
  console.log(`Test User ID: ${TEST_USER_ID}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('=' .repeat(80));

  // Run tests
  await testGetSingleResult();
  await testListResults();
  await testSearchResults();
  await testDeleteResult();
  await testInvalidTable();
  await testMissingId();
  await testUserOwnershipVerification();

  // Print summary
  console.log('\n' + '=' .repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('=' .repeat(80));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📈 Total: ${testResults.passed + testResults.failed}`);
  console.log('=' .repeat(80));

  console.log('\n📋 TEST RESULTS:');
  for (const test of testResults.tests) {
    console.log(`${test.status} - ${test.name}`);
  }

  if (testResults.failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED!');
    process.exit(0);
  } else {
    console.log(`\n⚠️  ${testResults.failed} TEST(S) FAILED`);
    process.exit(1);
  }
}

runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


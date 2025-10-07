#!/usr/bin/env node

/**
 * Simple API Test Script
 * Tests a few key endpoints to verify functionality
 */

const BASE_URL = 'https://v1api.materialshub.gr';
const API_KEY = 'mk_ITVyD3fyMtRdmnNK0';

// Test endpoints
const endpoints = [
  {
    name: 'Health Check',
    method: 'GET',
    path: '/api/v1/health',
    requiresFile: false
  },
  {
    name: 'List Documents',
    method: 'GET',
    path: '/api/v1/documents/documents',
    requiresFile: false
  },
  {
    name: 'Semantic Search',
    method: 'POST',
    path: '/api/search/semantic',
    requiresFile: false,
    testData: {
      query: "test search",
      limit: 5
    }
  }
];

async function testEndpoint(endpoint) {
  console.log(`\n🧪 Testing: ${endpoint.name}`);
  console.log(`   ${endpoint.method} ${endpoint.path}`);

  try {
    const requestOptions = {
      method: endpoint.method,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    if (endpoint.method !== 'GET' && endpoint.testData) {
      requestOptions.body = JSON.stringify(endpoint.testData);
    }

    const url = `${BASE_URL}${endpoint.path}`;
    const response = await fetch(url, requestOptions);

    let responseData;
    try {
      responseData = await response.json();
    } catch (e) {
      responseData = { error: 'Invalid JSON', raw: await response.text() };
    }

    if (response.ok) {
      console.log(`   ✅ PASSED (${response.status})`);
      return true;
    } else {
      console.log(`   ❌ FAILED (${response.status})`);
      console.log(`   Error: ${responseData.error || responseData.detail || 'Unknown error'}`);
      return false;
    }

  } catch (error) {
    console.log(`   ❌ EXCEPTION: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🔧 SIMPLE API TEST');
  console.log('==================');

  let passed = 0;
  let total = endpoints.length;

  for (const endpoint of endpoints) {
    const success = await testEndpoint(endpoint);
    if (success) passed++;
  }

  console.log('\n📊 RESULTS');
  console.log('==========');
  console.log(`Passed: ${passed}/${total} (${Math.round(passed/total*100)}%)`);
}

runTests().catch(console.error);
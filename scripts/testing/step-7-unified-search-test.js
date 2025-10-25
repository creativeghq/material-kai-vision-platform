#!/usr/bin/env node

/**
 * Step 7: Unified Search - End-to-End Test
 * 
 * Tests all search strategies:
 * - Semantic search
 * - Visual search
 * - Multi-vector search
 * - Hybrid search
 * - Material search
 * - Keyword search
 */

const http = require('http');

// Configuration
const API_BASE = process.env.API_BASE || 'http://localhost:8000';
const SEARCH_ENDPOINT = '/api/search/unified-search';

// Test data
const testQueries = [
  {
    query: 'wood materials',
    strategy: 'semantic',
    description: 'Semantic search for wood materials'
  },
  {
    query: 'oak furniture',
    strategy: 'multi_vector',
    description: 'Multi-vector search for oak furniture'
  },
  {
    query: 'texture patterns',
    strategy: 'visual',
    description: 'Visual search for texture patterns'
  },
  {
    query: 'material properties',
    strategy: 'hybrid',
    description: 'Hybrid search for material properties'
  },
  {
    query: 'wood',
    strategy: 'keyword',
    description: 'Keyword search for wood'
  }
];

// Helper function to make HTTP requests
function makeRequest(method, path, query = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

// Test functions
async function testSemanticSearch() {
  console.log('\n📝 Testing Semantic Search...');
  
  const response = await makeRequest('POST', SEARCH_ENDPOINT, {
    query: 'wood materials',
    strategy: 'semantic',
    limit: 10,
    threshold: 0.7
  });
  
  if (response.status === 200 && response.data.success) {
    console.log('✅ Semantic search successful');
    console.log(`   Results: ${response.data.total_found}`);
    console.log(`   Time: ${response.data.search_time_ms.toFixed(2)}ms`);
    return true;
  } else {
    console.log('❌ Semantic search failed');
    console.log(`   Status: ${response.status}`);
    return false;
  }
}

async function testVisualSearch() {
  console.log('\n🖼️  Testing Visual Search...');
  
  const response = await makeRequest('POST', SEARCH_ENDPOINT, {
    query: 'texture patterns',
    strategy: 'visual',
    limit: 10,
    threshold: 0.7
  });
  
  if (response.status === 200 && response.data.success) {
    console.log('✅ Visual search successful');
    console.log(`   Results: ${response.data.total_found}`);
    console.log(`   Time: ${response.data.search_time_ms.toFixed(2)}ms`);
    return true;
  } else {
    console.log('❌ Visual search failed');
    console.log(`   Status: ${response.status}`);
    return false;
  }
}

async function testMultiVectorSearch() {
  console.log('\n🔀 Testing Multi-Vector Search...');
  
  const response = await makeRequest('POST', SEARCH_ENDPOINT, {
    query: 'oak furniture',
    strategy: 'multi_vector',
    limit: 10,
    threshold: 0.7
  });
  
  if (response.status === 200 && response.data.success) {
    console.log('✅ Multi-vector search successful');
    console.log(`   Results: ${response.data.total_found}`);
    console.log(`   Time: ${response.data.search_time_ms.toFixed(2)}ms`);
    return true;
  } else {
    console.log('❌ Multi-vector search failed');
    console.log(`   Status: ${response.status}`);
    return false;
  }
}

async function testHybridSearch() {
  console.log('\n⚡ Testing Hybrid Search...');
  
  const response = await makeRequest('POST', SEARCH_ENDPOINT, {
    query: 'material properties',
    strategy: 'hybrid',
    limit: 10,
    threshold: 0.7
  });
  
  if (response.status === 200 && response.data.success) {
    console.log('✅ Hybrid search successful');
    console.log(`   Results: ${response.data.total_found}`);
    console.log(`   Time: ${response.data.search_time_ms.toFixed(2)}ms`);
    return true;
  } else {
    console.log('❌ Hybrid search failed');
    console.log(`   Status: ${response.status}`);
    return false;
  }
}

async function testKeywordSearch() {
  console.log('\n🔍 Testing Keyword Search...');
  
  const response = await makeRequest('POST', SEARCH_ENDPOINT, {
    query: 'wood',
    strategy: 'keyword',
    limit: 10
  });
  
  if (response.status === 200 && response.data.success) {
    console.log('✅ Keyword search successful');
    console.log(`   Results: ${response.data.total_found}`);
    console.log(`   Time: ${response.data.search_time_ms.toFixed(2)}ms`);
    return true;
  } else {
    console.log('❌ Keyword search failed');
    console.log(`   Status: ${response.status}`);
    return false;
  }
}

async function testMaterialSearch() {
  console.log('\n🏭 Testing Material Search...');
  
  const response = await makeRequest('POST', SEARCH_ENDPOINT, {
    query: 'wood oak',
    strategy: 'material',
    limit: 10,
    threshold: 0.7
  });
  
  if (response.status === 200 && response.data.success) {
    console.log('✅ Material search successful');
    console.log(`   Results: ${response.data.total_found}`);
    console.log(`   Time: ${response.data.search_time_ms.toFixed(2)}ms`);
    return true;
  } else {
    console.log('❌ Material search failed');
    console.log(`   Status: ${response.status}`);
    return false;
  }
}

async function testSearchResultFormat() {
  console.log('\n📋 Testing Search Result Format...');
  
  const response = await makeRequest('POST', SEARCH_ENDPOINT, {
    query: 'test',
    strategy: 'semantic',
    limit: 5
  });
  
  if (response.status === 200 && response.data.success) {
    const result = response.data.results[0];
    
    const hasRequiredFields = result && 
      result.id && 
      result.content && 
      typeof result.similarity_score === 'number' &&
      result.metadata &&
      result.embedding_type &&
      result.source_type;
    
    if (hasRequiredFields) {
      console.log('✅ Search result format is correct');
      console.log(`   Fields: id, content, similarity_score, metadata, embedding_type, source_type`);
      return true;
    } else {
      console.log('❌ Search result format is incorrect');
      return false;
    }
  } else {
    console.log('❌ Failed to retrieve search results');
    return false;
  }
}

async function testSearchPerformance() {
  console.log('\n⏱️  Testing Search Performance...');
  
  const startTime = Date.now();
  const response = await makeRequest('POST', SEARCH_ENDPOINT, {
    query: 'performance test',
    strategy: 'semantic',
    limit: 20
  });
  const totalTime = Date.now() - startTime;
  
  if (response.status === 200 && response.data.success) {
    const searchTime = response.data.search_time_ms;
    
    console.log('✅ Search performance test completed');
    console.log(`   Search time: ${searchTime.toFixed(2)}ms`);
    console.log(`   Total time: ${totalTime}ms`);
    
    if (searchTime < 1000) {
      console.log('   ✅ Performance is good (< 1s)');
      return true;
    } else {
      console.log('   ⚠️  Performance could be improved (> 1s)');
      return true;
    }
  } else {
    console.log('❌ Performance test failed');
    return false;
  }
}

// Main test runner
async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        🔍 STEP 7: UNIFIED SEARCH - END-TO-END TEST            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  const startTime = Date.now();
  const results = [];
  
  try {
    // Run all tests
    results.push(await testSemanticSearch());
    results.push(await testVisualSearch());
    results.push(await testMultiVectorSearch());
    results.push(await testHybridSearch());
    results.push(await testKeywordSearch());
    results.push(await testMaterialSearch());
    results.push(await testSearchResultFormat());
    results.push(await testSearchPerformance());
    
    // Summary
    const duration = Date.now() - startTime;
    const passed = results.filter(r => r).length;
    const total = results.length;
    
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                        TEST SUMMARY                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`\n✅ Passed: ${passed}/${total}`);
    console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);
    
    if (passed === total) {
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    } else {
      console.log(`\n⚠️  ${total - passed} test(s) failed`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Test execution failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runAllTests();


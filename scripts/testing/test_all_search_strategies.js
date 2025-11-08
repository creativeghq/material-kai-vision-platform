#!/usr/bin/env node

/**
 * Test All 6 Search Strategies
 * 
 * Tests the complete search implementation:
 * 1. Semantic Search
 * 2. Vector Search
 * 3. Multi-Vector Search
 * 4. Hybrid Search
 * 5. Material Search
 * 6. Image Search
 * 7. All Strategies Combined
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000';
const WORKSPACE_ID = process.env.WORKSPACE_ID || 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e';

// Test queries
const TEST_QUERIES = {
  semantic: 'modern minimalist tiles for bathroom',
  vector: 'porcelain tiles 60x60',
  multi_vector: 'geometric patterns in neutral colors',
  hybrid: 'R11 slip resistance porcelain',
  material: {
    filters: {
      material_type: 'Porcelain',
      slip_resistance: 'R11'
    }
  },
  image: {
    // Sample image URL (replace with actual image)
    url: 'https://example.com/tile-sample.jpg'
  }
};

async function testSearchStrategy(strategy, params) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 Testing ${strategy.toUpperCase()} Search`);
  console.log('='.repeat(80));

  const startTime = Date.now();

  try {
    const response = await fetch(`${API_BASE_URL}/api/rag/search?strategy=${strategy}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workspace_id: WORKSPACE_ID,
        top_k: 5,
        ...params
      })
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ ${strategy} search failed:`, error);
      return {
        strategy,
        success: false,
        error,
        responseTime
      };
    }

    const data = await response.json();

    console.log(`✅ ${strategy} search completed in ${responseTime}ms`);
    console.log(`📊 Results: ${data.total_results} products found`);
    
    if (data.results && data.results.length > 0) {
      console.log('\n📋 Top Results:');
      data.results.slice(0, 3).forEach((result, idx) => {
        console.log(`\n  ${idx + 1}. ${result.name || 'Unnamed Product'}`);
        console.log(`     Score: ${result.relevance_score?.toFixed(3) || 'N/A'}`);
        if (result.found_in_strategies) {
          console.log(`     Found in: ${result.found_in_strategies.join(', ')}`);
        }
        if (result.score_breakdown) {
          console.log(`     Score breakdown:`, result.score_breakdown);
        }
      });
    }

    // Strategy-specific metrics
    if (data.weights_used) {
      console.log('\n⚖️  Weights used:', data.weights_used);
    }
    if (data.filters_applied) {
      console.log('\n🔧 Filters applied:', data.filters_applied);
    }
    if (data.strategies_executed) {
      console.log('\n🎯 Strategies executed:', data.strategies_executed.join(', '));
    }

    return {
      strategy,
      success: true,
      resultsCount: data.total_results,
      responseTime,
      data
    };

  } catch (error) {
    const endTime = Date.now();
    console.error(`❌ ${strategy} search error:`, error.message);
    return {
      strategy,
      success: false,
      error: error.message,
      responseTime: endTime - startTime
    };
  }
}

async function runAllTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 MIVAA Search Strategies Test Suite');
  console.log('='.repeat(80));
  console.log(`API: ${API_BASE_URL}`);
  console.log(`Workspace: ${WORKSPACE_ID}`);
  console.log('='.repeat(80));

  const results = [];

  // Test 1: Semantic Search
  results.push(await testSearchStrategy('semantic', {
    query: TEST_QUERIES.semantic
  }));

  // Test 2: Vector Search
  results.push(await testSearchStrategy('vector', {
    query: TEST_QUERIES.vector
  }));

  // Test 3: Multi-Vector Search
  results.push(await testSearchStrategy('multi_vector', {
    query: TEST_QUERIES.multi_vector,
    text_weight: 0.4,
    visual_weight: 0.3,
    multimodal_weight: 0.3
  }));

  // Test 4: Hybrid Search
  results.push(await testSearchStrategy('hybrid', {
    query: TEST_QUERIES.hybrid,
    semantic_weight: 0.7,
    keyword_weight: 0.3
  }));

  // Test 5: Material Search
  results.push(await testSearchStrategy('material', {
    query: '',
    material_filters: TEST_QUERIES.material.filters
  }));

  // Test 6: Image Search (skip if no image URL provided)
  if (TEST_QUERIES.image.url && TEST_QUERIES.image.url !== 'https://example.com/tile-sample.jpg') {
    results.push(await testSearchStrategy('image', {
      query: '',
      image_url: TEST_QUERIES.image.url
    }));
  } else {
    console.log('\n⚠️  Skipping image search (no valid image URL provided)');
    console.log('   Set TEST_QUERIES.image.url to test image search');
  }

  // Test 7: All Strategies Combined
  results.push(await testSearchStrategy('all', {
    query: TEST_QUERIES.semantic,
    text_weight: 0.4,
    visual_weight: 0.3,
    multimodal_weight: 0.3,
    semantic_weight: 0.7,
    keyword_weight: 0.3
  }));

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n✅ Successful: ${successful}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);

  console.log('\n📈 Performance Metrics:');
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    const time = result.responseTime ? `${result.responseTime}ms` : 'N/A';
    const count = result.resultsCount !== undefined ? `${result.resultsCount} results` : 'N/A';
    console.log(`  ${status} ${result.strategy.padEnd(15)} - ${time.padEnd(10)} - ${count}`);
  });

  // Performance targets check
  console.log('\n🎯 Performance Target Check:');
  const targets = {
    semantic: 150,
    vector: 100,
    multi_vector: 200,
    hybrid: 180,
    material: 50,
    image: 150,
    all: 800
  };

  results.forEach(result => {
    if (result.success && result.responseTime) {
      const target = targets[result.strategy];
      const status = result.responseTime <= target ? '✅' : '⚠️';
      const diff = result.responseTime - target;
      console.log(`  ${status} ${result.strategy.padEnd(15)} - ${result.responseTime}ms (target: ${target}ms, ${diff > 0 ? '+' : ''}${diff}ms)`);
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log(successful === results.length ? '✅ ALL TESTS PASSED' : '⚠️  SOME TESTS FAILED');
  console.log('='.repeat(80) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


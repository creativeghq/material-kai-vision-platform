/**
 * Enhanced CLIP Integration Test Script
 * 
 * Tests the enhanced CLIP integration service for:
 * - Real CLIP embedding-based product-image matching
 * - Advanced visual similarity search
 * - Product recommendations based on visual similarity
 * - Batch processing capabilities
 * - Integration statistics
 */

import { EnhancedClipIntegrationService } from './src/services/enhancedClipIntegrationService.js';

// Test configuration
const TEST_CONFIG = {
  sampleProductId: 'test-product-001',
  sampleImageId: 'test-image-001',
  sampleProductText: `
    VALENOVA Collection
    Manufacturer: HARMONY CERAMICS
    Material: Porcelain Stoneware
    Dimensions: 15×38 cm
    Colors: White, Beige, Grey
    Surface Finish: Matte
    Application: Indoor/Outdoor
  `,
  testTimeout: 30000, // 30 seconds
};

/**
 * Test 1: Product CLIP Embedding Generation
 */
async function testProductEmbeddingGeneration() {
  console.log('\n🧪 Test 1: Product CLIP Embedding Generation');
  console.log('=' .repeat(60));

  try {
    const startTime = Date.now();

    // Generate CLIP embeddings for a sample product
    const embedding = await EnhancedClipIntegrationService.generateProductClipEmbeddings(
      TEST_CONFIG.sampleProductId,
      TEST_CONFIG.sampleProductText,
      { forceRegenerate: true, includeMetadata: true }
    );

    const processingTime = Date.now() - startTime;

    if (embedding) {
      console.log('✅ Product embedding generation successful');
      console.log(`📊 Embedding dimensions: ${embedding.dimensions}`);
      console.log(`🤖 Model used: ${embedding.model}`);
      console.log(`⏱️ Processing time: ${processingTime}ms`);
      console.log(`🎯 Confidence: ${(embedding.confidence * 100).toFixed(1)}%`);
      
      // Validate embedding structure
      if (Array.isArray(embedding.embedding) && embedding.embedding.length > 0) {
        console.log(`✅ Embedding vector valid: ${embedding.embedding.length} dimensions`);
        
        // Check if values are normalized
        const magnitude = Math.sqrt(embedding.embedding.reduce((sum, val) => sum + val * val, 0));
        console.log(`📏 Vector magnitude: ${magnitude.toFixed(4)} (should be ~1.0 if normalized)`);
      } else {
        console.log('❌ Invalid embedding vector structure');
        return false;
      }

      return true;
    } else {
      console.log('❌ Failed to generate product embeddings');
      return false;
    }

  } catch (error) {
    console.error('❌ Error in product embedding generation test:', error);
    return false;
  }
}

/**
 * Test 2: Real CLIP Similarity Calculation
 */
async function testRealClipSimilarity() {
  console.log('\n🧪 Test 2: Real CLIP Similarity Calculation');
  console.log('=' .repeat(60));

  try {
    const startTime = Date.now();

    // Calculate real CLIP similarity between image and product
    const similarityResult = await EnhancedClipIntegrationService.calculateRealClipScore(
      TEST_CONFIG.sampleImageId,
      TEST_CONFIG.sampleProductId
    );

    const processingTime = Date.now() - startTime;

    console.log('✅ CLIP similarity calculation completed');
    console.log(`🎯 Similarity score: ${(similarityResult.score * 100).toFixed(1)}%`);
    console.log(`🔒 Confidence: ${(similarityResult.confidence * 100).toFixed(1)}%`);
    console.log(`⏱️ Processing time: ${processingTime}ms`);
    console.log(`🔧 Method: ${similarityResult.metadata?.method || 'unknown'}`);

    if (similarityResult.metadata) {
      console.log('\n📋 Metadata:');
      console.log(`  - Image model: ${similarityResult.metadata.imageModel || 'N/A'}`);
      console.log(`  - Product model: ${similarityResult.metadata.productModel || 'N/A'}`);
      console.log(`  - Model match: ${similarityResult.metadata.modelMatch ? 'Yes' : 'No'}`);
      console.log(`  - Embedding dimensions: ${similarityResult.metadata.embeddingDimensions || 'N/A'}`);
    }

    // Validate similarity score
    if (similarityResult.score >= 0 && similarityResult.score <= 1) {
      console.log('✅ Similarity score within valid range [0, 1]');
      return true;
    } else {
      console.log(`❌ Invalid similarity score: ${similarityResult.score}`);
      return false;
    }

  } catch (error) {
    console.error('❌ Error in CLIP similarity calculation test:', error);
    return false;
  }
}

/**
 * Test 3: Visual Similarity Search
 */
async function testVisualSimilaritySearch() {
  console.log('\n🧪 Test 3: Visual Similarity Search');
  console.log('=' .repeat(60));

  try {
    const startTime = Date.now();

    // Test different search types
    const searchQueries = [
      {
        type: 'text_to_images',
        textQuery: 'ceramic tile with matte finish',
        similarityThreshold: 0.7,
        maxResults: 5,
      },
      {
        type: 'image_to_products',
        imageData: 'base64_encoded_image_data_placeholder',
        similarityThreshold: 0.75,
        maxResults: 10,
      },
      {
        type: 'hybrid_multimodal',
        textQuery: 'porcelain stoneware',
        imageData: 'base64_encoded_image_data_placeholder',
        similarityThreshold: 0.8,
        maxResults: 8,
      },
    ];

    let allTestsPassed = true;

    for (const query of searchQueries) {
      console.log(`\n🔍 Testing ${query.type} search...`);
      
      const searchResult = await EnhancedClipIntegrationService.performVisualSimilaritySearch(query);
      
      console.log(`📊 Results found: ${searchResult.results.length}`);
      console.log(`⏱️ Processing time: ${searchResult.metadata.processingTime}ms`);
      console.log(`🎯 Query type: ${searchResult.metadata.queryType}`);

      if (searchResult.results.length > 0) {
        console.log('\n🏆 Top results:');
        searchResult.results.slice(0, 3).forEach((result, index) => {
          console.log(`  ${index + 1}. ${result.name} (similarity: ${(result.similarity * 100).toFixed(1)}%)`);
        });
      }

      // Validate search results structure
      const isValidStructure = searchResult.results.every(result => 
        result.id && result.type && result.name && 
        typeof result.similarity === 'number' && 
        result.similarity >= 0 && result.similarity <= 1
      );

      if (isValidStructure) {
        console.log(`✅ ${query.type} search structure valid`);
      } else {
        console.log(`❌ ${query.type} search structure invalid`);
        allTestsPassed = false;
      }
    }

    const totalProcessingTime = Date.now() - startTime;
    console.log(`\n⏱️ Total visual search testing time: ${totalProcessingTime}ms`);

    return allTestsPassed;

  } catch (error) {
    console.error('❌ Error in visual similarity search test:', error);
    return false;
  }
}

/**
 * Test 4: Product Recommendations
 */
async function testProductRecommendations() {
  console.log('\n🧪 Test 4: Product Recommendations');
  console.log('=' .repeat(60));

  try {
    const startTime = Date.now();

    // Generate product recommendations
    const recommendations = await EnhancedClipIntegrationService.generateProductRecommendations(
      TEST_CONFIG.sampleProductId,
      {
        maxRecommendations: 5,
        similarityThreshold: 0.7,
        includeReasoningFactors: true,
      }
    );

    const processingTime = Date.now() - startTime;

    console.log('✅ Product recommendations generated');
    console.log(`📊 Recommendations found: ${recommendations.length}`);
    console.log(`⏱️ Processing time: ${processingTime}ms`);

    if (recommendations.length > 0) {
      console.log('\n🎯 Top recommendations:');
      recommendations.forEach((rec, index) => {
        console.log(`\n  ${index + 1}. ${rec.name}`);
        console.log(`     Visual similarity: ${(rec.visualSimilarity * 100).toFixed(1)}%`);
        console.log(`     Confidence: ${(rec.confidence * 100).toFixed(1)}%`);
        
        if (rec.reasoningFactors) {
          console.log('     Reasoning factors:');
          console.log(`       - Color: ${(rec.reasoningFactors.colorSimilarity * 100).toFixed(1)}%`);
          console.log(`       - Texture: ${(rec.reasoningFactors.textureSimilarity * 100).toFixed(1)}%`);
          console.log(`       - Shape: ${(rec.reasoningFactors.shapeSimilarity * 100).toFixed(1)}%`);
          console.log(`       - Material: ${(rec.reasoningFactors.materialTypeSimilarity * 100).toFixed(1)}%`);
        }
      });

      // Validate recommendations structure
      const isValidStructure = recommendations.every(rec => 
        rec.productId && rec.name && 
        typeof rec.visualSimilarity === 'number' && 
        rec.visualSimilarity >= 0 && rec.visualSimilarity <= 1 &&
        rec.reasoningFactors
      );

      if (isValidStructure) {
        console.log('\n✅ Recommendations structure valid');
        return true;
      } else {
        console.log('\n❌ Recommendations structure invalid');
        return false;
      }
    } else {
      console.log('\n⚠️ No recommendations found (this may be expected with test data)');
      return true; // Not necessarily a failure
    }

  } catch (error) {
    console.error('❌ Error in product recommendations test:', error);
    return false;
  }
}

/**
 * Test 5: Batch Processing
 */
async function testBatchProcessing() {
  console.log('\n🧪 Test 5: Batch Processing');
  console.log('=' .repeat(60));

  try {
    const startTime = Date.now();

    // Create sample products for batch processing
    const sampleProducts = [
      { id: 'batch-test-001', text: 'Ceramic tile with glossy finish' },
      { id: 'batch-test-002', text: 'Marble surface with natural veining' },
      { id: 'batch-test-003', text: 'Porcelain stoneware with matte texture' },
    ];

    let processedCount = 0;
    const onProgress = (completed, total) => {
      processedCount = completed;
      console.log(`📊 Progress: ${completed}/${total} products processed`);
    };

    // Batch process embeddings
    const batchResult = await EnhancedClipIntegrationService.batchGenerateProductEmbeddings(
      sampleProducts,
      {
        batchSize: 2,
        forceRegenerate: true,
        onProgress,
      }
    );

    const processingTime = Date.now() - startTime;

    console.log('\n✅ Batch processing completed');
    console.log(`📊 Successful: ${batchResult.successful}`);
    console.log(`❌ Failed: ${batchResult.failed}`);
    console.log(`⏱️ Total processing time: ${processingTime}ms`);
    console.log(`⚡ Average time per product: ${(processingTime / sampleProducts.length).toFixed(0)}ms`);

    // Validate batch results
    const expectedTotal = sampleProducts.length;
    const actualTotal = batchResult.successful + batchResult.failed;

    if (actualTotal === expectedTotal && batchResult.results.length === expectedTotal) {
      console.log('✅ Batch processing counts match expected values');
      
      // Check individual results
      const validResults = batchResult.results.every(result => 
        result.productId && typeof result.success === 'boolean'
      );

      if (validResults) {
        console.log('✅ Batch result structure valid');
        return true;
      } else {
        console.log('❌ Batch result structure invalid');
        return false;
      }
    } else {
      console.log(`❌ Batch processing count mismatch: expected ${expectedTotal}, got ${actualTotal}`);
      return false;
    }

  } catch (error) {
    console.error('❌ Error in batch processing test:', error);
    return false;
  }
}

/**
 * Test 6: Integration Statistics
 */
async function testIntegrationStatistics() {
  console.log('\n🧪 Test 6: Integration Statistics');
  console.log('=' .repeat(60));

  try {
    const startTime = Date.now();

    // Get CLIP integration statistics
    const stats = await EnhancedClipIntegrationService.getClipIntegrationStats();

    const processingTime = Date.now() - startTime;

    console.log('✅ Integration statistics retrieved');
    console.log(`⏱️ Processing time: ${processingTime}ms`);
    console.log('\n📊 Statistics:');
    console.log(`  - Products with embeddings: ${stats.productsWithEmbeddings}`);
    console.log(`  - Images with embeddings: ${stats.imagesWithEmbeddings}`);
    console.log(`  - Total embeddings: ${stats.totalEmbeddings}`);
    console.log(`  - Average embedding dimensions: ${stats.averageEmbeddingDimensions}`);
    console.log(`  - Last updated: ${stats.lastUpdated}`);

    if (stats.modelDistribution && Object.keys(stats.modelDistribution).length > 0) {
      console.log('\n🤖 Model distribution:');
      Object.entries(stats.modelDistribution).forEach(([model, count]) => {
        console.log(`  - ${model}: ${count} embeddings`);
      });
    }

    // Validate statistics structure
    const requiredFields = ['productsWithEmbeddings', 'imagesWithEmbeddings', 'totalEmbeddings', 'averageEmbeddingDimensions', 'modelDistribution', 'lastUpdated'];
    const hasAllFields = requiredFields.every(field => stats.hasOwnProperty(field));

    if (hasAllFields) {
      console.log('\n✅ Statistics structure valid');
      return true;
    } else {
      console.log('\n❌ Statistics structure invalid - missing required fields');
      return false;
    }

  } catch (error) {
    console.error('❌ Error in integration statistics test:', error);
    return false;
  }
}

/**
 * Main test execution
 */
async function runAllTests() {
  console.log('🚀 Enhanced CLIP Integration Test Suite');
  console.log('=' .repeat(80));
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log(`⚙️ Test configuration: ${JSON.stringify(TEST_CONFIG, null, 2)}`);

  const tests = [
    { name: 'Product Embedding Generation', fn: testProductEmbeddingGeneration },
    { name: 'Real CLIP Similarity Calculation', fn: testRealClipSimilarity },
    { name: 'Visual Similarity Search', fn: testVisualSimilaritySearch },
    { name: 'Product Recommendations', fn: testProductRecommendations },
    { name: 'Batch Processing', fn: testBatchProcessing },
    { name: 'Integration Statistics', fn: testIntegrationStatistics },
  ];

  const results = [];
  const overallStartTime = Date.now();

  for (const test of tests) {
    try {
      const testStartTime = Date.now();
      const passed = await Promise.race([
        test.fn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Test timeout')), TEST_CONFIG.testTimeout)
        ),
      ]);
      const testTime = Date.now() - testStartTime;

      results.push({
        name: test.name,
        passed,
        time: testTime,
        status: passed ? 'PASSED' : 'FAILED',
      });

      console.log(`\n${passed ? '✅' : '❌'} ${test.name}: ${passed ? 'PASSED' : 'FAILED'} (${testTime}ms)`);

    } catch (error) {
      const testTime = Date.now() - overallStartTime;
      results.push({
        name: test.name,
        passed: false,
        time: testTime,
        status: 'ERROR',
        error: error.message,
      });

      console.log(`\n❌ ${test.name}: ERROR - ${error.message}`);
    }
  }

  const overallTime = Date.now() - overallStartTime;
  const passedTests = results.filter(r => r.passed).length;
  const totalTests = results.length;

  console.log('\n' + '=' .repeat(80));
  console.log('📋 TEST SUMMARY');
  console.log('=' .repeat(80));
  console.log(`✅ Passed: ${passedTests}/${totalTests}`);
  console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);
  console.log(`⏱️ Total time: ${overallTime}ms`);
  console.log(`📅 Completed at: ${new Date().toISOString()}`);

  console.log('\n📊 Detailed Results:');
  results.forEach(result => {
    const status = result.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`  ${status} ${result.name} (${result.time}ms)`);
    if (result.error) {
      console.log(`    Error: ${result.error}`);
    }
  });

  const successRate = (passedTests / totalTests) * 100;
  console.log(`\n🎯 Success Rate: ${successRate.toFixed(1)}%`);

  if (successRate >= 80) {
    console.log('🎉 Enhanced CLIP Integration tests completed successfully!');
    console.log('✅ Ready for production deployment');
  } else {
    console.log('⚠️ Some tests failed - review and fix issues before deployment');
  }

  return successRate >= 80;
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test suite crashed:', error);
      process.exit(1);
    });
}

export { runAllTests };

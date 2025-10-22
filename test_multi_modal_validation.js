/**
 * Simple Multi-Modal Association Validation Test
 * 
 * Tests the core logic without requiring database connections
 */

// Mock the service for testing
class MockMultiModalService {
  static async calculateSpatialScore(image, product) {
    const imagePage = image.page_number || 0;
    const productPage = product.page_number || 0;

    // Same page = highest score
    if (imagePage === productPage) {
      return 1.0;
    }

    // Adjacent pages = high score
    const pageDifference = Math.abs(imagePage - productPage);
    if (pageDifference === 1) {
      return 0.8;
    }

    // Within 2 pages = medium score
    if (pageDifference <= 2) {
      return 0.6;
    }

    // Within 3 pages = low score
    if (pageDifference <= 3) {
      return 0.4;
    }

    // Further apart = very low score
    return Math.max(0.1, 1 / (pageDifference * 0.5));
  }

  static async calculateCaptionScore(image, product) {
    const imageText = (image.caption || image.alt_text || '').toLowerCase();
    const productText = (product.description || product.name || '').toLowerCase();

    if (!imageText || !productText) {
      return 0.0;
    }

    // Simple text similarity using word overlap
    const imageWords = new Set(imageText.split(/\s+/).filter(word => word.length > 2));
    const productWords = new Set(productText.split(/\s+/).filter(word => word.length > 2));

    if (imageWords.size === 0 || productWords.size === 0) {
      return 0.0;
    }

    // Calculate Jaccard similarity
    const intersection = new Set([...imageWords].filter(word => productWords.has(word)));
    const union = new Set([...imageWords, ...productWords]);

    const jaccardSimilarity = intersection.size / union.size;

    // Boost score if product name appears in image caption
    const productName = (product.name || '').toLowerCase();
    if (productName && imageText.includes(productName)) {
      return Math.min(1.0, jaccardSimilarity + 0.3);
    }

    return jaccardSimilarity;
  }

  static async calculateClipScore(image, product) {
    // Mock CLIP score based on text similarity
    const textSimilarity = await this.calculateCaptionScore(image, product);
    return Math.min(1.0, textSimilarity * 1.2);
  }

  static calculateOverallScore(spatialScore, captionScore, clipScore, weights = { spatial: 0.4, caption: 0.3, clip: 0.3 }) {
    return (
      spatialScore * weights.spatial +
      captionScore * weights.caption +
      clipScore * weights.clip
    );
  }

  static calculateConfidence(spatialScore, captionScore, clipScore, overallScore) {
    const scores = [spatialScore, captionScore, clipScore];
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    
    // Lower variance = higher confidence
    const consistencyBonus = Math.max(0, 0.3 - variance);
    return Math.min(1.0, overallScore + consistencyBonus);
  }
}

// Test data
const testImages = [
  {
    id: 'img_1',
    page_number: 1,
    caption: 'VALENOVA collection overview with dimensional specifications',
    alt_text: 'Modern furniture collection showcase',
  },
  {
    id: 'img_2',
    page_number: 2,
    caption: 'PIQUÉ modular seating system in various configurations',
    alt_text: 'Modular seating arrangements',
  },
  {
    id: 'img_3',
    page_number: 3,
    caption: 'ONA chair detail showing craftsmanship and materials',
    alt_text: 'Chair detail photography',
  },
];

const testProducts = [
  {
    id: 'prod_1',
    name: 'VALENOVA',
    description: 'Contemporary seating collection with clean lines and dimensional flexibility.',
    page_number: 1,
  },
  {
    id: 'prod_2',
    name: 'PIQUÉ',
    description: 'Modular seating system designed for versatile configurations.',
    page_number: 2,
  },
  {
    id: 'prod_3',
    name: 'ONA',
    description: 'Elegant chair with exceptional craftsmanship.',
    page_number: 3,
  },
];

async function runValidationTests() {
  console.log('🧪 Multi-Modal Association Validation Tests');
  console.log('=' .repeat(50));

  let totalTests = 0;
  let passedTests = 0;

  // Test 1: Spatial Score Calculation
  console.log('\n📊 Test 1: Spatial Score Calculation');
  totalTests++;

  const spatialScore1 = await MockMultiModalService.calculateSpatialScore(testImages[0], testProducts[0]);
  const spatialScore2 = await MockMultiModalService.calculateSpatialScore(testImages[0], testProducts[1]);

  console.log(`  Same page (1→1): ${(spatialScore1 * 100).toFixed(1)}%`);
  console.log(`  Adjacent page (1→2): ${(spatialScore2 * 100).toFixed(1)}%`);

  if (spatialScore1 === 1.0 && spatialScore2 === 0.8) {
    console.log('  ✅ Spatial scoring works correctly');
    passedTests++;
  } else {
    console.log('  ❌ Spatial scoring failed');
  }

  // Test 2: Caption Similarity
  console.log('\n📊 Test 2: Caption Similarity');
  totalTests++;

  const captionScore1 = await MockMultiModalService.calculateCaptionScore(testImages[0], testProducts[0]);
  const captionScore2 = await MockMultiModalService.calculateCaptionScore(testImages[0], testProducts[1]);

  console.log(`  Exact match (VALENOVA→VALENOVA): ${(captionScore1 * 100).toFixed(1)}%`);
  console.log(`  Different products (VALENOVA→PIQUÉ): ${(captionScore2 * 100).toFixed(1)}%`);

  if (captionScore1 > captionScore2 && captionScore1 > 0.5) {
    console.log('  ✅ Caption similarity works correctly');
    passedTests++;
  } else {
    console.log('  ❌ Caption similarity failed');
  }

  // Test 3: Overall Score Calculation
  console.log('\n📊 Test 3: Overall Score Calculation');
  totalTests++;

  const spatial = 1.0;
  const caption = 0.8;
  const clip = 0.7;
  const expectedOverall = (spatial * 0.4) + (caption * 0.3) + (clip * 0.3);
  const actualOverall = MockMultiModalService.calculateOverallScore(spatial, caption, clip);

  console.log(`  Expected: ${(expectedOverall * 100).toFixed(1)}%`);
  console.log(`  Actual: ${(actualOverall * 100).toFixed(1)}%`);

  if (Math.abs(expectedOverall - actualOverall) < 0.001) {
    console.log('  ✅ Overall score calculation works correctly');
    passedTests++;
  } else {
    console.log('  ❌ Overall score calculation failed');
  }

  // Test 4: Confidence Calculation
  console.log('\n📊 Test 4: Confidence Calculation');
  totalTests++;

  const confidence1 = MockMultiModalService.calculateConfidence(0.9, 0.9, 0.9, 0.9); // High consistency
  const confidence2 = MockMultiModalService.calculateConfidence(0.9, 0.3, 0.1, 0.5); // Low consistency

  console.log(`  High consistency: ${(confidence1 * 100).toFixed(1)}%`);
  console.log(`  Low consistency: ${(confidence2 * 100).toFixed(1)}%`);

  if (confidence1 > confidence2) {
    console.log('  ✅ Confidence calculation works correctly');
    passedTests++;
  } else {
    console.log('  ❌ Confidence calculation failed');
  }

  // Test 5: End-to-End Association
  console.log('\n📊 Test 5: End-to-End Association');
  totalTests++;

  const associations = [];

  for (const image of testImages) {
    for (const product of testProducts) {
      const spatial = await MockMultiModalService.calculateSpatialScore(image, product);
      const caption = await MockMultiModalService.calculateCaptionScore(image, product);
      const clip = await MockMultiModalService.calculateClipScore(image, product);
      const overall = MockMultiModalService.calculateOverallScore(spatial, caption, clip);
      const confidence = MockMultiModalService.calculateConfidence(spatial, caption, clip, overall);

      if (overall >= 0.6) { // Threshold
        associations.push({
          imageId: image.id,
          productId: product.id,
          imageName: image.caption.split(' ')[0],
          productName: product.name,
          overallScore: overall,
          confidence: confidence,
        });
      }
    }
  }

  associations.sort((a, b) => b.overallScore - a.overallScore);

  console.log(`  Found ${associations.length} high-quality associations:`);
  associations.forEach((assoc, i) => {
    console.log(`    ${i + 1}. ${assoc.imageName} → ${assoc.productName} (${(assoc.overallScore * 100).toFixed(1)}%)`);
  });

  // Check if we found the expected perfect matches
  const perfectMatches = associations.filter(assoc =>
    assoc.imageName === assoc.productName && assoc.overallScore >= 0.6
  );

  console.log(`  Perfect matches found: ${perfectMatches.length}/3 expected`);

  if (perfectMatches.length >= 3) {
    console.log('  ✅ End-to-end association works correctly');
    passedTests++;
  } else {
    console.log('  ❌ End-to-end association failed (expected 3 perfect matches with 60%+ score)');
  }

  // Summary
  console.log('\n🎯 Test Results Summary');
  console.log('=' .repeat(30));
  console.log(`Tests passed: ${passedTests}/${totalTests}`);
  console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (passedTests === totalTests) {
    console.log('✅ All tests passed! Multi-modal association logic is working correctly.');
  } else {
    console.log('❌ Some tests failed. Please review the implementation.');
  }

  return {
    totalTests,
    passedTests,
    successRate: (passedTests / totalTests) * 100,
    associations: associations.length,
  };
}

// Run the tests
runValidationTests().then(results => {
  console.log('\n🚀 Validation Complete');
  console.log(`Final Score: ${results.successRate.toFixed(1)}% (${results.passedTests}/${results.totalTests})`);
  console.log(`Associations Found: ${results.associations}`);
}).catch(error => {
  console.error('❌ Validation failed:', error);
});

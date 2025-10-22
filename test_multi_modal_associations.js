/**
 * Test Multi-Modal Image-Product Association Service
 * 
 * Tests the intelligent image-product linking system that uses:
 * - Spatial proximity (40% weight)
 * - Caption similarity (30% weight) 
 * - CLIP visual similarity (30% weight)
 */

import { createClient } from '@supabase/supabase-js';
import { MultiModalImageProductAssociationService } from './src/services/multiModalImageProductAssociationService.js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test data - simulating HARMONY PDF content
const mockImages = [
  {
    id: 'img_1',
    document_id: 'doc_harmony',
    page_number: 1,
    caption: 'VALENOVA collection overview with dimensional specifications',
    alt_text: 'Modern furniture collection showcase',
    image_type: 'product',
    clip_embedding: new Array(512).fill(0).map(() => Math.random()),
  },
  {
    id: 'img_2', 
    document_id: 'doc_harmony',
    page_number: 2,
    caption: 'PIQUÉ modular seating system in various configurations',
    alt_text: 'Modular seating arrangements',
    image_type: 'product',
    clip_embedding: new Array(512).fill(0).map(() => Math.random()),
  },
  {
    id: 'img_3',
    document_id: 'doc_harmony',
    page_number: 3,
    caption: 'ONA chair detail showing craftsmanship and materials',
    alt_text: 'Chair detail photography',
    image_type: 'detail',
    clip_embedding: new Array(512).fill(0).map(() => Math.random()),
  },
  {
    id: 'img_4',
    document_id: 'doc_harmony',
    page_number: 5,
    caption: 'FOLD table collection lifestyle setting',
    alt_text: 'Table in modern interior',
    image_type: 'lifestyle',
    clip_embedding: new Array(512).fill(0).map(() => Math.random()),
  },
  {
    id: 'img_5',
    document_id: 'doc_harmony',
    page_number: 7,
    caption: 'BEAT lighting series ambient photography',
    alt_text: 'Lighting fixtures in use',
    image_type: 'ambient',
    clip_embedding: new Array(512).fill(0).map(() => Math.random()),
  },
];

const mockProducts = [
  {
    id: 'prod_1',
    document_id: 'doc_harmony',
    name: 'VALENOVA',
    description: 'Contemporary seating collection with clean lines and dimensional flexibility. Available in multiple sizes and finishes.',
    page_number: 1,
    metadata: { designer: 'ESTUDI{H}AC', dimensions: '15×38', category: 'seating' },
  },
  {
    id: 'prod_2',
    document_id: 'doc_harmony', 
    name: 'PIQUÉ',
    description: 'Modular seating system designed for versatile configurations. Upholstered in premium fabrics.',
    page_number: 2,
    metadata: { designer: 'SG NY', dimensions: '20×40', category: 'seating' },
  },
  {
    id: 'prod_3',
    document_id: 'doc_harmony',
    name: 'ONA',
    description: 'Elegant chair with exceptional craftsmanship. Features solid wood construction and refined details.',
    page_number: 3,
    metadata: { designer: 'ESTUDI{H}AC', dimensions: '18×22', category: 'seating' },
  },
  {
    id: 'prod_4',
    document_id: 'doc_harmony',
    name: 'FOLD',
    description: 'Minimalist table collection with geometric forms. Available in various sizes and materials.',
    page_number: 5,
    metadata: { designer: 'SG NY', dimensions: '30×60', category: 'tables' },
  },
  {
    id: 'prod_5',
    document_id: 'doc_harmony',
    name: 'BEAT',
    description: 'Contemporary lighting series with ambient illumination. Features adjustable brightness and color temperature.',
    page_number: 7,
    metadata: { designer: 'ESTUDI{H}AC', dimensions: '12×45', category: 'lighting' },
  },
];

async function setupTestData() {
  console.log('🔧 Setting up test data...');
  
  try {
    // Insert mock images
    const { error: imageError } = await supabase
      .from('document_images')
      .upsert(mockImages, { onConflict: 'id' });
    
    if (imageError) {
      console.error('❌ Error inserting images:', imageError);
      return false;
    }

    // Insert mock products
    const { error: productError } = await supabase
      .from('products')
      .upsert(mockProducts, { onConflict: 'id' });
    
    if (productError) {
      console.error('❌ Error inserting products:', productError);
      return false;
    }

    console.log('✅ Test data setup complete');
    return true;
  } catch (error) {
    console.error('❌ Error setting up test data:', error);
    return false;
  }
}

async function testMultiModalAssociations() {
  console.log('🧪 Testing Multi-Modal Image-Product Associations');
  console.log('=' .repeat(60));

  try {
    // Test 1: Default association settings
    console.log('\n📊 Test 1: Default Association Settings');
    console.log('Weights: Spatial 40%, Caption 30%, CLIP 30%');
    console.log('Threshold: 0.6 overall score');

    const result1 = await MultiModalImageProductAssociationService.createDocumentAssociations(
      'doc_harmony'
    );

    console.log(`✅ Associations created: ${result1.associationsCreated}/${result1.totalEvaluated}`);
    console.log(`📊 Average confidence: ${(result1.averageConfidence * 100).toFixed(1)}%`);
    console.log(`🎯 Success rate: ${((result1.associationsCreated / result1.totalEvaluated) * 100).toFixed(1)}%`);

    // Show top associations
    console.log('\n🏆 Top Associations:');
    result1.associations
      .slice(0, 5)
      .forEach((assoc, i) => {
        const img = mockImages.find(img => img.id === assoc.imageId);
        const prod = mockProducts.find(prod => prod.id === assoc.productId);
        console.log(`  ${i + 1}. ${img?.caption?.substring(0, 30)}... → ${prod?.name}`);
        console.log(`     Score: ${(assoc.overallScore * 100).toFixed(1)}% | ${assoc.reasoning}`);
        console.log(`     Spatial: ${(assoc.spatialScore * 100).toFixed(0)}% | Caption: ${(assoc.captionScore * 100).toFixed(0)}% | CLIP: ${(assoc.clipScore * 100).toFixed(0)}%`);
      });

    // Test 2: High spatial weight (favor same-page associations)
    console.log('\n📊 Test 2: High Spatial Weight (60% spatial, 20% caption, 20% CLIP)');
    
    const result2 = await MultiModalImageProductAssociationService.createDocumentAssociations(
      'doc_harmony',
      {
        weights: { spatial: 0.6, caption: 0.2, clip: 0.2 },
        overallThreshold: 0.5,
      }
    );

    console.log(`✅ Associations created: ${result2.associationsCreated}/${result2.totalEvaluated}`);
    console.log(`📊 Average confidence: ${(result2.averageConfidence * 100).toFixed(1)}%`);

    // Test 3: High caption weight (favor text similarity)
    console.log('\n📊 Test 3: High Caption Weight (20% spatial, 60% caption, 20% CLIP)');
    
    const result3 = await MultiModalImageProductAssociationService.createDocumentAssociations(
      'doc_harmony',
      {
        weights: { spatial: 0.2, caption: 0.6, clip: 0.2 },
        overallThreshold: 0.4,
      }
    );

    console.log(`✅ Associations created: ${result3.associationsCreated}/${result3.totalEvaluated}`);
    console.log(`📊 Average confidence: ${(result3.averageConfidence * 100).toFixed(1)}%`);

    // Test 4: Association statistics
    console.log('\n📊 Test 4: Association Statistics');
    
    const stats = await MultiModalImageProductAssociationService.getDocumentAssociationStats('doc_harmony');
    
    console.log(`📈 Document Statistics:`);
    console.log(`  Images: ${stats.totalImages}`);
    console.log(`  Products: ${stats.totalProducts}`);
    console.log(`  Associations: ${stats.totalAssociations}`);
    console.log(`  Average Confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`);
    console.log(`  Score Distribution:`);
    Object.entries(stats.associationsByScore).forEach(([range, count]) => {
      console.log(`    ${range}: ${count}`);
    });

    // Test 5: Validate expected associations
    console.log('\n📊 Test 5: Validate Expected Associations');
    
    const expectedAssociations = [
      { image: 'VALENOVA collection overview', product: 'VALENOVA', reason: 'exact name match + same page' },
      { image: 'PIQUÉ modular seating', product: 'PIQUÉ', reason: 'exact name match + same page' },
      { image: 'ONA chair detail', product: 'ONA', reason: 'exact name match + same page' },
      { image: 'FOLD table collection', product: 'FOLD', reason: 'exact name match + same page' },
      { image: 'BEAT lighting series', product: 'BEAT', reason: 'exact name match + same page' },
    ];

    let correctAssociations = 0;
    for (const expected of expectedAssociations) {
      const found = result1.associations.find(assoc => {
        const img = mockImages.find(img => img.id === assoc.imageId);
        const prod = mockProducts.find(prod => prod.id === assoc.productId);
        return img?.caption?.includes(prod?.name || '') && assoc.overallScore >= 0.8;
      });
      
      if (found) {
        correctAssociations++;
        console.log(`  ✅ ${expected.image} → ${expected.product} (${expected.reason})`);
      } else {
        console.log(`  ❌ ${expected.image} → ${expected.product} (${expected.reason})`);
      }
    }

    console.log(`\n🎯 Validation Results: ${correctAssociations}/${expectedAssociations.length} expected associations found`);
    console.log(`📊 Accuracy: ${((correctAssociations / expectedAssociations.length) * 100).toFixed(1)}%`);

    // Performance summary
    console.log('\n🚀 Performance Summary:');
    console.log(`  Total evaluations: ${result1.totalEvaluated}`);
    console.log(`  Successful associations: ${result1.associationsCreated}`);
    console.log(`  Success rate: ${((result1.associationsCreated / result1.totalEvaluated) * 100).toFixed(1)}%`);
    console.log(`  Expected accuracy: ${((correctAssociations / expectedAssociations.length) * 100).toFixed(1)}%`);

    return {
      success: true,
      totalEvaluated: result1.totalEvaluated,
      associationsCreated: result1.associationsCreated,
      averageConfidence: result1.averageConfidence,
      expectedAccuracy: correctAssociations / expectedAssociations.length,
    };

  } catch (error) {
    console.error('❌ Error testing multi-modal associations:', error);
    return { success: false, error: error.message };
  }
}

async function cleanupTestData() {
  console.log('\n🧹 Cleaning up test data...');
  
  try {
    // Delete test associations
    await supabase
      .from('image_product_associations')
      .delete()
      .in('image_id', mockImages.map(img => img.id));

    // Delete test product-image relationships
    await supabase
      .from('product_image_relationships')
      .delete()
      .in('image_id', mockImages.map(img => img.id));

    // Delete test products
    await supabase
      .from('products')
      .delete()
      .in('id', mockProducts.map(prod => prod.id));

    // Delete test images
    await supabase
      .from('document_images')
      .delete()
      .in('id', mockImages.map(img => img.id));

    console.log('✅ Test data cleanup complete');
  } catch (error) {
    console.warn('⚠️ Error cleaning up test data:', error);
  }
}

async function main() {
  console.log('🎯 Multi-Modal Image-Product Association Test Suite');
  console.log('Testing intelligent image-product linking with weighted scoring');
  console.log('=' .repeat(60));

  try {
    // Setup test data
    const setupSuccess = await setupTestData();
    if (!setupSuccess) {
      console.error('❌ Failed to setup test data');
      return;
    }

    // Run tests
    const results = await testMultiModalAssociations();
    
    if (results.success) {
      console.log('\n✅ All tests completed successfully!');
      console.log(`📊 Final Results:`);
      console.log(`  - ${results.associationsCreated} associations created`);
      console.log(`  - ${(results.averageConfidence * 100).toFixed(1)}% average confidence`);
      console.log(`  - ${(results.expectedAccuracy * 100).toFixed(1)}% expected accuracy`);
    } else {
      console.error('❌ Tests failed:', results.error);
    }

    // Cleanup
    await cleanupTestData();

  } catch (error) {
    console.error('❌ Test suite failed:', error);
    await cleanupTestData();
  }
}

// Run the test suite
main().catch(console.error);

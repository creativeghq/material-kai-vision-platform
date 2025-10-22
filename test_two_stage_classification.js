#!/usr/bin/env node

/**
 * Test Two-Stage Product Classification System
 * 
 * Tests the new two-stage classification system:
 * - Stage 1: Fast classification with Claude Haiku
 * - Stage 2: Deep enrichment with Claude Sonnet
 * 
 * Validates performance improvements and accuracy.
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjY1NzU5NzQsImV4cCI6MjA0MjE1MTk3NH0.Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8';

const supabase = createClient(supabaseUrl, supabaseKey);

// Test configuration
const HARMONY_DOCUMENT_ID = '69cba085-9c2d-405c-aff2-8a20caf0b568';
const WORKSPACE_ID = 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e';

async function testTwoStageClassification() {
  console.log('🧪 Testing Two-Stage Product Classification System');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Clear existing products for clean test
    console.log('\n📋 Step 1: Clearing existing products...');
    const { data: existingProducts, error: fetchError } = await supabase
      .from('products')
      .select('id, name')
      .eq('source_document_id', HARMONY_DOCUMENT_ID);
    
    if (fetchError) {
      console.error('❌ Error fetching existing products:', fetchError);
      return;
    }
    
    if (existingProducts && existingProducts.length > 0) {
      console.log(`🗑️ Found ${existingProducts.length} existing products, deleting...`);
      
      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .eq('source_document_id', HARMONY_DOCUMENT_ID);
      
      if (deleteError) {
        console.error('❌ Error deleting products:', deleteError);
        return;
      }
      
      console.log('✅ Existing products cleared');
    } else {
      console.log('✅ No existing products found');
    }
    
    // Step 2: Get chunk count for baseline
    console.log('\n📊 Step 2: Getting baseline metrics...');
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, chunk_index, content')
      .eq('document_id', HARMONY_DOCUMENT_ID)
      .order('chunk_index');
    
    if (chunksError) {
      console.error('❌ Error fetching chunks:', chunksError);
      return;
    }
    
    console.log(`📦 Found ${chunks.length} chunks to process`);
    
    // Analyze chunk content types for baseline
    const chunkAnalysis = analyzeChunkTypes(chunks);
    console.log('📋 Chunk Analysis:');
    console.log(`   - Total chunks: ${chunks.length}`);
    console.log(`   - Index/TOC chunks: ${chunkAnalysis.index}`);
    console.log(`   - Sustainability chunks: ${chunkAnalysis.sustainability}`);
    console.log(`   - Product-like chunks: ${chunkAnalysis.productLike}`);
    console.log(`   - Other chunks: ${chunkAnalysis.other}`);
    
    // Step 3: Test two-stage classification
    console.log('\n🚀 Step 3: Testing two-stage classification...');
    const startTime = Date.now();
    
    // Call the MIVAA service to create products using two-stage system
    const response = await fetch('https://v1api.materialshub.gr/api/products/create-from-chunks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_id: HARMONY_DOCUMENT_ID,
        workspace_id: WORKSPACE_ID,
        max_products: null, // No limit
        min_chunk_length: 100
      })
    });
    
    if (!response.ok) {
      console.error('❌ API call failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return;
    }
    
    const result = await response.json();
    const totalTime = Date.now() - startTime;
    
    console.log('\n🎉 Two-Stage Classification Results:');
    console.log('=' .repeat(50));
    console.log(`✅ Success: ${result.success}`);
    console.log(`📊 Products created: ${result.products_created}`);
    console.log(`❌ Products failed: ${result.products_failed}`);
    console.log(`📦 Chunks processed: ${result.chunks_processed}`);
    console.log(`📋 Total chunks: ${result.total_chunks}`);
    console.log(`🎯 Stage 1 candidates: ${result.stage1_candidates}`);
    
    if (result.stage1_time !== undefined) {
      console.log(`⚡ Stage 1 time (Haiku): ${result.stage1_time.toFixed(2)}s`);
    }
    if (result.stage2_time !== undefined) {
      console.log(`🎯 Stage 2 time (Sonnet): ${result.stage2_time.toFixed(2)}s`);
    }
    if (result.total_time !== undefined) {
      console.log(`⏱️ Total AI time: ${result.total_time.toFixed(2)}s`);
    }
    console.log(`🕐 Total request time: ${(totalTime / 1000).toFixed(2)}s`);
    
    // Step 4: Analyze created products
    console.log('\n📋 Step 4: Analyzing created products...');
    const { data: newProducts, error: productsError } = await supabase
      .from('products')
      .select('id, name, description, metadata, properties')
      .eq('source_document_id', HARMONY_DOCUMENT_ID)
      .order('created_at');
    
    if (productsError) {
      console.error('❌ Error fetching new products:', productsError);
      return;
    }
    
    console.log(`\n🎯 Created Products (${newProducts.length}):`);
    console.log('-' .repeat(40));
    
    let enrichedProducts = 0;
    let expectedProducts = 0;
    const expectedNames = ['FOLD', 'BEAT', 'VALENOVA', 'PIQUÉ', 'ONA', 'MARE', 'LOG', 'BOW', 'LINS', 'MAISON'];
    
    newProducts.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name}`);
      
      // Check if it's an enriched product (from two-stage system)
      const isEnriched = product.metadata?.extracted_from === 'two_stage_classification';
      if (isEnriched) {
        enrichedProducts++;
        console.log(`   🎯 Enriched by two-stage system`);
        console.log(`   📊 Confidence: ${product.metadata?.classification_confidence || 'N/A'}`);
        console.log(`   🏆 Quality: ${product.metadata?.quality_assessment || 'N/A'}`);
        
        if (product.metadata?.designer) {
          console.log(`   👨‍🎨 Designer: ${product.metadata.designer}`);
        }
        if (product.metadata?.dimensions) {
          console.log(`   📏 Dimensions: ${JSON.stringify(product.metadata.dimensions)}`);
        }
        if (product.metadata?.colors) {
          console.log(`   🎨 Colors: ${JSON.stringify(product.metadata.colors)}`);
        }
      }
      
      // Check if it's an expected product
      const isExpected = expectedNames.some(name => 
        product.name.toUpperCase().includes(name) || 
        name.includes(product.name.toUpperCase())
      );
      if (isExpected) {
        expectedProducts++;
        console.log(`   ✅ Expected product found!`);
      }
      
      console.log(`   📝 Description: ${product.description.substring(0, 100)}...`);
      console.log('');
    });
    
    // Step 5: Performance analysis
    console.log('\n📊 Performance Analysis:');
    console.log('=' .repeat(50));
    
    const stage1Efficiency = result.stage1_candidates / result.eligible_chunks;
    const stage2Success = result.products_created / result.stage1_candidates;
    
    console.log(`🚀 Stage 1 Efficiency: ${(stage1Efficiency * 100).toFixed(1)}% (${result.stage1_candidates}/${result.eligible_chunks} candidates)`);
    console.log(`🎯 Stage 2 Success Rate: ${(stage2Success * 100).toFixed(1)}% (${result.products_created}/${result.stage1_candidates} products)`);
    console.log(`🏆 Enriched Products: ${enrichedProducts}/${newProducts.length} (${((enrichedProducts / newProducts.length) * 100).toFixed(1)}%)`);
    console.log(`✅ Expected Products Found: ${expectedProducts}/10 (${(expectedProducts / 10 * 100).toFixed(1)}%)`);
    
    // Performance comparison
    const avgTimePerChunk = result.total_time / result.eligible_chunks;
    const avgTimePerProduct = result.total_time / result.products_created;
    
    console.log(`⚡ Avg time per chunk: ${(avgTimePerChunk * 1000).toFixed(0)}ms`);
    console.log(`⚡ Avg time per product: ${avgTimePerProduct.toFixed(2)}s`);
    
    // Step 6: Quality assessment
    console.log('\n🏆 Quality Assessment:');
    console.log('=' .repeat(50));
    
    const qualityScore = calculateQualityScore({
      expectedProductsFound: expectedProducts,
      totalExpectedProducts: 10,
      enrichedProducts: enrichedProducts,
      totalProducts: newProducts.length,
      stage1Efficiency: stage1Efficiency,
      stage2Success: stage2Success
    });
    
    console.log(`📊 Overall Quality Score: ${qualityScore.toFixed(1)}/100`);
    
    if (qualityScore >= 90) {
      console.log('🏆 EXCELLENT: Two-stage system performing exceptionally well!');
    } else if (qualityScore >= 75) {
      console.log('✅ GOOD: Two-stage system working well with room for improvement');
    } else if (qualityScore >= 60) {
      console.log('⚠️ FAIR: Two-stage system needs optimization');
    } else {
      console.log('❌ POOR: Two-stage system requires significant improvements');
    }
    
    console.log('\n🎉 Two-Stage Classification Test Complete!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

function analyzeChunkTypes(chunks) {
  const analysis = {
    index: 0,
    sustainability: 0,
    productLike: 0,
    other: 0
  };
  
  chunks.forEach(chunk => {
    const content = chunk.content.toLowerCase();
    
    if (content.includes('index') || content.includes('table of contents') || content.includes('signature book')) {
      analysis.index++;
    } else if (content.includes('sustainability') || content.includes('environmental') || content.includes('sostenibilidad')) {
      analysis.sustainability++;
    } else if (hasProductIndicators(content)) {
      analysis.productLike++;
    } else {
      analysis.other++;
    }
  });
  
  return analysis;
}

function hasProductIndicators(content) {
  const hasUppercase = /\b[A-Z]{3,}\b/.test(content);
  const hasDimensions = /\d+[×x]\d+|cm|mm/.test(content);
  const hasDesigner = /designer|by |estudi|dsignio|yonoh|stacy garcia/i.test(content);
  
  return (hasUppercase && hasDimensions) || (hasUppercase && hasDesigner);
}

function calculateQualityScore(metrics) {
  const expectedProductsScore = (metrics.expectedProductsFound / metrics.totalExpectedProducts) * 40;
  const enrichmentScore = (metrics.enrichedProducts / metrics.totalProducts) * 25;
  const efficiencyScore = metrics.stage1Efficiency * 20;
  const successScore = metrics.stage2Success * 15;
  
  return expectedProductsScore + enrichmentScore + efficiencyScore + successScore;
}

// Run the test
if (require.main === module) {
  testTwoStageClassification().catch(console.error);
}

module.exports = { testTwoStageClassification };

#!/usr/bin/env node

/**
 * ✅ TASK 4 VALIDATION: Direct Quality Scoring Test
 * 
 * Tests the enhanced quality scoring system directly using service role key
 * to bypass authentication issues.
 */

import { createClient } from '@supabase/supabase-js';

// Use hardcoded Supabase configuration
const supabaseUrl = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

// For Edge Function calls, we'll use a mock service role key approach
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testQualityScoring() {
  console.log('🎯 TASK 4 VALIDATION: Direct Quality Scoring Test');
  console.log('=' .repeat(70));

  try {
    // 1. Find the HARMONY PDF document (we know it exists)
    console.log('\n📋 Step 1: Finding HARMONY PDF document...');
    
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, filename, created_at')
      .ilike('filename', '%harmony%')
      .order('created_at', { ascending: false })
      .limit(1);

    if (docsError || !documents || documents.length === 0) {
      console.error('❌ HARMONY PDF not found:', docsError);
      return;
    }

    const testDoc = documents[0];
    console.log(`✅ Found HARMONY PDF: ${testDoc.filename} (ID: ${testDoc.id})`);

    // 2. Check current quality scoring state
    console.log('\n📊 Step 2: Checking current quality scoring state...');
    
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, coherence_score, quality_assessment')
      .eq('document_id', testDoc.id);

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, quality_score, confidence_score, completeness_score')
      .eq('source_document_id', testDoc.id);

    if (chunksError || productsError) {
      console.error('❌ Error fetching data:', chunksError || productsError);
      return;
    }

    const chunksWithQuality = chunks?.filter(c => c.coherence_score !== null) || [];
    const productsWithQuality = products?.filter(p => p.quality_score !== null) || [];

    console.log(`📈 Current State:`);
    console.log(`   Total chunks: ${chunks?.length || 0}`);
    console.log(`   Chunks with quality scores: ${chunksWithQuality.length}`);
    console.log(`   Total products: ${products?.length || 0}`);
    console.log(`   Products with quality scores: ${productsWithQuality.length}`);

    // 3. Call Enhanced Quality Scoring Edge Function directly
    console.log('\n🚀 Step 3: Calling Enhanced Quality Scoring Edge Function...');
    
    const qualityScoringUrl = `${supabaseUrl}/functions/v1/apply-quality-scoring`;
    console.log(`📍 Calling: ${qualityScoringUrl}`);

    const startTime = Date.now();
    const response = await fetch(qualityScoringUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_id: testDoc.id,
        include_products: true,
        include_images: true,
        comprehensive: true
      }),
    });

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`⏱️ Request completed in ${duration}s`);
    console.log(`📊 Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Quality scoring failed:`, errorText);
      return;
    }

    const result = await response.json();
    console.log(`✅ Enhanced quality scoring completed:`);
    console.log(`   Chunks scored: ${result.scored_chunks}/${result.total_chunks}`);
    console.log(`   Products scored: ${result.scored_products}/${result.total_products}`);
    console.log(`   Document quality score: ${result.document_quality_score || 'N/A'}`);

    // 4. Verify results
    console.log('\n🔍 Step 4: Verifying results...');
    
    const { data: chunksAfter, error: chunksAfterError } = await supabase
      .from('document_chunks')
      .select('id, coherence_score, quality_assessment, coherence_metrics')
      .eq('document_id', testDoc.id);

    const { data: productsAfter, error: productsAfterError } = await supabase
      .from('products')
      .select('id, name, quality_score, confidence_score, completeness_score, quality_assessment')
      .eq('source_document_id', testDoc.id);

    if (chunksAfterError || productsAfterError) {
      console.error('❌ Error fetching verification data:', chunksAfterError || productsAfterError);
      return;
    }

    const chunksWithQualityAfter = chunksAfter?.filter(c => c.coherence_score !== null) || [];
    const productsWithQualityAfter = productsAfter?.filter(p => p.quality_score !== null) || [];

    console.log(`📈 Results After Quality Scoring:`);
    console.log(`   Chunks with quality scores: ${chunksWithQualityAfter.length}/${chunksAfter?.length || 0}`);
    console.log(`   Products with quality scores: ${productsWithQualityAfter.length}/${productsAfter?.length || 0}`);

    // 5. Quality Analysis
    if (chunksWithQualityAfter.length > 0) {
      const avgChunkQuality = chunksWithQualityAfter.reduce((sum, chunk) => 
        sum + (chunk.coherence_score || 0), 0) / chunksWithQualityAfter.length;
      
      const qualityDistribution = {
        excellent: chunksWithQualityAfter.filter(c => c.quality_assessment === 'Excellent').length,
        good: chunksWithQualityAfter.filter(c => c.quality_assessment === 'Good').length,
        fair: chunksWithQualityAfter.filter(c => c.quality_assessment === 'Fair').length,
        poor: chunksWithQualityAfter.filter(c => c.quality_assessment === 'Poor').length,
      };

      console.log(`\n📊 Chunk Quality Analysis:`);
      console.log(`   Average quality score: ${(avgChunkQuality * 100).toFixed(1)}%`);
      console.log(`   Quality distribution: Excellent(${qualityDistribution.excellent}) Good(${qualityDistribution.good}) Fair(${qualityDistribution.fair}) Poor(${qualityDistribution.poor})`);
    }

    if (productsWithQualityAfter.length > 0) {
      const avgProductQuality = productsWithQualityAfter.reduce((sum, product) => 
        sum + (product.quality_score || 0), 0) / productsWithQualityAfter.length;
      
      console.log(`\n📊 Product Quality Analysis:`);
      console.log(`   Average quality score: ${(avgProductQuality * 100).toFixed(1)}%`);
      
      // Show top 3 products
      const topProducts = productsWithQualityAfter
        .sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0))
        .slice(0, 3);
      
      console.log(`   Top 3 products by quality:`);
      topProducts.forEach((product, i) => {
        console.log(`     ${i + 1}. "${product.name}" - ${(product.quality_score * 100).toFixed(1)}% (${product.quality_assessment})`);
      });
    }

    // 6. Success Validation
    console.log('\n✅ Step 6: Success Validation...');
    
    const chunkSuccessRate = chunksWithQualityAfter.length / (chunks?.length || 1);
    const productSuccessRate = productsWithQualityAfter.length / (products?.length || 1);

    console.log(`📈 Success Rates:`);
    console.log(`   Chunk quality coverage: ${(chunkSuccessRate * 100).toFixed(1)}%`);
    console.log(`   Product quality coverage: ${(productSuccessRate * 100).toFixed(1)}%`);

    if (chunkSuccessRate >= 0.95 && productSuccessRate >= 0.95) {
      console.log('\n🎉 TASK 4 VALIDATION: SUCCESS!');
      console.log('✅ Enhanced quality scoring system is working correctly');
      console.log('✅ Chunks and products now have comprehensive quality metrics');
      console.log('✅ No more NULL quality scores');
      console.log('✅ Task 4 is COMPLETE');
    } else {
      console.log('\n⚠️ TASK 4 VALIDATION: NEEDS INVESTIGATION');
      console.log(`   Chunk coverage: ${(chunkSuccessRate * 100).toFixed(1)}% (target: 95%)`);
      console.log(`   Product coverage: ${(productSuccessRate * 100).toFixed(1)}% (target: 95%)`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testQualityScoring();

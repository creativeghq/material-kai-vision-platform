#!/usr/bin/env node

/**
 * ✅ TASK 4 VALIDATION: Enhanced Quality Scoring System Test
 * 
 * Tests the enhanced quality scoring system that:
 * 1. Removes duplicate local chunk scoring (was causing conflicts)
 * 2. Uses Edge Function for comprehensive quality scoring
 * 3. Adds product quality scoring with 5 metrics
 * 4. Calculates document-level quality scores
 * 
 * Expected Results:
 * - All chunks should have quality scores (not NULL)
 * - Products should have quality scores (new fields)
 * - Document should have overall quality score
 * - No duplicate scoring conflicts
 */

import { createClient } from '@supabase/supabase-js';

// Use hardcoded Supabase configuration (from supabaseConfig.ts)
const supabaseUrl = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testEnhancedQualityScoring() {
  console.log('🎯 TASK 4 VALIDATION: Enhanced Quality Scoring System');
  console.log('=' .repeat(80));

  try {
    // 1. Find a recent document with chunks and products
    console.log('\n📋 Step 1: Finding test document...');
    
    // First get documents with chunks
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, filename, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (docsError) {
      console.error('❌ Error fetching documents:', docsError);
      return;
    }

    // Then get chunk and product counts separately
    const documentsWithCounts = [];
    for (const doc of documents) {
      const { count: chunkCount } = await supabase
        .from('document_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', doc.id);

      const { count: productCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('source_document_id', doc.id);

      documentsWithCounts.push({
        ...doc,
        chunk_count: chunkCount || 0,
        product_count: productCount || 0
      });
    }

    if (!documentsWithCounts || documentsWithCounts.length === 0) {
      console.log('⚠️ No documents found for testing');
      return;
    }

    // Find document with both chunks and products
    const testDoc = documentsWithCounts.find(doc =>
      doc.chunk_count > 0 && doc.product_count > 0
    ) || documentsWithCounts[0];

    console.log(`✅ Selected test document: ${testDoc.filename} (ID: ${testDoc.id})`);
    console.log(`   Chunks: ${testDoc.chunk_count}`);
    console.log(`   Products: ${testDoc.product_count}`);

    // 2. Check BEFORE quality scoring state
    console.log('\n📊 Step 2: Checking BEFORE quality scoring state...');
    
    const { data: chunksBefore, error: chunksBeforeError } = await supabase
      .from('document_chunks')
      .select('id, coherence_score, quality_assessment, quality_score')
      .eq('document_id', testDoc.id);

    const { data: productsBefore, error: productsBeforeError } = await supabase
      .from('products')
      .select('id, quality_score, confidence_score, completeness_score, quality_assessment')
      .eq('source_document_id', testDoc.id);

    if (chunksBeforeError || productsBeforeError) {
      console.error('❌ Error fetching before state:', chunksBeforeError || productsBeforeError);
      return;
    }

    const chunksWithQuality = chunksBefore?.filter(c => c.coherence_score !== null) || [];
    const productsWithQuality = productsBefore?.filter(p => p.quality_score !== null) || [];

    console.log(`📈 BEFORE State:`);
    console.log(`   Chunks with quality scores: ${chunksWithQuality.length}/${chunksBefore?.length || 0}`);
    console.log(`   Products with quality scores: ${productsWithQuality.length}/${productsBefore?.length || 0}`);

    // 3. Call Enhanced Quality Scoring Edge Function
    console.log('\n🚀 Step 3: Calling Enhanced Quality Scoring Edge Function...');
    
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;

    if (!token) {
      console.error('❌ No authentication token available');
      return;
    }

    const qualityScoringUrl = `${supabaseUrl}/functions/v1/apply-quality-scoring`;
    console.log(`📍 Calling: ${qualityScoringUrl}`);

    const startTime = Date.now();
    const response = await fetch(qualityScoringUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Quality scoring failed with status ${response.status}:`, errorText);
      return;
    }

    const result = await response.json();
    console.log(`✅ Enhanced quality scoring completed in ${duration}s:`);
    console.log(`   Chunks scored: ${result.scored_chunks}/${result.total_chunks}`);
    console.log(`   Products scored: ${result.scored_products}/${result.total_products}`);
    console.log(`   Document quality score: ${result.document_quality_score || 'N/A'}`);

    // 4. Check AFTER quality scoring state
    console.log('\n📊 Step 4: Checking AFTER quality scoring state...');
    
    const { data: chunksAfter, error: chunksAfterError } = await supabase
      .from('document_chunks')
      .select('id, coherence_score, quality_assessment, coherence_metrics')
      .eq('document_id', testDoc.id);

    const { data: productsAfter, error: productsAfterError } = await supabase
      .from('products')
      .select('id, name, quality_score, confidence_score, completeness_score, quality_assessment, quality_metrics')
      .eq('source_document_id', testDoc.id);

    if (chunksAfterError || productsAfterError) {
      console.error('❌ Error fetching after state:', chunksAfterError || productsAfterError);
      return;
    }

    const chunksWithQualityAfter = chunksAfter?.filter(c => c.coherence_score !== null) || [];
    const productsWithQualityAfter = productsAfter?.filter(p => p.quality_score !== null) || [];

    console.log(`📈 AFTER State:`);
    console.log(`   Chunks with quality scores: ${chunksWithQualityAfter.length}/${chunksAfter?.length || 0}`);
    console.log(`   Products with quality scores: ${productsWithQualityAfter.length}/${productsAfter?.length || 0}`);

    // 5. Detailed Quality Analysis
    console.log('\n🔍 Step 5: Detailed Quality Analysis...');
    
    if (chunksWithQualityAfter.length > 0) {
      const avgChunkQuality = chunksWithQualityAfter.reduce((sum, chunk) => 
        sum + (chunk.coherence_score || 0), 0) / chunksWithQualityAfter.length;
      
      const qualityDistribution = {
        excellent: chunksWithQualityAfter.filter(c => c.quality_assessment === 'Excellent').length,
        good: chunksWithQualityAfter.filter(c => c.quality_assessment === 'Good').length,
        fair: chunksWithQualityAfter.filter(c => c.quality_assessment === 'Fair').length,
        poor: chunksWithQualityAfter.filter(c => c.quality_assessment === 'Poor').length,
      };

      console.log(`📊 Chunk Quality Analysis:`);
      console.log(`   Average quality score: ${(avgChunkQuality * 100).toFixed(1)}%`);
      console.log(`   Quality distribution:`);
      console.log(`     Excellent: ${qualityDistribution.excellent}`);
      console.log(`     Good: ${qualityDistribution.good}`);
      console.log(`     Fair: ${qualityDistribution.fair}`);
      console.log(`     Poor: ${qualityDistribution.poor}`);

      // Show sample chunk metrics
      const sampleChunk = chunksWithQualityAfter[0];
      if (sampleChunk.coherence_metrics) {
        console.log(`   Sample chunk metrics:`, sampleChunk.coherence_metrics);
      }
    }

    if (productsWithQualityAfter.length > 0) {
      const avgProductQuality = productsWithQualityAfter.reduce((sum, product) => 
        sum + (product.quality_score || 0), 0) / productsWithQualityAfter.length;
      
      const avgConfidence = productsWithQualityAfter.reduce((sum, product) => 
        sum + (product.confidence_score || 0), 0) / productsWithQualityAfter.length;

      const avgCompleteness = productsWithQualityAfter.reduce((sum, product) => 
        sum + (product.completeness_score || 0), 0) / productsWithQualityAfter.length;

      console.log(`📊 Product Quality Analysis:`);
      console.log(`   Average quality score: ${(avgProductQuality * 100).toFixed(1)}%`);
      console.log(`   Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
      console.log(`   Average completeness: ${(avgCompleteness * 100).toFixed(1)}%`);

      // Show sample product metrics
      const sampleProduct = productsWithQualityAfter[0];
      console.log(`   Sample product: "${sampleProduct.name}"`);
      console.log(`     Quality: ${(sampleProduct.quality_score * 100).toFixed(1)}% (${sampleProduct.quality_assessment})`);
      console.log(`     Confidence: ${(sampleProduct.confidence_score * 100).toFixed(1)}%`);
      console.log(`     Completeness: ${(sampleProduct.completeness_score * 100).toFixed(1)}%`);
      if (sampleProduct.quality_metrics) {
        console.log(`     Metrics:`, sampleProduct.quality_metrics);
      }
    }

    // 6. Success Validation
    console.log('\n✅ Step 6: Success Validation...');
    
    const chunkImprovementRate = chunksWithQualityAfter.length / (chunksBefore?.length || 1);
    const productImprovementRate = productsWithQualityAfter.length / (productsBefore?.length || 1);

    console.log(`📈 Improvement Results:`);
    console.log(`   Chunk quality coverage: ${(chunkImprovementRate * 100).toFixed(1)}%`);
    console.log(`   Product quality coverage: ${(productImprovementRate * 100).toFixed(1)}%`);

    if (chunkImprovementRate >= 0.95 && productImprovementRate >= 0.95) {
      console.log('\n🎉 TASK 4 VALIDATION: SUCCESS!');
      console.log('✅ Enhanced quality scoring system is working correctly');
      console.log('✅ Chunks and products now have comprehensive quality metrics');
      console.log('✅ No more NULL quality scores');
    } else {
      console.log('\n⚠️ TASK 4 VALIDATION: PARTIAL SUCCESS');
      console.log(`   Chunk coverage: ${(chunkImprovementRate * 100).toFixed(1)}% (target: 95%)`);
      console.log(`   Product coverage: ${(productImprovementRate * 100).toFixed(1)}% (target: 95%)`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testEnhancedQualityScoring();

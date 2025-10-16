/**
 * Browser-based Chunk Analysis Tool
 * 
 * Run this in the browser console on the Knowledge Base page to analyze chunk sizes
 * and provide RAG optimization recommendations.
 * 
 * Usage:
 * 1. Open http://localhost:3000/admin/knowledge-base
 * 2. Open browser console (F12)
 * 3. Copy and paste this script
 * 4. Run: analyzeChunkSizes()
 */

window.analyzeChunkSizes = async function() {
  console.log('📏 CHUNK SIZE ANALYSIS FOR RAG OPTIMIZATION');
  console.log('='.repeat(60));

  try {
    // Check if we're on the right page
    if (!window.location.pathname.includes('knowledge-base')) {
      console.log('❌ Please navigate to the Knowledge Base page first');
      console.log('   Go to: /admin/knowledge-base');
      return;
    }

    // Try to access Supabase client from the page
    let supabase = null;
    
    // Try different ways to access Supabase
    if (window.supabase) {
      supabase = window.supabase;
    } else if (window.__SUPABASE_CLIENT__) {
      supabase = window.__SUPABASE_CLIENT__;
    } else {
      // Try to find it in React components
      const reactRoot = document.querySelector('#root, #__next, [data-reactroot]');
      if (reactRoot && reactRoot._reactInternalFiber) {
        console.log('🔍 Searching for Supabase client in React components...');
      }
    }

    if (!supabase) {
      console.log('❌ Cannot access Supabase client from browser');
      console.log('💡 Alternative: Check the Knowledge Base page directly for chunk data');
      console.log('   Look at the "Overview" tab for average chunk size statistics');
      return;
    }

    console.log('✅ Supabase client found, fetching chunk data...');

    // Fetch chunks data
    const { data: chunks, error } = await supabase
      .from('document_chunks')
      .select('id, content, chunk_index, document_id, metadata, created_at');

    if (error) {
      console.error('❌ Error fetching chunks:', error);
      return;
    }

    if (!chunks || chunks.length === 0) {
      console.log('⚠️  No chunks found in database');
      console.log('   Process some PDFs first to generate chunks for analysis');
      return;
    }

    console.log(`✅ Analyzing ${chunks.length} chunks...\n`);

    // Calculate chunk sizes
    const sizes = chunks.map(chunk => chunk.content?.length || 0);
    const totalSize = sizes.reduce((a, b) => a + b, 0);
    const avgSize = totalSize / sizes.length;
    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);
    
    const sortedSizes = [...sizes].sort((a, b) => a - b);
    const medianSize = sortedSizes.length % 2 === 0
      ? (sortedSizes[sortedSizes.length / 2 - 1] + sortedSizes[sortedSizes.length / 2]) / 2
      : sortedSizes[Math.floor(sortedSizes.length / 2)];

    console.log('📊 BASIC STATISTICS');
    console.log('-'.repeat(40));
    console.log(`Total chunks: ${sizes.length}`);
    console.log(`Total content: ${(totalSize / 1000).toFixed(1)}K characters`);
    console.log(`Average size: ${Math.round(avgSize)} characters`);
    console.log(`Median size: ${Math.round(medianSize)} characters`);
    console.log(`Min size: ${minSize} characters`);
    console.log(`Max size: ${maxSize} characters`);

    // Size distribution for RAG optimization
    const verySmall = sizes.filter(s => s < 100).length;
    const small = sizes.filter(s => s >= 100 && s < 300).length;
    const medium = sizes.filter(s => s >= 300 && s < 800).length;
    const optimal = sizes.filter(s => s >= 500 && s <= 1500).length;
    const large = sizes.filter(s => s > 1500 && s <= 3000).length;
    const veryLarge = sizes.filter(s => s > 3000).length;

    console.log('\n📈 SIZE DISTRIBUTION FOR RAG');
    console.log('-'.repeat(40));
    console.log(`Very Small (<100): ${verySmall} (${((verySmall/sizes.length)*100).toFixed(1)}%) - ⚠️  Lack context`);
    console.log(`Small (100-300): ${small} (${((small/sizes.length)*100).toFixed(1)}%) - 🟡 Limited context`);
    console.log(`Medium (300-800): ${medium} (${((medium/sizes.length)*100).toFixed(1)}%) - 🟢 Good for facts`);
    console.log(`Optimal (500-1500): ${optimal} (${((optimal/sizes.length)*100).toFixed(1)}%) - ✅ Best for RAG`);
    console.log(`Large (1500-3000): ${large} (${((large/sizes.length)*100).toFixed(1)}%) - 🟡 May be too broad`);
    console.log(`Very Large (>3000): ${veryLarge} (${((veryLarge/sizes.length)*100).toFixed(1)}%) - ⚠️  Too broad`);

    // RAG Quality Assessment
    const contextQualityScore = (optimal / sizes.length) * 100;
    const problematicChunks = verySmall + veryLarge;
    const problematicPercentage = (problematicChunks / sizes.length) * 100;

    console.log('\n🎯 RAG QUALITY ASSESSMENT');
    console.log('-'.repeat(40));
    console.log(`Context Quality Score: ${contextQualityScore.toFixed(1)}% (optimal chunks)`);
    console.log(`Problematic chunks: ${problematicChunks} (${problematicPercentage.toFixed(1)}%)`);

    // Overall assessment
    let overallGrade = 'F';
    let recommendation = 'Critical chunking strategy revision needed';
    
    if (contextQualityScore >= 70 && problematicPercentage < 20) {
      overallGrade = 'A';
      recommendation = 'Excellent chunking for RAG performance';
    } else if (contextQualityScore >= 50 && problematicPercentage < 30) {
      overallGrade = 'B';
      recommendation = 'Good chunking with minor optimizations needed';
    } else if (contextQualityScore >= 30 && problematicPercentage < 50) {
      overallGrade = 'C';
      recommendation = 'Fair chunking, significant improvements recommended';
    } else if (contextQualityScore >= 15) {
      overallGrade = 'D';
      recommendation = 'Poor chunking, major strategy revision needed';
    }

    console.log(`Overall Grade: ${overallGrade}`);
    console.log(`Recommendation: ${recommendation}`);

    // Specific recommendations
    console.log('\n💡 SPECIFIC RECOMMENDATIONS');
    console.log('-'.repeat(40));

    if (avgSize < 200) {
      console.log('🔴 CRITICAL: Average chunk size too small');
      console.log('   → Increase chunk size to 500-1500 characters');
      console.log('   → Consider overlapping chunks for better context');
    } else if (avgSize > 2000) {
      console.log('🔴 CRITICAL: Average chunk size too large');
      console.log('   → Decrease chunk size to 500-1500 characters');
      console.log('   → Use semantic chunking instead of fixed-size');
    } else {
      console.log('✅ Average chunk size is reasonable');
    }

    if (verySmall > sizes.length * 0.2) {
      console.log('🟡 WARNING: Too many very small chunks');
      console.log('   → Review chunking algorithm');
      console.log('   → Consider minimum chunk size threshold');
    }

    if (veryLarge > sizes.length * 0.1) {
      console.log('🟡 WARNING: Too many very large chunks');
      console.log('   → Implement better text segmentation');
      console.log('   → Use paragraph or sentence boundaries');
    }

    console.log('\n🎯 SUMMARY');
    console.log('-'.repeat(40));
    console.log(`📊 Total chunks analyzed: ${sizes.length}`);
    console.log(`📏 Average chunk size: ${Math.round(avgSize)} characters`);
    console.log(`🎯 Context quality score: ${contextQualityScore.toFixed(1)}%`);
    console.log(`📈 Overall grade: ${overallGrade}`);
    console.log(`💡 ${recommendation}`);

    return {
      totalChunks: sizes.length,
      avgSize: Math.round(avgSize),
      medianSize: Math.round(medianSize),
      contextQualityScore: parseFloat(contextQualityScore.toFixed(1)),
      overallGrade,
      recommendation,
      distribution: {
        verySmall,
        small,
        medium,
        optimal,
        large,
        veryLarge
      }
    };

  } catch (error) {
    console.error('❌ Analysis failed:', error);
    console.log('💡 Make sure you\'re on the Knowledge Base page and have proper permissions');
  }
};

// Auto-load message
console.log('📏 Chunk Analysis Tool Loaded!');
console.log('📋 Instructions:');
console.log('1. Navigate to /admin/knowledge-base');
console.log('2. Run: analyzeChunkSizes()');
console.log('3. Review the detailed RAG optimization analysis');

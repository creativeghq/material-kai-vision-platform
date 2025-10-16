/**
 * Analyze Chunk Sizes for RAG Optimization
 * 
 * This script analyzes chunk sizes in the knowledge base to determine
 * if they are optimized for RAG (Retrieval Augmented Generation) performance.
 * 
 * Optimal chunk sizes for RAG:
 * - Too small (<200 chars): Lack context, poor semantic meaning
 * - Too large (>2000 chars): Dilute relevance, exceed token limits
 * - Optimal (500-1500 chars): Good balance of context and precision
 */

// This script should be run in the browser console on the knowledge base page
// where the Supabase client is available

async function analyzeChunkSizes() {
  console.log('📏 Analyzing Chunk Sizes for RAG Optimization');
  console.log('='.repeat(60));

  try {
    // Check if we're in the right context
    if (typeof window === 'undefined' || !window.supabase) {
      console.log('❌ This script must be run in the browser console on a page with Supabase client');
      return;
    }

    const supabase = window.supabase;

    // Fetch all chunks with their content
    console.log('📊 Fetching all document chunks...');
    const { data: chunks, error } = await supabase
      .from('document_chunks')
      .select(`
        id,
        content,
        chunk_index,
        document_id,
        metadata,
        created_at,
        documents!inner(
          id,
          filename,
          metadata
        )
      `);

    if (error) {
      console.error('❌ Error fetching chunks:', error);
      return;
    }

    if (!chunks || chunks.length === 0) {
      console.log('⚠️  No chunks found in database');
      return;
    }

    console.log(`✅ Found ${chunks.length} chunks to analyze\n`);

    // Analyze chunk sizes
    const chunkSizes = chunks.map(chunk => ({
      id: chunk.id,
      size: chunk.content?.length || 0,
      content: chunk.content || '',
      document: chunk.documents?.filename || 'Unknown',
      index: chunk.chunk_index
    }));

    // Calculate statistics
    const sizes = chunkSizes.map(c => c.size);
    const totalSize = sizes.reduce((a, b) => a + b, 0);
    const avgSize = totalSize / sizes.length;
    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);
    
    // Calculate median
    const sortedSizes = [...sizes].sort((a, b) => a - b);
    const medianSize = sortedSizes.length % 2 === 0
      ? (sortedSizes[sortedSizes.length / 2 - 1] + sortedSizes[sortedSizes.length / 2]) / 2
      : sortedSizes[Math.floor(sortedSizes.length / 2)];

    console.log('📊 CHUNK SIZE STATISTICS');
    console.log('-'.repeat(40));
    console.log(`Total chunks: ${sizes.length}`);
    console.log(`Total content: ${(totalSize / 1000).toFixed(1)}K characters`);
    console.log(`Average size: ${Math.round(avgSize)} characters`);
    console.log(`Median size: ${Math.round(medianSize)} characters`);
    console.log(`Min size: ${minSize} characters`);
    console.log(`Max size: ${maxSize} characters`);

    // Categorize chunks by size
    const verySmall = chunkSizes.filter(c => c.size < 100);
    const small = chunkSizes.filter(c => c.size >= 100 && c.size < 300);
    const medium = chunkSizes.filter(c => c.size >= 300 && c.size < 800);
    const optimal = chunkSizes.filter(c => c.size >= 500 && c.size <= 1500);
    const large = chunkSizes.filter(c => c.size > 1500 && c.size <= 3000);
    const veryLarge = chunkSizes.filter(c => c.size > 3000);

    console.log('\n📈 CHUNK SIZE DISTRIBUTION');
    console.log('-'.repeat(40));
    console.log(`Very Small (<100 chars): ${verySmall.length} (${((verySmall.length/sizes.length)*100).toFixed(1)}%)`);
    console.log(`Small (100-300 chars): ${small.length} (${((small.length/sizes.length)*100).toFixed(1)}%)`);
    console.log(`Medium (300-800 chars): ${medium.length} (${((medium.length/sizes.length)*100).toFixed(1)}%)`);
    console.log(`Large (800-1500 chars): ${large.length} (${((large.length/sizes.length)*100).toFixed(1)}%)`);
    console.log(`Very Large (1500-3000 chars): ${large.length} (${((large.length/sizes.length)*100).toFixed(1)}%)`);
    console.log(`Extremely Large (>3000 chars): ${veryLarge.length} (${((veryLarge.length/sizes.length)*100).toFixed(1)}%)`);

    console.log('\n🎯 RAG OPTIMIZATION ANALYSIS');
    console.log('-'.repeat(40));
    console.log(`Optimal chunks (500-1500 chars): ${optimal.length} (${((optimal.length/sizes.length)*100).toFixed(1)}%)`);
    
    const contextQualityScore = (optimal.length / sizes.length) * 100;
    console.log(`Context Quality Score: ${contextQualityScore.toFixed(1)}%`);

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS');
    console.log('-'.repeat(40));

    if (avgSize < 200) {
      console.log('⚠️  CRITICAL: Chunks are too small for effective RAG');
      console.log('   - Current average: ' + Math.round(avgSize) + ' chars');
      console.log('   - Recommended: 500-1500 chars');
      console.log('   - Action: Increase chunk size in PDF processing');
    } else if (avgSize > 2000) {
      console.log('⚠️  WARNING: Chunks are too large for optimal retrieval');
      console.log('   - Current average: ' + Math.round(avgSize) + ' chars');
      console.log('   - Recommended: 500-1500 chars');
      console.log('   - Action: Decrease chunk size in PDF processing');
    } else {
      console.log('✅ Chunk sizes are within acceptable range');
    }

    if (contextQualityScore < 30) {
      console.log('🔴 POOR: Less than 30% of chunks are optimally sized');
      console.log('   - Action Required: Reconfigure chunking strategy');
    } else if (contextQualityScore < 60) {
      console.log('🟡 FAIR: 30-60% of chunks are optimally sized');
      console.log('   - Action Recommended: Fine-tune chunking parameters');
    } else {
      console.log('🟢 GOOD: More than 60% of chunks are optimally sized');
    }

    // Show examples of problematic chunks
    if (verySmall.length > 0) {
      console.log('\n🔍 EXAMPLES OF VERY SMALL CHUNKS (may lack context):');
      verySmall.slice(0, 3).forEach((chunk, i) => {
        console.log(`${i + 1}. Size: ${chunk.size} chars, Content: "${chunk.content.substring(0, 80)}..."`);
      });
    }

    if (veryLarge.length > 0) {
      console.log('\n🔍 EXAMPLES OF VERY LARGE CHUNKS (may be too broad):');
      veryLarge.slice(0, 3).forEach((chunk, i) => {
        console.log(`${i + 1}. Size: ${chunk.size} chars, Content: "${chunk.content.substring(0, 80)}..."`);
      });
    }

    // Document-level analysis
    console.log('\n📄 DOCUMENT-LEVEL ANALYSIS');
    console.log('-'.repeat(40));
    
    const docStats = {};
    chunkSizes.forEach(chunk => {
      if (!docStats[chunk.document]) {
        docStats[chunk.document] = { chunks: 0, totalSize: 0, sizes: [] };
      }
      docStats[chunk.document].chunks++;
      docStats[chunk.document].totalSize += chunk.size;
      docStats[chunk.document].sizes.push(chunk.size);
    });

    Object.entries(docStats).forEach(([doc, stats]) => {
      const avgDocSize = stats.totalSize / stats.chunks;
      console.log(`${doc}: ${stats.chunks} chunks, avg ${Math.round(avgDocSize)} chars`);
    });

    console.log('\n🎯 FINAL ASSESSMENT');
    console.log('-'.repeat(40));
    
    let overallScore = 'POOR';
    if (contextQualityScore >= 60 && avgSize >= 300 && avgSize <= 1800) {
      overallScore = 'EXCELLENT';
    } else if (contextQualityScore >= 40 && avgSize >= 200 && avgSize <= 2200) {
      overallScore = 'GOOD';
    } else if (contextQualityScore >= 20 && avgSize >= 150) {
      overallScore = 'FAIR';
    }

    console.log(`Overall RAG Readiness: ${overallScore}`);
    console.log(`Context Quality Score: ${contextQualityScore.toFixed(1)}%`);
    console.log(`Average Chunk Size: ${Math.round(avgSize)} characters`);

    return {
      totalChunks: sizes.length,
      avgSize: Math.round(avgSize),
      medianSize: Math.round(medianSize),
      contextQualityScore: contextQualityScore.toFixed(1),
      overallScore,
      distribution: {
        verySmall: verySmall.length,
        small: small.length,
        medium: medium.length,
        optimal: optimal.length,
        large: large.length,
        veryLarge: veryLarge.length
      }
    };

  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.analyzeChunkSizes = analyzeChunkSizes;
  console.log('📏 Chunk size analyzer loaded. Run analyzeChunkSizes() in the browser console.');
} else {
  // For Node.js environment, just export the function
  module.exports = { analyzeChunkSizes };
}

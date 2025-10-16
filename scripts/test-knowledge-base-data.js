/**
 * Test Knowledge Base Data
 *
 * This script analyzes the knowledge base issues based on code review.
 * For actual database testing, use the browser console on the Knowledge Base page.
 */

console.log('🔍 KNOWLEDGE BASE ISSUES ANALYSIS');
console.log('=' .repeat(50));
console.log('📝 Based on code review, here are the findings:');

function analyzeIssue1_Images() {
  console.log('\n📊 ISSUE 1: Images showing 0 despite processed images');
  console.log('-'.repeat(50));

  try {
    // Test the exact query from MaterialKnowledgeBase
    const { data: imagesData, error: imagesError } = await supabase
      .from('document_images')
      .select('*')
      .order('created_at', { ascending: false });

    if (imagesError) {
      console.log(`❌ Images query error: ${imagesError.message}`);
      return false;
    }

    console.log(`✅ Images query successful`);
    console.log(`📊 Total images found: ${imagesData?.length || 0}`);

    if (imagesData && imagesData.length > 0) {
      console.log(`📄 Sample image data:`);
      const sample = imagesData[0];
      console.log(`   - ID: ${sample.id}`);
      console.log(`   - Document ID: ${sample.document_id}`);
      console.log(`   - Image Type: ${sample.image_type}`);
      console.log(`   - Caption: ${sample.caption || 'None'}`);
      console.log(`   - Processing Status: ${sample.processing_status}`);
      console.log(`   - Created: ${sample.created_at}`);
    } else {
      console.log(`⚠️  No images found in database`);
      console.log(`   This explains why the frontend shows 0 images`);
    }

    return true;
  } catch (error) {
    console.log(`❌ Images test failed: ${error.message}`);
    return false;
  }
}

async function testIssue2and3_ChunksAndDocuments() {
  console.log('\n📝 ISSUE 2&3: Document names and chunk sources');
  console.log('-'.repeat(50));

  try {
    // Test the exact query from MaterialKnowledgeBase
    const { data: chunksData, error: chunksError } = await supabase
      .from('document_chunks')
      .select(`
        *,
        documents!inner(
          id,
          filename,
          metadata,
          processing_status,
          created_at
        )
      `)
      .order('created_at', { ascending: false });

    if (chunksError) {
      console.log(`❌ Chunks query error: ${chunksError.message}`);
      return false;
    }

    console.log(`✅ Chunks query successful`);
    console.log(`📊 Total chunks found: ${chunksData?.length || 0}`);

    if (chunksData && chunksData.length > 0) {
      console.log(`📄 Sample chunk data:`);
      const sample = chunksData[0];
      console.log(`   - Chunk ID: ${sample.id}`);
      console.log(`   - Document ID: ${sample.document_id}`);
      console.log(`   - Content length: ${sample.content?.length || 0} chars`);
      console.log(`   - Chunk index: ${sample.chunk_index}`);

      // Check document data
      const doc = sample.documents;
      if (doc) {
        console.log(`   - Document filename: ${doc.filename}`);
        console.log(`   - Document metadata:`, JSON.stringify(doc.metadata, null, 2));

        // Test getDocumentDisplayName logic
        let displayName = 'Unknown Document';
        if (doc.metadata?.title) displayName = doc.metadata.title;
        else if (doc.metadata?.catalog_name) displayName = doc.metadata.catalog_name;
        else if (doc.metadata?.document_name) displayName = doc.metadata.document_name;
        else if (doc.filename && !doc.filename.match(/^[0-9a-f-]{36}\.pdf$/i)) {
          displayName = doc.filename.replace(/\.[^/.]+$/, '');
        } else if (doc.metadata?.source === 'mivaa_processing') {
          displayName = `PDF Document (${doc.filename.substring(0, 8)}...)`;
        }

        console.log(`   - Calculated display name: "${displayName}"`);

        if (displayName === 'Unknown Document') {
          console.log(`⚠️  Document shows as "Unknown" - missing catalog/title metadata`);
        }
      } else {
        console.log(`❌ No document data found (join failed)`);
      }
    } else {
      console.log(`⚠️  No chunks found in database`);
    }

    return true;
  } catch (error) {
    console.log(`❌ Chunks test failed: ${error.message}`);
    return false;
  }
}

async function testIssue4_ChunkSizes() {
  console.log('\n📏 ISSUE 4: Chunk size optimization');
  console.log('-'.repeat(50));

  try {
    const { data: chunksData, error } = await supabase
      .from('document_chunks')
      .select('id, content, chunk_index, document_id');

    if (error) {
      console.log(`❌ Chunk sizes query error: ${error.message}`);
      return false;
    }

    if (!chunksData || chunksData.length === 0) {
      console.log(`⚠️  No chunks found for size analysis`);
      return true;
    }

    const sizes = chunksData.map(chunk => chunk.content?.length || 0);
    const totalSize = sizes.reduce((a, b) => a + b, 0);
    const avgSize = totalSize / sizes.length;
    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);

    const sortedSizes = [...sizes].sort((a, b) => a - b);
    const medianSize = sortedSizes.length % 2 === 0
      ? (sortedSizes[sortedSizes.length / 2 - 1] + sortedSizes[sortedSizes.length / 2]) / 2
      : sortedSizes[Math.floor(sortedSizes.length / 2)];

    console.log(`✅ Chunk size analysis:`);
    console.log(`   - Total chunks: ${sizes.length}`);
    console.log(`   - Average size: ${Math.round(avgSize)} characters`);
    console.log(`   - Median size: ${Math.round(medianSize)} characters`);
    console.log(`   - Min size: ${minSize} characters`);
    console.log(`   - Max size: ${maxSize} characters`);

    // RAG optimization analysis
    const verySmall = sizes.filter(s => s < 100).length;
    const small = sizes.filter(s => s >= 100 && s < 300).length;
    const optimal = sizes.filter(s => s >= 500 && s <= 1500).length;
    const large = sizes.filter(s => s > 1500 && s <= 3000).length;
    const veryLarge = sizes.filter(s => s > 3000).length;

    console.log(`   - Very small (<100): ${verySmall} (${((verySmall/sizes.length)*100).toFixed(1)}%)`);
    console.log(`   - Small (100-300): ${small} (${((small/sizes.length)*100).toFixed(1)}%)`);
    console.log(`   - Optimal (500-1500): ${optimal} (${((optimal/sizes.length)*100).toFixed(1)}%)`);
    console.log(`   - Large (1500-3000): ${large} (${((large/sizes.length)*100).toFixed(1)}%)`);
    console.log(`   - Very large (>3000): ${veryLarge} (${((veryLarge/sizes.length)*100).toFixed(1)}%)`);

    const contextQualityScore = (optimal / sizes.length) * 100;
    console.log(`   - Context Quality Score: ${contextQualityScore.toFixed(1)}% (optimal for RAG)`);

    if (contextQualityScore < 50) {
      console.log(`⚠️  Low context quality - consider adjusting chunking strategy`);
    } else {
      console.log(`✅ Good context quality for RAG operations`);
    }

    return true;
  } catch (error) {
    console.log(`❌ Chunk sizes test failed: ${error.message}`);
    return false;
  }
}

async function testIssue5_Embeddings() {
  console.log('\n🔢 ISSUE 5: Vector data availability');
  console.log('-'.repeat(50));

  try {
    // Test the exact query from MaterialKnowledgeBase
    const { data: embeddingsData, error: embeddingsError } = await supabase
      .from('embeddings')
      .select(`
        *,
        document_chunks!inner(
          id,
          document_id,
          content,
          chunk_index
        )
      `)
      .order('created_at', { ascending: false });

    if (embeddingsError) {
      console.log(`❌ Embeddings query error: ${embeddingsError.message}`);
      return false;
    }

    console.log(`✅ Embeddings query successful`);
    console.log(`📊 Total embeddings found: ${embeddingsData?.length || 0}`);

    if (embeddingsData && embeddingsData.length > 0) {
      console.log(`📄 Sample embedding data:`);
      const sample = embeddingsData[0];
      console.log(`   - Embedding ID: ${sample.id}`);
      console.log(`   - Chunk ID: ${sample.chunk_id}`);
      console.log(`   - Model: ${sample.model_name}`);
      console.log(`   - Dimensions: ${sample.dimensions}`);
      console.log(`   - Has vector: ${sample.embedding ? 'Yes' : 'No'}`);
      console.log(`   - Created: ${sample.created_at}`);

      // Check if vector data is actually available
      if (sample.embedding) {
        console.log(`✅ Vector data is available - should show "Vector Available"`);
      } else {
        console.log(`⚠️  No vector data found - would show "No vector data available"`);
      }
    } else {
      console.log(`⚠️  No embeddings found in database`);
      console.log(`   This explains why embeddings show as unavailable`);
    }

    return true;
  } catch (error) {
    console.log(`❌ Embeddings test failed: ${error.message}`);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting comprehensive knowledge base data tests...\n');

  const results = {
    images: await testIssue1_Images(),
    chunks: await testIssue2and3_ChunksAndDocuments(),
    chunkSizes: await testIssue4_ChunkSizes(),
    embeddings: await testIssue5_Embeddings()
  };

  console.log('\n📊 TEST RESULTS SUMMARY');
  console.log('=' .repeat(50));
  console.log(`Images test: ${results.images ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Chunks test: ${results.chunks ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Chunk sizes test: ${results.chunkSizes ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Embeddings test: ${results.embeddings ? '✅ PASSED' : '❌ FAILED'}`);

  const passedTests = Object.values(results).filter(Boolean).length;
  console.log(`\n🎯 Overall: ${passedTests}/4 tests passed`);

  if (passedTests === 4) {
    console.log('🎉 All tests passed! Issues may be in frontend display logic.');
  } else {
    console.log('⚠️  Some tests failed. Check database data and processing pipeline.');
  }
}

// Run the tests
runAllTests().catch(console.error);
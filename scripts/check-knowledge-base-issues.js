/**
 * Check Knowledge Base Issues Status
 * 
 * Review the 5 critical issues:
 * 1. Images showing 0 despite processed images
 * 2. Documents missing catalog names in chunks  
 * 3. Chunks showing 'unknown' instead of source file
 * 4. Review chunk size optimization for better context
 * 5. Fix 'No vector data available' in embeddings display
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ2MjU4NzQsImV4cCI6MjA1MDIwMTg3NH0.YhNJp0aXOKJhEhNhZhNhZhNhZhNhZhNhZhNhZhNhZhM';

async function checkKnowledgeBaseIssues() {
  console.log('🔍 Checking Knowledge Base Issues Status\n');

  try {
    // Issue 1: Check Images
    console.log('📸 Issue 1: Images showing 0 despite processed images');
    console.log('='.repeat(60));
    
    const imagesResponse = await fetch(`${SUPABASE_URL}/rest/v1/document_images?select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (imagesResponse.ok) {
      const images = await imagesResponse.json();
      console.log(`📊 Total images in database: ${images?.length || 0}`);
      
      if (images && images.length > 0) {
        console.log(`✅ Sample image: ${images[0].id}`);
        console.log(`   Document ID: ${images[0].document_id}`);
        console.log(`   Image Type: ${images[0].image_type || 'Unknown'}`);
        console.log(`   Image URL: ${images[0].image_url ? 'Present' : 'Missing'}`);
        console.log(`   Caption: ${images[0].caption || 'None'}`);
        console.log(`   Status: IMAGES EXIST IN DATABASE ✅`);
      } else {
        console.log(`❌ Status: NO IMAGES FOUND IN DATABASE`);
      }
    } else {
      console.log(`❌ Error fetching images: ${imagesResponse.status} ${imagesResponse.statusText}`);
    }

    // Issue 2 & 3: Check Documents and Chunks
    console.log('\n📄 Issue 2 & 3: Documents missing catalog names and chunks showing unknown source');
    console.log('='.repeat(60));
    
    const chunksResponse = await fetch(`${SUPABASE_URL}/rest/v1/document_chunks?select=*,documents!inner(id,filename,metadata,processing_status,created_at)&limit=5`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (chunksResponse.ok) {
      const chunks = await chunksResponse.json();
      console.log(`📊 Total chunks with documents: ${chunks?.length || 0}`);
      
      if (chunks && chunks.length > 0) {
        let catalogNamesFound = 0;
        let sourceFilesFound = 0;
        
        chunks.forEach((chunk, index) => {
          const doc = chunk.documents;
          console.log(`\n📝 Chunk ${index + 1}:`);
          console.log(`   Chunk ID: ${chunk.id}`);
          console.log(`   Document ID: ${chunk.document_id}`);
          console.log(`   Document filename: ${doc?.filename || 'Unknown'}`);
          console.log(`   Document metadata title: ${doc?.metadata?.title || 'None'}`);
          console.log(`   Document metadata catalog_name: ${doc?.metadata?.catalog_name || 'None'}`);
          console.log(`   Chunk content length: ${chunk.content?.length || 0} characters`);
          
          if (doc?.metadata?.catalog_name || doc?.metadata?.title) catalogNamesFound++;
          if (doc?.filename && doc.filename !== 'Unknown') sourceFilesFound++;
        });
        
        console.log(`\n📊 Analysis:`);
        console.log(`   Chunks with catalog names: ${catalogNamesFound}/${chunks.length}`);
        console.log(`   Chunks with source files: ${sourceFilesFound}/${chunks.length}`);
        console.log(`   Status: ${catalogNamesFound > 0 ? '✅ SOME CATALOG NAMES FOUND' : '❌ NO CATALOG NAMES'}`);
        console.log(`   Status: ${sourceFilesFound > 0 ? '✅ SOURCE FILES FOUND' : '❌ NO SOURCE FILES'}`);
      } else {
        console.log(`❌ Status: NO CHUNKS FOUND IN DATABASE`);
      }
    } else {
      console.log(`❌ Error fetching chunks: ${chunksResponse.status} ${chunksResponse.statusText}`);
    }

    // Issue 4: Check chunk sizes
    console.log('\n📏 Issue 4: Review chunk size optimization');
    console.log('='.repeat(60));
    
    const allChunksResponse = await fetch(`${SUPABASE_URL}/rest/v1/document_chunks?select=id,content,chunk_index,document_id`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (allChunksResponse.ok) {
      const allChunks = await allChunksResponse.json();
      const chunkSizes = allChunks?.map(chunk => chunk.content?.length || 0) || [];
      
      if (chunkSizes.length > 0) {
        const avgSize = chunkSizes.reduce((a, b) => a + b, 0) / chunkSizes.length;
        const minSize = Math.min(...chunkSizes);
        const maxSize = Math.max(...chunkSizes);
        
        console.log(`📊 Chunk size analysis:`);
        console.log(`   Total chunks: ${chunkSizes.length}`);
        console.log(`   Average size: ${Math.round(avgSize)} characters`);
        console.log(`   Min size: ${minSize} characters`);
        console.log(`   Max size: ${maxSize} characters`);
        
        const verySmallChunks = chunkSizes.filter(size => size < 50);
        const smallChunks = chunkSizes.filter(size => size >= 50 && size < 200);
        const mediumChunks = chunkSizes.filter(size => size >= 200 && size < 1000);
        const largeChunks = chunkSizes.filter(size => size >= 1000);
        
        console.log(`   Very small chunks (<50 chars): ${verySmallChunks.length} (${((verySmallChunks.length/chunkSizes.length)*100).toFixed(1)}%)`);
        console.log(`   Small chunks (50-200 chars): ${smallChunks.length} (${((smallChunks.length/chunkSizes.length)*100).toFixed(1)}%)`);
        console.log(`   Medium chunks (200-1000 chars): ${mediumChunks.length} (${((mediumChunks.length/chunkSizes.length)*100).toFixed(1)}%)`);
        console.log(`   Large chunks (>1000 chars): ${largeChunks.length} (${((largeChunks.length/chunkSizes.length)*100).toFixed(1)}%)`);
        
        const optimalChunks = chunkSizes.filter(size => size >= 200 && size <= 2000);
        console.log(`   Optimal chunks (200-2000 chars): ${optimalChunks.length} (${((optimalChunks.length/chunkSizes.length)*100).toFixed(1)}%)`);
        
        if (avgSize < 200) {
          console.log(`⚠️  Status: CHUNKS TOO SMALL - Average ${Math.round(avgSize)} chars (recommended: 500-1500)`);
        } else if (avgSize > 2000) {
          console.log(`⚠️  Status: CHUNKS TOO LARGE - Average ${Math.round(avgSize)} chars (recommended: 500-1500)`);
        } else {
          console.log(`✅ Status: CHUNK SIZES REASONABLE`);
        }
      } else {
        console.log(`❌ Status: NO CHUNKS TO ANALYZE`);
      }
    } else {
      console.log(`❌ Error fetching chunk sizes: ${allChunksResponse.status} ${allChunksResponse.statusText}`);
    }

    // Issue 5: Check embeddings
    console.log('\n🧠 Issue 5: Embeddings showing "No vector data available"');
    console.log('='.repeat(60));
    
    const embeddingsResponse = await fetch(`${SUPABASE_URL}/rest/v1/embeddings?select=*,document_chunks!inner(id,document_id,content,chunk_index)&limit=5`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (embeddingsResponse.ok) {
      const embeddings = await embeddingsResponse.json();
      console.log(`📊 Total embeddings: ${embeddings?.length || 0}`);
      
      if (embeddings && embeddings.length > 0) {
        let vectorsFound = 0;
        
        embeddings.forEach((embedding, index) => {
          console.log(`\n🧠 Embedding ${index + 1}:`);
          console.log(`   Embedding ID: ${embedding.id}`);
          console.log(`   Chunk ID: ${embedding.chunk_id}`);
          console.log(`   Vector dimensions: ${embedding.vector?.length || 'No vector'}`);
          console.log(`   Model: ${embedding.model || 'Unknown'}`);
          console.log(`   Related chunk content: ${embedding.document_chunks?.content?.substring(0, 100) || 'No content'}...`);
          
          if (embedding.vector && embedding.vector.length > 0) vectorsFound++;
        });
        
        console.log(`\n📊 Analysis:`);
        console.log(`   Embeddings with vectors: ${vectorsFound}/${embeddings.length}`);
        console.log(`   Status: ${vectorsFound > 0 ? '✅ VECTOR DATA AVAILABLE' : '❌ NO VECTOR DATA'}`);
      } else {
        console.log(`❌ Status: NO EMBEDDINGS FOUND IN DATABASE`);
      }
    } else {
      console.log(`❌ Error fetching embeddings: ${embeddingsResponse.status} ${embeddingsResponse.statusText}`);
    }

    // Final Summary
    console.log('\n📋 FINAL SUMMARY - KNOWLEDGE BASE ISSUES STATUS');
    console.log('='.repeat(60));
    console.log('Based on the analysis above, here is the current status:');
    console.log('');
    console.log('1. 📸 Images showing 0: NEEDS INVESTIGATION');
    console.log('2. 📄 Documents missing catalog names: NEEDS INVESTIGATION'); 
    console.log('3. 📝 Chunks showing unknown source: NEEDS INVESTIGATION');
    console.log('4. 📏 Chunk size optimization: NEEDS ANALYSIS');
    console.log('5. 🧠 Embeddings vector data: NEEDS INVESTIGATION');
    console.log('');
    console.log('Next steps: Review the detailed output above to determine specific fixes needed.');

  } catch (error) {
    console.error('❌ Error checking knowledge base issues:', error);
  }
}

// Run the check
checkKnowledgeBaseIssues().catch(console.error);

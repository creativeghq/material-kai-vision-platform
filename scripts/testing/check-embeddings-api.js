/**
 * Check Embeddings API Response
 * Verify what data the API actually returns for chunks and images
 */

import fetch from 'node-fetch';

const MIVAA_API = 'https://v1api.materialshub.gr';
const DOCUMENT_ID = 'c0282120-3e73-468e-946b-501b250c3441';

async function checkAPIs() {
  console.log('🔍 Checking API responses for embeddings...\n');
  
  // Check chunks API
  console.log('1️⃣ Checking /api/rag/chunks endpoint:');
  const chunksResponse = await fetch(`${MIVAA_API}/api/rag/chunks?document_id=${DOCUMENT_ID}&limit=3`);
  if (chunksResponse.ok) {
    const chunksData = await chunksResponse.json();
    console.log(`   Total chunks: ${chunksData.chunks?.length || 0}`);
    if (chunksData.chunks && chunksData.chunks.length > 0) {
      const firstChunk = chunksData.chunks[0];
      console.log(`   First chunk keys: ${Object.keys(firstChunk).join(', ')}`);
      console.log(`   Has 'embedding' field: ${!!firstChunk.embedding}`);
      console.log(`   Has 'text_embedding' field: ${!!firstChunk.text_embedding}`);
      console.log(`   Sample chunk:`, JSON.stringify(firstChunk, null, 2).substring(0, 500));
    }
  } else {
    console.log(`   ❌ Failed: ${chunksResponse.status}`);
  }
  
  console.log('\n2️⃣ Checking /api/rag/images endpoint:');
  const imagesResponse = await fetch(`${MIVAA_API}/api/rag/images?document_id=${DOCUMENT_ID}&limit=3`);
  if (imagesResponse.ok) {
    const imagesData = await imagesResponse.json();
    console.log(`   Total images: ${imagesData.images?.length || 0}`);
    if (imagesData.images && imagesData.images.length > 0) {
      const firstImage = imagesData.images[0];
      console.log(`   First image keys: ${Object.keys(firstImage).join(', ')}`);
      console.log(`   Has 'clip_embedding' field: ${!!firstImage.clip_embedding}`);
      console.log(`   Has 'visual_clip_embedding_512' field: ${!!firstImage.visual_clip_embedding_512}`);
      console.log(`   Sample image:`, JSON.stringify(firstImage, null, 2).substring(0, 500));
    }
  } else {
    console.log(`   ❌ Failed: ${imagesResponse.status}`);
  }
  
  console.log('\n3️⃣ Checking /api/rag/embeddings endpoint:');
  const embeddingsResponse = await fetch(`${MIVAA_API}/api/rag/embeddings?document_id=${DOCUMENT_ID}&limit=5`);
  if (embeddingsResponse.ok) {
    const embeddingsData = await embeddingsResponse.json();
    console.log(`   Total embeddings: ${embeddingsData.count || 0}`);
    console.log(`   Response:`, JSON.stringify(embeddingsData, null, 2).substring(0, 800));
  } else {
    console.log(`   ❌ Failed: ${embeddingsResponse.status}`);
  }
  
  console.log('\n4️⃣ Checking /api/rag/relevancies endpoint:');
  const relevanciesResponse = await fetch(`${MIVAA_API}/api/rag/relevancies?document_id=${DOCUMENT_ID}&limit=5`);
  if (relevanciesResponse.ok) {
    const relevanciesData = await relevanciesResponse.json();
    console.log(`   ✅ Success: ${JSON.stringify(relevanciesData).substring(0, 500)}`);
  } else {
    console.log(`   ❌ Failed: ${relevanciesResponse.status} ${relevanciesResponse.statusText}`);
    const errorText = await relevanciesResponse.text();
    console.log(`   Error: ${errorText}`);
  }
}

checkAPIs().catch(console.error);


/**
 * Simple Data Retrieval Test
 * Tests retrieving data from an existing processed document
 */

import fetch from 'node-fetch';

const MIVAA_API = 'https://v1api.materialshub.gr';
const DOCUMENT_ID = 'd533bd8c-c137-4e9b-aed9-c58b09ca5802'; // From previous successful test

async function testDataRetrieval() {
  console.log('\n🎯 TESTING DATA RETRIEVAL FROM EXISTING DOCUMENT');
  console.log(`Document ID: ${DOCUMENT_ID}\n`);

  try {
    // Test 1: Get Chunks
    console.log('📋 Testing /api/rag/chunks...');
    const chunksResponse = await fetch(`${MIVAA_API}/api/rag/chunks?document_id=${DOCUMENT_ID}&limit=1000`);
    console.log(`   Status: ${chunksResponse.status} ${chunksResponse.statusText}`);
    
    if (chunksResponse.ok) {
      const chunksData = await chunksResponse.json();
      const chunks = chunksData.chunks || [];
      console.log(`   ✅ Found ${chunks.length} chunks`);
      console.log(`   Response format: ${JSON.stringify(Object.keys(chunksData))}`);
    } else {
      const errorText = await chunksResponse.text();
      console.log(`   ❌ Error: ${errorText}`);
    }

    // Test 2: Get Images
    console.log('\n📋 Testing /api/rag/images...');
    const imagesResponse = await fetch(`${MIVAA_API}/api/rag/images?document_id=${DOCUMENT_ID}&limit=1000`);
    console.log(`   Status: ${imagesResponse.status} ${imagesResponse.statusText}`);
    
    if (imagesResponse.ok) {
      const imagesData = await imagesResponse.json();
      const images = imagesData.images || [];
      console.log(`   ✅ Found ${images.length} images`);
      console.log(`   Response format: ${JSON.stringify(Object.keys(imagesData))}`);
      if (images.length > 0) {
        console.log(`   Sample image: ${JSON.stringify(images[0], null, 2).substring(0, 200)}...`);
      }
    } else {
      const errorText = await imagesResponse.text();
      console.log(`   ❌ Error: ${errorText}`);
    }

    // Test 3: Get Products
    console.log('\n📋 Testing /api/rag/products...');
    const productsResponse = await fetch(`${MIVAA_API}/api/rag/products?document_id=${DOCUMENT_ID}&limit=1000`);
    console.log(`   Status: ${productsResponse.status} ${productsResponse.statusText}`);
    
    if (productsResponse.ok) {
      const productsData = await productsResponse.json();
      const products = productsData.products || [];
      console.log(`   ✅ Found ${products.length} products`);
      console.log(`   Response format: ${JSON.stringify(Object.keys(productsData))}`);
      if (products.length > 0) {
        console.log(`   Sample product names: ${products.slice(0, 5).map(p => p.name).join(', ')}`);
      }
    } else {
      const errorText = await productsResponse.text();
      console.log(`   ❌ Error: ${errorText}`);
    }

    // Test 4: Get Embeddings
    console.log('\n📋 Testing /api/rag/embeddings...');
    const embeddingsResponse = await fetch(`${MIVAA_API}/api/rag/embeddings?document_id=${DOCUMENT_ID}&limit=1000`);
    console.log(`   Status: ${embeddingsResponse.status} ${embeddingsResponse.statusText}`);
    
    if (embeddingsResponse.ok) {
      const embeddingsData = await embeddingsResponse.json();
      const embeddings = embeddingsData.embeddings || [];
      console.log(`   ✅ Found ${embeddings.length} embeddings`);
      console.log(`   Response format: ${JSON.stringify(Object.keys(embeddingsData))}`);
      
      // Count by type
      const byType = {};
      embeddings.forEach(e => {
        byType[e.embedding_type] = (byType[e.embedding_type] || 0) + 1;
      });
      console.log(`   Embeddings by type: ${JSON.stringify(byType)}`);
    } else {
      const errorText = await embeddingsResponse.text();
      console.log(`   ❌ Error: ${errorText}`);
    }

    console.log('\n✅ DATA RETRIEVAL TEST COMPLETE\n');

  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

testDataRetrieval();


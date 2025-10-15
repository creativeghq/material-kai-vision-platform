#!/usr/bin/env node

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const NEW_DOC_ID = 'doc_20251015_063206'; // Harmony PDF document

async function testNewDocument() {
  console.log(`🔍 Testing new document: ${NEW_DOC_ID}`);
  console.log('This document should have 1,195 chunks and 168 images\n');
  
  try {
    // Test chunks endpoint
    console.log('📄 Testing chunks endpoint...');
    const chunksResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${NEW_DOC_ID}/chunks`);
    console.log(`📊 Chunks status: ${chunksResponse.status} ${chunksResponse.statusText}`);
    
    if (chunksResponse.ok) {
      const chunksData = await chunksResponse.json();
      const chunkCount = chunksData.data?.length || 0;
      console.log(`✅ SUCCESS! Found ${chunkCount} chunks in database`);
      
      if (chunkCount > 0) {
        const firstChunk = chunksData.data[0];
        console.log(`📄 First chunk preview: ${(firstChunk.content || '').substring(0, 100)}...`);
        console.log(`📄 Chunk structure:`, Object.keys(firstChunk));
      }
    } else {
      const errorText = await chunksResponse.text();
      console.log(`❌ Chunks error: ${errorText}`);
    }
    
    // Test images endpoint
    console.log('\n🖼️ Testing images endpoint...');
    const imagesResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${NEW_DOC_ID}/images`);
    console.log(`📊 Images status: ${imagesResponse.status} ${imagesResponse.statusText}`);
    
    if (imagesResponse.ok) {
      const imagesData = await imagesResponse.json();
      const imageCount = imagesData.data?.length || 0;
      console.log(`✅ SUCCESS! Found ${imageCount} images in database`);
      
      if (imageCount > 0) {
        const firstImage = imagesData.data[0];
        console.log(`🖼️ First image: ${firstImage.url || firstImage.image_url || 'No URL'}`);
        console.log(`🖼️ Image structure:`, Object.keys(firstImage));
      }
    } else {
      const errorText = await imagesResponse.text();
      console.log(`❌ Images error: ${errorText}`);
    }
    
    // Test content endpoint
    console.log('\n📋 Testing content endpoint...');
    const contentResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${NEW_DOC_ID}/content`);
    console.log(`📊 Content status: ${contentResponse.status} ${contentResponse.statusText}`);
    
    if (contentResponse.ok) {
      const contentData = await contentResponse.json();
      console.log(`✅ Content endpoint works!`);
      console.log(`📄 Content structure:`, Object.keys(contentData));
      
      if (contentData.content) {
        console.log(`📄 Chunks in content: ${contentData.content.chunks?.length || 0}`);
        console.log(`🖼️ Images in content: ${contentData.content.images?.length || 0}`);
      }
    } else {
      const errorText = await contentResponse.text();
      console.log(`❌ Content error: ${errorText.substring(0, 200)}...`);
    }
    
  } catch (error) {
    console.log(`❌ Test error: ${error.message}`);
  }
}

testNewDocument();

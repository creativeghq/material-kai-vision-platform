#!/usr/bin/env node

/**
 * Debug the chunks endpoint 500 error
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function debugChunksEndpoint() {
  console.log('🔍 DEBUGGING CHUNKS ENDPOINT 500 ERROR');
  console.log('==================================================\n');

  try {
    // Get documents first
    console.log('📋 Step 1: Getting document list...');
    const docsResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents`);
    
    if (!docsResponse.ok) {
      console.log(`❌ Documents list failed: ${docsResponse.status}`);
      return;
    }
    
    const docsData = await docsResponse.json();
    const documents = docsData.documents || [];
    console.log(`✅ Found ${documents.length} documents`);
    
    if (documents.length === 0) {
      console.log('⚠️ No documents to test with');
      return;
    }
    
    // Test with first document
    const testDoc = documents[0];
    const docId = testDoc.id || testDoc.document_id;
    console.log(`\n📋 Step 2: Testing chunks endpoint with document: ${docId}`);
    console.log(`📄 Document details:`, JSON.stringify(testDoc, null, 2));
    
    // Test chunks endpoint with detailed error handling
    try {
      console.log(`\n🔍 Calling: GET ${MIVAA_BASE_URL}/api/documents/documents/${docId}/chunks`);
      
      const chunksResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${docId}/chunks`);
      
      console.log(`📊 Response status: ${chunksResponse.status} ${chunksResponse.statusText}`);
      console.log(`📊 Response headers:`, Object.fromEntries(chunksResponse.headers.entries()));
      
      if (chunksResponse.ok) {
        const chunksData = await chunksResponse.json();
        console.log(`✅ Success! Response:`, JSON.stringify(chunksData, null, 2));
      } else {
        // Get error details
        const errorText = await chunksResponse.text();
        console.log(`❌ Error response body:`, errorText);
        
        try {
          const errorJson = JSON.parse(errorText);
          console.log(`❌ Parsed error:`, JSON.stringify(errorJson, null, 2));
        } catch (e) {
          console.log(`❌ Raw error text: ${errorText}`);
        }
      }
      
    } catch (fetchError) {
      console.log(`❌ Fetch error: ${fetchError.message}`);
      console.log(`❌ Error stack: ${fetchError.stack}`);
    }
    
    // Test images endpoint for comparison
    console.log(`\n📋 Step 3: Testing images endpoint for comparison...`);
    try {
      const imagesResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${docId}/images`);
      console.log(`📊 Images endpoint status: ${imagesResponse.status} ${imagesResponse.statusText}`);
      
      if (imagesResponse.ok) {
        const imagesData = await imagesResponse.json();
        console.log(`✅ Images endpoint works! Found ${imagesData.data?.length || 0} images`);
      } else {
        const errorText = await imagesResponse.text();
        console.log(`❌ Images endpoint error: ${errorText}`);
      }
    } catch (error) {
      console.log(`❌ Images endpoint fetch error: ${error.message}`);
    }
    
    // Test with different document if available
    if (documents.length > 1) {
      console.log(`\n📋 Step 4: Testing with second document...`);
      const testDoc2 = documents[1];
      const docId2 = testDoc2.id || testDoc2.document_id;
      console.log(`📄 Testing with document: ${docId2}`);
      
      try {
        const chunksResponse2 = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${docId2}/chunks`);
        console.log(`📊 Second document chunks status: ${chunksResponse2.status}`);
        
        if (!chunksResponse2.ok) {
          const errorText2 = await chunksResponse2.text();
          console.log(`❌ Second document error: ${errorText2.substring(0, 200)}...`);
        }
      } catch (error) {
        console.log(`❌ Second document test error: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.log(`❌ Debug script error: ${error.message}`);
    console.log(`❌ Error stack: ${error.stack}`);
  }
}

debugChunksEndpoint().catch(console.error);

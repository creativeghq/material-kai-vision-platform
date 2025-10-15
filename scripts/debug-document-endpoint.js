#!/usr/bin/env node

/**
 * Debug the document endpoint to see the exact error
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function debugDocumentEndpoint() {
  console.log('🔍 Debugging Document Endpoint');
  console.log('==================================================\n');

  // Test the documents endpoint with detailed error logging
  try {
    console.log('📋 Testing /api/documents/documents endpoint...');
    
    const response = await fetch(`${MIVAA_BASE_URL}/api/documents/documents`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    console.log(`   📊 Status: ${response.status}`);
    console.log(`   📊 Status Text: ${response.statusText}`);
    
    // Get response headers
    console.log('   📊 Response Headers:');
    for (const [key, value] of response.headers.entries()) {
      console.log(`      ${key}: ${value}`);
    }

    // Get response body
    const responseText = await response.text();
    console.log(`   📊 Response Body: ${responseText}`);

    if (response.ok) {
      try {
        const data = JSON.parse(responseText);
        console.log('   ✅ Response parsed successfully');
        console.log('   📄 Data:', JSON.stringify(data, null, 2));
      } catch (parseError) {
        console.log(`   ❌ JSON parse error: ${parseError.message}`);
      }
    } else {
      console.log(`   ❌ Request failed with status ${response.status}`);
      
      try {
        const errorData = JSON.parse(responseText);
        console.log('   📄 Error details:', JSON.stringify(errorData, null, 2));
      } catch (parseError) {
        console.log(`   📄 Raw error response: ${responseText}`);
      }
    }

  } catch (error) {
    console.log(`   ❌ Request error: ${error.message}`);
  }

  // Also test a simpler endpoint to see if the issue is specific to documents
  console.log('\n📋 Testing /api/health endpoint for comparison...');
  
  try {
    const healthResponse = await fetch(`${MIVAA_BASE_URL}/api/health`);
    console.log(`   📊 Health Status: ${healthResponse.status}`);
    
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('   ✅ Health endpoint working');
      console.log('   📄 Health data:', JSON.stringify(healthData, null, 2));
    } else {
      console.log(`   ❌ Health endpoint failed: ${healthResponse.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Health endpoint error: ${error.message}`);
  }

  console.log('\n🎯 Debug Summary');
  console.log('==================================================');
  console.log('💡 This test shows the exact error from the document endpoint');
  console.log('💡 Compare with health endpoint to see if issue is specific to documents');
}

debugDocumentEndpoint().catch(console.error);

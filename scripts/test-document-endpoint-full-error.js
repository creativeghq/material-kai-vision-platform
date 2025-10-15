#!/usr/bin/env node

/**
 * Test document endpoint and show full error details
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function testDocumentEndpointFullError() {
  console.log('🔍 Testing Document Endpoint - Full Error Details');
  console.log('==================================================\n');

  try {
    console.log('📋 Testing /api/documents/documents endpoint...');
    
    const response = await fetch(`${MIVAA_BASE_URL}/api/documents/documents`);
    
    console.log(`   📊 Status: ${response.status} ${response.statusText}`);
    console.log(`   📊 Content-Type: ${response.headers.get('content-type')}`);
    
    const responseText = await response.text();
    console.log(`   📊 Response Length: ${responseText.length} characters`);
    
    if (response.ok) {
      console.log('   ✅ Success');
      try {
        const data = JSON.parse(responseText);
        console.log(`   📄 Response: ${JSON.stringify(data, null, 2)}`);
      } catch (e) {
        console.log(`   ⚠️ JSON parse error: ${e.message}`);
        console.log(`   📄 Raw response: ${responseText}`);
      }
    } else {
      console.log('   ❌ Failed');
      
      try {
        const errorData = JSON.parse(responseText);
        console.log('\n📄 FULL ERROR RESPONSE:');
        console.log('==================================================');
        console.log(JSON.stringify(errorData, null, 2));
        
        console.log('\n🎯 ERROR ANALYSIS:');
        console.log('==================================================');
        console.log(`Error: ${errorData.error}`);
        console.log(`Detail: ${errorData.detail}`);
        console.log(`Timestamp: ${errorData.timestamp}`);
        
      } catch (e) {
        console.log(`   📄 Raw error response: ${responseText}`);
      }
    }
    
  } catch (error) {
    console.log(`   ❌ Request error: ${error.message}`);
  }

  console.log('\n🎯 Summary');
  console.log('==================================================');
  console.log('💡 This shows the complete error details from the document endpoint');
  console.log('💡 We should now see the actual database error instead of validation errors');
}

testDocumentEndpointFullError().catch(console.error);

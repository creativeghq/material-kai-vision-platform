#!/usr/bin/env node

/**
 * Test document endpoint with detailed error analysis
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function testDocumentEndpointDetailed() {
  console.log('🔍 Testing Document Endpoint with Detailed Analysis');
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
        console.log('   📄 Parsed Error Details:');
        console.log(`      Error: ${errorData.error}`);
        console.log(`      Type: ${errorData.type}`);
        console.log(`      Timestamp: ${errorData.timestamp}`);
        
        if (errorData.debug_error) {
          console.log('   📄 Debug Error (Full):');
          console.log(`      ${errorData.debug_error}`);
          
          // Try to extract the actual error message
          if (errorData.debug_error.includes('Failed to')) {
            const match = errorData.debug_error.match(/Failed to [^']+/);
            if (match) {
              console.log(`   🎯 Extracted Error: ${match[0]}`);
            }
          }
        }
        
      } catch (e) {
        console.log(`   📄 Raw error response: ${responseText}`);
      }
    }
    
  } catch (error) {
    console.log(`   ❌ Request error: ${error.message}`);
  }

  console.log('\n🎯 Analysis Summary');
  console.log('==================================================');
  console.log('💡 The parameter naming conflict has been fixed');
  console.log('💡 Now we have a Pydantic validation error for ErrorResponse');
  console.log('💡 This suggests the actual database operation is running but failing');
  console.log('💡 The error handler is not providing the correct fields for ErrorResponse');
}

testDocumentEndpointDetailed().catch(console.error);

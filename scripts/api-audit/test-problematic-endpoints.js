#!/usr/bin/env node

/**
 * Test the problematic endpoints individually
 */

const BASE_URL = 'https://v1api.materialshub.gr';
const API_KEY = 'mk_ITVyD3fyMtRdmnNK0';

// Test PDF content (base64)
const TEST_PDF_BASE64 = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPD4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQovQ29udGVudHMgNCAwIFIKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL0xlbmd0aCA0NAo+PgpzdHJlYW0KQlQKL0YxIDEyIFRmCjEwMCA3MDAgVGQKKFRlc3QgUERGIGNvbnRlbnQpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgo=';

function createFreshFileBlob() {
  const base64Data = TEST_PDF_BASE64.split(',')[1];
  const testContent = Buffer.from(base64Data, 'base64');
  return new Blob([new Uint8Array(testContent)], { type: 'application/pdf' });
}

async function testEndpoint(name, path) {
  console.log(`\n🧪 Testing: ${name}`);
  console.log(`   POST ${path}`);
  
  try {
    // Create completely fresh FormData
    const formData = new FormData();
    
    // Create fresh file blob
    const fileBlob = createFreshFileBlob();
    
    // Append file
    formData.append('file', fileBlob, 'test.pdf');
    
    // Make request
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      },
      body: formData
    });
    
    console.log(`   Response status: ${response.status}`);
    
    if (response.ok) {
      console.log(`   ✅ PASSED`);
      return true;
    } else {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { error: 'Could not parse response' };
      }
      console.log(`   ❌ FAILED: ${errorData.error || errorData.detail || 'Unknown error'}`);
      return false;
    }
    
  } catch (error) {
    console.log(`   ❌ EXCEPTION: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🔧 TESTING PROBLEMATIC ENDPOINTS');
  console.log('=================================');
  
  const endpoints = [
    { name: 'PDF Extract Tables', path: '/api/v1/extract/tables' },
    { name: 'PDF Extract Images', path: '/api/v1/extract/images' }
  ];
  
  let passed = 0;
  
  for (const endpoint of endpoints) {
    const success = await testEndpoint(endpoint.name, endpoint.path);
    if (success) passed++;
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n📊 RESULTS');
  console.log('==========');
  console.log(`Passed: ${passed}/${endpoints.length}`);
}

runTests().catch(console.error);

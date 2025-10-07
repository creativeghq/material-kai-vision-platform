#!/usr/bin/env node

/**
 * Test single file upload endpoint
 */

// Use native FormData (available in Node.js 18+)

const BASE_URL = 'https://v1api.materialshub.gr';
const API_KEY = 'mk_ITVyD3fyMtRdmnNK0';

// Test PDF content (base64)
const TEST_PDF_BASE64 = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPD4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQovQ29udGVudHMgNCAwIFIKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL0xlbmd0aCA0NAo+PgpzdHJlYW0KQlQKL0YxIDEyIFRmCjEwMCA3MDAgVGQKKFRlc3QgUERGIGNvbnRlbnQpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgo=';

async function testFileUpload() {
  console.log('🧪 Testing PDF Extract Markdown with FormData');
  
  try {
    // Create FormData using native implementation
    const formData = new FormData();

    // Create file buffer and convert to Blob
    const base64Data = TEST_PDF_BASE64.split(',')[1];
    const fileBuffer = Buffer.from(base64Data, 'base64');
    const fileBlob = new Blob([fileBuffer], { type: 'application/pdf' });

    // Append file as Blob with filename
    formData.append('file', fileBlob, 'test.pdf');

    // Append other data
    formData.append('page_number', '1');

    // Make request (don't set Content-Type, let fetch handle it)
    const response = await fetch(`${BASE_URL}/api/v1/extract/markdown`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`
        // Don't set Content-Type for FormData - let fetch set the boundary
      },
      body: formData
    });
    
    console.log(`Response status: ${response.status}`);
    
    let responseData;
    try {
      responseData = await response.json();
      console.log('Response data:', JSON.stringify(responseData, null, 2));
    } catch (e) {
      const text = await response.text();
      console.log('Response text:', text);
    }
    
    if (response.ok) {
      console.log('✅ SUCCESS: FormData upload working!');
    } else {
      console.log('❌ FAILED: Still having issues');
    }
    
  } catch (error) {
    console.log('❌ EXCEPTION:', error.message);
  }
}

testFileUpload().catch(console.error);

/**
 * Test the async upload endpoint directly
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

async function testAsyncEndpoint() {
  console.log('🔄 Testing async upload endpoint...\n');
  
  // Create form data
  const formData = new FormData();
  formData.append('file', fs.createReadStream('README.md'));
  formData.append('title', 'Test Document');
  
  try {
    // Submit job
    console.log('📤 Submitting job to MIVAA async endpoint...');
    const submitResponse = await fetch('https://v1api.materialshub.gr/api/rag/documents/upload-async', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test',
        ...formData.getHeaders(),
      },
      body: formData,
    });
    
    console.log(`📥 Submit response: ${submitResponse.status} ${submitResponse.statusText}`);
    
    const submitData = await submitResponse.json();
    console.log('📊 Submit data:', JSON.stringify(submitData, null, 2));
    
    if (submitResponse.status !== 202) {
      console.error('❌ Expected 202 Accepted, got:', submitResponse.status);
      return;
    }
    
    const jobId = submitData.job_id;
    console.log(`\n✅ Job submitted! Job ID: ${jobId}`);
    console.log(`📋 Status URL: ${submitData.status_url}\n`);
    
    // Poll for status
    console.log('🔄 Polling for job completion...\n');
    
    for (let i = 0; i < 60; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await fetch(`https://v1api.materialshub.gr/api/rag/documents/job/${jobId}`, {
        headers: {
          'Authorization': 'Bearer test',
        },
      });
      
      const statusData = await statusResponse.json();
      console.log(`[${i + 1}/60] Status: ${statusData.status}, Progress: ${statusData.progress}%`);
      
      if (statusData.status === 'completed') {
        console.log('\n✅ Job completed successfully!');
        console.log('📊 Result:', JSON.stringify(statusData.result, null, 2));
        return;
      } else if (statusData.status === 'failed') {
        console.error('\n❌ Job failed!');
        console.error('Error:', statusData.error);
        return;
      }
    }
    
    console.error('\n⏱️  Timeout: Job did not complete in 2 minutes');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAsyncEndpoint();


#!/usr/bin/env node

/**
 * COMPREHENSIVE MIVAA ASYNC WORKFLOW TEST
 * 
 * Tests the complete async processing workflow:
 * 1. Submit job via /api/bulk/process
 * 2. Get job ID from response
 * 3. Poll job status via /api/jobs/{job_id}
 * 4. Retrieve results when completed
 */

import fetch from 'node-fetch';

const MIVAA_BASE_URL = 'http://104.248.68.3:8000';
const AUTH_TOKEN = 'test-key';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAsyncWorkflow() {
  console.log('🚀 TESTING MIVAA ASYNC WORKFLOW');
  console.log('===============================');
  
  // Step 1: Submit async job via bulk processing
  console.log('\n📤 Step 1: Submitting async job...');
  
  let jobId;
  try {
    const response = await fetch(`${MIVAA_BASE_URL}/api/bulk/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({
        urls: ['https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'],
        batch_size: 1
      })
    });
    
    const result = await response.text();
    console.log(`📊 Status: ${response.status}`);
    
    if (response.status !== 200) {
      console.log('❌ Failed to submit job:', result);
      return;
    }
    
    const parsedResult = JSON.parse(result);
    console.log('✅ Job submitted successfully!');
    console.log(`📝 Response:`, JSON.stringify(parsedResult, null, 2));
    
    jobId = parsedResult.data?.job_id;
    if (!jobId) {
      console.log('❌ No job ID returned');
      return;
    }
    
    console.log(`🎯 Job ID: ${jobId}`);
    
  } catch (error) {
    console.log('❌ Error submitting job:', error.message);
    return;
  }
  
  // Step 2: Poll job status
  console.log('\n🔄 Step 2: Polling job status...');
  
  const maxAttempts = 24; // 2 minutes max (5 second intervals)
  let attempts = 0;
  let jobCompleted = false;
  let jobResult = null;
  
  while (attempts < maxAttempts && !jobCompleted) {
    attempts++;
    console.log(`\n🔍 Attempt ${attempts}/${maxAttempts} - Checking job status...`);
    
    try {
      // Test both job status endpoints
      const endpoints = [
        `/api/jobs/${jobId}`,
        `/api/v1/documents/job/${jobId}`
      ];
      
      for (const endpoint of endpoints) {
        console.log(`  🧪 Testing: ${endpoint}`);
        
        const response = await fetch(`${MIVAA_BASE_URL}${endpoint}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`
          }
        });
        
        const result = await response.text();
        console.log(`    📊 Status: ${response.status}`);
        
        if (response.status === 200) {
          try {
            const parsedResult = JSON.parse(result);
            console.log(`    ✅ Success! Job status: ${parsedResult.data?.status || parsedResult.status || 'unknown'}`);
            
            // Check if job is completed
            const status = parsedResult.data?.status || parsedResult.status;
            if (status === 'completed') {
              jobCompleted = true;
              jobResult = parsedResult;
              console.log(`    🎉 Job completed!`);
              break;
            } else if (status === 'failed' || status === 'error') {
              console.log(`    ❌ Job failed: ${parsedResult.data?.error || parsedResult.error || 'Unknown error'}`);
              return;
            } else {
              console.log(`    ⏳ Job still running... Status: ${status}`);
            }
            
          } catch (e) {
            console.log(`    ❌ Invalid JSON response`);
          }
        } else if (response.status === 404) {
          console.log(`    ⚠️ Endpoint not found (404)`);
        } else if (response.status === 500) {
          console.log(`    ❌ Server error (500):`, result.substring(0, 200));
        } else {
          console.log(`    ❌ Error (${response.status}):`, result.substring(0, 100));
        }
      }
      
      if (jobCompleted) break;
      
      // Wait before next poll
      console.log(`  ⏱️ Waiting 5 seconds before next check...`);
      await sleep(5000);
      
    } catch (error) {
      console.log(`  ❌ Error polling job status:`, error.message);
    }
  }
  
  // Step 3: Handle results
  if (jobCompleted && jobResult) {
    console.log('\n🎉 Step 3: Job completed successfully!');
    console.log('📋 Final Result:');
    console.log(JSON.stringify(jobResult, null, 2));
    
    // Check if we can get the processed document
    if (jobResult.data?.result_data || jobResult.result_data) {
      console.log('\n📄 Processed Document Data Available:');
      const resultData = jobResult.data?.result_data || jobResult.result_data;
      console.log(`  - Document ID: ${resultData.document_id || 'N/A'}`);
      console.log(`  - Content Length: ${resultData.content?.length || 0} characters`);
      console.log(`  - Metadata: ${Object.keys(resultData.metadata || {}).length} fields`);
    }
    
  } else if (attempts >= maxAttempts) {
    console.log('\n⏰ Step 3: Job polling timed out');
    console.log('The job may still be processing. Check manually later.');
    
  } else {
    console.log('\n❌ Step 3: Job failed or was cancelled');
  }
  
  // Step 4: Test job listing
  console.log('\n📋 Step 4: Testing job listing...');
  
  try {
    const response = await fetch(`${MIVAA_BASE_URL}/api/jobs`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    
    const result = await response.text();
    console.log(`📊 Status: ${response.status}`);
    
    if (response.status === 200) {
      const parsedResult = JSON.parse(result);
      console.log(`✅ Found ${parsedResult.jobs?.length || 0} jobs`);
      
      // Look for our job
      const ourJob = parsedResult.jobs?.find(job => job.job_id === jobId);
      if (ourJob) {
        console.log(`🎯 Our job found in list:`, {
          job_id: ourJob.job_id,
          status: ourJob.status,
          job_type: ourJob.job_type,
          created_at: ourJob.created_at
        });
      } else {
        console.log(`⚠️ Our job (${jobId}) not found in jobs list`);
      }
      
    } else {
      console.log('❌ Failed to get jobs list:', result);
    }
    
  } catch (error) {
    console.log('❌ Error getting jobs list:', error.message);
  }
  
  console.log('\n🏁 ASYNC WORKFLOW TEST COMPLETE');
  console.log('===============================');
}

// Run the test
testAsyncWorkflow().catch(console.error);

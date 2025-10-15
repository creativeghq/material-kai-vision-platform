#!/usr/bin/env node

/**
 * Test WIFI MOMO job progress monitoring
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const JOB_ID = 'bulk_20251015_041429'; // From previous submission

async function testWifiMomoJobProgress() {
  console.log('🔍 Testing WIFI MOMO Job Progress');
  console.log('==================================================\n');

  try {
    console.log(`📋 Testing job progress for: ${JOB_ID}`);
    
    // Test different progress endpoints
    const endpoints = [
      `/api/jobs/${JOB_ID}/progress`,
      `/api/jobs/${JOB_ID}`,
      `/api/jobs/${JOB_ID}/status`
    ];
    
    for (const endpoint of endpoints) {
      console.log(`\n📋 Testing endpoint: ${endpoint}`);
      console.log('--------------------------------------------------');
      
      try {
        const response = await fetch(`${MIVAA_BASE_URL}${endpoint}`);
        
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
            console.log(`   📄 Raw response: ${responseText}`);
          }
        } else {
          console.log('   ❌ Failed');
          try {
            const errorData = JSON.parse(responseText);
            console.log(`   📄 Error: ${JSON.stringify(errorData, null, 2)}`);
          } catch (e) {
            console.log(`   📄 Raw error: ${responseText}`);
          }
        }
        
      } catch (error) {
        console.log(`   ❌ Request error: ${error.message}`);
      }
    }

    // Also test general jobs endpoint
    console.log(`\n📋 Testing general jobs endpoint: /api/jobs`);
    console.log('--------------------------------------------------');
    
    try {
      const response = await fetch(`${MIVAA_BASE_URL}/api/jobs`);
      
      console.log(`   📊 Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ Success - Found ${data.jobs?.length || 0} jobs`);
        
        // Look for our specific job
        const ourJob = data.jobs?.find(job => job.job_id === JOB_ID);
        if (ourJob) {
          console.log(`   🎯 Found our job:`);
          console.log(`      📊 Status: ${ourJob.status}`);
          console.log(`      📈 Progress: ${ourJob.progress || 'N/A'}`);
          console.log(`      📅 Created: ${ourJob.created_at}`);
          console.log(`      📄 Details: ${JSON.stringify(ourJob, null, 6)}`);
        } else {
          console.log(`   ⚠️ Our job (${JOB_ID}) not found in jobs list`);
          if (data.jobs && data.jobs.length > 0) {
            console.log(`   📋 Available jobs:`);
            data.jobs.forEach(job => {
              console.log(`      - ${job.job_id}: ${job.status}`);
            });
          }
        }
      } else {
        console.log(`   ❌ Failed: ${response.status}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Request error: ${error.message}`);
    }

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
  }

  console.log('\n🎯 Summary');
  console.log('==================================================');
  console.log('💡 This shows which job progress endpoints work');
  console.log('💡 We need to find the correct way to monitor job progress');
}

testWifiMomoJobProgress().catch(console.error);

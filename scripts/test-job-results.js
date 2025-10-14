#!/usr/bin/env node

/**
 * Test Job Results Retrieval
 * Check how to get actual results from completed MIVAA jobs
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

async function testJobResults() {
  console.log('🔍 Testing Job Results Retrieval...\n');

  // Test 1: Create a job and wait for completion
  console.log('📦 Step 1: Creating a bulk processing job...');
  
  let jobId = null;
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'bulk_process',
        payload: {
          urls: ['https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'],
          batch_size: 1,
          processing_options: {
            extract_text: true,
            extract_images: true,
            extract_tables: true,
          }
        }
      })
    });

    const data = await response.json();
    
    if (response.ok && data.data && data.data.job_id) {
      jobId = data.data.job_id;
      console.log(`   ✅ Job created: ${jobId}`);
    } else {
      console.log('   ❌ Failed to create job');
      return;
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return;
  }

  // Test 2: Poll until completion
  console.log('\n⏳ Step 2: Waiting for job completion...');
  
  let completed = false;
  let attempts = 0;
  const maxAttempts = 24; // 2 minutes max
  
  while (!completed && attempts < maxAttempts) {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_job_status',
          payload: { job_id: jobId }
        })
      });

      const data = await response.json();
      
      if (response.ok && data.data) {
        const status = data.data.status;
        const progress = data.data.progress_percentage || 0;
        
        console.log(`   📊 Attempt ${attempts + 1}: Status=${status}, Progress=${progress}%`);
        
        if (status === 'completed') {
          completed = true;
          console.log('   ✅ Job completed!');
          
          // Show what data is available in the status response
          console.log('\n📋 Available data in status response:');
          console.log('   Keys:', Object.keys(data.data));
          
          if (data.data.result) {
            console.log('   📄 Result data available:', Object.keys(data.data.result));
            console.log('   📄 Full result:', JSON.stringify(data.data.result, null, 2));
          } else {
            console.log('   ⚠️  No result data in status response');
          }
          
          break;
        } else if (status === 'failed' || status === 'error') {
          console.log(`   ❌ Job failed: ${data.data.error_message || 'Unknown error'}`);
          return;
        }
        
      } else {
        console.log(`   ❌ Status check failed: ${data.message || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error checking status: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    attempts++;
  }
  
  if (!completed) {
    console.log('   ⏰ Timeout waiting for completion');
    return;
  }

  // Test 3: Try to get job results (if there's a separate endpoint)
  console.log('\n📄 Step 3: Trying to get job results...');
  
  // Check if there's a get_job_results endpoint
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'get_job_results',
        payload: { job_id: jobId }
      })
    });

    const data = await response.json();
    
    console.log(`   Status: ${response.status}`);
    
    if (response.ok) {
      console.log('   ✅ Job results retrieved!');
      console.log('   📊 Results:', JSON.stringify(data, null, 2));
    } else {
      console.log('   ❌ get_job_results not available or failed');
      console.log('   📊 Response:', data);
    }
    
  } catch (error) {
    console.log(`   ❌ Error getting results: ${error.message}`);
  }

  // Test 4: Try direct MIVAA service call for results
  console.log('\n🔗 Step 4: Trying direct MIVAA service for results...');
  
  try {
    const directUrl = `https://v1api.materialshub.gr/api/jobs/${jobId}/results`;
    console.log(`   Direct URL: ${directUrl}`);
    
    const response = await fetch(directUrl, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer your-mivaa-api-key',
        'Content-Type': 'application/json',
      }
    });

    const data = await response.json();
    
    console.log(`   Status: ${response.status}`);
    
    if (response.ok) {
      console.log('   ✅ Direct results call works!');
      console.log('   📊 Results structure:', Object.keys(data));
      
      // Show key metrics
      if (data.chunks) console.log(`   📝 Chunks: ${data.chunks.length}`);
      if (data.images) console.log(`   🖼️  Images: ${data.images.length}`);
      if (data.content) console.log(`   📄 Content available`);
      
    } else {
      console.log('   ❌ Direct results call failed');
      console.log('   📊 Response:', data);
    }
    
  } catch (error) {
    console.log(`   ❌ Direct call error: ${error.message}`);
  }

  console.log('\n🎯 Test Complete!');
  console.log('\n📝 Summary:');
  console.log('   - Job creation and polling works');
  console.log('   - Need to identify how to get actual processing results');
  console.log('   - Results should include chunks, images, embeddings, etc.');
}

// Run the test
testJobResults().catch(console.error);

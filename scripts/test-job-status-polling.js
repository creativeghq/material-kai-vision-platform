#!/usr/bin/env node

/**
 * Test Job Status Polling
 * Debug the HTTP 500 errors during job status polling
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

async function testJobStatusPolling() {
  console.log('🔍 Testing Job Status Polling Issues...\n');

  // Test 1: Create a bulk processing job first
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
            extract_images: false,
            extract_tables: false,
          }
        }
      })
    });

    const data = await response.json();
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, data);
    
    if (response.ok && data.data && data.data.job_id) {
      jobId = data.data.job_id;
      console.log(`   ✅ Job created successfully: ${jobId}`);
    } else {
      console.log('   ❌ Failed to create job');
      return;
    }
    
  } catch (error) {
    console.log(`   ❌ Error creating job: ${error.message}`);
    return;
  }

  console.log('\n' + '='.repeat(60));

  // Test 2: Try to get job status (this is what's failing)
  console.log('\n🔍 Step 2: Testing job status polling...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'get_job_status',
        payload: {
          job_id: jobId
        }
      })
    });

    const data = await response.json();
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, data);
    
    if (response.ok) {
      console.log('   ✅ Job status retrieved successfully');
    } else {
      console.log('   ❌ Job status polling failed');
      console.log(`   Error: ${data.message || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.log(`   ❌ Network error: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60));

  // Test 3: Try direct MIVAA service call to see if it's a gateway issue
  console.log('\n🔍 Step 3: Testing direct MIVAA service call...');
  
  try {
    const directUrl = `https://v1api.materialshub.gr/api/jobs/${jobId}/status`;
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
    console.log(`   Response:`, data);
    
    if (response.ok) {
      console.log('   ✅ Direct MIVAA call works');
    } else {
      console.log('   ❌ Direct MIVAA call failed');
      console.log(`   Error: ${data.message || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.log(`   ❌ Direct call error: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60));

  // Test 4: Try list_jobs endpoint as alternative
  console.log('\n🔍 Step 4: Testing list_jobs endpoint as alternative...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'list_jobs',
        payload: {}
      })
    });

    const data = await response.json();
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, data);
    
    if (response.ok) {
      console.log('   ✅ List jobs works');
      
      // Look for our job in the list
      if (data.jobs && Array.isArray(data.jobs)) {
        const ourJob = data.jobs.find(job => job.job_id === jobId);
        if (ourJob) {
          console.log(`   🎯 Found our job in list:`, ourJob);
        } else {
          console.log(`   ⚠️  Our job (${jobId}) not found in list`);
        }
      }
    } else {
      console.log('   ❌ List jobs failed');
    }
    
  } catch (error) {
    console.log(`   ❌ List jobs error: ${error.message}`);
  }

  console.log('\n🎯 Debug Complete!');
  console.log('\n📝 Analysis:');
  console.log('   - If Step 1 works but Step 2 fails: Gateway issue with get_job_status');
  console.log('   - If Step 3 works: Gateway path/parameter issue');
  console.log('   - If Step 4 works: Use list_jobs as workaround');
  console.log('\n💡 Next steps based on results above...');
}

// Run the test
testJobStatusPolling().catch(console.error);

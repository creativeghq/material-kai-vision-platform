#!/usr/bin/env node

/**
 * Check Available Jobs in MIVAA
 * 
 * Get the list of jobs and see what's available for testing
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function checkAvailableJobs() {
  console.log('🔍 Checking Available Jobs in MIVAA\n');

  try {
    console.log(`🧪 Fetching job list from: /api/jobs`);
    
    const response = await fetch(`${MIVAA_BASE_URL}/api/jobs`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Success!`);
      
      console.log(`\n📊 Job List Summary:`);
      console.log(`   Success: ${data.success}`);
      console.log(`   Message: ${data.message}`);
      console.log(`   Total Count: ${data.total_count}`);
      console.log(`   Page: ${data.page}`);
      console.log(`   Page Size: ${data.page_size}`);
      
      if (data.status_counts) {
        console.log(`   Status Counts: ${JSON.stringify(data.status_counts)}`);
      }
      
      if (data.type_counts) {
        console.log(`   Type Counts: ${JSON.stringify(data.type_counts)}`);
      }
      
      if (data.jobs && Array.isArray(data.jobs)) {
        console.log(`\n📋 Available Jobs (${data.jobs.length}):`);
        
        if (data.jobs.length === 0) {
          console.log(`   No jobs found in the system`);
        } else {
          data.jobs.forEach((job, index) => {
            console.log(`\n   ${index + 1}. Job ID: ${job.job_id || job.id || 'N/A'}`);
            console.log(`      Type: ${job.job_type || job.type || 'N/A'}`);
            console.log(`      Status: ${job.status || 'N/A'}`);
            console.log(`      Created: ${job.created_at || 'N/A'}`);
            console.log(`      Progress: ${job.progress_percentage || job.progress || 'N/A'}%`);
            
            if (job.details) {
              console.log(`      Details: ${JSON.stringify(job.details).substring(0, 100)}...`);
            }
          });
          
          // Test the status endpoint with the first available job
          if (data.jobs.length > 0) {
            const testJobId = data.jobs[0].job_id || data.jobs[0].id;
            if (testJobId) {
              console.log(`\n🧪 Testing status endpoint with job: ${testJobId}`);
              
              try {
                const statusResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/${testJobId}/status`, {
                  method: 'GET',
                  headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                  }
                });

                console.log(`   Status endpoint: ${statusResponse.status} ${statusResponse.statusText}`);
                
                if (statusResponse.ok) {
                  const statusData = await statusResponse.json();
                  console.log(`   ✅ Status endpoint works!`);
                  console.log(`   Response keys: ${Object.keys(statusData).join(', ')}`);
                } else {
                  const errorText = await statusResponse.text();
                  console.log(`   ❌ Status endpoint failed: ${errorText.substring(0, 200)}`);
                }
                
              } catch (error) {
                console.log(`   ❌ Status endpoint error: ${error.message}`);
              }
            }
          }
        }
      } else {
        console.log(`   ⚠️ Jobs data is not an array or missing`);
      }
      
    } else {
      console.log(`   ❌ Failed: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.log(`   Error: ${errorText}`);
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log(`\n💡 Analysis:`);
  console.log(`=`.repeat(50));
  console.log(`- If no jobs exist: The job 'bulk_20251014_171629' was never created or was cleared`);
  console.log(`- If jobs exist but status fails: There's a serialization issue in the status endpoint`);
  console.log(`- If status works: The issue is specific to the job ID we were testing`);
}

checkAvailableJobs().catch(console.error);

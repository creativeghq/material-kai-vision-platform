#!/usr/bin/env node

/**
 * Test MIVAA Job Status Structure
 * 
 * This script tests the actual job status response from MIVAA
 * to understand why progress updates are not working
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ1MzE1NzQsImV4cCI6MjA1MDEwNzU3NH0.Ej_Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8';

async function testMivaaJobStatus() {
  console.log('🔍 Testing MIVAA Job Status Structure\n');

  // Test with the job ID from the user's example
  const testJobId = 'bulk_20251014_171629';
  
  console.log(`📋 Testing Job ID: ${testJobId}\n`);

  try {
    console.log('🧪 Testing get_job_status endpoint...');
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'get_job_status',
        payload: { job_id: testJobId }
      })
    });

    const result = await response.json();
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Success: ${result.success}`);
    
    if (result.success && result.data) {
      console.log('\n📊 Job Status Data Structure:');
      console.log(JSON.stringify(result.data, null, 2));
      
      // Analyze the structure
      const job = result.data;
      console.log('\n🔍 Analysis:');
      console.log(`   Job Status: ${job.status || 'N/A'}`);
      console.log(`   Progress Percentage: ${job.progress_percentage || 'N/A'}`);
      console.log(`   Current Step: ${job.current_step || 'N/A'}`);
      
      // Check details structure
      if (job.details) {
        console.log('\n📋 Details Structure:');
        console.log(`   Type: ${typeof job.details}`);
        console.log(`   Chunks Created: ${job.details.chunks_created || 'N/A'}`);
        console.log(`   Images Extracted: ${job.details.images_extracted || 'N/A'}`);
        console.log(`   Text Length: ${job.details.text_length || 'N/A'}`);
      }
      
      // Check parameters structure
      if (job.parameters) {
        console.log('\n⚙️ Parameters Structure:');
        console.log(`   Type: ${typeof job.parameters}`);
        console.log(`   Chunks Created: ${job.parameters.chunks_created || 'N/A'}`);
        console.log(`   Images Extracted: ${job.parameters.images_extracted || 'N/A'}`);
        console.log(`   Text Length: ${job.parameters.text_length || 'N/A'}`);
      }
      
    } else {
      console.log('\n❌ Job Status Failed:');
      console.log(`   Error: ${result.error || 'Unknown error'}`);
      console.log(`   Message: ${result.message || 'No message'}`);
    }
    
  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
  }

  // Test with a few other potential job IDs
  console.log('\n🔄 Testing with other potential job formats...');
  
  const otherJobIds = [
    'job-1760458338978-pzyjkju9m',
    'bulk_20251014_171629',
    'test-job-id'
  ];

  for (const jobId of otherJobIds) {
    try {
      console.log(`\n   Testing: ${jobId}`);
      
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

      const result = await response.json();
      
      if (result.success) {
        console.log(`     ✅ Found job: ${result.data?.status || 'unknown status'}`);
      } else {
        console.log(`     ❌ Not found: ${result.error || 'unknown error'}`);
      }
      
    } catch (error) {
      console.log(`     ❌ Error: ${error.message}`);
    }
  }

  // Test list_jobs to see what jobs are available
  console.log('\n📋 Testing list_jobs to see available jobs...');
  
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

    const result = await response.json();
    
    if (result.success && result.data) {
      console.log(`   Found ${result.data.length || 0} jobs`);
      
      if (result.data.length > 0) {
        console.log('\n   Recent jobs:');
        result.data.slice(0, 5).forEach((job, index) => {
          console.log(`     ${index + 1}. ${job.job_id || job.id} - ${job.status} (${job.created_at || 'no date'})`);
        });
      }
    } else {
      console.log(`   ❌ Failed to list jobs: ${result.error || 'unknown error'}`);
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

testMivaaJobStatus().catch(console.error);

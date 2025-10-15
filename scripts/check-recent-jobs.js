#!/usr/bin/env node

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function checkRecentJobs() {
  try {
    console.log('🔍 Checking recent jobs...');
    
    const response = await fetch(`${MIVAA_BASE_URL}/api/jobs`);
    
    if (response.ok) {
      const data = await response.json();
      const jobs = data.jobs || [];
      
      console.log(`📊 Found ${jobs.length} jobs\n`);
      
      // Show recent jobs
      jobs.slice(0, 5).forEach((job, index) => {
        console.log(`${index + 1}. Job ID: ${job.job_id}`);
        console.log(`   Status: ${job.status}`);
        console.log(`   Progress: ${job.progress_percentage || 0}%`);
        console.log(`   Step: ${job.current_step || 'N/A'}`);
        console.log(`   Created: ${job.created_at}`);
        console.log('');
      });
      
      // Check for running jobs
      const runningJobs = jobs.filter(job => job.status === 'running');
      console.log(`🔄 Running jobs: ${runningJobs.length}`);
      
      if (runningJobs.length > 0) {
        console.log('\n📋 Checking running job details...');
        for (const job of runningJobs) {
          try {
            const statusResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/${job.job_id}/status`);
            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              const jobData = statusData.data || statusData;
              
              console.log(`\n🔍 Job: ${job.job_id}`);
              console.log(`   Status: ${jobData.status}`);
              console.log(`   Progress: ${Math.round(jobData.progress_percentage * 100) / 100 || 0}%`);
              console.log(`   Step: ${jobData.current_step || 'Unknown'}`);
              
              if (jobData.details) {
                console.log(`   Processed: ${jobData.details.processed_count || 0}`);
                console.log(`   Failed: ${jobData.details.failed_count || 0}`);
                console.log(`   Chunks: ${jobData.details.chunks_created || 0}`);
                console.log(`   Images: ${jobData.details.images_extracted || 0}`);
              }
            }
          } catch (e) {
            console.log(`   ❌ Status check failed: ${e.message}`);
          }
        }
      }
      
    } else {
      console.log(`❌ Failed: ${response.status} ${response.statusText}`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

checkRecentJobs();

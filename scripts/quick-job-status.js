#!/usr/bin/env node

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const JOB_ID = 'bulk_20251015_055236';

async function quickJobStatus() {
  try {
    console.log(`🔍 Checking job status: ${JOB_ID}`);
    
    const response = await fetch(`${MIVAA_BASE_URL}/api/jobs/${JOB_ID}/status`);
    
    if (response.ok) {
      const data = await response.json();
      const jobData = data.data || data;
      
      console.log(`📊 Status: ${jobData.status}`);
      console.log(`📈 Progress: ${Math.round(jobData.progress_percentage * 100) / 100 || 0}%`);
      console.log(`📝 Step: ${jobData.current_step || 'Unknown'}`);
      
      if (jobData.details) {
        console.log(`📄 Processed: ${jobData.details.processed_count || 0}`);
        console.log(`❌ Failed: ${jobData.details.failed_count || 0}`);
        console.log(`📄 Chunks: ${jobData.details.chunks_created || 0}`);
        console.log(`🖼️ Images: ${jobData.details.images_extracted || 0}`);
      }
      
      if (jobData.status === 'completed') {
        console.log('\n🎉 JOB COMPLETED!');
        
        if (jobData.details?.results?.[0]?.document_id) {
          console.log(`🆔 Document ID: ${jobData.details.results[0].document_id}`);
        }
      }
      
    } else {
      console.log(`❌ Failed: ${response.status} ${response.statusText}`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

quickJobStatus();

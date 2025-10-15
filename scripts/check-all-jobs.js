#!/usr/bin/env node

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function checkAllJobs() {
  try {
    console.log('🔍 Checking all jobs...');
    
    const response = await fetch(`${MIVAA_BASE_URL}/api/jobs`);
    
    if (response.ok) {
      const data = await response.json();
      const jobs = data.jobs || [];
      
      console.log(`📊 Found ${jobs.length} jobs\n`);
      
      jobs.forEach((job, index) => {
        console.log(`${index + 1}. Job ID: ${job.job_id}`);
        console.log(`   Status: ${job.status}`);
        console.log(`   Progress: ${job.progress_percentage || 0}%`);
        console.log(`   Created: ${job.created_at}`);
        console.log(`   Step: ${job.current_step || 'N/A'}`);
        
        if (job.status === 'completed') {
          console.log(`   ✅ COMPLETED JOB FOUND!`);
        }
        
        console.log('');
      });
      
      // Look for completed jobs
      const completedJobs = jobs.filter(job => job.status === 'completed');
      console.log(`🎯 Completed jobs: ${completedJobs.length}`);
      
      if (completedJobs.length > 0) {
        console.log('\n📋 Testing completed job results...');
        
        for (const job of completedJobs) {
          console.log(`\n🔍 Testing job: ${job.job_id}`);
          
          // Get detailed status
          try {
            const statusResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/${job.job_id}/status`);
            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              const jobData = statusData.data || statusData;
              
              console.log(`   📄 Chunks: ${jobData.details?.chunks_created || 0}`);
              console.log(`   🖼️ Images: ${jobData.details?.images_extracted || 0}`);
              
              if (jobData.details?.results?.[0]?.document_id) {
                const docId = jobData.details.results[0].document_id;
                console.log(`   🆔 Document ID: ${docId}`);
                
                // Test database retrieval
                try {
                  const chunksResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${docId}/chunks`);
                  if (chunksResponse.ok) {
                    const chunksData = await chunksResponse.json();
                    const chunkCount = chunksData.data?.length || chunksData.chunks?.length || 0;
                    console.log(`   📚 DB Chunks: ${chunkCount}`);
                    
                    if (chunkCount > 0) {
                      console.log(`   🎉 CHUNKS IN DATABASE!`);
                    }
                  }
                } catch (e) {
                  console.log(`   ❌ Chunk test failed: ${e.message}`);
                }
                
                try {
                  const imagesResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${docId}/images`);
                  if (imagesResponse.ok) {
                    const imagesData = await imagesResponse.json();
                    const imageCount = imagesData.data?.length || imagesData.images?.length || 0;
                    console.log(`   🖼️ DB Images: ${imageCount}`);
                    
                    if (imageCount > 0) {
                      console.log(`   🎉 IMAGES IN DATABASE!`);
                    }
                  }
                } catch (e) {
                  console.log(`   ❌ Image test failed: ${e.message}`);
                }
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

checkAllJobs();

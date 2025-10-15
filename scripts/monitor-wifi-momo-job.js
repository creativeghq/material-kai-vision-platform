#!/usr/bin/env node

/**
 * Monitor WIFI MOMO PDF Processing Job
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const JOB_ID = 'bulk_20251015_041844'; // Current job

async function monitorWifiMomoJob() {
  console.log('🔍 Monitoring WIFI MOMO PDF Processing Job');
  console.log('==================================================\n');
  console.log(`🆔 Job ID: ${JOB_ID}`);

  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max
  let jobCompleted = false;
  let documentId = null;

  while (attempts < maxAttempts && !jobCompleted) {
    attempts++;
    
    try {
      // Check both status and progress
      const [statusResponse, progressResponse] = await Promise.all([
        fetch(`${MIVAA_BASE_URL}/api/jobs/${JOB_ID}/status`),
        fetch(`${MIVAA_BASE_URL}/api/jobs/${JOB_ID}/progress`)
      ]);

      console.log(`\n⏱️ Check ${attempts}/${maxAttempts} (${new Date().toLocaleTimeString()})`);
      console.log('--------------------------------------------------');

      // Process status response
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        const jobData = statusData.data || statusData;
        
        console.log(`📊 Status: ${jobData.status}`);
        console.log(`📈 Progress: ${jobData.progress_percentage || 0}%`);
        console.log(`📝 Current Step: ${jobData.current_step || 'Unknown'}`);
        
        if (jobData.details) {
          console.log(`📄 Processed: ${jobData.details.processed_count || 0}`);
          console.log(`❌ Failed: ${jobData.details.failed_count || 0}`);
          console.log(`📄 Chunks: ${jobData.details.chunks_created || 0}`);
          console.log(`🖼️ Images: ${jobData.details.images_extracted || 0}`);
        }
        
        // Check if completed
        if (jobData.status === 'completed') {
          jobCompleted = true;
          documentId = jobData.result?.document_id;
          
          console.log(`\n🎉 JOB COMPLETED SUCCESSFULLY!`);
          console.log(`🆔 Document ID: ${documentId}`);
          
          if (jobData.details) {
            console.log(`\n📊 FINAL RESULTS:`);
            console.log(`   📄 Total Chunks: ${jobData.details.chunks_created || 0}`);
            console.log(`   🖼️ Total Images: ${jobData.details.images_extracted || 0}`);
            console.log(`   📄 Processed: ${jobData.details.processed_count || 0}`);
            console.log(`   ❌ Failed: ${jobData.details.failed_count || 0}`);
            
            if (jobData.details.results) {
              console.log(`\n📋 PROCESSING RESULTS:`);
              jobData.details.results.forEach((result, index) => {
                console.log(`   Result ${index + 1}: ${result.status}`);
                if (result.error) {
                  console.log(`     ❌ Error: ${result.error.substring(0, 100)}...`);
                }
                if (result.document_id) {
                  console.log(`     🆔 Document ID: ${result.document_id}`);
                  documentId = result.document_id; // Use this if available
                }
              });
            }
          }
          break;
        } else if (jobData.status === 'failed') {
          console.log(`\n❌ JOB FAILED!`);
          if (jobData.error_message) {
            console.log(`Error: ${jobData.error_message}`);
          }
          break;
        }
      } else {
        console.log(`❌ Status check failed: ${statusResponse.status}`);
      }

      // Process progress response
      if (progressResponse.ok) {
        const progressData = await progressResponse.json();
        
        console.log(`📊 Stage: ${progressData.current_stage}`);
        console.log(`📄 Pages: ${progressData.pages_completed}/${progressData.total_pages}`);
        console.log(`📊 DB Records: ${progressData.database_records_created}`);
        console.log(`🧠 KB Entries: ${progressData.knowledge_base_entries}`);
        console.log(`🖼️ Images Stored: ${progressData.images_stored}`);
        
        if (progressData.errors && progressData.errors.length > 0) {
          console.log(`❌ Errors: ${progressData.errors.length}`);
          progressData.errors.forEach((error, index) => {
            console.log(`   ${index + 1}. ${error.title}: ${error.message.substring(0, 80)}...`);
          });
        }
      } else {
        console.log(`❌ Progress check failed: ${progressResponse.status}`);
      }

      // Wait before next check
      if (!jobCompleted) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      }

    } catch (error) {
      console.log(`❌ Check failed: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  if (!jobCompleted) {
    console.log('\n⏰ Monitoring timeout - job still running');
  }

  // If we have a document ID, test data retrieval
  if (documentId) {
    console.log('\n📋 TESTING DATA RETRIEVAL');
    console.log('==================================================');
    
    try {
      // Test document content
      const contentResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${documentId}/content`);
      if (contentResponse.ok) {
        const contentData = await contentResponse.json();
        console.log(`✅ Document content: ${(contentData.content || '').length} characters`);
      } else {
        console.log(`❌ Document content failed: ${contentResponse.status}`);
      }

      // Test chunks
      const chunksResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${documentId}/chunks`);
      if (chunksResponse.ok) {
        const chunksData = await chunksResponse.json();
        console.log(`✅ Document chunks: ${chunksData.chunks?.length || 0} chunks`);
      } else {
        console.log(`❌ Document chunks failed: ${chunksResponse.status}`);
      }

      // Test images
      const imagesResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${documentId}/images`);
      if (imagesResponse.ok) {
        const imagesData = await imagesResponse.json();
        console.log(`✅ Document images: ${imagesData.images?.length || 0} images`);
      } else {
        console.log(`❌ Document images failed: ${imagesResponse.status}`);
      }

    } catch (error) {
      console.log(`❌ Data retrieval test failed: ${error.message}`);
    }
  }

  console.log('\n🎯 MONITORING COMPLETE');
  console.log('==================================================');
  console.log(`📊 Total Checks: ${attempts}`);
  console.log(`✅ Job Completed: ${jobCompleted ? 'YES' : 'NO'}`);
  console.log(`🆔 Document ID: ${documentId || 'None'}`);
}

monitorWifiMomoJob().catch(console.error);

#!/usr/bin/env node

/**
 * Long-term monitoring of WIFI MOMO PDF processing job
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const JOB_ID = 'bulk_20251015_055236'; // Current active job

async function monitorWifiMomoLongTerm() {
  console.log('🎯 LONG-TERM WIFI MOMO PDF MONITORING');
  console.log('==================================================');
  console.log(`🆔 Job ID: ${JOB_ID}`);
  console.log(`⏰ Started: ${new Date().toISOString()}`);
  console.log('📄 Expected: 62 pages to process');
  console.log('🔄 Will monitor until completion or 20 minutes timeout\n');

  let attempts = 0;
  const maxAttempts = 200; // 20 minutes (6 seconds * 200 = 1200 seconds = 20 minutes)
  let jobCompleted = false;
  let lastProgress = -1;
  let lastStep = '';
  let documentId = null;
  
  while (attempts < maxAttempts && !jobCompleted) {
    attempts++;
    
    // Wait before checking
    await new Promise(resolve => setTimeout(resolve, 6000)); // Wait 6 seconds
    
    try {
      const statusResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/${JOB_ID}/status`);
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        const jobData = statusData.data || statusData;
        
        // Only log if progress changed or step changed
        if (jobData.progress_percentage !== lastProgress || jobData.current_step !== lastStep) {
          const timeElapsed = Math.round((attempts * 6) / 60 * 10) / 10; // Minutes with 1 decimal
          
          console.log(`\n⏱️ Check ${attempts}/${maxAttempts} (${timeElapsed}min elapsed):`);
          console.log(`   📊 Status: ${jobData.status}`);
          console.log(`   📈 Progress: ${Math.round(jobData.progress_percentage * 100) / 100 || 0}%`);
          console.log(`   📝 Step: ${jobData.current_step || 'Unknown'}`);
          
          if (jobData.details) {
            console.log(`   📄 Processed: ${jobData.details.processed_count || 0}`);
            console.log(`   ❌ Failed: ${jobData.details.failed_count || 0}`);
            console.log(`   📄 Chunks: ${jobData.details.chunks_created || 0}`);
            console.log(`   🖼️ Images: ${jobData.details.images_extracted || 0}`);
            
            // Highlight improvements
            if (jobData.details.chunks_created > 0) {
              console.log(`   🎉 CHUNKS DETECTED! ${jobData.details.chunks_created} chunks created`);
            }
            if (jobData.details.images_extracted > 0) {
              console.log(`   🎉 IMAGES DETECTED! ${jobData.details.images_extracted} images extracted`);
            }
          }
          
          lastProgress = jobData.progress_percentage;
          lastStep = jobData.current_step;
        }
        
        // Check if completed
        if (jobData.status === 'completed') {
          jobCompleted = true;
          
          console.log(`\n🎉🎉🎉 JOB COMPLETED SUCCESSFULLY! 🎉🎉🎉`);
          console.log(`⏰ Total time: ${Math.round((attempts * 6) / 60 * 10) / 10} minutes`);
          console.log(`📊 Final Status: ${jobData.status}`);
          console.log(`📈 Final Progress: ${jobData.progress_percentage}%`);
          
          if (jobData.details) {
            console.log(`\n📊 FINAL PROCESSING RESULTS:`);
            console.log(`   📄 Documents Processed: ${jobData.details.processed_count || 0}`);
            console.log(`   ❌ Documents Failed: ${jobData.details.failed_count || 0}`);
            console.log(`   📄 Total Chunks Created: ${jobData.details.chunks_created || 0}`);
            console.log(`   🖼️ Total Images Extracted: ${jobData.details.images_extracted || 0}`);
            
            // Success analysis
            const chunksCreated = jobData.details.chunks_created || 0;
            const imagesExtracted = jobData.details.images_extracted || 0;
            
            if (chunksCreated > 0 && imagesExtracted > 0) {
              console.log(`\n🎉 COMPLETE SUCCESS! Both chunks and images were generated!`);
              console.log(`✅ RAG pipeline should now work`);
              console.log(`✅ Search functionality should return results`);
              console.log(`✅ Material intelligence platform is functional`);
            } else if (chunksCreated > 0) {
              console.log(`\n⚠️ PARTIAL SUCCESS: Chunks generated but no images`);
              console.log(`✅ Text search will work`);
              console.log(`❌ Image-based search may not work`);
            } else if (imagesExtracted > 0) {
              console.log(`\n⚠️ PARTIAL SUCCESS: Images extracted but no chunks`);
              console.log(`❌ Text search may not work`);
              console.log(`✅ Image processing is working`);
            } else {
              console.log(`\n❌ PROCESSING FAILURE: No chunks or images generated`);
              console.log(`❌ RAG pipeline will not work`);
              console.log(`❌ Search functionality will not work`);
            }
            
            if (jobData.details.results && jobData.details.results.length > 0) {
              const result = jobData.details.results[0];
              console.log(`\n📋 DOCUMENT DETAILS:`);
              console.log(`   📊 Status: ${result.status}`);
              
              if (result.document_id) {
                documentId = result.document_id;
                console.log(`   🆔 Document ID: ${documentId}`);
              }
              
              if (result.error) {
                console.log(`   ❌ Error: ${result.error.substring(0, 200)}...`);
              }
            }
          }
          
          break;
        } else if (jobData.status === 'failed') {
          console.log(`\n❌ JOB FAILED!`);
          console.log(`⏰ Failed after: ${Math.round((attempts * 6) / 60 * 10) / 10} minutes`);
          if (jobData.error_message) {
            console.log(`Error: ${jobData.error_message}`);
          }
          break;
        }
        
      } else {
        console.log(`   ❌ Status check failed: ${statusResponse.status}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Check error: ${error.message}`);
    }
    
    // Progress indicator every 10 checks
    if (attempts % 10 === 0) {
      console.log(`\n⏳ Still monitoring... (${attempts}/${maxAttempts} checks, ${Math.round((attempts * 6) / 60 * 10) / 10}min elapsed)`);
    }
  }
  
  if (!jobCompleted) {
    console.log('\n⏰ MONITORING TIMEOUT REACHED (20 minutes)');
    console.log('📊 Job may still be processing - check manually');
    
    // One final status check
    try {
      const finalResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/${JOB_ID}/status`);
      if (finalResponse.ok) {
        const finalData = await finalResponse.json();
        const finalJobData = finalData.data || finalData;
        
        console.log(`\n📊 FINAL STATUS CHECK:`);
        console.log(`   Status: ${finalJobData.status}`);
        console.log(`   Progress: ${Math.round(finalJobData.progress_percentage * 100) / 100 || 0}%`);
        console.log(`   Step: ${finalJobData.current_step || 'Unknown'}`);
        
        if (finalJobData.details) {
          console.log(`   Chunks: ${finalJobData.details.chunks_created || 0}`);
          console.log(`   Images: ${finalJobData.details.images_extracted || 0}`);
        }
      }
    } catch (error) {
      console.log(`❌ Final check failed: ${error.message}`);
    }
  }

  // Test database retrieval if we have a document ID
  if (documentId) {
    console.log('\n📋 TESTING DATABASE STORAGE');
    console.log('--------------------------------------------------');
    
    // Test chunks
    try {
      const chunksResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${documentId}/chunks`);
      if (chunksResponse.ok) {
        const chunksData = await chunksResponse.json();
        const chunkCount = chunksData.data?.length || chunksData.chunks?.length || 0;
        console.log(`✅ Database Chunks: ${chunkCount} chunks stored`);
        
        if (chunkCount > 0) {
          console.log(`🎉 CHUNKS SUCCESSFULLY STORED IN DATABASE!`);
          const firstChunk = chunksData.data?.[0] || chunksData.chunks?.[0];
          if (firstChunk) {
            const content = firstChunk.content || firstChunk.text || '';
            console.log(`📄 First chunk: ${content.substring(0, 80)}...`);
          }
        }
      } else {
        console.log(`❌ Chunks retrieval failed: ${chunksResponse.status}`);
      }
    } catch (error) {
      console.log(`❌ Chunks test failed: ${error.message}`);
    }

    // Test images
    try {
      const imagesResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${documentId}/images`);
      if (imagesResponse.ok) {
        const imagesData = await imagesResponse.json();
        const imageCount = imagesData.data?.length || imagesData.images?.length || 0;
        console.log(`✅ Database Images: ${imageCount} images stored`);
        
        if (imageCount > 0) {
          console.log(`🎉 IMAGES SUCCESSFULLY STORED IN DATABASE!`);
        }
      } else {
        console.log(`❌ Images retrieval failed: ${imagesResponse.status}`);
      }
    } catch (error) {
      console.log(`❌ Images test failed: ${error.message}`);
    }
  }

  console.log('\n🎯 MONITORING COMPLETE');
  console.log('==================================================');
  console.log(`📊 Job Completed: ${jobCompleted ? 'YES' : 'TIMEOUT'}`);
  console.log(`🆔 Document Created: ${documentId ? 'YES' : 'NO'}`);
  console.log(`⏰ Total Monitoring Time: ${Math.round((attempts * 6) / 60 * 10) / 10} minutes`);
  
  if (jobCompleted && documentId) {
    console.log('\n🎉 SUCCESS! WIFI MOMO PDF processing completed with fixes applied!');
  } else {
    console.log('\n⚠️ Check job status manually or extend monitoring time');
  }
}

monitorWifiMomoLongTerm().catch(console.error);

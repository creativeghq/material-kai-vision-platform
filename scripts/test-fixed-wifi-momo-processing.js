#!/usr/bin/env node

/**
 * Test WIFI MOMO PDF processing with the critical fixes applied
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const WIFI_MOMO_PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/WIFI%20MOMO%20lookbook%2001s.pdf';

async function testFixedWifiMomoProcessing() {
  console.log('🎯 TESTING FIXED WIFI MOMO PDF PROCESSING');
  console.log('==================================================\n');

  let jobId = null;
  let documentId = null;

  try {
    // Step 1: Submit new WIFI MOMO PDF processing job
    console.log('📋 STEP 1: Submitting New WIFI MOMO PDF Job (Post-Fix)');
    console.log('--------------------------------------------------');
    
    const submitResponse = await fetch(`${MIVAA_BASE_URL}/api/bulk/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        urls: [WIFI_MOMO_PDF_URL],
        processing_options: {
          extract_images: true,
          extract_tables: true,
          chunk_text: true,
          generate_embeddings: true
        }
      })
    });

    console.log(`📊 Submit Status: ${submitResponse.status} ${submitResponse.statusText}`);
    
    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      console.log(`❌ Submit failed: ${errorText}`);
      return;
    }

    const submitData = await submitResponse.json();
    jobId = submitData.data?.job_id;
    
    console.log(`✅ PDF submitted successfully`);
    console.log(`🆔 Job ID: ${jobId}`);
    console.log(`📄 PDF: WIFI MOMO lookbook (9.65 MB)`);
    console.log(`📊 Total Documents: ${submitData.data?.total_documents}`);
    console.log(`⏰ Estimated Completion: ${submitData.data?.estimated_completion_time}`);

    if (!jobId) {
      console.log('❌ No job ID returned');
      return;
    }

    // Step 2: Monitor job progress with detailed logging
    console.log('\n📋 STEP 2: Monitoring Job Progress (Looking for Chunks & Images)');
    console.log('--------------------------------------------------');
    
    let attempts = 0;
    const maxAttempts = 30; // 3 minutes max
    let jobCompleted = false;
    let lastProgress = -1;
    
    while (attempts < maxAttempts && !jobCompleted) {
      attempts++;
      
      // Wait before checking
      await new Promise(resolve => setTimeout(resolve, 6000)); // Wait 6 seconds
      
      try {
        const statusResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/${jobId}/status`);
        
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const jobData = statusData.data || statusData;
          
          // Only log if progress changed
          if (jobData.progress_percentage !== lastProgress) {
            console.log(`\n⏱️ Check ${attempts}/${maxAttempts}:`);
            console.log(`   📊 Status: ${jobData.status}`);
            console.log(`   📈 Progress: ${jobData.progress_percentage || 0}%`);
            console.log(`   📝 Step: ${jobData.current_step || 'Unknown'}`);
            
            if (jobData.details) {
              console.log(`   📄 Processed: ${jobData.details.processed_count || 0}`);
              console.log(`   ❌ Failed: ${jobData.details.failed_count || 0}`);
              console.log(`   📄 Chunks: ${jobData.details.chunks_created || 0}`);
              console.log(`   🖼️ Images: ${jobData.details.images_extracted || 0}`);
              
              // Check for improvement in chunks/images
              if (jobData.details.chunks_created > 0) {
                console.log(`   🎉 CHUNKS DETECTED! ${jobData.details.chunks_created} chunks created`);
              }
              if (jobData.details.images_extracted > 0) {
                console.log(`   🎉 IMAGES DETECTED! ${jobData.details.images_extracted} images extracted`);
              }
            }
            
            lastProgress = jobData.progress_percentage;
          }
          
          // Check if completed
          if (jobData.status === 'completed') {
            jobCompleted = true;
            
            console.log(`\n🎉 JOB COMPLETED!`);
            console.log(`📊 Final Status: ${jobData.status}`);
            console.log(`📈 Final Progress: ${jobData.progress_percentage}%`);
            
            if (jobData.details) {
              console.log(`\n📊 FINAL RESULTS:`);
              console.log(`   📄 Documents Processed: ${jobData.details.processed_count || 0}`);
              console.log(`   ❌ Documents Failed: ${jobData.details.failed_count || 0}`);
              console.log(`   📄 Total Chunks Created: ${jobData.details.chunks_created || 0}`);
              console.log(`   🖼️ Total Images Extracted: ${jobData.details.images_extracted || 0}`);
              
              // Analyze results
              if (jobData.details.chunks_created > 0 && jobData.details.images_extracted > 0) {
                console.log(`\n🎉 SUCCESS! Both chunks and images were generated!`);
              } else if (jobData.details.chunks_created > 0) {
                console.log(`\n⚠️ PARTIAL SUCCESS: Chunks generated but no images`);
              } else if (jobData.details.images_extracted > 0) {
                console.log(`\n⚠️ PARTIAL SUCCESS: Images extracted but no chunks`);
              } else {
                console.log(`\n❌ FAILURE: No chunks or images generated`);
              }
              
              if (jobData.details.results && jobData.details.results.length > 0) {
                const result = jobData.details.results[0];
                console.log(`\n📋 FIRST RESULT DETAILS:`);
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
    }
    
    if (!jobCompleted) {
      console.log('\n⏰ Monitoring timeout - checking final status...');
      
      // One final check
      try {
        const finalResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/${jobId}/status`);
        if (finalResponse.ok) {
          const finalData = await finalResponse.json();
          const finalJobData = finalData.data || finalData;
          
          console.log(`📊 Final Status: ${finalJobData.status}`);
          console.log(`📈 Final Progress: ${finalJobData.progress_percentage || 0}%`);
          
          if (finalJobData.details) {
            console.log(`📄 Final Chunks: ${finalJobData.details.chunks_created || 0}`);
            console.log(`🖼️ Final Images: ${finalJobData.details.images_extracted || 0}`);
          }
        }
      } catch (error) {
        console.log(`❌ Final check failed: ${error.message}`);
      }
    }

    // Step 3: Test database retrieval if we have a document ID
    if (documentId) {
      console.log('\n📋 STEP 3: Testing Database Retrieval');
      console.log('--------------------------------------------------');
      
      // Test document chunks
      try {
        const chunksResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${documentId}/chunks`);
        if (chunksResponse.ok) {
          const chunksData = await chunksResponse.json();
          const chunkCount = chunksData.data?.length || chunksData.chunks?.length || 0;
          console.log(`✅ Database Chunks: ${chunkCount} chunks retrieved`);
          
          if (chunkCount > 0) {
            console.log(`🎉 CHUNKS SUCCESSFULLY STORED IN DATABASE!`);
            
            // Show first chunk preview
            const firstChunk = chunksData.data?.[0] || chunksData.chunks?.[0];
            if (firstChunk) {
              const content = firstChunk.content || firstChunk.text || '';
              console.log(`📄 First chunk preview: ${content.substring(0, 100)}...`);
            }
          } else {
            console.log(`❌ No chunks found in database`);
          }
        } else {
          console.log(`❌ Chunks retrieval failed: ${chunksResponse.status}`);
        }
      } catch (error) {
        console.log(`❌ Chunks test failed: ${error.message}`);
      }

      // Test document images
      try {
        const imagesResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${documentId}/images`);
        if (imagesResponse.ok) {
          const imagesData = await imagesResponse.json();
          const imageCount = imagesData.data?.length || imagesData.images?.length || 0;
          console.log(`✅ Database Images: ${imageCount} images retrieved`);
          
          if (imageCount > 0) {
            console.log(`🎉 IMAGES SUCCESSFULLY STORED IN DATABASE!`);
            
            // Show first image info
            const firstImage = imagesData.data?.[0] || imagesData.images?.[0];
            if (firstImage) {
              console.log(`🖼️ First image: ${firstImage.image_url || firstImage.url || 'No URL'}`);
            }
          } else {
            console.log(`❌ No images found in database`);
          }
        } else {
          console.log(`❌ Images retrieval failed: ${imagesResponse.status}`);
        }
      } catch (error) {
        console.log(`❌ Images test failed: ${error.message}`);
      }
    }

    console.log('\n🎯 FINAL TEST RESULTS');
    console.log('==================================================');
    console.log(`✅ PDF Submission: SUCCESS`);
    console.log(`✅ Job Monitoring: SUCCESS`);
    console.log(`📊 Job Completed: ${jobCompleted ? 'YES' : 'TIMEOUT'}`);
    console.log(`🆔 Document Created: ${documentId ? 'YES' : 'NO'}`);
    console.log(`📄 Database Testing: ${documentId ? 'COMPLETED' : 'SKIPPED'}`);
    
    if (jobCompleted && documentId) {
      console.log('\n🎉 WIFI MOMO PDF PROCESSING TEST COMPLETED!');
      console.log('✅ Check the results above to see if chunks and images were generated');
      console.log('✅ If chunks > 0 and images > 0, the critical fixes worked!');
    } else {
      console.log('\n⚠️ Test incomplete - manual verification needed');
    }

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
  }
}

testFixedWifiMomoProcessing().catch(console.error);

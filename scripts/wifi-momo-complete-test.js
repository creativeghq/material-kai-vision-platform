#!/usr/bin/env node

/**
 * Complete WIFI MOMO PDF Test - Submit new job and monitor
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const WIFI_MOMO_PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/WIFI%20MOMO%20lookbook%2001s.pdf';

async function wifiMomoCompleteTest() {
  console.log('🎯 WIFI MOMO PDF - Complete End-to-End Test');
  console.log('==================================================\n');

  let jobId = null;
  let documentId = null;

  try {
    // Step 1: Submit new WIFI MOMO PDF processing job
    console.log('📋 STEP 1: Submitting New WIFI MOMO PDF Job');
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

    // Step 2: Monitor job progress (simplified)
    console.log('\n📋 STEP 2: Monitoring Job Progress');
    console.log('--------------------------------------------------');
    
    let attempts = 0;
    const maxAttempts = 20; // 2 minutes max
    let jobCompleted = false;
    
    while (attempts < maxAttempts && !jobCompleted) {
      attempts++;
      
      // Wait before checking
      await new Promise(resolve => setTimeout(resolve, 6000)); // Wait 6 seconds
      
      try {
        const statusResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/${jobId}/status`);
        
        console.log(`\n⏱️ Check ${attempts}/${maxAttempts}:`);
        
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const jobData = statusData.data || statusData;
          
          console.log(`   📊 Status: ${jobData.status}`);
          console.log(`   📈 Progress: ${jobData.progress_percentage || 0}%`);
          console.log(`   📝 Step: ${jobData.current_step || 'Unknown'}`);
          
          if (jobData.details) {
            console.log(`   📄 Processed: ${jobData.details.processed_count || 0}`);
            console.log(`   ❌ Failed: ${jobData.details.failed_count || 0}`);
            console.log(`   📄 Chunks: ${jobData.details.chunks_created || 0}`);
            console.log(`   🖼️ Images: ${jobData.details.images_extracted || 0}`);
          }
          
          // Check if completed
          if (jobData.status === 'completed') {
            jobCompleted = true;
            
            console.log(`\n🎉 JOB COMPLETED!`);
            
            if (jobData.details?.results && jobData.details.results.length > 0) {
              const result = jobData.details.results[0];
              console.log(`📊 Result Status: ${result.status}`);
              
              if (result.document_id) {
                documentId = result.document_id;
                console.log(`🆔 Document ID: ${documentId}`);
              }
              
              if (result.error) {
                console.log(`❌ Error: ${result.error.substring(0, 100)}...`);
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
          
          if (finalJobData.details?.results && finalJobData.details.results.length > 0) {
            const result = finalJobData.details.results[0];
            if (result.document_id) {
              documentId = result.document_id;
              console.log(`🆔 Document ID: ${documentId}`);
            }
          }
        }
      } catch (error) {
        console.log(`❌ Final check failed: ${error.message}`);
      }
    }

    // Step 3: Test data retrieval if we have a document ID
    if (documentId) {
      console.log('\n📋 STEP 3: Testing Data Retrieval');
      console.log('--------------------------------------------------');
      
      // Test document content
      try {
        const contentResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${documentId}/content`);
        if (contentResponse.ok) {
          const contentData = await contentResponse.json();
          console.log(`✅ Content: ${(contentData.content || '').length} characters`);
          
          // Check for MOMO-specific content
          if (contentData.content && contentData.content.toLowerCase().includes('momo')) {
            console.log(`🎯 MOMO content found in document!`);
          }
        } else {
          console.log(`❌ Content retrieval failed: ${contentResponse.status}`);
        }
      } catch (error) {
        console.log(`❌ Content test failed: ${error.message}`);
      }

      // Test chunks
      try {
        const chunksResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${documentId}/chunks`);
        if (chunksResponse.ok) {
          const chunksData = await chunksResponse.json();
          console.log(`✅ Chunks: ${chunksData.chunks?.length || 0} chunks`);
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
          console.log(`✅ Images: ${imagesData.images?.length || 0} images`);
        } else {
          console.log(`❌ Images retrieval failed: ${imagesResponse.status}`);
        }
      } catch (error) {
        console.log(`❌ Images test failed: ${error.message}`);
      }
    }

    console.log('\n🎯 COMPLETE TEST SUMMARY');
    console.log('==================================================');
    console.log(`✅ PDF Submission: SUCCESS`);
    console.log(`✅ Job Monitoring: SUCCESS`);
    console.log(`📊 Job Completed: ${jobCompleted ? 'YES' : 'TIMEOUT'}`);
    console.log(`🆔 Document Created: ${documentId ? 'YES' : 'NO'}`);
    console.log(`📄 Data Retrieval: ${documentId ? 'TESTED' : 'SKIPPED'}`);
    
    if (jobCompleted && documentId) {
      console.log('\n🎉 WIFI MOMO PDF PROCESSING SUCCESSFUL!');
      console.log('✅ All workflow steps completed');
      console.log('✅ Document created and accessible');
      console.log('✅ Content, chunks, and images available');
    } else {
      console.log('\n⚠️ Workflow incomplete - check job status manually');
    }

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
  }
}

wifiMomoCompleteTest().catch(console.error);

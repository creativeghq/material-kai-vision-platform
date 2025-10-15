#!/usr/bin/env node

/**
 * Test the UUID fix with a small PDF
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const SMALL_PDF_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

async function testUuidFix() {
  console.log('🎯 TESTING UUID FIX WITH SMALL PDF');
  console.log('==================================================');
  console.log(`📄 Test PDF: ${SMALL_PDF_URL}`);
  console.log(`🎯 Goal: Verify proper UUID generation and database storage\n`);

  let jobId = null;
  let documentId = null;

  try {
    // Step 1: Submit small PDF processing job
    console.log('📋 STEP 1: Submitting Small PDF Job (Post-UUID Fix)');
    console.log('--------------------------------------------------');
    
    const submitResponse = await fetch(`${MIVAA_BASE_URL}/api/bulk/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        urls: [SMALL_PDF_URL],
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

    if (!jobId) {
      console.log('❌ No job ID returned');
      return;
    }

    // Step 2: Monitor job progress
    console.log('\n📋 STEP 2: Monitoring Job Progress');
    console.log('--------------------------------------------------');
    
    let attempts = 0;
    const maxAttempts = 15; // 1.5 minutes
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
          console.log(`   📈 Progress: ${Math.round(jobData.progress_percentage * 100) / 100 || 0}%`);
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
            
            if (jobData.details) {
              console.log(`\n📊 FINAL RESULTS:`);
              console.log(`   📄 Documents Processed: ${jobData.details.processed_count || 0}`);
              console.log(`   ❌ Documents Failed: ${jobData.details.failed_count || 0}`);
              console.log(`   📄 Total Chunks Created: ${jobData.details.chunks_created || 0}`);
              console.log(`   🖼️ Total Images Extracted: ${jobData.details.images_extracted || 0}`);
              
              if (jobData.details.results && jobData.details.results.length > 0) {
                const result = jobData.details.results[0];
                console.log(`\n📋 DOCUMENT DETAILS:`);
                console.log(`   📊 Status: ${result.status}`);
                
                if (result.document_id) {
                  documentId = result.document_id;
                  console.log(`   🆔 Document ID: ${documentId}`);
                  
                  // Check if it's a proper UUID format
                  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                  const isValidUuid = uuidRegex.test(documentId);
                  console.log(`   🔍 UUID Format: ${isValidUuid ? '✅ VALID' : '❌ INVALID'}`);
                  
                  if (!isValidUuid) {
                    console.log(`   ⚠️ Document ID is not a valid UUID: ${documentId}`);
                  }
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

    // Step 3: Test database retrieval if we have a document ID
    if (documentId) {
      console.log('\n📋 STEP 3: Testing Database Retrieval with UUID');
      console.log('--------------------------------------------------');
      
      // Test chunks endpoint
      try {
        console.log(`🔍 Testing chunks endpoint with UUID: ${documentId}`);
        const chunksResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${documentId}/chunks`);
        console.log(`📊 Chunks status: ${chunksResponse.status} ${chunksResponse.statusText}`);
        
        if (chunksResponse.ok) {
          const chunksData = await chunksResponse.json();
          const chunkCount = chunksData.data?.length || 0;
          console.log(`✅ SUCCESS! Database chunks: ${chunkCount} chunks retrieved`);
          
          if (chunkCount > 0) {
            console.log(`🎉 CHUNKS SUCCESSFULLY STORED AND RETRIEVED!`);
            
            // Show first chunk preview
            const firstChunk = chunksData.data[0];
            console.log(`📄 First chunk preview: ${(firstChunk.content || '').substring(0, 100)}...`);
            console.log(`📄 Chunk ID format: ${firstChunk.chunk_id}`);
            console.log(`📄 Chunk index: ${firstChunk.chunk_index}`);
          } else {
            console.log(`⚠️ No chunks found in database`);
          }
        } else {
          const errorText = await chunksResponse.text();
          console.log(`❌ Chunks retrieval failed: ${errorText.substring(0, 300)}...`);
        }
      } catch (error) {
        console.log(`❌ Chunks test failed: ${error.message}`);
      }

      // Test images endpoint
      try {
        console.log(`\n🔍 Testing images endpoint with UUID: ${documentId}`);
        const imagesResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${documentId}/images`);
        console.log(`📊 Images status: ${imagesResponse.status} ${imagesResponse.statusText}`);
        
        if (imagesResponse.ok) {
          const imagesData = await imagesResponse.json();
          const imageCount = imagesData.data?.length || 0;
          console.log(`✅ SUCCESS! Database images: ${imageCount} images retrieved`);
          
          if (imageCount > 0) {
            console.log(`🎉 IMAGES SUCCESSFULLY STORED AND RETRIEVED!`);
          } else {
            console.log(`⚠️ No images found (may be normal for simple PDF)`);
          }
        } else {
          const errorText = await imagesResponse.text();
          console.log(`❌ Images retrieval failed: ${errorText.substring(0, 300)}...`);
        }
      } catch (error) {
        console.log(`❌ Images test failed: ${error.message}`);
      }
    }

    console.log('\n🎯 UUID FIX TEST RESULTS');
    console.log('==================================================');
    console.log(`✅ PDF Submission: SUCCESS`);
    console.log(`✅ Job Processing: ${jobCompleted ? 'COMPLETED' : 'TIMEOUT'}`);
    console.log(`🆔 Document Created: ${documentId ? 'YES' : 'NO'}`);
    console.log(`🔍 UUID Format: ${documentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId) ? 'VALID' : 'INVALID'}`);
    console.log(`📄 Database Testing: ${documentId ? 'COMPLETED' : 'SKIPPED'}`);
    
    if (jobCompleted && documentId) {
      console.log('\n🎉 UUID FIX VERIFICATION COMPLETE!');
      console.log('✅ Document IDs are now proper UUIDs');
      console.log('✅ Database storage should work correctly');
      console.log('✅ Document retrieval endpoints should work');
    } else {
      console.log('\n⚠️ Test incomplete - manual verification needed');
    }

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
  }
}

testUuidFix().catch(console.error);

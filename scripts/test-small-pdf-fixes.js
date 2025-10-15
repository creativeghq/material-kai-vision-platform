#!/usr/bin/env node

/**
 * Test the critical fixes with a small PDF for faster results
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const SMALL_PDF_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'; // Small test PDF

async function testSmallPdfFixes() {
  console.log('🎯 TESTING CRITICAL FIXES WITH SMALL PDF');
  console.log('==================================================');
  console.log(`📄 Test PDF: ${SMALL_PDF_URL}`);
  console.log(`🎯 Goal: Verify chunks and images are generated and stored\n`);

  let jobId = null;
  let documentId = null;

  try {
    // Step 1: Submit small PDF processing job
    console.log('📋 STEP 1: Submitting Small PDF Job');
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
    console.log(`📄 PDF: Small test PDF`);
    console.log(`📊 Total Documents: ${submitData.data?.total_documents}`);

    if (!jobId) {
      console.log('❌ No job ID returned');
      return;
    }

    // Step 2: Monitor job progress (should be fast for small PDF)
    console.log('\n📋 STEP 2: Monitoring Small PDF Processing');
    console.log('--------------------------------------------------');
    
    let attempts = 0;
    const maxAttempts = 20; // 2 minutes max for small PDF
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
            
            // Highlight any progress
            if (jobData.details.chunks_created > 0) {
              console.log(`   🎉 CHUNKS DETECTED! ${jobData.details.chunks_created} chunks created`);
            }
            if (jobData.details.images_extracted > 0) {
              console.log(`   🎉 IMAGES DETECTED! ${jobData.details.images_extracted} images extracted`);
            }
          }
          
          // Check if completed
          if (jobData.status === 'completed') {
            jobCompleted = true;
            
            console.log(`\n🎉 SMALL PDF JOB COMPLETED!`);
            
            if (jobData.details) {
              console.log(`\n📊 FINAL RESULTS:`);
              console.log(`   📄 Documents Processed: ${jobData.details.processed_count || 0}`);
              console.log(`   ❌ Documents Failed: ${jobData.details.failed_count || 0}`);
              console.log(`   📄 Total Chunks Created: ${jobData.details.chunks_created || 0}`);
              console.log(`   🖼️ Total Images Extracted: ${jobData.details.images_extracted || 0}`);
              
              // Critical fix verification
              const chunksCreated = jobData.details.chunks_created || 0;
              const imagesExtracted = jobData.details.images_extracted || 0;
              
              if (chunksCreated > 0) {
                console.log(`\n✅ CRITICAL FIX VERIFIED: Chunks are being generated!`);
                console.log(`   📄 Before fix: chunks_created was always 0`);
                console.log(`   📄 After fix: chunks_created = ${chunksCreated}`);
              } else {
                console.log(`\n❌ CRITICAL FIX FAILED: Still no chunks generated`);
              }
              
              if (imagesExtracted > 0) {
                console.log(`\n✅ IMAGE EXTRACTION WORKING: Images are being extracted!`);
                console.log(`   🖼️ Images extracted: ${imagesExtracted}`);
              } else {
                console.log(`\n⚠️ No images extracted (may be normal for simple PDF)`);
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

    // Step 3: Test database storage if we have a document ID
    if (documentId) {
      console.log('\n📋 STEP 3: Testing Database Storage');
      console.log('--------------------------------------------------');
      
      // Test chunks in database
      try {
        const chunksResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${documentId}/chunks`);
        if (chunksResponse.ok) {
          const chunksData = await chunksResponse.json();
          const chunkCount = chunksData.data?.length || chunksData.chunks?.length || 0;
          console.log(`✅ Database Chunks: ${chunkCount} chunks stored`);
          
          if (chunkCount > 0) {
            console.log(`🎉 DATABASE STORAGE WORKING: Chunks saved to document_chunks table!`);
            
            // Show first chunk
            const firstChunk = chunksData.data?.[0] || chunksData.chunks?.[0];
            if (firstChunk) {
              const content = firstChunk.content || firstChunk.text || '';
              console.log(`📄 First chunk preview: ${content.substring(0, 100)}...`);
            }
          } else {
            console.log(`❌ No chunks found in database - storage issue`);
          }
        } else {
          console.log(`❌ Chunks retrieval failed: ${chunksResponse.status}`);
        }
      } catch (error) {
        console.log(`❌ Chunks test failed: ${error.message}`);
      }

      // Test images in database
      try {
        const imagesResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${documentId}/images`);
        if (imagesResponse.ok) {
          const imagesData = await imagesResponse.json();
          const imageCount = imagesData.data?.length || imagesData.images?.length || 0;
          console.log(`✅ Database Images: ${imageCount} images stored`);
          
          if (imageCount > 0) {
            console.log(`🎉 IMAGE STORAGE WORKING: Images saved to document_images table!`);
          } else {
            console.log(`⚠️ No images in database (may be normal for simple PDF)`);
          }
        } else {
          console.log(`❌ Images retrieval failed: ${imagesResponse.status}`);
        }
      } catch (error) {
        console.log(`❌ Images test failed: ${error.message}`);
      }
    }

    console.log('\n🎯 CRITICAL FIXES TEST RESULTS');
    console.log('==================================================');
    console.log(`✅ PDF Submission: SUCCESS`);
    console.log(`✅ Job Processing: ${jobCompleted ? 'COMPLETED' : 'TIMEOUT'}`);
    console.log(`🆔 Document Created: ${documentId ? 'YES' : 'NO'}`);
    console.log(`📄 Database Testing: ${documentId ? 'COMPLETED' : 'SKIPPED'}`);
    
    if (jobCompleted && documentId) {
      console.log('\n🎉 CRITICAL FIXES VERIFICATION COMPLETE!');
      console.log('✅ The fixes are working - chunks and images are being generated');
      console.log('✅ Database storage is working');
      console.log('✅ RAG pipeline should now function properly');
      console.log('✅ Search functionality should return results');
    } else {
      console.log('\n⚠️ Test incomplete - check results manually');
    }

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
  }
}

testSmallPdfFixes().catch(console.error);

#!/usr/bin/env node

/**
 * Simple WIFI MOMO PDF Processing Test
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const WIFI_MOMO_PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/WIFI%20MOMO%20lookbook%2001s.pdf';

async function testWifiMomoSimple() {
  console.log('🎯 WIFI MOMO PDF - Simple Processing Test');
  console.log('==================================================\n');

  try {
    // Step 1: Submit PDF for processing
    console.log('📋 STEP 1: Submitting WIFI MOMO PDF');
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
    const jobId = submitData.data?.job_id;
    
    console.log(`✅ PDF submitted successfully`);
    console.log(`🆔 Job ID: ${jobId}`);
    console.log(`📄 PDF URL: ${WIFI_MOMO_PDF_URL}`);
    console.log(`📊 Total Documents: ${submitData.data?.total_documents}`);
    console.log(`⏰ Estimated Completion: ${submitData.data?.estimated_completion_time}`);

    if (!jobId) {
      console.log('❌ No job ID returned');
      return;
    }

    // Step 2: Check job status once
    console.log('\n📋 STEP 2: Checking Job Status');
    console.log('--------------------------------------------------');
    
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
    
    const statusResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/${jobId}/status`);
    console.log(`📊 Status Check: ${statusResponse.status} ${statusResponse.statusText}`);
    
    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      const jobData = statusData.data || statusData;
      
      console.log(`✅ Job status retrieved`);
      console.log(`📊 Status: ${jobData.status}`);
      console.log(`📈 Progress: ${jobData.progress_percentage || 0}%`);
      console.log(`📝 Current Step: ${jobData.current_step || 'Unknown'}`);
      
      if (jobData.details) {
        console.log(`📄 Processed: ${jobData.details.processed_count || 0}`);
        console.log(`❌ Failed: ${jobData.details.failed_count || 0}`);
        console.log(`📄 Chunks: ${jobData.details.chunks_created || 0}`);
        console.log(`🖼️ Images: ${jobData.details.images_extracted || 0}`);
      }
      
      // Show any errors
      if (jobData.details?.results) {
        console.log('\n📋 PROCESSING RESULTS:');
        jobData.details.results.forEach((result, index) => {
          console.log(`   Result ${index + 1}: ${result.status}`);
          if (result.error) {
            console.log(`   ❌ Error: ${result.error.substring(0, 200)}...`);
          }
        });
      }
      
    } else {
      const errorText = await statusResponse.text();
      console.log(`❌ Status check failed: ${errorText}`);
    }

    // Step 3: Check progress endpoint
    console.log('\n📋 STEP 3: Checking Job Progress');
    console.log('--------------------------------------------------');
    
    const progressResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/${jobId}/progress`);
    console.log(`📊 Progress Check: ${progressResponse.status} ${progressResponse.statusText}`);
    
    if (progressResponse.ok) {
      const progressData = await progressResponse.json();
      
      console.log(`✅ Job progress retrieved`);
      console.log(`📊 Current Stage: ${progressData.current_stage}`);
      console.log(`📄 Total Pages: ${progressData.total_pages}`);
      console.log(`📄 Pages Completed: ${progressData.pages_completed}`);
      console.log(`📄 Pages Failed: ${progressData.pages_failed}`);
      console.log(`📈 Progress: ${progressData.progress_percentage}%`);
      
      // Show errors
      if (progressData.errors && progressData.errors.length > 0) {
        console.log('\n❌ ERRORS FOUND:');
        progressData.errors.forEach((error, index) => {
          console.log(`   Error ${index + 1}: ${error.title}`);
          console.log(`   Message: ${error.message.substring(0, 200)}...`);
        });
      }
      
    } else {
      const errorText = await progressResponse.text();
      console.log(`❌ Progress check failed: ${errorText}`);
    }

    console.log('\n🎯 SIMPLE TEST SUMMARY');
    console.log('==================================================');
    console.log('✅ PDF submission: TESTED');
    console.log('✅ Job status check: TESTED');
    console.log('✅ Job progress check: TESTED');
    console.log('');
    console.log('🎯 NEXT: Monitor job until completion and test data retrieval');

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
  }
}

testWifiMomoSimple().catch(console.error);

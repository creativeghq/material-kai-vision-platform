#!/usr/bin/env node

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const SMALL_PDF_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

async function testUuidFixV2() {
  console.log('🎯 TESTING UUID FIX V2 - QUICK TEST');
  console.log('==================================================');
  
  try {
    // Submit new job
    console.log('📋 Submitting new PDF job...');
    const submitResponse = await fetch(`${MIVAA_BASE_URL}/api/bulk/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: [SMALL_PDF_URL],
        processing_options: { extract_images: true }
      })
    });

    if (!submitResponse.ok) {
      console.log(`❌ Submit failed: ${submitResponse.status}`);
      return;
    }

    const submitData = await submitResponse.json();
    const jobId = submitData.data?.job_id;
    console.log(`✅ Job submitted: ${jobId}`);

    // Wait for completion
    console.log('\n⏱️ Waiting for job completion...');
    let attempts = 0;
    let documentId = null;
    
    while (attempts < 10) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 6000));
      
      try {
        const statusResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/${jobId}/status`);
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const jobData = statusData.data || statusData;
          
          console.log(`   Check ${attempts}: ${jobData.status} (${Math.round(jobData.progress_percentage || 0)}%)`);
          
          if (jobData.status === 'completed') {
            console.log(`🎉 Job completed!`);
            
            if (jobData.details?.results?.[0]?.document_id) {
              documentId = jobData.details.results[0].document_id;
              console.log(`🆔 Document ID: ${documentId}`);
              
              // Check UUID format
              const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
              const isValidUuid = uuidRegex.test(documentId);
              console.log(`🔍 UUID Format: ${isValidUuid ? '✅ VALID' : '❌ INVALID'}`);
              
              if (isValidUuid) {
                console.log('\n🎉 SUCCESS! UUID FIX IS WORKING!');
                
                // Quick test of database retrieval
                console.log('\n📋 Testing database retrieval...');
                const chunksResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${documentId}/chunks`);
                console.log(`📄 Chunks endpoint: ${chunksResponse.status}`);
                
                if (chunksResponse.ok) {
                  const chunksData = await chunksResponse.json();
                  console.log(`✅ Database retrieval works! Found ${chunksData.data?.length || 0} chunks`);
                } else {
                  const errorText = await chunksResponse.text();
                  console.log(`❌ Database error: ${errorText.substring(0, 100)}...`);
                }
              } else {
                console.log('\n❌ UUID fix not working yet - deployment may still be in progress');
              }
            }
            break;
          } else if (jobData.status === 'failed') {
            console.log(`❌ Job failed`);
            break;
          }
        }
      } catch (e) {
        console.log(`   ❌ Check error: ${e.message}`);
      }
    }
    
  } catch (error) {
    console.log(`❌ Test error: ${error.message}`);
  }
}

testUuidFixV2();

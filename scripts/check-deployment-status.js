#!/usr/bin/env node

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function checkDeploymentStatus() {
  console.log('🔍 CHECKING DEPLOYMENT STATUS');
  console.log('==================================================');
  
  try {
    // Check if the service is responding
    console.log('📋 Step 1: Testing service availability...');
    const healthResponse = await fetch(`${MIVAA_BASE_URL}/health`);
    console.log(`📊 Health endpoint: ${healthResponse.status} ${healthResponse.statusText}`);
    
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log(`✅ Service is running`);
      console.log(`📊 Health data:`, healthData);
    }
    
    // Check jobs endpoint
    console.log('\n📋 Step 2: Testing jobs endpoint...');
    const jobsResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs`);
    console.log(`📊 Jobs endpoint: ${jobsResponse.status} ${jobsResponse.statusText}`);
    
    if (jobsResponse.ok) {
      const jobsData = await jobsResponse.json();
      console.log(`✅ Jobs endpoint working`);
      console.log(`📊 Recent jobs: ${jobsData.jobs?.length || 0}`);
      
      // Show most recent job
      if (jobsData.jobs && jobsData.jobs.length > 0) {
        const recentJob = jobsData.jobs[0];
        console.log(`📄 Most recent job: ${recentJob.job_id}`);
        console.log(`📊 Status: ${recentJob.status}`);
        console.log(`📅 Created: ${recentJob.created_at}`);
      }
    }
    
    // Test a simple processing request to see current behavior
    console.log('\n📋 Step 3: Testing current document ID generation...');
    console.log('(This will help us see if the UUID fix is deployed)');
    
    const testResponse = await fetch(`${MIVAA_BASE_URL}/api/bulk/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: ['https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'],
        processing_options: { extract_images: false }
      })
    });
    
    console.log(`📊 Test submit: ${testResponse.status} ${testResponse.statusText}`);
    
    if (testResponse.ok) {
      const testData = await testResponse.json();
      const jobId = testData.data?.job_id;
      console.log(`✅ Test job submitted: ${jobId}`);
      
      // Wait a moment and check the job
      console.log('\n⏱️ Waiting 10 seconds then checking job...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      const statusResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/${jobId}/status`);
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        const jobData = statusData.data || statusData;
        
        console.log(`📊 Job status: ${jobData.status}`);
        console.log(`📈 Progress: ${Math.round(jobData.progress_percentage || 0)}%`);
        
        if (jobData.details?.results?.[0]?.document_id) {
          const docId = jobData.details.results[0].document_id;
          console.log(`🆔 Document ID generated: ${docId}`);
          
          // Check format
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const isValidUuid = uuidRegex.test(docId);
          const isOldFormat = docId.startsWith('doc_') && docId.includes('_');
          
          console.log(`🔍 Format analysis:`);
          console.log(`   UUID format: ${isValidUuid ? '✅ YES' : '❌ NO'}`);
          console.log(`   Old format: ${isOldFormat ? '❌ YES' : '✅ NO'}`);
          
          if (isValidUuid) {
            console.log('\n🎉 UUID FIX IS DEPLOYED AND WORKING!');
          } else if (isOldFormat) {
            console.log('\n❌ UUID fix not deployed yet - still using old format');
          } else {
            console.log('\n❓ Unknown document ID format');
          }
        } else {
          console.log('⚠️ No document ID found in job results yet');
        }
      }
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

checkDeploymentStatus();

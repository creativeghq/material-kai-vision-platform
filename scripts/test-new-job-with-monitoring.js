#!/usr/bin/env node

/**
 * Submit a new job and monitor it carefully to see what's happening
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function testNewJobWithMonitoring() {
  console.log('🔍 Testing New Job with Careful Monitoring');
  console.log('==================================================\n');

  // Submit a new job
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
  const jobId = `bulk_${timestamp}`;
  
  console.log('📤 Step 1: Submitting new PDF for processing...');
  
  const submitData = {
    urls: ['https://www.adobe.com/support/products/enterprise/knowledgecenter/media/c4611_sample_explain.pdf'],
    options: {
      extract_images: true,
      extract_text: true,
      chunk_size: 1000,
      overlap: 200
    }
  };

  try {
    const submitResponse = await fetch(`${MIVAA_BASE_URL}/api/bulk/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(submitData)
    });

    if (!submitResponse.ok) {
      console.log(`   ❌ Job submission failed: ${submitResponse.status}`);
      const errorText = await submitResponse.text();
      console.log(`   📄 Error details: ${errorText}`);
      return;
    }

    const submitResult = await submitResponse.json();
    console.log(`   ✅ Job submitted: ${submitResult.job_id}`);
    console.log(`   📊 Submit response:`, JSON.stringify(submitResult, null, 2));

    const actualJobId = submitResult.job_id;

    // Monitor the job for a short time
    console.log('\n⏳ Step 2: Monitoring job progress...');
    
    for (let i = 0; i < 10; i++) {
      console.log(`   🔍 Check ${i + 1}/10...`);
      
      // Check job statistics
      try {
        const statsResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/statistics`);
        if (statsResponse.ok) {
          const stats = await statsResponse.json();
          console.log(`   📊 Total jobs: ${stats.data.total_jobs}, Completed: ${stats.data.completed_jobs}, Active: ${stats.data.active_jobs}`);
        }
      } catch (error) {
        console.log(`   ⚠️ Stats check failed: ${error.message}`);
      }

      // Wait 3 seconds between checks
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log('\n📊 Step 3: Final status check...');
    
    // Final statistics check
    try {
      const finalStatsResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/statistics`);
      if (finalStatsResponse.ok) {
        const finalStats = await finalStatsResponse.json();
        console.log('   ✅ Final statistics:', JSON.stringify(finalStats.data, null, 2));
      }
    } catch (error) {
      console.log(`   ❌ Final stats error: ${error.message}`);
    }

    console.log('\n🗄️ Step 4: Check database for new data...');
    
    // Check if any data was saved to database
    try {
      const dbCheckResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents`);
      if (dbCheckResponse.ok) {
        const dbData = await dbCheckResponse.json();
        console.log('   ✅ Database check successful');
        console.log(`   📄 Documents in database: ${dbData.documents?.length || 0}`);
      } else {
        console.log(`   ❌ Database check failed: ${dbCheckResponse.status}`);
        const errorText = await dbCheckResponse.text();
        console.log(`   📄 Error: ${errorText}`);
      }
    } catch (error) {
      console.log(`   ❌ Database check error: ${error.message}`);
    }

  } catch (error) {
    console.log(`   ❌ Job submission error: ${error.message}`);
  }

  console.log('\n🎯 New Job Test Summary');
  console.log('==================================================');
  console.log('💡 This test monitors a new job from start to finish');
  console.log('💡 to see exactly what happens during processing');
}

testNewJobWithMonitoring().catch(console.error);

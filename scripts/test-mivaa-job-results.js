#!/usr/bin/env node

/**
 * Test MIVAA Job Results Extraction
 * Check what actual data we can get from completed MIVAA jobs
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

async function testMivaaJobResults() {
  console.log('🔍 Testing MIVAA Job Results Extraction...\n');

  // Step 1: Create a job and wait for completion
  console.log('📦 Step 1: Creating a bulk processing job...');
  
  let jobId = null;
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'bulk_process',
        payload: {
          urls: ['https://www.adobe.com/support/products/enterprise/knowledgecenter/media/c4611_sample_explain.pdf'],
          batch_size: 1,
          processing_options: {
            extract_text: true,
            extract_images: true,
            extract_tables: true,
          }
        }
      })
    });

    const data = await response.json();
    
    if (response.ok && data.data && data.data.job_id) {
      jobId = data.data.job_id;
      console.log(`   ✅ Job created: ${jobId}`);
    } else {
      console.log('   ❌ Failed to create job');
      return;
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return;
  }

  // Step 2: Wait for completion
  console.log('\n⏳ Step 2: Waiting for job completion...');
  
  let completed = false;
  let attempts = 0;
  const maxAttempts = 24; // 2 minutes max
  let finalJobData = null;
  
  while (!completed && attempts < maxAttempts) {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_job_status',
          payload: { job_id: jobId }
        })
      });

      const data = await response.json();
      
      if (response.ok && data.data) {
        const status = data.data.status;
        const progress = data.data.progress_percentage || 0;
        
        console.log(`   📊 Attempt ${attempts + 1}: Status=${status}, Progress=${progress}%`);
        
        if (status === 'completed') {
          completed = true;
          finalJobData = data.data;
          console.log('   ✅ Job completed!');
          break;
        } else if (status === 'failed' || status === 'error') {
          console.log(`   ❌ Job failed: ${data.data.error_message || 'Unknown error'}`);
          return;
        }
        
      } else {
        console.log(`   ❌ Status check failed: ${data.message || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error checking status: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    attempts++;
  }
  
  if (!completed) {
    console.log('   ⏰ Timeout waiting for completion');
    return;
  }

  // Step 3: Analyze the completed job data
  console.log('\n📋 Step 3: Analyzing completed job data...');
  
  console.log('   📊 Full job data structure:');
  console.log('   Keys:', Object.keys(finalJobData));
  
  if (finalJobData.details) {
    console.log('\n   📄 Details structure:');
    console.log('   Details keys:', Object.keys(finalJobData.details));
    console.log('   Details:', JSON.stringify(finalJobData.details, null, 2));
  }
  
  if (finalJobData.parameters) {
    console.log('\n   ⚙️  Parameters structure:');
    console.log('   Parameters keys:', Object.keys(finalJobData.parameters));
    console.log('   Parameters:', JSON.stringify(finalJobData.parameters, null, 2));
  }
  
  if (finalJobData.result) {
    console.log('\n   🎯 Result structure:');
    console.log('   Result keys:', Object.keys(finalJobData.result));
    console.log('   Result:', JSON.stringify(finalJobData.result, null, 2));
  }

  // Step 4: Try to get actual content from MIVAA
  console.log('\n🔍 Step 4: Trying to get actual processed content...');
  
  // Check if there are any endpoints to get the actual chunks/images
  const testEndpoints = [
    { name: 'get_document_content', payload: { job_id: jobId } },
    { name: 'get_chunks', payload: { job_id: jobId } },
    { name: 'get_images', payload: { job_id: jobId } },
    { name: 'get_results', payload: { job_id: jobId } },
    { name: 'download_results', payload: { job_id: jobId } }
  ];
  
  for (const endpoint of testEndpoints) {
    try {
      console.log(`\n   🔍 Testing ${endpoint.name}...`);
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: endpoint.name,
          payload: endpoint.payload
        })
      });

      const data = await response.json();
      
      console.log(`      Status: ${response.status}`);
      
      if (response.ok) {
        console.log(`      ✅ ${endpoint.name} works!`);
        console.log(`      📊 Response keys:`, Object.keys(data));
        
        if (data.chunks) console.log(`      📝 Chunks: ${data.chunks.length}`);
        if (data.images) console.log(`      🖼️  Images: ${data.images.length}`);
        if (data.content) console.log(`      📄 Content available`);
        
      } else {
        console.log(`      ❌ ${endpoint.name} failed: ${data.message || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.log(`      ❌ Error: ${error.message}`);
    }
  }

  // Step 5: Check if we can extract content from the job data itself
  console.log('\n📝 Step 5: Extracting content from job data...');
  
  const details = finalJobData.details || {};
  const parameters = finalJobData.parameters || {};
  
  console.log('   📊 Available metrics:');
  console.log(`      Chunks created: ${details.chunks_created || parameters.chunks_created || 0}`);
  console.log(`      Images extracted: ${details.images_extracted || parameters.images_extracted || 0}`);
  console.log(`      Text length: ${details.text_length || parameters.text_length || 0}`);
  console.log(`      Document ID: ${details.document_id || parameters.document_id || 'N/A'}`);
  
  // Check if there are results arrays
  if (details.results) {
    console.log('\n   📄 Results in details:');
    console.log('   Results:', JSON.stringify(details.results, null, 2));
  }
  
  if (parameters.results) {
    console.log('\n   📄 Results in parameters:');
    console.log('   Results:', JSON.stringify(parameters.results, null, 2));
  }

  console.log('\n🎯 Test Complete!');
  console.log('\n📝 Summary:');
  console.log('   - Job completes successfully with metrics');
  console.log('   - Need to find how to get actual chunk content and image URLs');
  console.log('   - May need to use document_id to fetch content from MIVAA');
}

// Run the test
testMivaaJobResults().catch(console.error);

#!/usr/bin/env node

/**
 * Fresh Upload Test - Upload Harmony PDF with focused extraction
 * This will trigger all the new detailed logging
 */

const MIVAA_API = 'https://v1api.materialshub.gr';
const WORKSPACE_ID = 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e';
const PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/harmony-signature-book-24-25.pdf';

async function uploadPDF() {
  console.log('\n' + '='.repeat(100));
  console.log('🎯 FRESH UPLOAD TEST - HARMONY PDF WITH FOCUSED EXTRACTION');
  console.log('='.repeat(100));
  console.log(`PDF: ${PDF_URL}`);
  console.log(`Workspace: ${WORKSPACE_ID}`);
  console.log(`MIVAA API: ${MIVAA_API}\n`);

  try {
    // Upload PDF with focused extraction using Form data
    console.log('📤 [UPLOAD] Starting PDF upload with focused extraction...');

    const formData = new URLSearchParams();
    formData.append('file_url', PDF_URL);
    formData.append('workspace_id', WORKSPACE_ID);
    formData.append('title', 'Fresh Upload Test - Harmony');
    formData.append('processing_mode', 'standard');
    formData.append('categories', 'products');

    const uploadResponse = await fetch(`${MIVAA_API}/api/rag/documents/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}\n${errorText}`);
    }

    const result = await uploadResponse.json();
    console.log('✅ [UPLOAD] Upload initiated successfully!');
    console.log(`   Job ID: ${result.job_id}`);
    console.log(`   Document ID: ${result.document_id}`);
    console.log(`   Status: ${result.status}`);

    // Monitor job progress
    console.log('\n📊 [MONITOR] Monitoring job progress...\n');
    
    let completed = false;
    let lastStage = '';
    let iterations = 0;
    const maxIterations = 120; // 30 minutes max

    while (!completed && iterations < maxIterations) {
      await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds
      iterations++;

      const statusResponse = await fetch(`${MIVAA_API}/api/rag/documents/job/${result.job_id}`);
      if (!statusResponse.ok) {
        console.log(`⚠️  [MONITOR] Failed to get job status: ${statusResponse.status}`);
        continue;
      }

      const jobData = await statusResponse.json();
      const currentStage = jobData.current_stage || 'unknown';
      const progress = jobData.progress || 0;
      const status = jobData.status || 'unknown';

      if (currentStage !== lastStage) {
        console.log(`📝 [${new Date().toLocaleTimeString()}] Stage: ${currentStage} | Progress: ${progress}% | Status: ${status}`);
        if (jobData.metadata) {
          console.log(`   Chunks: ${jobData.metadata.chunks_created || 0} | Images: ${jobData.metadata.images_extracted || 0} | Products: ${jobData.metadata.products_created || 0}`);
        }
        lastStage = currentStage;
      }

      if (status === 'completed' || status === 'failed') {
        completed = true;
        console.log(`\n✅ [MONITOR] Job ${status}!`);
        console.log(`   Final Progress: ${progress}%`);
        console.log(`   Final Stage: ${currentStage}`);
        if (jobData.metadata) {
          console.log(`   Chunks Created: ${jobData.metadata.chunks_created || 0}`);
          console.log(`   Images Extracted: ${jobData.metadata.images_extracted || 0}`);
          console.log(`   Products Created: ${jobData.metadata.products_created || 0}`);
        }
      }
    }

    if (!completed) {
      console.log('\n⚠️  [MONITOR] Job did not complete within timeout');
    }

    return {
      job_id: result.job_id,
      document_id: result.document_id,
      completed
    };

  } catch (error) {
    console.error('❌ [ERROR] Test failed:', error.message);
    throw error;
  }
}

// Run the test
uploadPDF().catch(console.error);


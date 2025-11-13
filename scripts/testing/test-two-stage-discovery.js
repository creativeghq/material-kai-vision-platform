/**
 * Test Two-Stage Discovery System
 * 
 * This test uploads the Harmony PDF and monitors the two-stage discovery process:
 * - STAGE 0A: Index Scan (first 50-100 pages to find product locations)
 * - STAGE 0B: Focused Extraction (extract specific pages per product)
 */

import fetch from 'node-fetch';
import FormData from 'form-data';

const MIVAA_API = 'https://v1api.materialshub.gr';
const HARMONY_PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/harmony-signature-book-24-25.pdf';
const WORKSPACE_ID = 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e';

function log(message, level = 'info') {
  const emoji = { info: '📝', success: '✅', error: '❌', warning: '⚠️' }[level] || '📝';
  console.log(`${emoji} ${message}`);
}

async function testTwoStageDiscovery() {
  console.log('\n' + '='.repeat(100));
  console.log('🎯 TWO-STAGE DISCOVERY TEST');
  console.log('='.repeat(100));
  console.log(`PDF: ${HARMONY_PDF_URL}`);
  console.log(`API: ${MIVAA_API}\n`);

  try {
    // Step 1: Download PDF
    log('Downloading Harmony PDF...', 'info');
    const pdfResponse = await fetch(HARMONY_PDF_URL);
    const pdfBuffer = await pdfResponse.arrayBuffer();
    log(`Downloaded ${pdfBuffer.byteLength} bytes`, 'success');

    // Step 2: Upload with async processing
    log('Uploading PDF with Two-Stage Discovery enabled...', 'info');
    
    const formData = new FormData();
    formData.append('file', Buffer.from(pdfBuffer), {
      filename: 'harmony-test-two-stage.pdf',
      contentType: 'application/pdf'
    });
    formData.append('title', 'Harmony PDF - Two-Stage Discovery Test');
    formData.append('description', 'Testing new two-stage discovery system');
    formData.append('categories', 'products');
    formData.append('processing_mode', 'deep');
    formData.append('discovery_model', 'claude');
    formData.append('chunk_size', '1024');
    formData.append('chunk_overlap', '128');
    formData.append('enable_prompt_enhancement', 'true');
    formData.append('workspace_id', WORKSPACE_ID);

    const uploadResponse = await fetch(`${MIVAA_API}/api/rag/documents/upload`, {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    const uploadResult = await uploadResponse.json();
    const jobId = uploadResult.job_id;
    const documentId = uploadResult.document_id;

    log(`Job ID: ${jobId}`, 'success');
    log(`Document ID: ${documentId}`, 'success');

    // Step 3: Monitor job progress
    log('\nMonitoring job progress (checking every 5 seconds)...', 'info');
    
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;

      const statusResponse = await fetch(`${MIVAA_API}/api/rag/documents/job/${jobId}`);
      const status = await statusResponse.json();

      console.log(`\n[${attempts}] Status: ${status.status} | Progress: ${status.progress}%`);
      
      if (status.current_stage) {
        console.log(`    Stage: ${status.current_stage}`);
      }
      
      if (status.products_created !== undefined) {
        console.log(`    Products: ${status.products_created}`);
      }

      if (status.status === 'completed') {
        log('\n✅ Job completed successfully!', 'success');
        console.log('\nFinal Results:');
        console.log(`  Products Created: ${status.products_created || 0}`);
        console.log(`  Chunks Created: ${status.chunks_created || 0}`);
        console.log(`  Images Extracted: ${status.images_extracted || 0}`);
        break;
      } else if (status.status === 'failed') {
        log(`\n❌ Job failed: ${status.error}`, 'error');
        break;
      }
    }

    if (attempts >= maxAttempts) {
      log('\n⚠️ Timeout: Job did not complete within 10 minutes', 'warning');
    }

  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

// Run test
testTwoStageDiscovery();


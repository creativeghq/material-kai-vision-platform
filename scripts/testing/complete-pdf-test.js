/**
 * Complete end-to-end PDF processing test
 * 1. Upload PDF
 * 2. Poll for completion
 * 3. Verify database storage
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkwNjAzMSwiZXhwIjoyMDY3NDgyMDMxfQ.KCfP909Qttvs3jr4t1pTYMjACVz2-C-Ga4Xm_ZyecwM';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const TEST_PDF_URL = 'https://www.harmonyfloors.com/wp-content/uploads/2024/08/harmony-signature-book-24-25.pdf';

async function uploadPDF() {
  console.log('\n' + '='.repeat(100));
  console.log('📤 STEP 1: UPLOADING PDF');
  console.log('='.repeat(100));

  try {
    // Download PDF
    console.log(`\n🔄 Downloading PDF from: ${TEST_PDF_URL}`);
    const pdfResponse = await fetch(TEST_PDF_URL);
    const pdfBuffer = await pdfResponse.buffer();
    console.log(`✅ Downloaded ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Prepare FormData
    const formData = new FormData();
    formData.append('file', pdfBuffer, {
      filename: 'harmony-signature-book-24-25.pdf',
      contentType: 'application/pdf'
    });
    formData.append('title', 'Harmony Signature Book 24-25');
    formData.append('description', 'Test upload for end-to-end validation');
    formData.append('category', 'flooring');

    // Upload to edge function
    console.log(`\n🔄 Uploading to Supabase edge function...`);
    const uploadResponse = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: formData
    });

    const uploadData = await uploadResponse.json();
    console.log(`\n📋 Upload response (${uploadResponse.status}):`, JSON.stringify(uploadData, null, 2));

    if (uploadResponse.status === 202 && uploadData.success && uploadData.data?.job_id) {
      console.log(`\n✅ Job started with ID: ${uploadData.data.job_id}`);
      return {
        success: true,
        jobId: uploadData.data.job_id,
        documentId: null // Will be retrieved from job status
      };
    } else {
      console.log(`\n❌ Upload failed: ${uploadData.error || 'Unknown error'}`);
      return { success: false, error: uploadData.error };
    }

  } catch (error) {
    console.error(`\n❌ Upload error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function pollJobStatus(jobId) {
  console.log('\n' + '='.repeat(100));
  console.log('⏳ STEP 2: POLLING JOB STATUS');
  console.log('='.repeat(100));

  const maxAttempts = 120; // 10 minutes
  const pollInterval = 5000; // 5 seconds

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`\n🔄 [${attempt}/${maxAttempts}] Checking job status...`);

      const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway/job-status/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });

      const data = await response.json();

      if (data.error) {
        console.log(`   ⚠️  Error: ${data.message || data.error}`);
        // Try direct MIVAA API
        const mivaaResponse = await fetch(`https://v1api.materialshub.gr/api/rag/documents/job/${jobId}`, {
          headers: {
            'Authorization': 'Bearer test'
          }
        });
        const mivaaData = await mivaaResponse.json();
        console.log(`   📋 MIVAA response:`, JSON.stringify(mivaaData, null, 2));

        if (mivaaData.status === 'completed') {
          console.log(`\n✅ Job completed successfully!`);
          return {
            success: true,
            documentId: mivaaData.document_id,
            result: mivaaData
          };
        } else if (mivaaData.status === 'failed') {
          console.log(`\n❌ Job failed: ${mivaaData.error}`);
          return { success: false, error: mivaaData.error };
        }
      } else if (data.success && data.data) {
        const status = data.data.status;
        const progress = data.data.progress || 0;

        console.log(`   📊 Status: ${status}, Progress: ${progress}%`);

        if (status === 'completed') {
          console.log(`\n✅ Job completed successfully!`);
          return {
            success: true,
            documentId: data.data.result?.document_id,
            result: data.data.result
          };
        } else if (status === 'failed') {
          console.log(`\n❌ Job failed: ${data.data.error}`);
          return { success: false, error: data.data.error };
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));

    } catch (error) {
      console.error(`   ❌ Poll error: ${error.message}`);
    }
  }

  console.log(`\n⏱️  Timeout: Job did not complete within ${maxAttempts * pollInterval / 1000} seconds`);
  return { success: false, error: 'Timeout' };
}

async function verifyDatabase(documentId) {
  console.log('\n' + '='.repeat(100));
  console.log('🔍 STEP 3: VERIFYING DATABASE STORAGE');
  console.log('='.repeat(100));

  try {
    // Check document
    console.log(`\n🔍 [1/5] Checking document record...`);
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .maybeSingle();

    if (docError || !document) {
      console.log(`   ❌ Document not found: ${docError?.message || 'No record'}`);
    } else {
      console.log(`   ✅ Document found: ${document.filename}`);
    }

    // Check chunks
    console.log(`\n🔍 [2/5] Checking document chunks...`);
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, content, chunk_index')
      .eq('document_id', documentId);

    if (chunksError) {
      console.log(`   ❌ Error: ${chunksError.message}`);
    } else {
      console.log(`   ✅ Found ${chunks.length} chunks`);
    }

    // Check embeddings
    console.log(`\n🔍 [3/5] Checking embeddings...`);
    const { data: embeddings, error: embError } = await supabase
      .from('embeddings')
      .select('id, dimensions, model_name')
      .in('chunk_id', chunks?.map(c => c.id) || []);

    if (embError) {
      console.log(`   ❌ Error: ${embError.message}`);
    } else {
      console.log(`   ✅ Found ${embeddings.length} embeddings`);
    }

    // Check images
    console.log(`\n🔍 [4/5] Checking images...`);
    const { data: images, error: imgError } = await supabase
      .from('document_images')
      .select('id, image_url, page_number')
      .eq('document_id', documentId);

    if (imgError) {
      console.log(`   ❌ Error: ${imgError.message}`);
    } else {
      console.log(`   ✅ Found ${images.length} images`);
    }

    // Check vectors
    console.log(`\n🔍 [5/5] Checking vectors...`);
    const { data: vectors, error: vecError } = await supabase
      .from('document_vectors')
      .select('id, model_name')
      .eq('document_id', documentId);

    if (vecError) {
      console.log(`   ❌ Error: ${vecError.message}`);
    } else {
      console.log(`   ✅ Found ${vectors.length} vectors`);
    }

    // Summary
    console.log(`\n${'='.repeat(100)}`);
    console.log('📊 SUMMARY');
    console.log(`${'='.repeat(100)}`);
    console.log(`Document: ${document ? '✅' : '❌'}`);
    console.log(`Chunks: ${chunks?.length || 0} ${chunks?.length > 0 ? '✅' : '❌'}`);
    console.log(`Embeddings: ${embeddings?.length || 0} ${embeddings?.length > 0 ? '✅' : '❌'}`);
    console.log(`Images: ${images?.length || 0} ${images?.length >= 0 ? '✅' : '❌'}`);
    console.log(`Vectors: ${vectors?.length || 0} ${vectors?.length > 0 ? '✅' : '❌'}`);
    console.log(`${'='.repeat(100)}\n`);

    return document && chunks?.length > 0 && embeddings?.length > 0;

  } catch (error) {
    console.error(`\n❌ Verification error: ${error.message}`);
    return false;
  }
}

async function runCompleteTest() {
  console.log('\n' + '='.repeat(100));
  console.log('🚀 COMPLETE END-TO-END PDF PROCESSING TEST');
  console.log('='.repeat(100));

  // Step 1: Upload
  const uploadResult = await uploadPDF();
  if (!uploadResult.success) {
    console.log('\n❌ TEST FAILED: Upload failed');
    process.exit(1);
  }

  // Step 2: Poll
  const pollResult = await pollJobStatus(uploadResult.jobId);
  if (!pollResult.success) {
    console.log('\n❌ TEST FAILED: Job processing failed');
    process.exit(1);
  }

  // Step 3: Verify
  const verifyResult = await verifyDatabase(pollResult.documentId);
  if (!verifyResult) {
    console.log('\n❌ TEST FAILED: Database verification failed');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(100));
  console.log('✅ ALL TESTS PASSED! PDF processing workflow is working correctly.');
  console.log('='.repeat(100) + '\n');
  process.exit(0);
}

runCompleteTest();


/**
 * Test PDF processing with a PDF that contains images
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkwNjAzMSwiZXhwIjoyMDY3NDgyMDMxfQ.KCfP909Qttvs3jr4t1pTYMjACVz2-C-Ga4Xm_ZyecwM';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Use the proper Harmony PDF with images from Supabase storage
const TEST_PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/harmony-signature-book-24-25.pdf';

async function uploadPDF() {
  console.log('\n' + '='.repeat(100));
  console.log('🚀 TESTING PDF WITH IMAGES');
  console.log('='.repeat(100));

  try {
    // Download PDF
    console.log(`\n🔄 Downloading PDF from: ${TEST_PDF_URL}`);
    const pdfResponse = await fetch(TEST_PDF_URL);
    const pdfBuffer = await pdfResponse.buffer();
    console.log(`✅ Downloaded ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Upload to edge function
    console.log('\n🔄 Uploading to Supabase edge function...');
    const formData = new FormData();
    formData.append('file', pdfBuffer, {
      filename: 'harmony-signature-book-24-25-with-images.pdf',
      contentType: 'application/pdf'
    });
    formData.append('title', 'Harmony Signature Book 24-25 - Image Test');
    formData.append('description', 'Testing image extraction and upload');

    const uploadResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/mivaa-gateway`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: formData
      }
    );

    const uploadData = await uploadResponse.json();
    console.log(`\n📋 Upload response (${uploadResponse.status}):`, JSON.stringify(uploadData, null, 2));

    if (uploadResponse.status !== 202) {
      console.log('\n❌ Upload failed - expected HTTP 202');
      return { success: false };
    }

    const jobId = uploadData.data.job_id;
    console.log(`\n✅ Job started with ID: ${jobId}`);

    return { success: true, jobId };

  } catch (error) {
    console.log(`\n❌ Upload error: ${error.message}`);
    return { success: false };
  }
}

async function pollJobStatus(jobId) {
  console.log('\n' + '='.repeat(100));
  console.log('⏳ POLLING JOB STATUS');
  console.log('='.repeat(100));

  const maxAttempts = 240; // 20 minutes (5 second intervals)
  const pollInterval = 5000;

  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/mivaa-gateway/job/${jobId}`,
        {
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          }
        }
      );

      const data = await response.json();
      
      console.log(`\n🔄 [${i}/${maxAttempts}] Status: ${data.status}, Progress: ${data.progress}%`);
      
      if (data.status === 'completed') {
        console.log('\n✅ Job completed successfully!');
        console.log('📊 Result:', JSON.stringify(data.result, null, 2));
        return { success: true, documentId: data.document_id, result: data.result };
      }

      if (data.status === 'failed') {
        console.log(`\n❌ Job failed: ${data.error}`);
        return { success: false };
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));

    } catch (error) {
      console.log(`\n⚠️  Poll error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  console.log('\n❌ Timeout waiting for job completion');
  return { success: false };
}

async function verifyImages(documentId) {
  console.log('\n' + '='.repeat(100));
  console.log('🖼️  VERIFYING IMAGE EXTRACTION');
  console.log('='.repeat(100));

  try {
    // Check images in database
    const { data: images, error } = await supabase
      .from('document_images')
      .select('id, image_url, page_number, context')
      .eq('document_id', documentId);

    if (error) {
      console.log(`\n❌ Error querying images: ${error.message}`);
      return false;
    }

    console.log(`\n✅ Found ${images?.length || 0} images in database`);
    
    if (images && images.length > 0) {
      console.log('\n📋 Image details:');
      images.forEach((img, idx) => {
        console.log(`   ${idx + 1}. Page ${img.page_number}: ${img.image_url}`);
        if (img.context) {
          console.log(`      Context: ${img.context.substring(0, 100)}...`);
        }
      });
      return true;
    } else {
      console.log('\n⚠️  No images found - this might indicate an issue with image extraction');
      return false;
    }

  } catch (error) {
    console.log(`\n❌ Verification error: ${error.message}`);
    return false;
  }
}

async function runTest() {
  console.log('\n' + '='.repeat(100));
  console.log('🚀 PDF WITH IMAGES - COMPLETE TEST');
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

  // Step 3: Verify images
  const hasImages = await verifyImages(pollResult.documentId);
  
  console.log('\n' + '='.repeat(100));
  console.log('📊 FINAL SUMMARY');
  console.log('='.repeat(100));
  console.log(`Document ID: ${pollResult.documentId}`);
  console.log(`Chunks created: ${pollResult.result.chunks_created}`);
  console.log(`Images extracted: ${hasImages ? 'YES ✅' : 'NO ❌'}`);
  console.log(`Processing time: ${pollResult.result.processing_time?.toFixed(2)}s`);
  console.log('='.repeat(100));

  if (hasImages) {
    console.log('\n✅ TEST PASSED: Images were successfully extracted and stored!');
  } else {
    console.log('\n⚠️  TEST INCOMPLETE: No images found - check MIVAA logs for errors');
  }
}

runTest().catch(error => {
  console.error('\n❌ Test failed with error:', error);
  process.exit(1);
});


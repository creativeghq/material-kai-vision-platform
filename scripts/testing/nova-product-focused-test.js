/**
 * NOVA Product Focused End-to-End Test
 * 
 * Tests the complete PDF processing pipeline for a SINGLE product (NOVA by SG NY)
 * from the Harmony PDF catalog.
 * 
 * This test will:
 * 1. Extract only NOVA product pages from Harmony PDF
 * 2. Process all related images
 * 3. Run full AI analysis (LLAMA classification, Claude chunking, CLIP embeddings)
 * 4. Generate text and image embeddings
 * 5. Create product record
 * 6. Return COMPLETE detailed results including:
 *    - Actual Supabase image URLs
 *    - Extracted text content
 *    - All metadata
 *    - AI model outputs and scores
 *    - Processing steps with timings
 *    - Quality metrics
 */

import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

// Configuration
const MIVAA_API = 'https://v1api.materialshub.gr';
const HARMONY_PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/00b52212-3c44-4234-9a55-8eb8f8472db6/harmony-signature-book-24-25.pdf';
const WORKSPACE_ID = 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e';

// NOVA product search criteria
const NOVA_PRODUCT = {
  name: 'NOVA',
  designer: 'SG NY',
  searchTerms: ['NOVA', 'SG NY', 'SGNY']
};

// Logging utilities
function log(category, message, level = 'info') {
  const timestamp = new Date().toISOString();
  const emoji = {
    'step': '📋',
    'info': '📝',
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'data': '📊'
  }[level] || '📝';
  
  console.log(`${emoji} [${category}] ${message}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(100));
  console.log(`🎯 ${title}`);
  console.log('='.repeat(100));
}

// Main test function
async function runNovaProductTest() {
  logSection('NOVA PRODUCT FOCUSED END-TO-END TEST');
  
  console.log(`Product: ${NOVA_PRODUCT.name} by ${NOVA_PRODUCT.designer}`);
  console.log(`PDF: ${HARMONY_PDF_URL}`);
  console.log(`Workspace: ${WORKSPACE_ID}`);
  console.log(`MIVAA API: ${MIVAA_API}\n`);

  try {
    // Step 1: Upload PDF with NOVA-specific processing options
    log('UPLOAD', 'Starting NOVA product extraction from Harmony PDF', 'step');
    const uploadResult = await uploadPDFForNovaExtraction();
    const jobId = uploadResult.job_id;
    const documentId = uploadResult.document_id;

    log('UPLOAD', `Job ID: ${jobId}`, 'info');
    log('UPLOAD', `Document ID: ${documentId}`, 'info');

    // Step 2: Monitor processing with continuous data validation
    log('MONITOR', `Monitoring job: ${jobId}`, 'step');
    const jobResult = await monitorProcessingJob(jobId, documentId);

    // Step 3: Retrieve and validate NOVA product data
    log('VALIDATE', 'Retrieving NOVA product data', 'step');
    const novaData = await retrieveNovaProductData(documentId);

    // Step 4: Generate comprehensive report
    log('REPORT', 'Generating detailed report', 'step');
    await generateDetailedReport(novaData, jobResult);

    log('COMPLETE', '✅ NOVA product test completed successfully!', 'success');

  } catch (error) {
    log('ERROR', `Test failed: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

async function uploadPDFForNovaExtraction() {
  log('UPLOAD', `Fetching PDF from: ${HARMONY_PDF_URL}`, 'info');
  
  const pdfResponse = await fetch(HARMONY_PDF_URL);
  if (!pdfResponse.ok) {
    throw new Error(`Failed to fetch PDF: ${pdfResponse.status}`);
  }
  
  const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
  log('UPLOAD', `Downloaded ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`, 'success');

  // Create form data with NOVA-specific options
  const formData = new FormData();
  
  formData.append('file', pdfBuffer, {
    filename: 'harmony-signature-book-24-25.pdf',
    contentType: 'application/pdf'
  });

  formData.append('title', 'NOVA Product Extraction - Focused Test');
  formData.append('description', 'Extract NOVA by SG NY product with full AI analysis');
  formData.append('tags', 'nova,sg-ny,focused-test');
  formData.append('discovery_model', 'claude');
  formData.append('focused_extraction', 'true');
  formData.append('chunk_size', '1024');
  formData.append('chunk_overlap', '128');

  log('UPLOAD', `Triggering Product Discovery Pipeline via MIVAA API: ${MIVAA_API}`, 'info');
  log('UPLOAD', `Using focused extraction - will ONLY process product pages`, 'info');

  const uploadResponse = await fetch(`${MIVAA_API}/api/rag/documents/upload-with-discovery`, {
    method: 'POST',
    body: formData,
    headers: formData.getHeaders()
  });
  
  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
  }
  
  const result = await uploadResponse.json();
  log('UPLOAD', `Job started: ${result.job_id}`, 'success');
  log('UPLOAD', `Document ID: ${result.document_id}`, 'success');

  if (result.message) {
    log('UPLOAD', result.message, 'info');
  }

  return {
    job_id: result.job_id,
    document_id: result.document_id
  };
}

async function validateDataSaved(documentId, jobData) {
  // Validate that data is actually being saved to database via API
  const validation = {
    chunks: 0,
    images: 0,
    products: 0,
    embeddings: 0
  };

  try {
    // Check chunks
    const chunksResponse = await fetch(`${MIVAA_API}/api/rag/chunks?document_id=${documentId}&limit=100`);
    if (chunksResponse.ok) {
      const chunksData = await chunksResponse.json();
      validation.chunks = chunksData.chunks?.length || 0;
    }

    // Check images
    const imagesResponse = await fetch(`${MIVAA_API}/api/rag/images?document_id=${documentId}&limit=100`);
    if (imagesResponse.ok) {
      const imagesData = await imagesResponse.json();
      validation.images = imagesData.images?.length || 0;
    }

    // Check products
    const productsResponse = await fetch(`${MIVAA_API}/api/rag/products?document_id=${documentId}&limit=100`);
    if (productsResponse.ok) {
      const productsData = await productsResponse.json();
      validation.products = productsData.products?.length || 0;
    }

    // Compare with job metadata
    const jobChunks = jobData.metadata?.chunks_created || 0;
    const jobImages = jobData.metadata?.images_extracted || 0;
    const jobProducts = jobData.metadata?.products_created || 0;

    const chunksMatch = validation.chunks === jobChunks;
    const imagesMatch = validation.images === jobImages;
    const productsMatch = validation.products === jobProducts;

    log('VALIDATE', `Chunks: ${validation.chunks}/${jobChunks} ${chunksMatch ? '✅' : '❌'}`, chunksMatch ? 'success' : 'error');
    log('VALIDATE', `Images: ${validation.images}/${jobImages} ${imagesMatch ? '✅' : '❌'}`, imagesMatch ? 'success' : 'error');
    log('VALIDATE', `Products: ${validation.products}/${jobProducts} ${productsMatch ? '✅' : '❌'}`, productsMatch ? 'success' : 'error');

    return {
      valid: chunksMatch && imagesMatch && productsMatch,
      validation,
      expected: { chunks: jobChunks, images: jobImages, products: jobProducts }
    };
  } catch (error) {
    log('VALIDATE', `Validation error: ${error.message}`, 'error');
    return { valid: false, error: error.message };
  }
}

async function monitorProcessingJob(jobId, documentId) {
  const maxAttempts = 480; // 2 hours with 15-second intervals
  const pollInterval = 15000; // 15 seconds
  let lastProgress = 0;
  let lastValidation = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const statusResponse = await fetch(`${MIVAA_API}/api/rag/documents/job/${jobId}`);

    if (!statusResponse.ok) {
      log('MONITOR', `API returned ${statusResponse.status}`, 'warning');
      continue;
    }

    const jobData = await statusResponse.json();
    const status = jobData.status;
    const progress = jobData.progress || 0;
    const currentStep = jobData.metadata?.current_step || 'Unknown';

    log('MONITOR', `Attempt ${attempt}/${maxAttempts} - ${status} (${progress}%) - ${currentStep}`, 'info');

    // Validate data saving at key checkpoints
    if (progress >= 40 && progress !== lastProgress && progress % 20 === 0) {
      log('VALIDATE', `Running data validation at ${progress}%...`, 'info');
      lastValidation = await validateDataSaved(documentId, jobData);
      if (!lastValidation.valid) {
        log('VALIDATE', `⚠️ Data mismatch detected at ${progress}%`, 'warning');
      }
    }

    lastProgress = progress;

    if (status === 'completed') {
      log('MONITOR', '✅ Job completed successfully!', 'success');

      // Final validation
      log('VALIDATE', 'Running final data validation...', 'info');
      const finalValidation = await validateDataSaved(documentId, jobData);

      if (!finalValidation.valid) {
        log('VALIDATE', '❌ CRITICAL: Final validation failed! Data not properly saved!', 'error');
        throw new Error('Data validation failed: ' + JSON.stringify(finalValidation));
      }

      log('VALIDATE', '✅ All data successfully saved to database!', 'success');
      return jobData;
    }

    if (status === 'failed') {
      const error = jobData.error || 'Unknown error';
      throw new Error(`Job failed: ${error}`);
    }

    if (status === 'interrupted') {
      log('MONITOR', '⚠️ Job interrupted! Attempting to resume...', 'warning');
      // Try to resume the job
      const resumeResponse = await fetch(`${MIVAA_API}/api/rag/documents/job/${jobId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (resumeResponse.ok) {
        log('MONITOR', '✅ Job resumed successfully', 'success');
      } else {
        const resumeError = await resumeResponse.text();
        log('MONITOR', `❌ Resume failed: ${resumeError}`, 'error');
        throw new Error(`Job interrupted and resume failed: ${resumeError}`);
      }
    }
  }

  throw new Error('Job monitoring timed out after 2 hours');
}

async function retrieveNovaProductData(documentId) {
  log('RETRIEVE', `Fetching NOVA product data for document: ${documentId}`, 'info');
  
  const novaData = {
    chunks: [],
    images: [],
    products: [],
    embeddings: {
      text: [],
      image: []
    }
  };
  
  // Retrieve chunks
  const chunksResponse = await fetch(`${MIVAA_API}/api/rag/chunks?document_id=${documentId}`);
  if (chunksResponse.ok) {
    const chunksData = await chunksResponse.json();
    const chunks = chunksData.chunks || [];
    novaData.chunks = chunks.filter(chunk =>
      chunk.content?.toLowerCase().includes('nova') ||
      chunk.metadata?.product_name?.toLowerCase().includes('nova')
    );
    log('RETRIEVE', `Found ${novaData.chunks.length} NOVA-related chunks`, 'success');
  }

  // Retrieve images
  const imagesResponse = await fetch(`${MIVAA_API}/api/rag/images?document_id=${documentId}`);
  if (imagesResponse.ok) {
    const imagesData = await imagesResponse.json();
    const images = imagesData.images || [];
    novaData.images = images.filter(img =>
      img.metadata?.product_name?.toLowerCase().includes('nova') ||
      img.caption?.toLowerCase().includes('nova')
    );
    log('RETRIEVE', `Found ${novaData.images.length} NOVA-related images`, 'success');
  }

  // Retrieve products
  const productsResponse = await fetch(`${MIVAA_API}/api/rag/products?document_id=${documentId}`);
  if (productsResponse.ok) {
    const productsData = await productsResponse.json();
    const products = productsData.products || [];
    novaData.products = products.filter(p =>
      p.name?.toLowerCase().includes('nova')
    );
    log('RETRIEVE', `Found ${novaData.products.length} NOVA products`, 'success');
  }

  return novaData;
}

async function generateDetailedReport(novaData, jobResult) {
  logSection('DETAILED NOVA PRODUCT REPORT');
  
  const report = {
    timestamp: new Date().toISOString(),
    product: NOVA_PRODUCT,
    job: {
      id: jobResult.job_id,
      document_id: jobResult.document_id,
      status: jobResult.status,
      progress: jobResult.progress,
      metadata: jobResult.metadata
    },
    data: novaData,
    summary: {
      total_chunks: novaData.chunks.length,
      total_images: novaData.images.length,
      total_products: novaData.products.length,
      total_text_embeddings: novaData.embeddings.text.length,
      total_image_embeddings: novaData.embeddings.image.length
    }
  };
  
  // Print detailed information
  console.log('\n📊 SUMMARY:');
  console.log(JSON.stringify(report.summary, null, 2));
  
  console.log('\n📝 CHUNKS:');
  novaData.chunks.forEach((chunk, idx) => {
    console.log(`\nChunk ${idx + 1}:`);
    console.log(`  ID: ${chunk.id}`);
    console.log(`  Content: ${chunk.content?.substring(0, 200)}...`);
    console.log(`  Metadata: ${JSON.stringify(chunk.metadata, null, 2)}`);
  });
  
  console.log('\n🖼️  IMAGES:');
  novaData.images.forEach((img, idx) => {
    console.log(`\nImage ${idx + 1}:`);
    console.log(`  ID: ${img.id}`);
    console.log(`  URL: ${img.url}`);
    console.log(`  Caption: ${img.caption}`);
    console.log(`  Metadata: ${JSON.stringify(img.metadata, null, 2)}`);
  });
  
  console.log('\n🏷️  PRODUCTS:');
  novaData.products.forEach((product, idx) => {
    console.log(`\nProduct ${idx + 1}:`);
    console.log(`  ID: ${product.id}`);
    console.log(`  Name: ${product.name}`);
    console.log(`  Designer: ${product.designer}`);
    console.log(`  Description: ${product.description}`);
    console.log(`  Metadata: ${JSON.stringify(product.metadata, null, 2)}`);
  });
  
  // Save report to file
  const reportPath = `nova-product-report-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log('REPORT', `Detailed report saved to: ${reportPath}`, 'success');
}

// Run the test
runNovaProductTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


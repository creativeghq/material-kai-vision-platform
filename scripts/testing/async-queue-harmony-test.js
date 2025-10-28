#!/usr/bin/env node

/**
 * Comprehensive Async Queue Processing Test with Harmony PDF
 *
 * Complete end-to-end pipeline test:
 * 1. Upload Harmony PDF
 * 2. Monitor extraction stage (0-20%)
 * 3. Monitor image processing queue (20-40%)
 * 4. Monitor chunking stage (40-60%)
 * 5. Monitor AI analysis queue (60-90%)
 * 6. Monitor product creation (90-100%)
 * 7. Validate final results with detailed metrics
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const API_URL = process.env.MIVAA_API_URL || 'https://v1api.materialshub.gr';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const HARMONY_PDF_PATH = path.join(__dirname, '../../test-files/harmony-signature-book.pdf');

let testResults = {
  timestamp: new Date().toISOString(),
  documentId: null,
  metrics: {
    imagesExtracted: 0,
    chunksCreated: 0,
    productsCreated: 0,
    imageJobsQueued: 0,
    aiJobsQueued: 0,
    imageJobsCompleted: 0,
    aiJobsCompleted: 0,
  },
  tests: [],
  summary: {
    passed: 0,
    failed: 0,
    total: 0,
  },
};

async function test(name, fn) {
  testResults.summary.total++;
  try {
    console.log(`\n🧪 Testing: ${name}`);
    await fn();
    testResults.tests.push({ name, status: 'PASS', timestamp: new Date().toISOString() });
    testResults.summary.passed++;
    console.log(`✅ PASS: ${name}`);
  } catch (error) {
    testResults.tests.push({ name, status: 'FAIL', error: error.message, timestamp: new Date().toISOString() });
    testResults.summary.failed++;
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${error.message}`);
  }
}

async function uploadPDF() {
  if (!fs.existsSync(HARMONY_PDF_PATH)) {
    throw new Error(`Harmony PDF not found at ${HARMONY_PDF_PATH}`);
  }

  const fileContent = fs.readFileSync(HARMONY_PDF_PATH);
  const formData = new FormData();
  formData.append('file', new Blob([fileContent]), 'harmony-signature-book.pdf');
  formData.append('document_type', 'material_catalog');
  formData.append('catalog_name', 'Harmony Signature Book');

  const response = await fetch(`${API_URL}/documents/upload-async`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  const data = await response.json();
  testResults.documentId = data.document_id;
  console.log(`\n📄 PDF uploaded successfully`);
  console.log(`   Document ID: ${data.document_id}`);
  console.log(`   File: Harmony Signature Book`);
  return data.document_id;
}

async function getQueueMetrics(documentId) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/image_processing_queue?document_id=eq.${documentId}`, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch queue metrics: ${response.statusText}`);
  }

  return await response.json();
}

async function getProgress(documentId) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/job_progress?document_id=eq.${documentId}`, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch progress: ${response.statusText}`);
  }

  return await response.json();
}

async function processImageQueue() {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/process-image-queue`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ batchSize: 10 }),
  });

  if (!response.ok) {
    throw new Error(`Image queue processing failed: ${response.statusText}`);
  }

  return await response.json();
}

async function processAIQueue() {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/process-ai-analysis-queue`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ batchSize: 10 }),
  });

  if (!response.ok) {
    throw new Error(`AI queue processing failed: ${response.statusText}`);
  }

  return await response.json();
}

async function getDetailedMetrics(documentId) {
  try {
    // Get images
    const imagesResponse = await fetch(`${SUPABASE_URL}/rest/v1/document_images?document_id=eq.${documentId}`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
      },
    });
    const images = imagesResponse.ok ? await imagesResponse.json() : [];
    testResults.metrics.imagesExtracted = images.length;

    // Get chunks
    const chunksResponse = await fetch(`${SUPABASE_URL}/rest/v1/document_chunks?document_id=eq.${documentId}`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
      },
    });
    const chunks = chunksResponse.ok ? await chunksResponse.json() : [];
    testResults.metrics.chunksCreated = chunks.length;

    // Get products
    const productsResponse = await fetch(`${SUPABASE_URL}/rest/v1/products?document_id=eq.${documentId}`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
      },
    });
    const products = productsResponse.ok ? await productsResponse.json() : [];
    testResults.metrics.productsCreated = products.length;

    // Get image queue stats
    const imageQueueResponse = await fetch(`${SUPABASE_URL}/rest/v1/image_processing_queue?document_id=eq.${documentId}`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
      },
    });
    const imageQueue = imageQueueResponse.ok ? await imageQueueResponse.json() : [];
    testResults.metrics.imageJobsQueued = imageQueue.length;
    testResults.metrics.imageJobsCompleted = imageQueue.filter(j => j.status === 'completed').length;

    // Get AI queue stats
    const aiQueueResponse = await fetch(`${SUPABASE_URL}/rest/v1/ai_analysis_queue?document_id=eq.${documentId}`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
      },
    });
    const aiQueue = aiQueueResponse.ok ? await aiQueueResponse.json() : [];
    testResults.metrics.aiJobsQueued = aiQueue.length;
    testResults.metrics.aiJobsCompleted = aiQueue.filter(j => j.status === 'completed').length;

    return testResults.metrics;
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return testResults.metrics;
  }
}

async function waitForProgress(documentId, targetStage, maxWaitMs = 600000) {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds
  let lastProgress = 0;

  while (Date.now() - startTime < maxWaitMs) {
    const progress = await getProgress(documentId);
    const stageProgress = progress.find(p => p.stage === targetStage);
    const metrics = await getDetailedMetrics(documentId);

    if (stageProgress && stageProgress.progress >= 100) {
      console.log(`\n✅ Stage '${targetStage}' COMPLETE: 100%`);
      console.log(`   Completed: ${stageProgress.completed_items}/${stageProgress.total_items} items`);
      return stageProgress;
    }

    if (stageProgress) {
      const currentProgress = stageProgress.progress;
      if (currentProgress !== lastProgress) {
        console.log(`⏳ Stage '${targetStage}': ${currentProgress}% (${stageProgress.completed_items}/${stageProgress.total_items})`);
        lastProgress = currentProgress;
      }
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Timeout waiting for stage ${targetStage}`);
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 COMPREHENSIVE ASYNC QUEUE PROCESSING TEST - HARMONY PDF');
  console.log('='.repeat(70));

  let documentId;

  await test('STEP 1: Upload Harmony PDF', async () => {
    documentId = await uploadPDF();
    if (!documentId) throw new Error('No document ID returned');
  });

  await test('STEP 2: Wait for extraction stage (0-20%)', async () => {
    await waitForProgress(documentId, 'extraction', 120000);
    const metrics = await getDetailedMetrics(documentId);
    console.log(`   📊 Images extracted: ${metrics.imagesExtracted}`);
  });

  await test('STEP 3: Verify image processing jobs queued', async () => {
    const jobs = await getQueueMetrics(documentId);
    if (jobs.length === 0) throw new Error('No image processing jobs found');
    console.log(`   📊 Image processing jobs queued: ${jobs.length}`);
    testResults.metrics.imageJobsQueued = jobs.length;
  });

  await test('STEP 4: Process image queue (batch processing)', async () => {
    let totalProcessed = 0;
    let batchNum = 1;
    while (true) {
      const result = await processImageQueue();
      if (result.processed === 0) break;
      totalProcessed += result.processed;
      console.log(`   Batch ${batchNum}: Processed ${result.processed}, Failed: ${result.failed}`);
      batchNum++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    const metrics = await getDetailedMetrics(documentId);
    console.log(`   📊 Total image jobs completed: ${metrics.imageJobsCompleted}/${metrics.imageJobsQueued}`);
  });

  await test('STEP 5: Wait for chunking stage (40-60%)', async () => {
    await waitForProgress(documentId, 'chunking', 120000);
    const metrics = await getDetailedMetrics(documentId);
    console.log(`   📊 Chunks created: ${metrics.chunksCreated}`);
  });

  await test('STEP 6: Verify AI analysis jobs queued', async () => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_analysis_queue?document_id=eq.${documentId}`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
      },
    });
    const jobs = await response.json();
    if (jobs.length === 0) throw new Error('No AI analysis jobs found');
    console.log(`   📊 AI analysis jobs queued: ${jobs.length}`);
    testResults.metrics.aiJobsQueued = jobs.length;
  });

  await test('STEP 7: Process AI analysis queue (batch processing)', async () => {
    let totalProcessed = 0;
    let batchNum = 1;
    while (true) {
      const result = await processAIQueue();
      if (result.processed === 0) break;
      totalProcessed += result.processed;
      console.log(`   Batch ${batchNum}: Processed ${result.processed}, Failed: ${result.failed}`);
      batchNum++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    const metrics = await getDetailedMetrics(documentId);
    console.log(`   📊 Total AI jobs completed: ${metrics.aiJobsCompleted}/${metrics.aiJobsQueued}`);
  });

  await test('STEP 8: Wait for product creation stage (90-100%)', async () => {
    await waitForProgress(documentId, 'product_creation', 120000);
    const metrics = await getDetailedMetrics(documentId);
    console.log(`   📊 Products created: ${metrics.productsCreated}`);
  });

  await test('STEP 9: Verify final progress is 100%', async () => {
    const progress = await getProgress(documentId);
    const productStage = progress.find(p => p.stage === 'product_creation');
    if (!productStage || productStage.progress < 100) {
      throw new Error(`Product creation not complete: ${productStage?.progress || 0}%`);
    }
    console.log(`   ✅ All stages complete: 100%`);
  });

  // Final metrics
  const finalMetrics = await getDetailedMetrics(documentId);

  // Save results
  const reportPath = path.join(__dirname, `async-queue-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));

  console.log('\n' + '='.repeat(70));
  console.log('📊 FINAL RESULTS');
  console.log('='.repeat(70));
  console.log(`✅ Images extracted: ${finalMetrics.imagesExtracted}`);
  console.log(`✅ Chunks created: ${finalMetrics.chunksCreated}`);
  console.log(`✅ Products identified: ${finalMetrics.productsCreated}`);
  console.log(`✅ Image jobs completed: ${finalMetrics.imageJobsCompleted}/${finalMetrics.imageJobsQueued}`);
  console.log(`✅ AI jobs completed: ${finalMetrics.aiJobsCompleted}/${finalMetrics.aiJobsQueued}`);
  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total Tests: ${testResults.summary.total}`);
  console.log(`Passed: ${testResults.summary.passed} ✅`);
  console.log(`Failed: ${testResults.summary.failed} ❌`);
  console.log(`Report: ${reportPath}`);
  console.log('='.repeat(70) + '\n');

  process.exit(testResults.summary.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


#!/usr/bin/env node

/**
 * Async Queue Processing Test with Harmony PDF
 * 
 * Tests the complete async job queue pipeline:
 * 1. Upload Harmony PDF
 * 2. Monitor queue progress
 * 3. Verify image processing jobs
 * 4. Verify AI analysis jobs
 * 5. Validate final results
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
  console.log(`📄 PDF uploaded: ${data.document_id}`);
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

async function waitForProgress(documentId, targetStage, maxWaitMs = 600000) {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  while (Date.now() - startTime < maxWaitMs) {
    const progress = await getProgress(documentId);
    const stageProgress = progress.find(p => p.stage === targetStage);

    if (stageProgress && stageProgress.progress >= 100) {
      console.log(`✅ Stage ${targetStage} complete: ${stageProgress.progress}%`);
      return stageProgress;
    }

    if (stageProgress) {
      console.log(`⏳ Stage ${targetStage}: ${stageProgress.progress}% (${stageProgress.completed_items}/${stageProgress.total_items})`);
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Timeout waiting for stage ${targetStage}`);
}

async function main() {
  console.log('🚀 Starting Async Queue Processing Test with Harmony PDF\n');

  let documentId;

  await test('Upload Harmony PDF', async () => {
    documentId = await uploadPDF();
    if (!documentId) throw new Error('No document ID returned');
  });

  await test('Verify extraction stage completes', async () => {
    await waitForProgress(documentId, 'extraction', 120000);
  });

  await test('Verify image processing jobs queued', async () => {
    const jobs = await getQueueMetrics(documentId);
    if (jobs.length === 0) throw new Error('No image processing jobs found');
    console.log(`   Found ${jobs.length} image processing jobs`);
  });

  await test('Process image queue batch 1', async () => {
    const result = await processImageQueue();
    console.log(`   Processed: ${result.processed}, Failed: ${result.failed}`);
  });

  await test('Verify chunking stage completes', async () => {
    await waitForProgress(documentId, 'chunking', 120000);
  });

  await test('Verify AI analysis jobs queued', async () => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_analysis_queue?document_id=eq.${documentId}`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
      },
    });
    const jobs = await response.json();
    if (jobs.length === 0) throw new Error('No AI analysis jobs found');
    console.log(`   Found ${jobs.length} AI analysis jobs`);
  });

  await test('Process AI analysis queue batch 1', async () => {
    const result = await processAIQueue();
    console.log(`   Processed: ${result.processed}, Failed: ${result.failed}`);
  });

  await test('Verify product creation stage completes', async () => {
    await waitForProgress(documentId, 'product_creation', 120000);
  });

  await test('Verify final progress is 100%', async () => {
    const progress = await getProgress(documentId);
    const productStage = progress.find(p => p.stage === 'product_creation');
    if (!productStage || productStage.progress < 100) {
      throw new Error(`Product creation not complete: ${productStage?.progress || 0}%`);
    }
  });

  // Save results
  const reportPath = path.join(__dirname, `async-queue-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${testResults.summary.total}`);
  console.log(`Passed: ${testResults.summary.passed}`);
  console.log(`Failed: ${testResults.summary.failed}`);
  console.log(`Report: ${reportPath}`);
  console.log('='.repeat(60));

  process.exit(testResults.summary.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


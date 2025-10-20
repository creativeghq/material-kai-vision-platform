#!/usr/bin/env node

/**
 * FULL PDF PROCESSING PIPELINE TEST
 * 
 * Complete end-to-end test that:
 * 1. Triggers MIVAA PDF processing
 * 2. Waits for processing to complete
 * 3. Monitors database for results
 * 4. Reports all metrics (chunks, embeddings, images, products)
 * 5. Identifies any issues
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY);
const TEST_PDF_URL = process.env.TEST_PDF_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/harmony-signature-book-24-25.pdf';

let testResults = {
  startTime: new Date().toISOString(),
  steps: [],
  finalMetrics: null,
  issues: [],
  success: false
};

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    'info': '📋',
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'step': '🔄',
    'metric': '📊',
  }[type] || '📋';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getMetrics() {
  const { count: docs } = await supabase.from('documents').select('*', { count: 'exact', head: true });
  const { count: chunks } = await supabase.from('document_chunks').select('*', { count: 'exact', head: true });
  const { count: embeddings } = await supabase.from('document_vectors').select('*', { count: 'exact', head: true });
  const { count: images } = await supabase.from('document_images').select('*', { count: 'exact', head: true });
  const { count: products } = await supabase.from('products').select('*', { count: 'exact', head: true });

  return {
    documents: docs || 0,
    chunks: chunks || 0,
    embeddings: embeddings || 0,
    images: images || 0,
    products: products || 0,
    timestamp: new Date().toISOString()
  };
}

async function step1_VerifyPDF() {
  log('STEP 1: Verifying PDF accessibility', 'step');
  try {
    const response = await fetch(TEST_PDF_URL);
    if (!response.ok) throw new Error(`PDF not accessible: ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(2);
    log(`✅ PDF verified: ${sizeMB} MB`, 'success');
    testResults.steps.push({ step: 1, name: 'PDF Verification', status: 'success', size: sizeMB });
    return true;
  } catch (error) {
    log(`❌ PDF verification failed: ${error.message}`, 'error');
    testResults.steps.push({ step: 1, name: 'PDF Verification', status: 'error', error: error.message });
    testResults.issues.push(`PDF verification failed: ${error.message}`);
    throw error;
  }
}

async function step2_TriggerMIVAA() {
  log('STEP 2: Triggering MIVAA PDF processing', 'step');
  try {
    const gatewayUrl = `${SUPABASE_URL}/functions/v1/mivaa-gateway`;
    const payload = {
      action: 'bulk_process',
      payload: {
        urls: [TEST_PDF_URL],
        options: { extract_text: true, extract_images: true, extract_tables: true }
      }
    };

    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Gateway error: ${response.statusText}`);
    const result = await response.json();
    log(`✅ MIVAA processing triggered`, 'success');
    testResults.steps.push({ step: 2, name: 'MIVAA Trigger', status: 'success' });
    return result;
  } catch (error) {
    log(`❌ MIVAA trigger failed: ${error.message}`, 'error');
    testResults.steps.push({ step: 2, name: 'MIVAA Trigger', status: 'error', error: error.message });
    testResults.issues.push(`MIVAA trigger failed: ${error.message}`);
    throw error;
  }
}

async function step3_MonitorProcessing() {
  log('STEP 3: Monitoring PDF processing (waiting up to 180 seconds)', 'step');
  
  const maxWait = 180000; // 3 minutes
  const startTime = Date.now();
  let lastMetrics = null;
  let checkCount = 0;

  while (Date.now() - startTime < maxWait) {
    try {
      const metrics = await getMetrics();
      checkCount++;

      if (checkCount === 1 || (lastMetrics && JSON.stringify(lastMetrics) !== JSON.stringify(metrics))) {
        log(`📊 Check #${checkCount}: Docs=${metrics.documents}, Chunks=${metrics.chunks}, Embeddings=${metrics.embeddings}, Images=${metrics.images}, Products=${metrics.products}`, 'metric');
      }

      // Success conditions
      if (metrics.chunks > 0) {
        log(`✅ Chunks detected: ${metrics.chunks}`, 'success');
        
        if (metrics.embeddings > 0) {
          log(`✅ Embeddings generated: ${metrics.embeddings}`, 'success');
        } else {
          log(`⚠️  No embeddings yet (${metrics.chunks} chunks waiting)`, 'warning');
        }

        if (metrics.images > 0) {
          log(`✅ Images extracted: ${metrics.images}`, 'success');
        } else {
          log(`⚠️  No images extracted yet`, 'warning');
        }

        if (metrics.products > 0) {
          log(`✅ Products generated: ${metrics.products}`, 'success');
        }

        lastMetrics = metrics;
        await sleep(5000); // Check every 5 seconds
      } else {
        log(`⏳ Waiting for processing... (${Math.round((Date.now() - startTime) / 1000)}s)`, 'info');
        await sleep(10000); // Check every 10 seconds if nothing yet
      }
    } catch (error) {
      log(`⚠️  Error during monitoring: ${error.message}`, 'warning');
      await sleep(5000);
    }
  }

  if (lastMetrics) {
    testResults.steps.push({ step: 3, name: 'Processing Monitor', status: 'success', metrics: lastMetrics });
    testResults.finalMetrics = lastMetrics;
    return lastMetrics;
  } else {
    log(`❌ No processing detected after ${maxWait / 1000} seconds`, 'error');
    testResults.steps.push({ step: 3, name: 'Processing Monitor', status: 'error', error: 'Timeout' });
    testResults.issues.push('No processing detected - MIVAA service may not be responding');
    throw new Error('Processing timeout');
  }
}

async function step4_AnalyzeResults() {
  log('STEP 4: Analyzing results', 'step');
  
  const metrics = testResults.finalMetrics;
  if (!metrics) {
    log(`❌ No metrics available`, 'error');
    return;
  }

  log(`📊 FINAL METRICS:`, 'metric');
  log(`   Documents:  ${metrics.documents}`, 'info');
  log(`   Chunks:     ${metrics.chunks}`, 'info');
  log(`   Embeddings: ${metrics.embeddings}`, 'info');
  log(`   Images:     ${metrics.images}`, 'info');
  log(`   Products:   ${metrics.products}`, 'info');

  // Calculate rates
  if (metrics.chunks > 0) {
    const embeddingRate = ((metrics.embeddings / metrics.chunks) * 100).toFixed(1);
    log(`   Embedding Rate: ${embeddingRate}%`, 'metric');
  }

  if (metrics.documents > 0) {
    const imageRate = ((metrics.images / metrics.documents) * 100).toFixed(1);
    const productRate = ((metrics.products / metrics.documents) * 100).toFixed(1);
    log(`   Image Rate: ${imageRate}%`, 'metric');
    log(`   Product Rate: ${productRate}%`, 'metric');
  }

  // Identify issues
  if (metrics.chunks > 0 && metrics.embeddings === 0) {
    const issue = `❌ CRITICAL: ${metrics.chunks} chunks but 0 embeddings - OPENAI_API_KEY not set in MIVAA?`;
    log(issue, 'error');
    testResults.issues.push(issue);
  }

  if (metrics.documents > 0 && metrics.images === 0) {
    const issue = `❌ CRITICAL: ${metrics.documents} documents but 0 images - image extraction failing?`;
    log(issue, 'error');
    testResults.issues.push(issue);
  }

  if (metrics.chunks > 0 && metrics.embeddings > 0 && metrics.images > 0) {
    testResults.success = true;
    log(`✅ SUCCESS: All systems operational!`, 'success');
  }

  testResults.steps.push({ step: 4, name: 'Results Analysis', status: 'success' });
}

async function main() {
  console.log(`
========================================================================================================================
🚀 FULL PDF PROCESSING PIPELINE TEST
========================================================================================================================
`);

  try {
    await step1_VerifyPDF();
    console.log('');
    
    await step2_TriggerMIVAA();
    console.log('');
    
    await step3_MonitorProcessing();
    console.log('');
    
    await step4_AnalyzeResults();
    console.log('');

    // Final report
    console.log(`
========================================================================================================================
📋 TEST REPORT
========================================================================================================================
Start Time: ${testResults.startTime}
End Time:   ${new Date().toISOString()}

Steps Completed: ${testResults.steps.length}
${testResults.steps.map(s => `  ${s.step}. ${s.name}: ${s.status.toUpperCase()}`).join('\n')}

${testResults.issues.length > 0 ? `Issues Found: ${testResults.issues.length}\n${testResults.issues.map(i => `  • ${i}`).join('\n')}` : 'No issues found!'}

Overall Status: ${testResults.success ? '✅ SUCCESS' : '⚠️  INCOMPLETE'}
========================================================================================================================
`);

    process.exit(testResults.success ? 0 : 1);
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    console.log(`
========================================================================================================================
❌ TEST FAILED
========================================================================================================================
Error: ${error.message}
Issues: ${testResults.issues.join('\n')}
========================================================================================================================
`);
    process.exit(1);
  }
}

main();


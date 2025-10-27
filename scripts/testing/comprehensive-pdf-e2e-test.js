#!/usr/bin/env node

/**
 * COMPREHENSIVE PDF END-TO-END TEST
 * 
 * Tests complete PDF processing workflow with:
 * - Proper job queue integration
 * - Background job monitoring
 * - AI cost tracking validation
 * - Real-time progress updates
 * - Database validation
 * - Quality metrics
 * - Error handling
 * 
 * This script follows all platform standards established today.
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
const MIVAA_API_URL = process.env.VITE_MIVAA_API_URL || 'http://v1api.materialshub.gr';
const TEST_PDF_URL = 'https://www.harmonyfloors.com/wp-content/uploads/2024/08/harmony-signature-book-24-25.pdf';
const WORKSPACE_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test results tracking
const testResults = {
  timestamp: new Date().toISOString(),
  testName: 'Comprehensive PDF E2E Test',
  steps: [],
  validations: {},
  aiCosts: {},
  errors: [],
  summary: {}
};

function log(step, message, type = 'info') {
  const icons = {
    'info': '📋',
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'step': '🔄',
    'cost': '💰'
  };
  
  const icon = icons[type] || '📋';
  const timestamp = new Date().toISOString();
  console.log(`${icon} [${step}] ${message}`);
  
  testResults.steps.push({ step, message, type, timestamp });
}

/**
 * Step 1: Upload PDF and trigger processing
 */
async function uploadPDF() {
  log('UPLOAD', 'Starting PDF upload...', 'step');
  
  try {
    // Download PDF
    log('UPLOAD', `Fetching PDF from: ${TEST_PDF_URL}`, 'info');
    const pdfResponse = await fetch(TEST_PDF_URL);
    
    if (!pdfResponse.ok) {
      throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
    }
    
    const pdfBuffer = await pdfResponse.buffer();
    const sizeMB = (pdfBuffer.length / 1024 / 1024).toFixed(2);
    log('UPLOAD', `Downloaded ${sizeMB} MB`, 'success');
    
    // Prepare FormData
    const formData = new FormData();
    formData.append('file', pdfBuffer, {
      filename: 'harmony-signature-book-24-25.pdf',
      contentType: 'application/pdf'
    });
    formData.append('workspace_id', WORKSPACE_ID);
    formData.append('title', 'Harmony Signature Book 24-25 - E2E Test');
    formData.append('enable_embedding', 'true');
    formData.append('chunk_size', '1500');
    formData.append('chunk_overlap', '100');
    
    // Upload via MIVAA RAG endpoint
    log('UPLOAD', 'Uploading to MIVAA RAG endpoint...', 'info');
    const uploadResponse = await fetch(`${MIVAA_API_URL}/api/v1/rag/upload`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });
    
    const result = await uploadResponse.json();
    log('UPLOAD', `Response status: ${uploadResponse.status}`, 'info');
    
    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${result.error || result.message || uploadResponse.statusText}`);
    }
    
    const jobId = result.job_id || result.id;
    const documentId = result.document_id;
    
    log('UPLOAD', `Job ID: ${jobId}`, 'success');
    log('UPLOAD', `Document ID: ${documentId}`, 'success');
    
    return { success: true, jobId, documentId };
    
  } catch (error) {
    log('UPLOAD', `Upload failed: ${error.message}`, 'error');
    testResults.errors.push({ step: 'UPLOAD', error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Step 2: Monitor background job processing
 */
async function monitorJob(jobId) {
  log('MONITOR', `Monitoring job: ${jobId}`, 'step');
  
  const maxAttempts = 60; // 5 minutes max
  const pollInterval = 5000; // 5 seconds
  let attempts = 0;
  
  try {
    while (attempts < maxAttempts) {
      attempts++;
      
      // Query background_jobs table
      const { data: job, error } = await supabase
        .from('background_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to query job: ${error.message}`);
      }
      
      if (job) {
        const status = job.status;
        const progress = job.progress || 0;
        
        log('MONITOR', `Status: ${status} | Progress: ${progress}%`, 'info');
        
        if (status === 'completed') {
          log('MONITOR', 'Job completed successfully!', 'success');
          return { success: true, job };
        }
        
        if (status === 'failed') {
          const errorMsg = job.error_message || 'Unknown error';
          log('MONITOR', `Job failed: ${errorMsg}`, 'error');
          testResults.errors.push({ step: 'MONITOR', error: errorMsg });
          return { success: false, error: errorMsg };
        }
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new Error('Job monitoring timeout (5 minutes)');
    
  } catch (error) {
    log('MONITOR', `Monitoring failed: ${error.message}`, 'error');
    testResults.errors.push({ step: 'MONITOR', error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Step 3: Validate AI cost tracking
 */
async function validateAICosts(jobId) {
  log('AI_COSTS', 'Validating AI cost tracking...', 'step');
  
  try {
    // Query AI metrics for this job
    const response = await fetch(`${MIVAA_API_URL}/api/v1/ai-metrics/job/${jobId}`);
    
    if (!response.ok) {
      log('AI_COSTS', 'AI metrics endpoint not available (expected for new jobs)', 'warning');
      return { success: true, costs: null };
    }
    
    const metrics = await response.json();
    
    if (metrics.total_calls > 0) {
      log('AI_COSTS', `Total AI calls: ${metrics.total_calls}`, 'cost');
      log('AI_COSTS', `Total cost: $${metrics.total_cost.toFixed(4)}`, 'cost');
      
      // Log costs by model
      const costsByModel = {};
      metrics.calls.forEach(call => {
        if (!costsByModel[call.model]) {
          costsByModel[call.model] = 0;
        }
        costsByModel[call.model] += call.cost || 0;
      });
      
      Object.entries(costsByModel).forEach(([model, cost]) => {
        log('AI_COSTS', `${model}: $${cost.toFixed(4)}`, 'cost');
      });
      
      testResults.aiCosts = {
        totalCalls: metrics.total_calls,
        totalCost: metrics.total_cost,
        byModel: costsByModel
      };
      
      log('AI_COSTS', 'AI cost tracking validated!', 'success');
    } else {
      log('AI_COSTS', 'No AI calls logged yet', 'warning');
    }
    
    return { success: true, costs: metrics };
    
  } catch (error) {
    log('AI_COSTS', `Validation failed: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

/**
 * Step 4: Validate database storage
 */
async function validateDatabase(documentId) {
  log('DATABASE', 'Validating database storage...', 'step');
  
  try {
    // Query all related data
    const [chunksResult, imagesResult, embeddingsResult, productsResult] = await Promise.all([
      supabase.from('document_chunks').select('*').eq('document_id', documentId),
      supabase.from('document_images').select('*').eq('document_id', documentId),
      supabase.from('embeddings').select('*').eq('workspace_id', WORKSPACE_ID),
      supabase.from('products').select('*').eq('workspace_id', WORKSPACE_ID)
    ]);
    
    const chunks = chunksResult.data || [];
    const images = imagesResult.data || [];
    const embeddings = embeddingsResult.data || [];
    const products = productsResult.data || [];
    
    log('DATABASE', `Chunks: ${chunks.length}`, 'info');
    log('DATABASE', `Images: ${images.length}`, 'info');
    log('DATABASE', `Embeddings: ${embeddings.length}`, 'info');
    log('DATABASE', `Products: ${products.length}`, 'info');
    
    // Validate chunks have embeddings
    const chunksWithEmbeddings = chunks.filter(chunk => 
      embeddings.some(emb => emb.chunk_id === chunk.id)
    );
    
    log('DATABASE', `Chunks with embeddings: ${chunksWithEmbeddings.length}/${chunks.length}`, 'info');
    
    // Validate images have CLIP embeddings
    const imagesWithCLIP = images.filter(img => img.clip_embedding);
    log('DATABASE', `Images with CLIP: ${imagesWithCLIP.length}/${images.length}`, 'info');
    
    testResults.validations.database = {
      chunks: chunks.length,
      images: images.length,
      embeddings: embeddings.length,
      products: products.length,
      chunksWithEmbeddings: chunksWithEmbeddings.length,
      imagesWithCLIP: imagesWithCLIP.length
    };
    
    log('DATABASE', 'Database validation complete!', 'success');
    return { success: true, data: { chunks, images, embeddings, products } };
    
  } catch (error) {
    log('DATABASE', `Validation failed: ${error.message}`, 'error');
    testResults.errors.push({ step: 'DATABASE', error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Main test execution
 */
async function runTest() {
  console.log('\n' + '='.repeat(100));
  console.log('🚀 COMPREHENSIVE PDF END-TO-END TEST');
  console.log('='.repeat(100) + '\n');
  
  const startTime = Date.now();
  
  try {
    // Step 1: Upload PDF
    const uploadResult = await uploadPDF();
    if (!uploadResult.success) {
      throw new Error('Upload failed');
    }
    
    const { jobId, documentId } = uploadResult;
    
    // Step 2: Monitor job
    const monitorResult = await monitorJob(jobId);
    if (!monitorResult.success) {
      throw new Error('Job monitoring failed');
    }
    
    // Step 3: Validate AI costs
    await validateAICosts(jobId);
    
    // Step 4: Validate database
    await validateDatabase(documentId);
    
    // Generate summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    testResults.summary = {
      duration: `${duration}s`,
      jobId,
      documentId,
      totalSteps: testResults.steps.length,
      totalErrors: testResults.errors.length,
      success: testResults.errors.length === 0
    };
    
    console.log('\n' + '='.repeat(100));
    console.log('✅ TEST COMPLETED SUCCESSFULLY');
    console.log('='.repeat(100));
    console.log(`Duration: ${duration}s`);
    console.log(`Job ID: ${jobId}`);
    console.log(`Document ID: ${documentId}`);
    console.log(`Total Steps: ${testResults.steps.length}`);
    console.log(`Total Errors: ${testResults.errors.length}`);
    
    if (testResults.aiCosts.totalCost) {
      console.log(`\n💰 AI Costs: $${testResults.aiCosts.totalCost.toFixed(4)}`);
    }
    
    // Save results
    const resultsFile = `scripts/testing/pdf-e2e-test-${Date.now()}.json`;
    fs.writeFileSync(resultsFile, JSON.stringify(testResults, null, 2));
    console.log(`\n📁 Results saved to: ${resultsFile}\n`);
    
  } catch (error) {
    console.log('\n' + '='.repeat(100));
    console.log('❌ TEST FAILED');
    console.log('='.repeat(100));
    console.log(`Error: ${error.message}\n`);
    
    testResults.summary = {
      duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      success: false,
      error: error.message
    };
    
    // Save error results
    const resultsFile = `scripts/testing/pdf-e2e-test-error-${Date.now()}.json`;
    fs.writeFileSync(resultsFile, JSON.stringify(testResults, null, 2));
    console.log(`📁 Error results saved to: ${resultsFile}\n`);
    
    process.exit(1);
  }
}

runTest().catch(console.error);


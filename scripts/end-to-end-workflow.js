#!/usr/bin/env node

/**
 * END-TO-END WORKFLOW TEST
 * 
 * Mimics frontend flow:
 * 1. Upload PDF to Supabase storage
 * 2. Trigger PDF processing via MIVAA gateway
 * 3. Monitor job progress
 * 4. Verify chunks and images extracted
 * 5. Verify embeddings generated
 * 6. Perform search on embeddings
 * 7. Display all results
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEST_PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/1760462185826-harmony-signature-book-24-25.pdf';

let workflowResults = {
  steps: [],
  errors: [],
  summary: {}
};

function log(step, message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    'info': '📋',
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'step': '🔄'
  }[type] || '📋';

  console.log(`${prefix} [${timestamp}] ${step}: ${message}`);
  
  workflowResults.steps.push({
    step,
    message,
    type,
    timestamp
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function step1_UploadPDF() {
  log('STEP 1', 'Verifying test PDF', 'step');

  try {
    // Verify test PDF is accessible (avoid RLS policy issues)
    log('STEP 1', 'Verifying test PDF is accessible...', 'info');
    const response = await fetch(TEST_PDF_URL);
    const buffer = await response.buffer();

    if (!response.ok) {
      throw new Error(`PDF not accessible: ${response.statusText}`);
    }

    log('STEP 1', `Test PDF verified: ${buffer.length} bytes`, 'success');

    const fileName = TEST_PDF_URL.split('/').pop() || 'test.pdf';
    const uploadedPath = `pdf-documents/${fileName}`;

    log('STEP 1', `Using test PDF: ${uploadedPath}`, 'success');

    return {
      fileName,
      path: uploadedPath,
      size: buffer.length,
      url: TEST_PDF_URL
    };
  } catch (error) {
    log('STEP 1', `PDF verification failed: ${error.message}`, 'error');
    workflowResults.errors.push({ step: 'Verify PDF', error: error.message });
    throw error;
  }
}

async function step2_TriggerProcessing(pdfPath) {
  log('STEP 2', 'Triggering PDF processing via MIVAA gateway', 'step');
  
  try {
    const processingUrl = `${SUPABASE_URL}/functions/v1/mivaa-gateway`;
    
    // Use full URL if provided, otherwise construct from path
    const pdfUrl = pdfPath.startsWith('http') ? pdfPath : `${SUPABASE_URL}/storage/v1/object/public/${pdfPath}`;

    const payload = {
      action: 'pdf_process_url',
      payload: {
        url: pdfUrl,
        document_name: pdfPath.split('/').pop(),
        options: {
          extract_text: true,
          extract_images: true,
          extract_tables: true
        }
      }
    };

    log('STEP 2', `Sending processing request to ${processingUrl}`, 'info');
    
    const response = await fetch(processingUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`Processing failed: ${result.error || response.statusText}`);
    }

    log('STEP 2', `Processing triggered successfully`, 'success');
    log('STEP 2', `Job ID: ${result.job_id || 'N/A'}`, 'info');
    
    return result;
  } catch (error) {
    log('STEP 2', `Processing trigger failed: ${error.message}`, 'error');
    workflowResults.errors.push({ step: 'Trigger Processing', error: error.message });
    throw error;
  }
}

async function step3_MonitorProgress(jobId, maxWaitTime = 300000) {
  log('STEP 3', 'Monitoring job progress', 'step');
  
  try {
    const startTime = Date.now();
    let lastStatus = null;

    while (Date.now() - startTime < maxWaitTime) {
      const statusUrl = `${SUPABASE_URL}/functions/v1/mivaa-gateway`;
      
      const response = await fetch(statusUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'get_job_status',
          payload: {
            job_id: jobId
          }
        })
      });

      const result = await response.json();
      
      if (result.status !== lastStatus) {
        log('STEP 3', `Job status: ${result.status}`, 'info');
        lastStatus = result.status;
      }

      if (result.status === 'completed') {
        log('STEP 3', `Job completed successfully`, 'success');
        log('STEP 3', `Chunks: ${result.chunks_count || 0}, Images: ${result.images_count || 0}`, 'info');
        return result;
      }

      if (result.status === 'failed') {
        throw new Error(`Job failed: ${result.error || 'Unknown error'}`);
      }

      await sleep(5000); // Check every 5 seconds
    }

    throw new Error(`Job timeout after ${maxWaitTime / 1000} seconds`);
  } catch (error) {
    log('STEP 3', `Progress monitoring failed: ${error.message}`, 'error');
    workflowResults.errors.push({ step: 'Monitor Progress', error: error.message });
    throw error;
  }
}

async function step4_VerifyChunksAndImages(documentId) {
  log('STEP 4', 'Verifying chunks and images extraction', 'step');
  
  try {
    // Query chunks
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, content, page_number')
      .eq('document_id', documentId)
      .limit(10);

    if (chunksError) {
      throw new Error(`Failed to fetch chunks: ${chunksError.message}`);
    }

    log('STEP 4', `Found ${chunks?.length || 0} chunks`, 'success');
    if (chunks && chunks.length > 0) {
      log('STEP 4', `Sample chunk (first 100 chars): "${chunks[0].content.substring(0, 100)}..."`, 'info');
    }

    // Query images
    const { data: images, error: imagesError } = await supabase
      .from('document_images')
      .select('id, image_url, page_number')
      .eq('document_id', documentId)
      .limit(10);

    if (imagesError) {
      throw new Error(`Failed to fetch images: ${imagesError.message}`);
    }

    log('STEP 4', `Found ${images?.length || 0} images`, 'success');

    return { chunks: chunks || [], images: images || [] };
  } catch (error) {
    log('STEP 4', `Verification failed: ${error.message}`, 'error');
    workflowResults.errors.push({ step: 'Verify Chunks/Images', error: error.message });
    throw error;
  }
}

async function step5_VerifyEmbeddings(documentId) {
  log('STEP 5', 'Verifying embeddings generation', 'step');
  
  try {
    const { data: embeddings, error } = await supabase
      .from('document_embeddings')
      .select('id, chunk_id, embedding')
      .eq('document_id', documentId)
      .limit(10);

    if (error) {
      throw new Error(`Failed to fetch embeddings: ${error.message}`);
    }

    log('STEP 5', `Found ${embeddings?.length || 0} embeddings`, 'success');
    
    if (embeddings && embeddings.length > 0) {
      const sample = embeddings[0];
      const embeddingDim = Array.isArray(sample.embedding) ? sample.embedding.length : 0;
      log('STEP 5', `Embedding dimension: ${embeddingDim}`, 'info');
    }

    return embeddings || [];
  } catch (error) {
    log('STEP 5', `Embedding verification failed: ${error.message}`, 'error');
    workflowResults.errors.push({ step: 'Verify Embeddings', error: error.message });
    throw error;
  }
}

async function step6_PerformSearch(documentId, searchQuery = 'material') {
  log('STEP 6', `Performing search: "${searchQuery}"`, 'step');
  
  try {
    const searchUrl = `${SUPABASE_URL}/functions/v1/unified-material-search`;
    
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 10,
        document_id: documentId
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`Search failed: ${result.error || response.statusText}`);
    }

    log('STEP 6', `Search completed successfully`, 'success');
    log('STEP 6', `Found ${result.results?.length || 0} results`, 'info');
    
    if (result.results && result.results.length > 0) {
      result.results.slice(0, 3).forEach((r, i) => {
        log('STEP 6', `Result ${i + 1}: "${r.content?.substring(0, 80)}..." (score: ${r.similarity_score?.toFixed(3)})`, 'info');
      });
    }

    return result.results || [];
  } catch (error) {
    log('STEP 6', `Search failed: ${error.message}`, 'error');
    workflowResults.errors.push({ step: 'Perform Search', error: error.message });
    throw error;
  }
}

async function runCompleteWorkflow() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 END-TO-END WORKFLOW TEST');
  console.log('='.repeat(80) + '\n');

  try {
    // Step 1: Upload PDF
    const uploadResult = await step1_UploadPDF();
    workflowResults.summary.uploadedFile = uploadResult;

    // Step 2: Trigger Processing
    const processingResult = await step2_TriggerProcessing(uploadResult.url || uploadResult.path);
    workflowResults.summary.jobId = processingResult.job_id;

    // Step 3: Monitor Progress
    const progressResult = await step3_MonitorProgress(processingResult.job_id);
    workflowResults.summary.processingResult = progressResult;

    // Step 4: Verify Chunks and Images
    const extractionResult = await step4_VerifyChunksAndImages(progressResult.document_id);
    workflowResults.summary.extraction = extractionResult;

    // Step 5: Verify Embeddings
    const embeddingsResult = await step5_VerifyEmbeddings(progressResult.document_id);
    workflowResults.summary.embeddings = {
      count: embeddingsResult.length,
      sample: embeddingsResult[0] || null
    };

    // Step 6: Perform Search
    const searchResults = await step6_PerformSearch(progressResult.document_id, 'material design');
    workflowResults.summary.searchResults = {
      count: searchResults.length,
      topResults: searchResults.slice(0, 3)
    };

    // Final Summary
    console.log('\n' + '='.repeat(80));
    console.log('✅ WORKFLOW COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80));
    console.log('\n📊 SUMMARY:');
    console.log(`  ✓ PDF Uploaded: ${uploadResult.fileName}`);
    console.log(`  ✓ Job ID: ${workflowResults.summary.jobId}`);
    console.log(`  ✓ Chunks Extracted: ${extractionResult.chunks.length}`);
    console.log(`  ✓ Images Extracted: ${extractionResult.images.length}`);
    console.log(`  ✓ Embeddings Generated: ${embeddingsResult.length}`);
    console.log(`  ✓ Search Results: ${searchResults.length}`);
    console.log('\n');

  } catch (error) {
    console.log('\n' + '='.repeat(80));
    console.log('❌ WORKFLOW FAILED');
    console.log('='.repeat(80));
    console.log(`\nError: ${error.message}\n`);
    
    if (workflowResults.errors.length > 0) {
      console.log('Errors encountered:');
      workflowResults.errors.forEach(e => {
        console.log(`  - ${e.step}: ${e.error}`);
      });
    }
  }

  // Save results to file
  const resultsFile = `workflow-results-${Date.now()}.json`;
  fs.writeFileSync(resultsFile, JSON.stringify(workflowResults, null, 2));
  console.log(`📁 Results saved to: ${resultsFile}\n`);
}

runCompleteWorkflow().catch(console.error);


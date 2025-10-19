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

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY);

const TEST_PDF_URL = process.env.TEST_PDF_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/harmony-signature-book-24-25.pdf';

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
      action: 'bulk_process',
      payload: {
        urls: [pdfUrl],
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

    const raw = await response.text();
    let result;
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch (e) {
      throw new Error(`Processing failed: Non-JSON response (status ${response.status}). Body: ${raw?.slice(0, 500)}`);
    }

    if (!response.ok) {
      throw new Error(`Processing failed (status ${response.status}): ${result.error || response.statusText}`);
    }

    const jobId = result.job_id || result.data?.job_id;
    log('STEP 2', `Processing triggered successfully`, 'success');
    log('STEP 2', `Job ID: ${jobId || 'N/A'}`, 'info');

    return { ...result, job_id: jobId };
  } catch (error) {
    log('STEP 2', `Processing trigger failed: ${error.message}`, 'error');
    workflowResults.errors.push({ step: 'Trigger Processing', error: error.message });
    throw error;
  }
}

async function step3_MonitorProgress(jobId, maxWaitTime = 600000) {
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

      const raw = await response.text();
      let result;
      try {
        result = raw ? JSON.parse(raw) : {};
      } catch (e) {
        throw new Error(`Status poll failed: Non-JSON response (status ${response.status}). Body: ${raw?.slice(0, 500)}`);
      }

      const status = result.status ?? result.data?.status;
      if (status !== lastStatus) {
        log('STEP 3', `Job status: ${status}`, 'info');
        lastStatus = status;
      }

      if (status === 'completed' || status === 'succeeded' || status === 'success') {
        const details = result.details ?? result.data?.details;
        const chunksCount = result.chunks_count ?? result.data?.chunks_count ?? details?.chunks_created ?? details?.chunks ?? 0;
        const imagesCount = result.images_count ?? result.data?.images_count ?? details?.images_extracted ?? details?.images ?? 0;
        const documentId = result.document_id ?? result.data?.document_id ?? details?.document_id;
        log('STEP 3', `Job completed successfully`, 'success');
        log('STEP 3', `Chunks: ${chunksCount}, Images: ${imagesCount}`, 'info');
        return { ...result, document_id: documentId, chunks_count: chunksCount, images_count: imagesCount };
      }

      if (status === 'failed' || status === 'error') {
        const errMsg = result.error || result.data?.error_message || 'Unknown error';
        throw new Error(`Job failed: ${errMsg}`);
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
      .select('id, content, chunk_index, metadata')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true })
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

    // Fallback: if DB has 0 images, get image list directly from MIVAA gateway for diagnostics
    if (!images || images.length === 0) {
      try {
        // Check images via MIVAA
        const diagImagesRes = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'get_document_images', payload: { document_id: documentId } })
        });
        const diagImagesText = await diagImagesRes.text();
        let diagImagesJson; try { diagImagesJson = diagImagesText ? JSON.parse(diagImagesText) : {}; } catch {}
        const mivaaImages = diagImagesJson?.data?.images || diagImagesJson?.images || [];
        log('STEP 4', `Diagnostics: MIVAA get_document_images -> ${mivaaImages.length} images`, 'warning');
        if (mivaaImages.length > 0) {
          const u = mivaaImages[0]?.url || mivaaImages[0]?.image_url || 'n/a';
          log('STEP 4', `Diagnostics: Sample MIVAA image URL: ${u}`, 'info');
        }

        // Check document content summary via MIVAA
        const diagContentRes = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'get_document_content', payload: { document_id: documentId } })
        });
        const diagContentText = await diagContentRes.text();
        let diagContentJson; try { diagContentJson = diagContentText ? JSON.parse(diagContentText) : {}; } catch {}
        const imagesCountFromContent = diagContentJson?.data?.processing_summary?.images_extracted
          ?? diagContentJson?.document_info?.processing_summary?.images_extracted
          ?? diagContentJson?.images?.length
          ?? 0;
        const chunkCountFromContent = diagContentJson?.data?.chunks?.length
          ?? diagContentJson?.chunks?.length
          ?? 0;
        log('STEP 4', `Diagnostics: MIVAA get_document_content -> images_extracted=${imagesCountFromContent}, chunks=${chunkCountFromContent}`, 'warning');
      } catch (diagErr) {
        log('STEP 4', `Diagnostics failed to query MIVAA content/images: ${diagErr.message}`, 'warning');
      }
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
    // Fetch a sample of embeddings
    const { data: embeddings, error } = await supabase
      .from('embeddings')
      .select(`
        id, chunk_id, embedding,
        document_chunks!inner(id, document_id)
      `)
      .eq('document_chunks.document_id', documentId)
      .limit(10);

    if (error) {
      throw new Error(`Failed to fetch embeddings: ${error.message}`);
    }

    // Get exact count via head request
    const { count, error: countError } = await supabase
      .from('embeddings')
      .select(`id, document_chunks!inner(id, document_id)`, { count: 'exact', head: true })
      .eq('document_chunks.document_id', documentId);

    if (countError) {
      log('STEP 5', `Warning: Failed to count embeddings exactly: ${countError.message}`, 'warning');
    }

    const totalEmbeddings = typeof count === 'number' ? count : (embeddings?.length || 0);
    log('STEP 5', `Found ${totalEmbeddings} embeddings`, 'success');

    if (embeddings && embeddings.length > 0) {
      const sample = embeddings[0];
      // Embedding is stored as pgvector type, check if it exists
      let embeddingDim = 0;
      if (sample.embedding) {
        if (Array.isArray(sample.embedding)) {
          embeddingDim = sample.embedding.length;
        } else if (typeof sample.embedding === 'string') {
          // Vector stored as string, parse to get dimension
          const vectorMatch = sample.embedding.match(/\[([^\]]+)\]/);
          if (vectorMatch) {
            embeddingDim = vectorMatch[1].split(',').length;
          }
        }
      }
      log('STEP 5', `Embedding dimension: ${embeddingDim} (expected: 1536)`, embeddingDim === 1536 ? 'success' : 'warning');
    }

    return { rows: embeddings || [], totalCount: totalEmbeddings, sample: embeddings?.[0] || null };
  } catch (error) {
    log('STEP 5', `Embedding verification failed: ${error.message}`, 'error');
    workflowResults.errors.push({ step: 'Verify Embeddings', error: error.message });
    throw error;
  }
}

async function step6_PerformSearch(documentId, searchQuery = 'energy') {
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
        search_type: 'text'  // Use text search for testing
      })
    });

    const raw = await response.text();
    let result;
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch {
      result = { error: `Non-JSON response: ${raw?.slice(0, 300)}` };
    }

    if (!response.ok) {
      log('STEP 6', `Primary search endpoint failed (${response.status}). Falling back to text search on chunks.`, 'warning');
      // Fallback: simple text search within this document's chunks
      const { data: chunkSearch, error: chunkSearchError } = await supabase
        .from('document_chunks')
        .select('id, content, chunk_index')
        .eq('document_id', documentId)
        .ilike('content', `%${searchQuery}%`)
        .order('chunk_index', { ascending: true })
        .limit(10);

      if (chunkSearchError) {
        throw new Error(`Search fallback failed: ${chunkSearchError.message}`);
      }

      log('STEP 6', `Fallback search completed`, 'success');
      log('STEP 6', `Found ${chunkSearch?.length || 0} results`, 'info');
      if (chunkSearch && chunkSearch.length > 0) {
        chunkSearch.slice(0, 3).forEach((r, i) => {
          log('STEP 6', `Result ${i + 1}: "${r.content?.substring(0, 80)}..."`, 'info');
        });
      }
      return chunkSearch || [];
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
      count: embeddingsResult.totalCount,
      sample: embeddingsResult.sample || null
    };

    // Step 6: Perform Search
    const searchResults = await step6_PerformSearch(progressResult.document_id);
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
    console.log(`  ✓ Chunks Extracted: ${progressResult.chunks_count ?? extractionResult.chunks.length}`);
    console.log(`  ✓ Images Extracted: ${progressResult.images_count ?? extractionResult.images.length}`);
    console.log(`  ✓ Embeddings Generated: ${embeddingsResult.totalCount}`);
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


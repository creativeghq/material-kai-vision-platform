#!/usr/bin/env node

/**
 * HARMONY PDF COMPLETE END-TO-END TEST
 * 
 * Comprehensive workflow testing with real data validation:
 * 1. Upload Harmony PDF
 * 2. Monitor processing job
 * 3. Validate chunks (real content, no fake data)
 * 4. Validate embeddings (proper dimensions, no random values)
 * 5. Validate images (CLIP embeddings, Anthropic analysis)
 * 6. Validate products (14+ products with metadata)
 * 7. Test search functionality
 * 8. Validate quality scores
 * 9. Test admin-kb endpoints
 * 10. Generate comprehensive report
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const HARMONY_PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/harmony-signature-book-24-25.pdf';
const WORKSPACE_ID = 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e';

// Expected Harmony PDF products (for validation)
const EXPECTED_PRODUCTS = [
  'FOLD', 'BEAT', 'VALENOVA', 'LOFT', 'URBAN', 'CLASSIC', 
  'NATURAL', 'VINTAGE', 'MODERN', 'RUSTIC', 'ELEGANT', 
  'CONTEMPORARY', 'TRADITIONAL', 'INDUSTRIAL'
];

let testResults = {
  timestamp: new Date().toISOString(),
  documentId: null,
  steps: [],
  validations: {
    chunks: { passed: false, details: {} },
    embeddings: { passed: false, details: {} },
    images: { passed: false, details: {} },
    products: { passed: false, details: {} },
    search: { passed: false, details: {} },
    quality: { passed: false, details: {} },
    adminKB: { passed: false, details: {} }
  },
  errors: [],
  summary: {}
};

function log(step, message, type = 'info') {
  const timestamp = new Date().toISOString();
  const icons = {
    'info': '📋',
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'step': '🔄',
    'validation': '🔍'
  };
  
  const icon = icons[type] || '📋';
  console.log(`${icon} [${step}] ${message}`);
  
  testResults.steps.push({ step, message, type, timestamp });
}

function recordError(step, error) {
  const errorMsg = error.message || error;
  log(step, `Error: ${errorMsg}`, 'error');
  testResults.errors.push({ step, error: errorMsg, timestamp: new Date().toISOString() });
}

// ============================================================================
// STEP 1: UPLOAD HARMONY PDF
// ============================================================================

async function uploadHarmonyPDF() {
  log('UPLOAD', 'Starting Harmony PDF upload', 'step');
  
  try {
    // Download PDF
    log('UPLOAD', `Fetching PDF from: ${HARMONY_PDF_URL}`, 'info');
    const pdfResponse = await fetch(HARMONY_PDF_URL);
    
    if (!pdfResponse.ok) {
      throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
    }
    
    const pdfBuffer = await pdfResponse.buffer();
    const sizeMB = (pdfBuffer.length / 1024 / 1024).toFixed(2);
    log('UPLOAD', `Downloaded ${sizeMB} MB`, 'success');
    
    // Trigger processing via MIVAA gateway (RAG upload endpoint)
    log('UPLOAD', 'Triggering PDF processing via MIVAA gateway...', 'info');

    // Create form data with the PDF
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('file', pdfBuffer, {
      filename: 'harmony-signature-book-24-25.pdf',
      contentType: 'application/pdf'
    });
    formData.append('workspace_id', WORKSPACE_ID);
    formData.append('title', 'Harmony Signature Book 24-25 - E2E Test');

    const processingResponse = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });
    
    const result = await processingResponse.json();

    log('UPLOAD', `Response status: ${processingResponse.status}`, 'info');
    log('UPLOAD', `Response body: ${JSON.stringify(result, null, 2)}`, 'info');

    if (!processingResponse.ok) {
      throw new Error(`Processing failed: ${result.error || result.message || processingResponse.statusText}`);
    }

    // Handle both direct response and nested data response
    const jobId = result.job_id || result.data?.job_id;
    const documentId = result.document_id || result.data?.document_id;

    if (jobId) {
      log('UPLOAD', `Job started: ${jobId}`, 'success');
      return { success: true, jobId: jobId, documentId: documentId };
    } else if (documentId) {
      log('UPLOAD', `Document created: ${documentId}`, 'success');
      testResults.documentId = documentId;
      return { success: true, documentId: documentId };
    } else {
      throw new Error(`No job_id or document_id in response. Got: ${JSON.stringify(result)}`);
    }
    
  } catch (error) {
    recordError('UPLOAD', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// STEP 2: MONITOR PROCESSING JOB
// ============================================================================

async function monitorProcessingJob(jobId) {
  log('MONITOR', `Monitoring job: ${jobId}`, 'step');

  const maxAttempts = 120; // 10 minutes
  const pollInterval = 5000; // 5 seconds

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      log('MONITOR', `Attempt ${attempt}/${maxAttempts}`, 'info');

      // ✅ FIX: Check database directly instead of relying on API
      const { data: jobData, error: dbError } = await supabase
        .from('background_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (dbError) {
        log('MONITOR', `Database error: ${dbError.message}`, 'error');

        // Fallback to API if database fails
        try {
          const statusResponse = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              action: 'get_job_status',
              payload: { job_id: jobId }
            })
          });

          if (!statusResponse.ok) {
            throw new Error(`API returned ${statusResponse.status}`);
          }

          const statusData = await statusResponse.json();
          const apiJobData = statusData.data || statusData;

          // Use API data
          status = apiJobData.status;
          progress = apiJobData.progress || 0;
          documentId = apiJobData.document_id;
          error = apiJobData.error;
          metadata = apiJobData.metadata || {};
        } catch (apiError) {
          log('MONITOR', `API also failed: ${apiError.message}`, 'error');
          continue; // Skip this attempt
        }
      }

      // Extract job data from database
      const status = jobData.status;
      const progress = jobData.progress || 0;
      const documentId = jobData.document_id;
      const error = jobData.error;
      const metadata = jobData.metadata || {};

      if (status === 'completed') {
        log('MONITOR', 'Processing completed!', 'success');
        testResults.documentId = documentId;

        // ✅ FIX: Show detailed completion stats
        if (metadata.chunks_created || metadata.images_extracted || metadata.products_created) {
          log('MONITOR', `📊 Final Stats:`, 'info');
          log('MONITOR', `   📄 Chunks: ${metadata.chunks_created || 0}`, 'info');
          log('MONITOR', `   🖼️  Images: ${metadata.images_extracted || 0}`, 'info');
          log('MONITOR', `   📦 Products: ${metadata.products_created || 0}`, 'info');

          if (metadata.ai_usage) {
            log('MONITOR', `   🤖 AI Usage:`, 'info');
            log('MONITOR', `      - Llama calls: ${metadata.ai_usage.llama_calls || 0}`, 'info');
            log('MONITOR', `      - Claude calls: ${metadata.ai_usage.claude_calls || 0}`, 'info');
            log('MONITOR', `      - OpenAI calls: ${metadata.ai_usage.openai_calls || 0}`, 'info');
            log('MONITOR', `      - CLIP embeddings: ${metadata.ai_usage.clip_embeddings || 0}`, 'info');
          }

          if (metadata.embeddings_generated) {
            log('MONITOR', `   📊 Embeddings:`, 'info');
            log('MONITOR', `      - Text: ${metadata.embeddings_generated.text || 0}`, 'info');
            log('MONITOR', `      - Visual: ${metadata.embeddings_generated.visual || 0}`, 'info');
            log('MONITOR', `      - Color: ${metadata.embeddings_generated.color || 0}`, 'info');
            log('MONITOR', `      - Texture: ${metadata.embeddings_generated.texture || 0}`, 'info');
            log('MONITOR', `      - Application: ${metadata.embeddings_generated.application || 0}`, 'info');
          }
        }

        return { success: true, documentId: documentId };
      } else if (status === 'failed') {
        throw new Error(`Job failed: ${error}`);
      } else {
        // ✅ FIX: Show detailed progress during processing
        let progressMsg = `Status: ${status} (${progress}%)`;

        if (metadata.current_step) {
          progressMsg += ` - ${metadata.current_step}`;
        }

        if (metadata.current_page && metadata.total_pages) {
          progressMsg += ` [Page ${metadata.current_page}/${metadata.total_pages}]`;
        }

        if (metadata.chunks_created) {
          progressMsg += ` | Chunks: ${metadata.chunks_created}`;
        }

        if (metadata.images_extracted) {
          progressMsg += ` | Images: ${metadata.images_extracted}`;
        }

        if (metadata.products_created) {
          progressMsg += ` | Products: ${metadata.products_created}`;
        }

        log('MONITOR', progressMsg, 'info');
      }
      
    } catch (error) {
      recordError('MONITOR', error);
    }
  }
  
  throw new Error('Job monitoring timeout');
}

// ============================================================================
// STEP 3: GET DOCUMENT CONTENT FROM MIVAA API
// ============================================================================

async function getDocumentContent(documentId) {
  log('GET_CONTENT', 'Fetching document content from MIVAA API', 'step');

  try {
    // Use MIVAA API to get complete document content
    const response = await fetch(`https://v1api.materialshub.gr/api/documents/documents/${documentId}/content?include_chunks=true&include_images=true`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`MIVAA API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    log('GET_CONTENT', `Retrieved ${data.chunks?.length || 0} chunks and ${data.images?.length || 0} images`, 'success');

    return data;
  } catch (error) {
    recordError('GET_CONTENT', error);
    return null;
  }
}

// ============================================================================
// STEP 4: VALIDATE CHUNKS (NO FAKE DATA)
// ============================================================================

async function validateChunks(documentId, contentData) {
  log('VALIDATE_CHUNKS', 'Validating document chunks', 'step');

  try {
    const chunks = contentData?.chunks || [];

    if (!chunks || chunks.length === 0) {
      throw new Error('No chunks found in document content');
    }
    
    const validation = {
      total: chunks.length,
      withContent: 0,
      withMetadata: 0,
      withQualityScores: 0,
      avgContentLength: 0,
      realDataChecks: {
        hasHarmonyKeywords: 0,
        hasProductNames: 0,
        hasDimensions: 0
      }
    };
    
    let totalLength = 0;
    const harmonyKeywords = ['harmony', 'flooring', 'signature', 'collection'];
    const productKeywords = EXPECTED_PRODUCTS.map(p => p.toLowerCase());
    
    chunks.forEach(chunk => {
      if (chunk.content && chunk.content.length > 10) {
        validation.withContent++;
        totalLength += chunk.content.length;
        
        const contentLower = chunk.content.toLowerCase();
        
        // Check for Harmony-specific keywords
        if (harmonyKeywords.some(kw => contentLower.includes(kw))) {
          validation.realDataChecks.hasHarmonyKeywords++;
        }
        
        // Check for product names
        if (productKeywords.some(kw => contentLower.includes(kw))) {
          validation.realDataChecks.hasProductNames++;
        }
        
        // Check for dimensions (e.g., "15×38", "20×40")
        if (/\d+\s*[×x]\s*\d+/.test(chunk.content)) {
          validation.realDataChecks.hasDimensions++;
        }
      }
      
      if (chunk.metadata && Object.keys(chunk.metadata).length > 0) {
        validation.withMetadata++;
      }
      
      if (chunk.quality_score !== null) {
        validation.withQualityScores++;
      }
    });
    
    validation.avgContentLength = Math.round(totalLength / chunks.length);
    
    // Validation criteria
    const passed = 
      validation.total >= 50 && // At least 50 chunks
      validation.withContent >= validation.total * 0.95 && // 95% have content
      validation.avgContentLength >= 100 && // Average chunk size >= 100 chars
      validation.realDataChecks.hasHarmonyKeywords >= 10 && // Real Harmony content
      validation.realDataChecks.hasProductNames >= 5; // Real product names
    
    testResults.validations.chunks = { passed, details: validation };
    
    log('VALIDATE_CHUNKS', `Total chunks: ${validation.total}`, passed ? 'success' : 'warning');
    log('VALIDATE_CHUNKS', `With content: ${validation.withContent}/${validation.total}`, 'info');
    log('VALIDATE_CHUNKS', `Avg length: ${validation.avgContentLength} chars`, 'info');
    log('VALIDATE_CHUNKS', `Harmony keywords: ${validation.realDataChecks.hasHarmonyKeywords}`, 'info');
    log('VALIDATE_CHUNKS', `Product names: ${validation.realDataChecks.hasProductNames}`, 'info');
    log('VALIDATE_CHUNKS', `Dimensions found: ${validation.realDataChecks.hasDimensions}`, 'info');
    
    if (!passed) {
      log('VALIDATE_CHUNKS', 'Chunk validation FAILED - possible fake data', 'error');
    }
    
    return { success: passed, validation };
    
  } catch (error) {
    recordError('VALIDATE_CHUNKS', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// STEP 4: VALIDATE EMBEDDINGS (NO RANDOM VALUES)
// ============================================================================

async function validateEmbeddings(documentId) {
  log('VALIDATE_EMBEDDINGS', 'Validating embeddings', 'step');

  try {
    const { data: embeddings, error } = await supabase
      .from('document_vectors')
      .select('*')
      .eq('document_id', documentId);

    if (error) throw error;

    const validation = {
      total: embeddings.length,
      withValidDimensions: 0,
      avgMagnitude: 0,
      dimensionCheck: {},
      randomnessCheck: {
        passed: true,
        suspiciousEmbeddings: 0
      }
    };

    let totalMagnitude = 0;

    embeddings.forEach(emb => {
      if (emb.embedding && Array.isArray(emb.embedding)) {
        const dim = emb.embedding.length;
        validation.dimensionCheck[dim] = (validation.dimensionCheck[dim] || 0) + 1;

        // Check for valid dimensions (OpenAI: 1536, CLIP: 512, etc.)
        if ([512, 768, 1024, 1536, 3072].includes(dim)) {
          validation.withValidDimensions++;
        }

        // Calculate magnitude to detect random values
        const magnitude = Math.sqrt(emb.embedding.reduce((sum, val) => sum + val * val, 0));
        totalMagnitude += magnitude;

        // Check for suspicious patterns (all zeros, all same value, etc.)
        const uniqueValues = new Set(emb.embedding.slice(0, 10)).size;
        if (uniqueValues < 3 || magnitude < 0.1 || magnitude > 100) {
          validation.randomnessCheck.suspiciousEmbeddings++;
          validation.randomnessCheck.passed = false;
        }
      }
    });

    validation.avgMagnitude = (totalMagnitude / embeddings.length).toFixed(3);

    const passed =
      validation.total >= 50 && // At least 50 embeddings
      validation.withValidDimensions >= validation.total * 0.95 && // 95% valid dimensions
      validation.randomnessCheck.passed; // No suspicious patterns

    testResults.validations.embeddings = { passed, details: validation };

    log('VALIDATE_EMBEDDINGS', `Total embeddings: ${validation.total}`, passed ? 'success' : 'warning');
    log('VALIDATE_EMBEDDINGS', `Valid dimensions: ${validation.withValidDimensions}/${validation.total}`, 'info');
    log('VALIDATE_EMBEDDINGS', `Avg magnitude: ${validation.avgMagnitude}`, 'info');
    log('VALIDATE_EMBEDDINGS', `Dimensions: ${JSON.stringify(validation.dimensionCheck)}`, 'info');

    if (validation.randomnessCheck.suspiciousEmbeddings > 0) {
      log('VALIDATE_EMBEDDINGS', `⚠️  Suspicious embeddings: ${validation.randomnessCheck.suspiciousEmbeddings}`, 'warning');
    }

    return { success: passed, validation };

  } catch (error) {
    recordError('VALIDATE_EMBEDDINGS', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// STEP 5: VALIDATE IMAGES (CLIP + ANTHROPIC)
// ============================================================================

async function validateImages(documentId) {
  log('VALIDATE_IMAGES', 'Validating images', 'step');

  try {
    const { data: images, error } = await supabase
      .from('document_images')
      .select('*')
      .eq('document_id', documentId);

    if (error) throw error;

    const validation = {
      total: images.length,
      withCLIPEmbeddings: 0,
      withAnthropicAnalysis: 0,
      withChunkLinks: 0,
      withQualityScores: 0,
      avgQualityScore: 0,
      clipDimensions: {}
    };

    let totalQuality = 0;

    images.forEach(img => {
      // Check CLIP embeddings
      if (img.image_embedding && Array.isArray(img.image_embedding) && img.image_embedding.length > 0) {
        validation.withCLIPEmbeddings++;
        const dim = img.image_embedding.length;
        validation.clipDimensions[dim] = (validation.clipDimensions[dim] || 0) + 1;
      }

      // Check Anthropic analysis
      if (img.image_analysis_results && Object.keys(img.image_analysis_results).length > 0) {
        validation.withAnthropicAnalysis++;
      }

      // Check chunk relationships
      if (img.chunk_id) {
        validation.withChunkLinks++;
      }

      // Check quality scores
      if (img.quality_score !== null && img.quality_score !== undefined) {
        validation.withQualityScores++;
        totalQuality += img.quality_score;
      }
    });

    validation.avgQualityScore = validation.withQualityScores > 0
      ? (totalQuality / validation.withQualityScores).toFixed(3)
      : 0;

    const passed =
      validation.total >= 50 && // At least 50 images
      validation.withCLIPEmbeddings >= validation.total * 0.9 && // 90% have CLIP embeddings
      validation.withAnthropicAnalysis >= validation.total * 0.8 && // 80% have Anthropic analysis
      validation.withChunkLinks >= validation.total * 0.7; // 70% linked to chunks

    testResults.validations.images = { passed, details: validation };

    log('VALIDATE_IMAGES', `Total images: ${validation.total}`, passed ? 'success' : 'warning');
    log('VALIDATE_IMAGES', `CLIP embeddings: ${validation.withCLIPEmbeddings}/${validation.total}`, 'info');
    log('VALIDATE_IMAGES', `Anthropic analysis: ${validation.withAnthropicAnalysis}/${validation.total}`, 'info');
    log('VALIDATE_IMAGES', `Chunk links: ${validation.withChunkLinks}/${validation.total}`, 'info');
    log('VALIDATE_IMAGES', `Avg quality: ${validation.avgQualityScore}`, 'info');

    return { success: passed, validation };

  } catch (error) {
    recordError('VALIDATE_IMAGES', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// STEP 6: VALIDATE PRODUCTS (14+ EXPECTED)
// ============================================================================

async function validateProducts(documentId) {
  log('VALIDATE_PRODUCTS', 'Validating products', 'step');

  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('source_document_id', documentId);

    if (error) throw error;

    const validation = {
      total: products.length,
      withNames: 0,
      withDescriptions: 0,
      withMetadata: 0,
      withDimensions: 0,
      expectedProductsFound: [],
      productNames: []
    };

    products.forEach(product => {
      if (product.name) {
        validation.withNames++;
        validation.productNames.push(product.name);

        // Check if it matches expected Harmony products
        const nameUpper = product.name.toUpperCase();
        EXPECTED_PRODUCTS.forEach(expected => {
          if (nameUpper.includes(expected)) {
            validation.expectedProductsFound.push(expected);
          }
        });
      }

      if (product.description && product.description.length > 20) {
        validation.withDescriptions++;
      }

      if (product.metadata && Object.keys(product.metadata).length > 0) {
        validation.withMetadata++;

        // Check for dimensions in metadata
        const metaStr = JSON.stringify(product.metadata).toLowerCase();
        if (metaStr.includes('dimension') || /\d+\s*[×x]\s*\d+/.test(metaStr)) {
          validation.withDimensions++;
        }
      }
    });

    validation.expectedProductsFound = [...new Set(validation.expectedProductsFound)];

    const passed =
      validation.total >= 14 && // At least 14 products (Harmony benchmark)
      validation.withNames >= validation.total * 0.95 && // 95% have names
      validation.withDescriptions >= validation.total * 0.8 && // 80% have descriptions
      validation.expectedProductsFound.length >= 5; // At least 5 expected products found

    testResults.validations.products = { passed, details: validation };

    log('VALIDATE_PRODUCTS', `Total products: ${validation.total}`, passed ? 'success' : 'warning');
    log('VALIDATE_PRODUCTS', `With names: ${validation.withNames}/${validation.total}`, 'info');
    log('VALIDATE_PRODUCTS', `With descriptions: ${validation.withDescriptions}/${validation.total}`, 'info');
    log('VALIDATE_PRODUCTS', `With metadata: ${validation.withMetadata}/${validation.total}`, 'info');
    log('VALIDATE_PRODUCTS', `Expected products found: ${validation.expectedProductsFound.join(', ')}`, 'info');

    if (validation.total < 14) {
      log('VALIDATE_PRODUCTS', `⚠️  Expected 14+ products, got ${validation.total}`, 'warning');
    }

    return { success: passed, validation };

  } catch (error) {
    recordError('VALIDATE_PRODUCTS', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// STEP 7: TEST SEARCH FUNCTIONALITY
// ============================================================================

async function testSearch(documentId) {
  log('TEST_SEARCH', 'Testing search functionality', 'step');

  try {
    const searchQueries = [
      { query: 'flooring', expectedResults: 5 },
      { query: 'FOLD collection', expectedResults: 3 },
      { query: 'dimensions 15x38', expectedResults: 2 }
    ];

    const validation = {
      queriesTested: 0,
      queriesPassed: 0,
      results: []
    };

    for (const test of searchQueries) {
      try {
        const { data, error } = await supabase
          .rpc('search_documents', {
            search_query: test.query,
            match_threshold: 0.5,
            match_count: 10
          });

        if (error) throw error;

        const passed = data && data.length >= test.expectedResults;
        validation.queriesTested++;
        if (passed) validation.queriesPassed++;

        validation.results.push({
          query: test.query,
          expected: test.expectedResults,
          actual: data?.length || 0,
          passed
        });

        log('TEST_SEARCH', `Query "${test.query}": ${data?.length || 0} results`, passed ? 'success' : 'warning');

      } catch (error) {
        log('TEST_SEARCH', `Query "${test.query}" failed: ${error.message}`, 'error');
        validation.results.push({
          query: test.query,
          error: error.message,
          passed: false
        });
      }
    }

    const passed = validation.queriesPassed >= validation.queriesTested * 0.7; // 70% pass rate
    testResults.validations.search = { passed, details: validation };

    return { success: passed, validation };

  } catch (error) {
    recordError('TEST_SEARCH', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// STEP 8: TEST ADMIN-KB ENDPOINTS
// ============================================================================

async function testAdminKBEndpoints() {
  log('TEST_ADMIN_KB', 'Testing admin-kb endpoints', 'step');

  try {
    const endpoints = [
      'admin-kb-metadata',
      'admin-kb-quality-scores',
      'admin-kb-embeddings-stats',
      'admin-kb-detections',
      'admin-kb-quality-dashboard',
      'admin-kb-patterns'
    ];

    const validation = {
      endpointsTested: 0,
      endpointsPassed: 0,
      results: []
    };

    for (const endpoint of endpoints) {
      try {
        const url = `${SUPABASE_URL}/functions/v1/${endpoint}?workspace_id=${WORKSPACE_ID}`;
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();
        const passed = response.ok && data && !data.error;

        validation.endpointsTested++;
        if (passed) validation.endpointsPassed++;

        validation.results.push({
          endpoint,
          status: response.status,
          passed,
          dataKeys: data ? Object.keys(data) : []
        });

        log('TEST_ADMIN_KB', `${endpoint}: ${response.status}`, passed ? 'success' : 'error');

      } catch (error) {
        log('TEST_ADMIN_KB', `${endpoint} failed: ${error.message}`, 'error');
        validation.results.push({
          endpoint,
          error: error.message,
          passed: false
        });
      }
    }

    const passed = validation.endpointsPassed === validation.endpointsTested;
    testResults.validations.adminKB = { passed, details: validation };

    return { success: passed, validation };

  } catch (error) {
    recordError('TEST_ADMIN_KB', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// COMPREHENSIVE SUMMARY
// ============================================================================

async function generateComprehensiveSummary(documentId) {
  log('SUMMARY', 'Generating comprehensive summary...', 'step');

  try {
    // Get all data from database
    const [chunksResult, embeddingsResult, imagesResult, productsResult, vectorsResult] = await Promise.all([
      supabase.from('document_chunks').select('*').eq('document_id', documentId),
      supabase.from('embeddings').select('*').eq('workspace_id', WORKSPACE_ID),
      supabase.from('document_images').select('*').eq('document_id', documentId),
      supabase.from('products').select('*').eq('workspace_id', WORKSPACE_ID),
      supabase.from('document_vectors').select('*').eq('document_id', documentId)
    ]);

    console.log('\n' + '='.repeat(100));
    console.log('📊 COMPREHENSIVE PROCESSING SUMMARY');
    console.log('='.repeat(100));

    // Chunks Summary
    console.log('\n📄 CHUNKS:');
    console.log(`   Total: ${chunksResult.data?.length || 0}`);
    if (chunksResult.data && chunksResult.data.length > 0) {
      const avgLength = chunksResult.data.reduce((sum, c) => sum + (c.content?.length || 0), 0) / chunksResult.data.length;
      console.log(`   Average length: ${avgLength.toFixed(0)} characters`);
      console.log(`   Has Claude analysis: ${chunksResult.data.filter(c => c.has_claude).length}`);
      console.log(`   Has Llama analysis: ${chunksResult.data.filter(c => c.has_llama).length}`);
    }

    // Embeddings Summary
    console.log('\n🔢 EMBEDDINGS:');
    console.log(`   Total in 'embeddings' table: ${embeddingsResult.data?.length || 0}`);
    console.log(`   Total in 'document_vectors' table: ${vectorsResult.data?.length || 0}`);
    if (embeddingsResult.data && embeddingsResult.data.length > 0) {
      const models = [...new Set(embeddingsResult.data.map(e => e.model_name))];
      console.log(`   Models used: ${models.join(', ')}`);
      const dimensions = [...new Set(embeddingsResult.data.map(e => e.dimensions))];
      console.log(`   Dimensions: ${dimensions.join(', ')}`);
    }

    // Images Summary
    console.log('\n🖼️  IMAGES:');
    console.log(`   Total: ${imagesResult.data?.length || 0}`);
    if (imagesResult.data && imagesResult.data.length > 0) {
      console.log(`   Has Claude analysis: ${imagesResult.data.filter(i => i.has_claude).length}`);
      console.log(`   Has Llama analysis: ${imagesResult.data.filter(i => i.has_llama).length}`);
      console.log(`   Has CLIP embeddings: ${imagesResult.data.filter(i => i.visual_clip_embedding_512).length}`);
      const imageTypes = [...new Set(imagesResult.data.map(i => i.image_type))];
      console.log(`   Image types: ${imageTypes.join(', ')}`);
    }

    // Products Summary
    console.log('\n📦 PRODUCTS:');
    console.log(`   Total: ${productsResult.data?.length || 0}`);
    if (productsResult.data && productsResult.data.length > 0) {
      const productNames = productsResult.data.map(p => p.name).slice(0, 10);
      console.log(`   Sample products: ${productNames.join(', ')}${productsResult.data.length > 10 ? '...' : ''}`);
      const avgQuality = productsResult.data.reduce((sum, p) => sum + (p.quality_score || 0), 0) / productsResult.data.length;
      console.log(`   Average quality score: ${avgQuality.toFixed(3)}`);
      console.log(`   Has embeddings: ${productsResult.data.filter(p => p.text_embedding_1536).length}`);
    }

    console.log('\n' + '='.repeat(100));

  } catch (error) {
    recordError('SUMMARY', error);
  }
}

// ============================================================================
// GENERATE COMPREHENSIVE REPORT
// ============================================================================

function generateReport() {
  console.log('\n' + '='.repeat(100));
  console.log('📊 HARMONY PDF E2E TEST REPORT');
  console.log('='.repeat(100));
  console.log(`\nTimestamp: ${testResults.timestamp}`);
  console.log(`Document ID: ${testResults.documentId || 'N/A'}`);

  console.log('\n' + '-'.repeat(100));
  console.log('VALIDATION RESULTS');
  console.log('-'.repeat(100));

  const validations = testResults.validations;
  let totalPassed = 0;
  let totalTests = 0;

  Object.entries(validations).forEach(([name, result]) => {
    totalTests++;
    if (result.passed) totalPassed++;

    const icon = result.passed ? '✅' : '❌';
    console.log(`\n${icon} ${name.toUpperCase()}: ${result.passed ? 'PASSED' : 'FAILED'}`);

    if (result.details) {
      Object.entries(result.details).forEach(([key, value]) => {
        if (typeof value === 'object' && !Array.isArray(value)) {
          console.log(`   ${key}: ${JSON.stringify(value)}`);
        } else if (Array.isArray(value)) {
          console.log(`   ${key}: [${value.length} items]`);
        } else {
          console.log(`   ${key}: ${value}`);
        }
      });
    }
  });

  console.log('\n' + '-'.repeat(100));
  console.log('SUMMARY');
  console.log('-'.repeat(100));
  console.log(`Total validations: ${totalTests}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalTests - totalPassed}`);
  console.log(`Success rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);

  if (testResults.errors.length > 0) {
    console.log('\n' + '-'.repeat(100));
    console.log('ERRORS');
    console.log('-'.repeat(100));
    testResults.errors.forEach((err, idx) => {
      console.log(`${idx + 1}. [${err.step}] ${err.error}`);
    });
  }

  // Save report to file
  const reportPath = path.join(__dirname, `harmony-e2e-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  console.log(`\n📄 Full report saved to: ${reportPath}`);

  console.log('\n' + '='.repeat(100));

  const allPassed = totalPassed === totalTests;
  if (allPassed) {
    console.log('🎉 ALL TESTS PASSED! Harmony PDF processing is working correctly with real data.');
  } else {
    console.log('⚠️  SOME TESTS FAILED. Review the report above for details.');
  }
  console.log('='.repeat(100) + '\n');

  return allPassed;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function runCompleteE2ETest() {
  console.log('\n' + '='.repeat(100));
  console.log('🚀 HARMONY PDF COMPLETE END-TO-END TEST');
  console.log('='.repeat(100));
  console.log(`\nPDF: ${HARMONY_PDF_URL}`);
  console.log(`Workspace: ${WORKSPACE_ID}`);
  console.log(`Supabase: ${SUPABASE_URL}\n`);

  const startTime = Date.now();

  try {
    // Step 1: Upload PDF
    const uploadResult = await uploadHarmonyPDF();
    if (!uploadResult.success) {
      throw new Error('Upload failed');
    }

    // Step 2: Monitor job (if job-based processing)
    if (uploadResult.jobId) {
      const monitorResult = await monitorProcessingJob(uploadResult.jobId);
      if (!monitorResult.success) {
        throw new Error('Job monitoring failed');
      }
    }

    // Ensure we have a document ID
    if (!testResults.documentId) {
      throw new Error('No document ID available');
    }

    // Wait a bit for processing to complete
    log('MAIN', 'Waiting 10 seconds for processing to complete...', 'info');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Step 3: Get complete document content from MIVAA API
    const contentData = await getDocumentContent(testResults.documentId);
    if (!contentData) {
      throw new Error('Failed to retrieve document content from MIVAA API');
    }

    // Step 4-9: Run all validations using content data
    await validateChunks(testResults.documentId, contentData);
    await validateEmbeddings(testResults.documentId);
    await validateImages(testResults.documentId);
    await validateProducts(testResults.documentId);
    await testSearch(testResults.documentId);
    await testAdminKBEndpoints();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    testResults.summary = {
      duration: `${duration}s`,
      documentId: testResults.documentId,
      totalSteps: testResults.steps.length,
      totalErrors: testResults.errors.length
    };

    log('MAIN', `Test completed in ${duration}s`, 'success');

    // ✅ NEW: Generate comprehensive final summary
    await generateComprehensiveSummary(testResults.documentId);

  } catch (error) {
    recordError('MAIN', error);
    log('MAIN', 'Test execution failed', 'error');
  }

  // Generate and display report
  const allPassed = generateReport();

  // Exit with appropriate code
  process.exit(allPassed ? 0 : 1);
}

// Run the test
runCompleteE2ETest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


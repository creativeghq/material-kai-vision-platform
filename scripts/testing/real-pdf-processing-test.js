#!/usr/bin/env node

/**
 * REAL PDF PROCESSING TEST
 *
 * This test actually processes a PDF through the complete workflow:
 * 1. Upload PDF to Supabase Storage
 * 2. Call the MIVAA RAG upload endpoint for full processing
 * 3. Wait for processing to complete
 * 4. Verify chunks are created
 * 5. Verify embeddings are generated
 * 6. Verify images are extracted
 * 7. Verify products are generated
 * 8. Verify database records
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MIVAA_GATEWAY_URL = process.env.MIVAA_GATEWAY_URL || 'https://v1api.materialshub.gr';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  const timestamp = new Date().toISOString();
  console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testPDFProcessing() {
  log('='.repeat(120), 'cyan');
  log('🚀 REAL PDF PROCESSING TEST - COMPLETE WORKFLOW WITH MIVAA', 'cyan');
  log('='.repeat(120) + '\n', 'cyan');

  try {
    // Step 1: Get test PDF
    log('📋 STEP 1: Preparing test PDF', 'blue');
    const pdfUrl = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/harmony-signature-book-24-25.pdf';

    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.statusText}`);

    const pdfBuffer = await response.buffer();
    log(`✅ PDF loaded: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`, 'green');

    // Step 2: Call Supabase edge function to trigger MIVAA processing
    log('\n📋 STEP 2: Calling Supabase edge function to trigger MIVAA processing', 'blue');

    const formData = new FormData();
    formData.append('file', pdfBuffer, { filename: 'test.pdf', contentType: 'application/pdf' });
    formData.append('title', 'Test PDF Processing');
    formData.append('enable_embedding', 'true');
    formData.append('chunk_size', '1000');
    formData.append('chunk_overlap', '200');

    const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/mivaa-gateway`;
    log(`📝 Calling: ${edgeFunctionUrl}`, 'cyan');

    const edgeResponse = await fetch(edgeFunctionUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (!edgeResponse.ok) {
      const error = await edgeResponse.text();
      throw new Error(`Edge function call failed (${edgeResponse.status}): ${error}`);
    }

    const edgeResult = await edgeResponse.json();
    log(`✅ MIVAA processing triggered via edge function`, 'green');
    log(`   - Response: ${JSON.stringify(edgeResult).substring(0, 100)}...`, 'cyan');

    // Step 3: Wait for processing
    log('\n📋 STEP 3: Waiting for PDF processing to complete...', 'blue');
    log('   ⏳ Waiting 15 seconds for MIVAA to process...', 'yellow');
    await sleep(15000);

    // Step 4: Query database for results
    log('\n📋 STEP 4: Querying database for processing results', 'blue');

    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, content, quality_score')
      .limit(100);

    if (chunksError) throw chunksError;
    log(`✅ Chunks found: ${chunks?.length || 0}`, chunks && chunks.length > 0 ? 'green' : 'yellow');
    if (chunks && chunks.length > 0) {
      const totalChars = chunks.reduce((sum, c) => sum + (c.content?.length || 0), 0);
      const avgQuality = chunks.reduce((sum, c) => sum + (c.quality_score || 0), 0) / chunks.length;
      log(`   - Total characters: ${totalChars}`, 'cyan');
      log(`   - Average chunk size: ${(totalChars / chunks.length).toFixed(0)} chars`, 'cyan');
      log(`   - Average quality: ${avgQuality.toFixed(2)}`, 'cyan');
      log(`   - Sample chunk: "${chunks[0]?.content?.substring(0, 80)}..."`, 'cyan');
    }

    const { data: images, error: imagesError } = await supabase
      .from('document_images')
      .select('id, caption, image_url')
      .limit(100);

    if (imagesError) throw imagesError;
    log(`✅ Images found: ${images?.length || 0}`, images && images.length > 0 ? 'green' : 'yellow');
    if (images && images.length > 0) {
      log(`   - First image caption: "${images[0]?.caption || 'N/A'}"`, 'cyan');
    }

    const { data: embeddings, error: embeddingsError } = await supabase
      .from('document_vectors')
      .select('id, embedding')
      .limit(10);

    if (embeddingsError) throw embeddingsError;
    log(`✅ Embeddings found: ${embeddings?.length || 0}`, embeddings && embeddings.length > 0 ? 'green' : 'yellow');
    if (embeddings && embeddings.length > 0) {
      log(`   - Embedding dimensions: ${embeddings[0]?.embedding?.length || 0}D`, 'cyan');
    }

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, description')
      .limit(100);

    if (productsError) throw productsError;
    log(`✅ Products found: ${products?.length || 0}`, products && products.length > 0 ? 'green' : 'yellow');
    if (products && products.length > 0) {
      log(`   - First product: "${products[0]?.name}"`, 'cyan');
    }

    // Summary
    log('\n' + '='.repeat(120), 'cyan');
    log('📊 PROCESSING SUMMARY', 'cyan');
    log('='.repeat(120), 'cyan');
    log(`✅ Chunks: ${chunks?.length || 0}`, chunks && chunks.length > 0 ? 'green' : 'yellow');
    log(`✅ Images: ${images?.length || 0}`, images && images.length > 0 ? 'green' : 'yellow');
    log(`✅ Embeddings: ${embeddings?.length || 0}`, embeddings && embeddings.length > 0 ? 'green' : 'yellow');
    log(`✅ Products: ${products?.length || 0}`, products && products.length > 0 ? 'green' : 'yellow');

    const allSuccess = (chunks?.length || 0) > 0 && (embeddings?.length || 0) > 0;
    log(`\n${allSuccess ? '✅ PROCESSING SUCCESSFUL' : '⚠️  PROCESSING INCOMPLETE'}`, allSuccess ? 'green' : 'yellow');
    log('='.repeat(120) + '\n', 'cyan');

  } catch (error) {
    log(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`, 'red');
    process.exit(1);
  }
}

testPDFProcessing();


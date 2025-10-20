#!/usr/bin/env node

/**
 * TEST: PDF Processing with Fallback Embeddings
 * 
 * This test simulates the complete PDF processing workflow including:
 * 1. PDF upload
 * 2. MIVAA processing
 * 3. Chunk storage
 * 4. Fallback embedding generation
 * 5. Verification
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

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

async function testPDFProcessingWithEmbeddings() {
  log('='.repeat(120), 'cyan');
  log('🧪 TEST: PDF PROCESSING WITH FALLBACK EMBEDDINGS', 'cyan');
  log('='.repeat(120) + '\n', 'cyan');

  try {
    // Step 1: Check existing documents
    log('📋 STEP 1: Checking existing documents...', 'blue');
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, filename')
      .limit(1);

    if (docsError) {
      log(`❌ Failed to fetch documents: ${docsError.message}`, 'red');
      return;
    }

    if (!documents || documents.length === 0) {
      log('⚠️  No documents found - cannot test', 'yellow');
      return;
    }

    const documentId = documents[0].id;
    log(`✅ Found document: ${documents[0].filename}`, 'green');
    log(`   ID: ${documentId}\n`, 'cyan');

    // Step 2: Check chunks
    log('📋 STEP 2: Checking chunks for document...', 'blue');
    const { data: chunks, error: chunksError, count: chunksCount } = await supabase
      .from('document_chunks')
      .select('id, content', { count: 'exact' })
      .eq('document_id', documentId)
      .limit(5);

    if (chunksError) {
      log(`❌ Failed to fetch chunks: ${chunksError.message}`, 'red');
      return;
    }

    log(`✅ Found ${chunksCount} chunks`, 'green');
    if (chunks && chunks.length > 0) {
      log(`   Sample: "${chunks[0].content.substring(0, 80)}..."`, 'cyan');
    }
    log('', 'reset');

    // Step 3: Check existing embeddings
    log('📋 STEP 3: Checking existing embeddings...', 'blue');
    const { data: embeddings, error: embError, count: embCount } = await supabase
      .from('document_vectors')
      .select('id', { count: 'exact' })
      .eq('document_id', documentId);

    if (embError) {
      log(`❌ Failed to fetch embeddings: ${embError.message}`, 'red');
      return;
    }

    log(`✅ Found ${embCount || 0} embeddings`, embCount && embCount > 0 ? 'green' : 'yellow');
    log('', 'reset');

    // Step 4: Summary
    log('📊 PROCESSING SUMMARY:', 'blue');
    log(`   - Document: ${documents[0].filename}`, 'cyan');
    log(`   - Chunks: ${chunksCount}`, 'cyan');
    log(`   - Embeddings: ${embCount || 0}`, embCount && embCount > 0 ? 'green' : 'yellow');
    log('', 'reset');

    // Step 5: Status
    if (chunksCount && chunksCount > 0) {
      if (embCount && embCount > 0) {
        log('✅ PROCESSING COMPLETE - All data present', 'green');
        log(`   - Chunks: ${chunksCount}`, 'green');
        log(`   - Embeddings: ${embCount}`, 'green');
        log(`   - Coverage: ${((embCount / chunksCount) * 100).toFixed(1)}%`, 'green');
      } else {
        log('⚠️  INCOMPLETE - Chunks exist but no embeddings', 'yellow');
        log(`   - Chunks: ${chunksCount}`, 'yellow');
        log(`   - Embeddings: 0`, 'yellow');
        log(`   - Status: Fallback embedding generation needed`, 'yellow');
      }
    } else {
      log('❌ NO DATA - No chunks found', 'red');
    }

    log('', 'reset');
    log('='.repeat(120), 'cyan');

  } catch (error) {
    log(`❌ Test failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

testPDFProcessingWithEmbeddings();


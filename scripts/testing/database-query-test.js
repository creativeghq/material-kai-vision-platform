#!/usr/bin/env node

/**
 * DATABASE QUERY TEST
 * 
 * This test queries the database to see what PDF processing data exists
 * and validates the complete workflow results
 */

import { createClient } from '@supabase/supabase-js';

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

async function testDatabaseQueries() {
  log('='.repeat(120), 'cyan');
  log('📊 DATABASE QUERY TEST - CHECKING PDF PROCESSING RESULTS', 'cyan');
  log('='.repeat(120) + '\n', 'cyan');

  try {
    // Query 1: Document chunks
    log('📋 QUERY 1: Checking document_chunks table', 'blue');
    const { data: chunks, error: chunksError, count: chunksCount } = await supabase
      .from('document_chunks')
      .select('id, content, quality_score, metadata', { count: 'exact' })
      .limit(10);
    
    if (chunksError) {
      log(`⚠️  Error querying chunks: ${chunksError.message}`, 'yellow');
    } else {
      log(`✅ Found ${chunksCount || 0} total chunks`, chunksCount && chunksCount > 0 ? 'green' : 'yellow');
      if (chunks && chunks.length > 0) {
        log(`   - Sample chunk (first 100 chars): "${chunks[0]?.content?.substring(0, 100)}..."`, 'cyan');
        log(`   - Quality score: ${chunks[0]?.quality_score || 'N/A'}`, 'cyan');
        log(`   - Metadata: ${JSON.stringify(chunks[0]?.metadata || {}).substring(0, 80)}...`, 'cyan');
      }
    }

    // Query 2: Document images
    log('\n📋 QUERY 2: Checking document_images table', 'blue');
    const { data: images, error: imagesError, count: imagesCount } = await supabase
      .from('document_images')
      .select('id, caption, image_url, metadata', { count: 'exact' })
      .limit(10);
    
    if (imagesError) {
      log(`⚠️  Error querying images: ${imagesError.message}`, 'yellow');
    } else {
      log(`✅ Found ${imagesCount || 0} total images`, imagesCount && imagesCount > 0 ? 'green' : 'yellow');
      if (images && images.length > 0) {
        log(`   - First image caption: "${images[0]?.caption || 'N/A'}"`, 'cyan');
        log(`   - Image URL: ${images[0]?.image_url ? '✅ Present' : '❌ Missing'}`, 'cyan');
      }
    }

    // Query 3: Document vectors (embeddings)
    log('\n📋 QUERY 3: Checking document_vectors table', 'blue');
    const { data: embeddings, error: embeddingsError, count: embeddingsCount } = await supabase
      .from('document_vectors')
      .select('id, embedding', { count: 'exact' })
      .limit(5);
    
    if (embeddingsError) {
      log(`⚠️  Error querying embeddings: ${embeddingsError.message}`, 'yellow');
    } else {
      log(`✅ Found ${embeddingsCount || 0} total embeddings`, embeddingsCount && embeddingsCount > 0 ? 'green' : 'yellow');
      if (embeddings && embeddings.length > 0) {
        const dims = embeddings[0]?.embedding?.length || 0;
        log(`   - Embedding dimensions: ${dims}D`, 'cyan');
        log(`   - Sample embedding (first 5 values): [${embeddings[0]?.embedding?.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`, 'cyan');
      }
    }

    // Query 4: Products
    log('\n📋 QUERY 4: Checking products table', 'blue');
    const { data: products, error: productsError, count: productsCount } = await supabase
      .from('products')
      .select('id, name, description, metadata', { count: 'exact' })
      .limit(10);
    
    if (productsError) {
      log(`⚠️  Error querying products: ${productsError.message}`, 'yellow');
    } else {
      log(`✅ Found ${productsCount || 0} total products`, productsCount && productsCount > 0 ? 'green' : 'yellow');
      if (products && products.length > 0) {
        log(`   - First product: "${products[0]?.name}"`, 'cyan');
        log(`   - Description: "${products[0]?.description?.substring(0, 80) || 'N/A'}..."`, 'cyan');
      }
    }

    // Query 5: Documents
    log('\n📋 QUERY 5: Checking documents table', 'blue');
    const { data: documents, error: docsError, count: docsCount } = await supabase
      .from('documents')
      .select('id, filename, page_count, metadata', { count: 'exact' })
      .limit(10);
    
    if (docsError) {
      log(`⚠️  Error querying documents: ${docsError.message}`, 'yellow');
    } else {
      log(`✅ Found ${docsCount || 0} total documents`, docsCount && docsCount > 0 ? 'green' : 'yellow');
      if (documents && documents.length > 0) {
        log(`   - First document: "${documents[0]?.filename}"`, 'cyan');
        log(`   - Pages: ${documents[0]?.page_count || 'N/A'}`, 'cyan');
      }
    }

    // Summary
    log('\n' + '='.repeat(120), 'cyan');
    log('📊 DATABASE SUMMARY', 'cyan');
    log('='.repeat(120), 'cyan');
    log(`${docsCount && docsCount > 0 ? '✅' : '❌'} Documents: ${docsCount || 0}`, docsCount && docsCount > 0 ? 'green' : 'red');
    log(`${chunksCount && chunksCount > 0 ? '✅' : '❌'} Chunks: ${chunksCount || 0}`, chunksCount && chunksCount > 0 ? 'green' : 'red');
    log(`${imagesCount && imagesCount > 0 ? '✅' : '❌'} Images: ${imagesCount || 0}`, imagesCount && imagesCount > 0 ? 'green' : 'red');
    log(`${embeddingsCount && embeddingsCount > 0 ? '✅' : '❌'} Embeddings: ${embeddingsCount || 0}`, embeddingsCount && embeddingsCount > 0 ? 'green' : 'red');
    log(`${productsCount && productsCount > 0 ? '✅' : '❌'} Products: ${productsCount || 0}`, productsCount && productsCount > 0 ? 'green' : 'red');

    log('\n📋 ISSUES DETECTED:', 'magenta');
    if (!embeddingsCount || embeddingsCount === 0) {
      log('   ❌ NO EMBEDDINGS GENERATED - This is a critical issue!', 'red');
      log('      Embeddings are required for semantic search and AI features', 'yellow');
    }
    if (!imagesCount || imagesCount === 0) {
      log('   ❌ NO IMAGES EXTRACTED - Check if PDF has images or if extraction is disabled', 'yellow');
    }
    if (chunksCount && chunksCount > 0 && (!embeddingsCount || embeddingsCount === 0)) {
      log('   ⚠️  Chunks exist but embeddings are missing - embedding generation may be failing', 'yellow');
    }

    const allSuccess = (chunksCount || 0) > 0 && (embeddingsCount || 0) > 0;
    log(`\n${allSuccess ? '✅ PROCESSING COMPLETE' : '❌ PROCESSING INCOMPLETE - EMBEDDINGS MISSING'}`, allSuccess ? 'green' : 'red');
    log('='.repeat(120) + '\n', 'cyan');
    
  } catch (error) {
    log(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`, 'red');
    process.exit(1);
  }
}

testDatabaseQueries();


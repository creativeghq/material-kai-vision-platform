#!/usr/bin/env node

/**
 * GENERATE MISSING EMBEDDINGS
 * 
 * This script generates embeddings for all chunks that don't have them yet.
 * It uses the OpenAI API directly to create embeddings.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  const timestamp = new Date().toISOString();
  console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

async function generateEmbedding(text) {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.data[0]?.embedding || [];
  } catch (error) {
    throw error;
  }
}

async function generateMissingEmbeddings() {
  log('='.repeat(120), 'cyan');
  log('🔄 GENERATING MISSING EMBEDDINGS', 'cyan');
  log('='.repeat(120) + '\n', 'cyan');

  if (!OPENAI_API_KEY) {
    log('❌ OpenAI API key not found in environment', 'red');
    log('   Set OPENAI_API_KEY environment variable to continue', 'yellow');
    process.exit(1);
  }

  try {
    // Get all documents
    log('📋 Fetching documents...', 'blue');
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, filename');

    if (docsError) {
      log(`❌ Failed to fetch documents: ${docsError.message}`, 'red');
      return;
    }

    if (!documents || documents.length === 0) {
      log('⚠️  No documents found', 'yellow');
      return;
    }

    log(`✅ Found ${documents.length} documents\n`, 'green');

    let totalEmbeddingsGenerated = 0;
    let totalFailed = 0;

    for (const doc of documents) {
      log(`📄 Processing document: ${doc.filename}`, 'blue');

      // Get chunks for this document
      const { data: chunks, error: chunksError } = await supabase
        .from('document_chunks')
        .select('id, content')
        .eq('document_id', doc.id);

      if (chunksError) {
        log(`   ❌ Failed to fetch chunks: ${chunksError.message}`, 'red');
        continue;
      }

      if (!chunks || chunks.length === 0) {
        log(`   ⚠️  No chunks found`, 'yellow');
        continue;
      }

      log(`   📊 Found ${chunks.length} chunks`, 'cyan');

      let embeddingsGenerated = 0;
      let failed = 0;

      // Process chunks in batches
      const batchSize = 10;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        log(`   📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}...`, 'cyan');

        for (const chunk of batch) {
          try {
            const embedding = await generateEmbedding(chunk.content);

            if (!embedding || embedding.length === 0) {
              failed++;
              continue;
            }

            // Store embedding
            const { error: storeError } = await supabase
              .from('document_vectors')
              .insert({
                document_id: doc.id,
                chunk_id: chunk.id,
                content: chunk.content,
                embedding,
                model_name: 'text-embedding-3-small',
                metadata: {
                  generated_by: 'batch_generation_script',
                  generated_at: new Date().toISOString(),
                },
              });

            if (storeError) {
              log(`      ⚠️  Failed to store embedding for chunk ${chunk.id}`, 'yellow');
              failed++;
            } else {
              embeddingsGenerated++;
            }
          } catch (error) {
            log(`      ❌ Error processing chunk: ${error.message}`, 'red');
            failed++;
          }
        }

        // Delay between batches
        if (i + batchSize < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      log(`   ✅ Generated ${embeddingsGenerated} embeddings (${failed} failed)`, 'green');
      totalEmbeddingsGenerated += embeddingsGenerated;
      totalFailed += failed;
      log('', 'reset');
    }

    log('='.repeat(120), 'cyan');
    log('✅ EMBEDDING GENERATION COMPLETE', 'green');
    log(`   - Total embeddings generated: ${totalEmbeddingsGenerated}`, 'green');
    log(`   - Total failed: ${totalFailed}`, totalFailed > 0 ? 'yellow' : 'green');
    log('='.repeat(120), 'cyan');

  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    process.exit(1);
  }
}

generateMissingEmbeddings();


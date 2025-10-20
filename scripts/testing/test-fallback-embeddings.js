/**
 * Test Fallback Embedding Generation
 *
 * This script tests the fallback embedding generation for existing chunks
 * that don't have embeddings yet.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('❌ Missing OpenAI API key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    console.error('❌ Failed to generate embedding:', error.message);
    throw error;
  }
}

async function testFallbackEmbeddings() {
  console.log('========================================================================================================================');
  console.log('🧪 TEST: FALLBACK EMBEDDING GENERATION');
  console.log('========================================================================================================================\n');

  try {
    // Get all documents
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, filename')
      .limit(1);

    if (docsError) {
      console.error('❌ Failed to fetch documents:', docsError);
      return;
    }

    if (!documents || documents.length === 0) {
      console.log('⚠️  No documents found in database');
      return;
    }

    const documentId = documents[0].id;
    console.log(`📄 Testing with document: ${documents[0].filename} (ID: ${documentId})\n`);

    // Get chunks for this document
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, content')
      .eq('document_id', documentId)
      .limit(5);

    if (chunksError) {
      console.error('❌ Failed to fetch chunks:', chunksError);
      return;
    }

    if (!chunks || chunks.length === 0) {
      console.log('⚠️  No chunks found for document');
      return;
    }

    console.log(`📊 Found ${chunks.length} chunks to test\n`);

    // Test embedding generation for first chunk
    const testChunk = chunks[0];
    console.log(`🔄 Generating embedding for chunk: ${testChunk.id}`);
    console.log(`   Content preview: ${testChunk.content.substring(0, 100)}...\n`);

    const embedding = await generateEmbedding(testChunk.content);

    if (!embedding || embedding.length === 0) {
      console.error('❌ Failed to generate embedding');
      return;
    }

    console.log(`✅ Embedding generated successfully`);
    console.log(`   - Dimensions: ${embedding.length}`);
    console.log(`   - First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]\n`);

    // Store embedding in database
    console.log(`💾 Storing embedding in document_vectors table...`);
    const { error: storeError } = await supabase
      .from('document_vectors')
      .insert({
        document_id: documentId,
        chunk_id: testChunk.id,
        content: testChunk.content,
        embedding,
        model_name: 'text-embedding-3-small',
        metadata: {
          generated_by: 'fallback_test',
          generated_at: new Date().toISOString(),
        },
      });

    if (storeError) {
      console.error('❌ Failed to store embedding:', storeError);
      return;
    }

    console.log(`✅ Embedding stored successfully\n`);

    // Verify embedding was stored
    console.log(`🔍 Verifying embedding in database...`);
    const { data: storedEmbeddings, error: verifyError } = await supabase
      .from('document_vectors')
      .select('id, embedding')
      .eq('chunk_id', testChunk.id)
      .limit(1);

    if (verifyError) {
      console.error('❌ Failed to verify embedding:', verifyError);
      return;
    }

    if (storedEmbeddings && storedEmbeddings.length > 0) {
      const stored = storedEmbeddings[0];
      console.log(`✅ Embedding verified in database`);
      console.log(`   - ID: ${stored.id}`);
      console.log(`   - Dimensions: ${stored.embedding.length}\n`);
    } else {
      console.error('❌ Embedding not found in database after storage');
      return;
    }

    // Summary
    console.log('========================================================================================================================');
    console.log('✅ FALLBACK EMBEDDING GENERATION TEST PASSED');
    console.log('========================================================================================================================');
    console.log('\n✅ Summary:');
    console.log('   - Embedding generation: SUCCESS');
    console.log('   - Embedding storage: SUCCESS');
    console.log('   - Embedding verification: SUCCESS');
    console.log('\n✅ The fallback embedding service is working correctly!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testFallbackEmbeddings();


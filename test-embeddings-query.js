/**
 * Test Embeddings Query - Demonstrates how embeddings work
 * This script tests semantic similarity search using embeddings
 */

const fetch = require('node-fetch');

// Configuration
const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const WORKSPACE_ID = 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e'; // Default Workspace

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_ANON_KEY environment variable not set');
  process.exit(1);
}

/**
 * Generate embedding for a query using OpenAI API
 */
async function generateQueryEmbedding(query) {
  console.log(`\n📝 Generating embedding for query: "${query}"`);
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/document-vector-search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        workspace_id: WORKSPACE_ID,
        match_threshold: 0.5,
        match_count: 10,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ Embedding generated successfully`);
    return data;
  } catch (error) {
    console.error('❌ Error generating embedding:', error.message);
    throw error;
  }
}

/**
 * Test semantic similarity search
 */
async function testEmbeddingSearch() {
  console.log('🚀 Starting Embeddings Query Test\n');
  console.log('=' .repeat(80));
  
  // Test queries
  const testQueries = [
    'fabric materials for furniture',
    'leather upholstery',
    'sustainable materials',
    'color and texture',
    'product design',
  ];

  for (const query of testQueries) {
    try {
      console.log(`\n🔍 Testing query: "${query}"`);
      console.log('-'.repeat(80));
      
      const results = await generateQueryEmbedding(query);
      
      if (results.data && results.data.length > 0) {
        console.log(`✅ Found ${results.data.length} similar chunks\n`);
        
        results.data.slice(0, 3).forEach((result, index) => {
          console.log(`  ${index + 1}. Similarity: ${(result.similarity * 100).toFixed(2)}%`);
          console.log(`     Content: ${result.content.substring(0, 100)}...`);
          console.log(`     Metadata: ${JSON.stringify(result.metadata).substring(0, 80)}...`);
        });
      } else {
        console.log('⚠️  No similar chunks found');
      }
    } catch (error) {
      console.error(`❌ Error testing query: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Embeddings test completed!\n');
}

// Run the test
testEmbeddingSearch().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


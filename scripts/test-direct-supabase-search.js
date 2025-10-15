#!/usr/bin/env node

/**
 * TEST DIRECT SUPABASE SEARCH
 * Test vector search directly using Supabase API
 */

import https from 'https';

const BASE_URL = 'https://v1api.materialshub.gr';

function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data, headers: res.headers });
                }
            });
        });
        
        req.on('error', reject);
        
        if (options.body) {
            req.write(options.body);
        }
        
        req.end();
    });
}

async function testDirectSupabaseSearch() {
    console.log('🔍 TEST DIRECT SUPABASE SEARCH');
    console.log('==================================================');
    
    try {
        console.log('\n1. First, let\'s generate an embedding for our test query...');
        
        // Generate embedding for "dummy" query
        const embeddingResponse = await makeRequest(`${BASE_URL}/api/rag/health`);
        
        if (embeddingResponse.status === 200) {
            console.log('   ✅ Service is healthy');
            
            // Get a test embedding from the health check
            const testEmbedding = embeddingResponse.data.services.embedding.test_embedding;
            console.log(`   Test embedding dimensions: ${testEmbedding.dimension}`);
            
            console.log('\n2. Now let\'s test the search with a simple query...');
            
            // Test with a very simple search
            const searchPayload = {
                query: "test",
                max_results: 10,
                similarity_threshold: 0.0  // Accept any similarity
            };
            
            console.log(`   Payload: ${JSON.stringify(searchPayload)}`);
            
            const searchResponse = await makeRequest(`${BASE_URL}/api/search/semantic`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(searchPayload)
            });
            
            console.log(`   Status: ${searchResponse.status}`);
            
            if (searchResponse.status === 200) {
                const results = searchResponse.data.results || [];
                console.log(`   Results found: ${results.length}`);
                console.log(`   Total results: ${searchResponse.data.total_results}`);
                console.log(`   Searched documents: ${searchResponse.data.metadata?.searched_documents}`);
                
                if (results.length > 0) {
                    console.log('\n   ✅ SEARCH IS WORKING!');
                    results.forEach((result, idx) => {
                        console.log(`   Result ${idx + 1}:`);
                        console.log(`     - Score: ${result.score?.toFixed(4) || 'N/A'}`);
                        console.log(`     - Content: "${result.content?.substring(0, 50) || 'N/A'}..."`);
                        console.log(`     - Document ID: ${result.document_id || 'N/A'}`);
                    });
                } else {
                    console.log('\n   ⚠️ No results found');
                    console.log('   This could mean:');
                    console.log('   - No documents have embeddings');
                    console.log('   - Similarity calculation is not working');
                    console.log('   - Document filtering is too restrictive');
                }
            } else {
                console.log(`   ❌ Search failed: ${JSON.stringify(searchResponse.data)}`);
            }
        } else {
            console.log(`   ❌ Service health check failed: ${embeddingResponse.status}`);
        }
        
    } catch (error) {
        console.log(`❌ Test error: ${error.message}`);
    }
}

testDirectSupabaseSearch().catch(console.error);

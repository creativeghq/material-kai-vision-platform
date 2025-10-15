#!/usr/bin/env node

/**
 * COMPREHENSIVE SEARCH TEST
 * Test vector search across all documents with different queries
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

async function testComprehensiveSearch() {
    console.log('🔍 COMPREHENSIVE SEARCH TEST');
    console.log('==================================================');
    
    const testQueries = [
        { query: "dummy", description: "Test with 'dummy' - should find PDF content" },
        { query: "material", description: "Test with 'material' - should find material analysis docs" },
        { query: "ceramic", description: "Test with 'ceramic' - should find ceramic tile content" },
        { query: "test", description: "Test with 'test' - should find test documents" },
        { query: "document", description: "Test with 'document' - should find various documents" }
    ];
    
    try {
        console.log('\n1. Health check...');
        const healthResponse = await makeRequest(`${BASE_URL}/api/rag/health`);
        
        if (healthResponse.status !== 200) {
            console.log(`   ❌ Service health check failed: ${healthResponse.status}`);
            return;
        }
        
        console.log('   ✅ Service is healthy');
        
        for (let i = 0; i < testQueries.length; i++) {
            const test = testQueries[i];
            console.log(`\n${i + 2}. ${test.description}`);
            
            const searchPayload = {
                query: test.query,
                max_results: 5,
                similarity_threshold: 0.1  // Lower threshold to find more results
            };
            
            console.log(`   Query: "${test.query}"`);
            
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
                    console.log('   ✅ Results:');
                    results.forEach((result, idx) => {
                        console.log(`     ${idx + 1}. Score: ${result.score?.toFixed(4)} | "${result.content?.substring(0, 60)}..."`);
                    });
                } else {
                    console.log('   ⚠️ No results found');
                }
            } else {
                console.log(`   ❌ Search failed: ${searchResponse.status}`);
            }
        }
        
        console.log('\n==================================================');
        console.log('🎉 COMPREHENSIVE SEARCH TEST COMPLETED');
        
    } catch (error) {
        console.log(`❌ Test error: ${error.message}`);
    }
}

testComprehensiveSearch().catch(console.error);

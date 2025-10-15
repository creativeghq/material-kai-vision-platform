#!/usr/bin/env node

/**
 * DEBUG SEARCH 500 ERROR
 * Investigate the search endpoint 500 errors
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

async function debugSearch500Error() {
    console.log('🔍 DEBUGGING SEARCH 500 ERROR');
    console.log('==================================================');
    
    // Test 1: Basic search endpoint health
    console.log('\n1. Testing basic search endpoint...');
    try {
        const basicSearchPayload = {
            query: "test",
            limit: 5,
            similarity_threshold: 0.1,
            search_type: "semantic"
        };
        
        const searchResponse = await makeRequest(`${BASE_URL}/api/search/semantic`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(basicSearchPayload)
        });
        
        console.log(`📊 Search endpoint status: ${searchResponse.status}`);
        
        if (searchResponse.status === 500) {
            console.log(`❌ 500 Error details:`);
            console.log(`   Response: ${JSON.stringify(searchResponse.data, null, 2)}`);
            
            // Check if it's a specific error message
            if (searchResponse.data && searchResponse.data.detail) {
                console.log(`   Error detail: ${searchResponse.data.detail}`);
            }
        } else if (searchResponse.status === 200) {
            console.log(`✅ Search working! Results: ${searchResponse.data.results?.length || 0}`);
        }
    } catch (error) {
        console.log(`❌ Search test error: ${error.message}`);
    }
    
    // Test 2: Check LlamaIndex service health
    console.log('\n2. Testing LlamaIndex service health...');
    try {
        const healthResponse = await makeRequest(`${BASE_URL}/api/health/llamaindex`);
        console.log(`📊 LlamaIndex health: ${healthResponse.status}`);
        
        if (healthResponse.status === 200) {
            console.log(`✅ LlamaIndex service: ${JSON.stringify(healthResponse.data)}`);
        } else {
            console.log(`❌ LlamaIndex service issue: ${JSON.stringify(healthResponse.data)}`);
        }
    } catch (error) {
        console.log(`❌ LlamaIndex health check error: ${error.message}`);
    }
    
    // Test 3: Check general health endpoint
    console.log('\n3. Testing general health endpoint...');
    try {
        const generalHealthResponse = await makeRequest(`${BASE_URL}/api/health`);
        console.log(`📊 General health: ${generalHealthResponse.status}`);
        
        if (generalHealthResponse.status === 200) {
            console.log(`✅ General health: ${JSON.stringify(generalHealthResponse.data)}`);
        }
    } catch (error) {
        console.log(`❌ General health check error: ${error.message}`);
    }
    
    // Test 4: Try different search endpoints
    console.log('\n4. Testing alternative search endpoints...');
    
    const endpoints = [
        '/api/v1/rag/search',
        '/api/v1/rag/query',
        '/api/search/vector',
        '/api/search/hybrid'
    ];
    
    for (const endpoint of endpoints) {
        try {
            const testPayload = {
                query: "test",
                limit: 5
            };
            
            const response = await makeRequest(`${BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(testPayload)
            });
            
            console.log(`📊 ${endpoint}: ${response.status}`);
            
            if (response.status === 200) {
                console.log(`   ✅ Working! Results: ${response.data.results?.length || 0}`);
            } else if (response.status === 404) {
                console.log(`   ⚠️ Not found`);
            } else if (response.status === 500) {
                console.log(`   ❌ 500 error: ${response.data.detail || 'Unknown'}`);
            }
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
        }
    }
    
    // Test 5: Check if embeddings are available
    console.log('\n5. Testing embeddings availability...');
    try {
        // Get a document with chunks
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/documents`);
        
        if (docsResponse.status === 200 && docsResponse.data.documents && docsResponse.data.documents.length > 0) {
            const doc = docsResponse.data.documents[0];
            console.log(`📄 Testing with document: ${doc.document_id}`);
            
            // Get chunks for this document
            const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${doc.document_id}/chunks`);
            
            if (chunksResponse.status === 200 && chunksResponse.data.data && chunksResponse.data.data.length > 0) {
                const chunk = chunksResponse.data.data[0];
                console.log(`📄 Chunk has embedding: ${chunk.embedding ? 'YES' : 'NO'}`);
                
                if (chunk.embedding) {
                    console.log(`   📊 Embedding dimensions: ${chunk.embedding.length}`);
                } else {
                    console.log(`   ⚠️ No embeddings found - this may be the issue!`);
                }
            }
        }
    } catch (error) {
        console.log(`❌ Embeddings check error: ${error.message}`);
    }
    
    // Test 6: Simple document query
    console.log('\n6. Testing document-specific query...');
    try {
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/documents`);
        
        if (docsResponse.status === 200 && docsResponse.data.documents && docsResponse.data.documents.length > 0) {
            const doc = docsResponse.data.documents[0];
            
            const queryPayload = {
                query: "test",
                context_length: 1000
            };
            
            const queryResponse = await makeRequest(`${BASE_URL}/api/documents/${doc.document_id}/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(queryPayload)
            });
            
            console.log(`📊 Document query: ${queryResponse.status}`);
            
            if (queryResponse.status === 200) {
                console.log(`✅ Document query working!`);
            } else if (queryResponse.status === 500) {
                console.log(`❌ Document query 500: ${queryResponse.data.detail || 'Unknown'}`);
            }
        }
    } catch (error) {
        console.log(`❌ Document query error: ${error.message}`);
    }
    
    console.log('\n🎯 SEARCH DEBUG COMPLETE');
    console.log('==================================================');
}

debugSearch500Error().catch(console.error);

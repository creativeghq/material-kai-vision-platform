#!/usr/bin/env node

/**
 * TEST RAG SEARCH FUNCTIONALITY
 * Tests the actual RAG search endpoints
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

async function testRagSearch() {
    console.log('🔍 TESTING RAG SEARCH FUNCTIONALITY');
    console.log('==================================================');
    
    // Test RAG search endpoint
    console.log('\n📋 Step 1: Testing RAG search endpoint...');
    try {
        const searchPayload = {
            query: "material",
            top_k: 5,
            search_type: "semantic"
        };
        
        const searchResponse = await makeRequest(`${BASE_URL}/api/v1/rag/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(searchPayload)
        });
        
        console.log(`📊 RAG Search: ${searchResponse.status}`);
        
        if (searchResponse.status === 200) {
            console.log(`✅ Search successful!`);
            console.log(`📄 Results: ${searchResponse.data.results?.length || 0}`);
            console.log(`📊 Total: ${searchResponse.data.total_results || 0}`);
            console.log(`⏱️ Time: ${searchResponse.data.processing_time || 0}s`);
            
            if (searchResponse.data.results && searchResponse.data.results.length > 0) {
                const firstResult = searchResponse.data.results[0];
                console.log(`📄 Sample result: ${JSON.stringify(firstResult).substring(0, 200)}...`);
            }
        } else {
            console.log(`❌ Search failed: ${JSON.stringify(searchResponse.data).substring(0, 200)}...`);
        }
    } catch (error) {
        console.log(`❌ RAG search error: ${error.message}`);
    }
    
    // Test RAG query endpoint
    console.log('\n📋 Step 2: Testing RAG query endpoint...');
    try {
        const queryPayload = {
            query: "What materials are available?",
            top_k: 3,
            similarity_threshold: 0.7,
            enable_reranking: true
        };
        
        const queryResponse = await makeRequest(`${BASE_URL}/api/v1/rag/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(queryPayload)
        });
        
        console.log(`📊 RAG Query: ${queryResponse.status}`);
        
        if (queryResponse.status === 200) {
            console.log(`✅ Query successful!`);
            console.log(`💬 Answer: ${queryResponse.data.answer?.substring(0, 100) || 'No answer'}...`);
            console.log(`📄 Sources: ${queryResponse.data.sources?.length || 0}`);
            console.log(`🎯 Confidence: ${queryResponse.data.confidence_score || 0}`);
            console.log(`⏱️ Time: ${queryResponse.data.processing_time || 0}s`);
        } else {
            console.log(`❌ Query failed: ${JSON.stringify(queryResponse.data).substring(0, 200)}...`);
        }
    } catch (error) {
        console.log(`❌ RAG query error: ${error.message}`);
    }
    
    // Test document query endpoint
    console.log('\n📋 Step 3: Testing document-specific query...');
    try {
        // Get a document ID first
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/documents`);
        
        if (docsResponse.status === 200 && docsResponse.data.data && docsResponse.data.data.length > 0) {
            const docId = docsResponse.data.data[0].document_id;
            console.log(`🆔 Testing with document: ${docId}`);
            
            const docQueryPayload = {
                query: "What is this document about?",
                response_mode: "compact"
            };
            
            const docQueryResponse = await makeRequest(`${BASE_URL}/api/search/documents/${docId}/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(docQueryPayload)
            });
            
            console.log(`📊 Document Query: ${docQueryResponse.status}`);
            
            if (docQueryResponse.status === 200) {
                console.log(`✅ Document query successful!`);
                console.log(`💬 Response: ${docQueryResponse.data.response?.substring(0, 100) || 'No response'}...`);
                console.log(`📄 Sources: ${docQueryResponse.data.sources?.length || 0}`);
            } else {
                console.log(`❌ Document query failed: ${JSON.stringify(docQueryResponse.data).substring(0, 200)}...`);
            }
        } else {
            console.log(`❌ No documents available for testing`);
        }
    } catch (error) {
        console.log(`❌ Document query error: ${error.message}`);
    }
    
    // Test semantic search
    console.log('\n📋 Step 4: Testing semantic search...');
    try {
        const semanticPayload = {
            query: "dummy PDF content",
            document_ids: null,
            limit: 5,
            similarity_threshold: 0.5,
            search_type: "semantic"
        };
        
        const semanticResponse = await makeRequest(`${BASE_URL}/api/search/semantic`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(semanticPayload)
        });
        
        console.log(`📊 Semantic Search: ${semanticResponse.status}`);
        
        if (semanticResponse.status === 200) {
            console.log(`✅ Semantic search successful!`);
            console.log(`📄 Results: ${semanticResponse.data.results?.length || 0}`);
        } else {
            console.log(`❌ Semantic search failed: ${JSON.stringify(semanticResponse.data).substring(0, 200)}...`);
        }
    } catch (error) {
        console.log(`❌ Semantic search error: ${error.message}`);
    }
    
    console.log('\n🎉 RAG SEARCH FUNCTIONALITY TEST COMPLETE!');
}

testRagSearch().catch(console.error);

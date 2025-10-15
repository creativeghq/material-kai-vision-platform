#!/usr/bin/env node

/**
 * CHECK EMBEDDINGS TABLE
 * Check if embeddings are being stored in the database
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

async function checkEmbeddingsTable() {
    console.log('🔍 CHECKING EMBEDDINGS TABLE');
    console.log('==================================================');
    
    // Check if there's a direct API to query embeddings table
    console.log('\n1. Checking for embeddings in database...');
    
    // Try to access embeddings through a direct query endpoint
    try {
        // First, let's check if there are any embeddings at all
        const testQuery = {
            query: "SELECT COUNT(*) FROM embeddings",
            table: "embeddings"
        };
        
        // Since there's no direct embeddings endpoint, let's check document_vectors table
        console.log('\n2. Checking document_vectors table...');
        
        // Get recent documents first
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/documents`);
        
        if (docsResponse.status === 200 && docsResponse.data.documents) {
            const docs = docsResponse.data.documents;
            const sortedDocs = docs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            console.log(`📊 Total documents: ${docs.length}`);
            
            if (sortedDocs.length > 0) {
                const latestDoc = sortedDocs[0];
                console.log(`📄 Latest document: ${latestDoc.document_id}`);
                
                // Get chunks to see their IDs
                const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${latestDoc.document_id}/chunks`);
                
                if (chunksResponse.status === 200 && chunksResponse.data.data) {
                    const chunks = chunksResponse.data.data;
                    console.log(`📄 Document has ${chunks.length} chunks`);
                    
                    if (chunks.length > 0) {
                        const firstChunk = chunks[0];
                        const chunkId = firstChunk.chunk_id || firstChunk.id;
                        console.log(`📄 First chunk ID: ${chunkId}`);
                        
                        // Check if we can query the embeddings table directly through any endpoint
                        console.log('\n3. Checking for embedding service endpoints...');
                        
                        // Try the RAG endpoints that might show embeddings
                        const ragHealthResponse = await makeRequest(`${BASE_URL}/api/rag/health`);
                        console.log(`📊 RAG health: ${ragHealthResponse.status}`);
                        
                        if (ragHealthResponse.status === 200) {
                            console.log(`✅ RAG service available`);
                            console.log(`📄 RAG health: ${JSON.stringify(ragHealthResponse.data, null, 2)}`);
                        }
                        
                        // Try to query for embeddings through search
                        console.log('\n4. Testing if embeddings exist through search...');
                        
                        const searchPayload = {
                            query: "test",
                            limit: 1,
                            search_type: "semantic"
                        };
                        
                        const searchResponse = await makeRequest(`${BASE_URL}/api/search/semantic`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(searchPayload)
                        });
                        
                        console.log(`🔍 Search response: ${searchResponse.status}`);
                        
                        if (searchResponse.status === 200) {
                            console.log(`📄 Search data: ${JSON.stringify(searchResponse.data, null, 2)}`);
                        } else {
                            console.log(`❌ Search error: ${JSON.stringify(searchResponse.data)}`);
                        }
                        
                        // Check if there are any vector search endpoints
                        console.log('\n5. Checking vector search endpoints...');
                        
                        const vectorSearchResponse = await makeRequest(`${BASE_URL}/api/search/vector`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                query_vector: [0.1, 0.2, 0.3], // dummy vector
                                limit: 1
                            })
                        });
                        
                        console.log(`🔍 Vector search: ${vectorSearchResponse.status}`);
                        
                        if (vectorSearchResponse.status === 200) {
                            console.log(`📄 Vector search works!`);
                        } else {
                            console.log(`❌ Vector search error: ${vectorSearchResponse.status}`);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
    
    console.log('\n🎯 EMBEDDINGS TABLE CHECK SUMMARY');
    console.log('==================================================');
    console.log('🔍 INVESTIGATION:');
    console.log('   - Check if embeddings are being stored in database');
    console.log('   - Verify embedding service is working during processing');
    console.log('   - Test if search endpoints can access embeddings');
    console.log('   - Identify where the embedding generation is failing');
}

checkEmbeddingsTable().catch(console.error);

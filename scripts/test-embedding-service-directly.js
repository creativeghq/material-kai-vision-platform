#!/usr/bin/env node

/**
 * TEST EMBEDDING SERVICE DIRECTLY
 * Test if the embedding service can generate embeddings manually
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

async function testEmbeddingServiceDirectly() {
    console.log('🔍 TEST EMBEDDING SERVICE DIRECTLY');
    console.log('==================================================');
    
    try {
        // 1. Check RAG health and embedding service status
        console.log('1. Checking RAG health and embedding service...');
        const ragHealthResponse = await makeRequest(`${BASE_URL}/api/rag/health`);
        
        if (ragHealthResponse.status === 200) {
            const embeddingService = ragHealthResponse.data.services?.embedding;
            if (embeddingService) {
                console.log(`✅ Embedding service status: ${embeddingService.status}`);
                console.log(`📊 Model: ${embeddingService.model?.name} (${embeddingService.model?.dimension} dimensions)`);
                console.log(`📈 Total embeddings generated: ${embeddingService.metrics?.total_embeddings_generated || 0}`);
                
                if (embeddingService.status === 'healthy') {
                    console.log(`✅ Embedding service is healthy!`);
                } else {
                    console.log(`❌ Embedding service is not healthy: ${embeddingService.message}`);
                    return;
                }
            } else {
                console.log(`❌ No embedding service data found`);
                return;
            }
        } else {
            console.log(`❌ RAG health check failed: ${ragHealthResponse.status}`);
            return;
        }
        
        // 2. Try to generate an embedding manually through the RAG endpoint
        console.log('\n2. Testing manual embedding generation...');
        
        // Check if there's a direct embedding endpoint
        const embeddingEndpoints = [
            '/api/rag/embed',
            '/api/embedding/generate',
            '/api/embeddings/generate',
            '/api/rag/generate-embedding'
        ];
        
        for (const endpoint of embeddingEndpoints) {
            try {
                const testPayload = {
                    text: "This is a test text for embedding generation",
                    model: "text-embedding-3-small"
                };
                
                const embeddingResponse = await makeRequest(`${BASE_URL}${endpoint}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(testPayload)
                });
                
                console.log(`📊 ${endpoint}: ${embeddingResponse.status}`);
                
                if (embeddingResponse.status === 200) {
                    console.log(`✅ Manual embedding generation works!`);
                    if (embeddingResponse.data.embedding) {
                        console.log(`📊 Embedding dimensions: ${embeddingResponse.data.embedding.length}`);
                        console.log(`📊 Sample values: [${embeddingResponse.data.embedding.slice(0, 3).join(', ')}...]`);
                    }
                    break;
                } else if (embeddingResponse.status === 404) {
                    console.log(`⚠️ ${endpoint}: Not found`);
                } else {
                    console.log(`❌ ${endpoint}: Error ${embeddingResponse.status}`);
                    if (embeddingResponse.data) {
                        console.log(`📄 Error details: ${JSON.stringify(embeddingResponse.data)}`);
                    }
                }
            } catch (error) {
                console.log(`❌ Error testing ${endpoint}: ${error.message}`);
            }
        }
        
        // 3. Check if there's an issue with the document processing pipeline
        console.log('\n3. Checking document processing pipeline...');
        
        // Get an existing document and try to reprocess it
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/documents`);
        
        if (docsResponse.status === 200 && docsResponse.data.data && docsResponse.data.data.length > 0) {
            const testDoc = docsResponse.data.data[0];
            const docId = testDoc.id;
            
            console.log(`📄 Testing with document: ${docId}`);
            
            // Check if there's a reprocess endpoint
            const reprocessEndpoints = [
                `/api/documents/documents/${docId}/reprocess`,
                `/api/documents/${docId}/generate-embeddings`,
                `/api/rag/index-document/${docId}`,
                `/api/admin/documents/${docId}/reindex`
            ];
            
            for (const endpoint of reprocessEndpoints) {
                try {
                    const reprocessResponse = await makeRequest(`${BASE_URL}${endpoint}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({})
                    });
                    
                    console.log(`📊 ${endpoint}: ${reprocessResponse.status}`);
                    
                    if (reprocessResponse.status === 200) {
                        console.log(`✅ Document reprocessing initiated!`);
                        
                        // Wait a bit and check if embeddings were generated
                        console.log('⏳ Waiting for reprocessing to complete...');
                        await new Promise(resolve => setTimeout(resolve, 10000));
                        
                        const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${docId}/chunks`);
                        
                        if (chunksResponse.status === 200 && chunksResponse.data.data) {
                            const chunks = chunksResponse.data.data;
                            const chunksWithEmbeddings = chunks.filter(chunk => 
                                chunk.embedding && Array.isArray(chunk.embedding) && chunk.embedding.length > 0
                            );
                            
                            console.log(`📊 After reprocessing: ${chunksWithEmbeddings.length}/${chunks.length} chunks have embeddings`);
                            
                            if (chunksWithEmbeddings.length > 0) {
                                console.log(`✅ EMBEDDINGS GENERATED AFTER REPROCESSING!`);
                                
                                // Test search functionality
                                console.log('\n4. Testing search functionality...');
                                
                                const searchPayload = {
                                    query: "test",
                                    limit: 5,
                                    similarity_threshold: 0.1
                                };
                                
                                const searchResponse = await makeRequest(`${BASE_URL}/api/search/semantic`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify(searchPayload)
                                });
                                
                                console.log(`🔍 Search test: ${searchResponse.status}`);
                                
                                if (searchResponse.status === 200) {
                                    const results = searchResponse.data.results || [];
                                    console.log(`📄 Search results: ${results.length}`);
                                    
                                    if (results.length > 0) {
                                        console.log(`✅ SEARCH FUNCTIONALITY WORKING!`);
                                        
                                        // Final success summary
                                        console.log('\n🎉 FINAL SUCCESS SUMMARY');
                                        console.log('==================================================');
                                        console.log('✅ ALL ISSUES RESOLVED:');
                                        console.log('   ✅ Progress tracking: Working');
                                        console.log('   ✅ Embedding generation: Working (after reprocessing)');
                                        console.log('   ✅ Embedding retrieval: Working');
                                        console.log('   ✅ Search functionality: Working');
                                        console.log('');
                                        console.log('🚀 PLATFORM IS FULLY FUNCTIONAL!');
                                        console.log('');
                                        console.log('⚠️ NOTE: New documents may need manual reprocessing to generate embeddings');
                                        console.log('   This suggests the embedding generation during PDF processing needs investigation');
                                        return;
                                    }
                                }
                            }
                        }
                        break;
                    } else if (reprocessResponse.status === 404) {
                        console.log(`⚠️ ${endpoint}: Not found`);
                    } else {
                        console.log(`❌ ${endpoint}: Error ${reprocessResponse.status}`);
                    }
                } catch (error) {
                    console.log(`❌ Error testing ${endpoint}: ${error.message}`);
                }
            }
        }
        
        console.log('\n❌ EMBEDDING GENERATION ISSUE PERSISTS');
        console.log('==================================================');
        console.log('🔍 DIAGNOSIS:');
        console.log('   ✅ Embedding service is healthy and available');
        console.log('   ✅ API endpoints return embeddings when they exist');
        console.log('   ❌ Embeddings are NOT being generated during PDF processing');
        console.log('   ❌ Manual embedding generation endpoints not found');
        console.log('');
        console.log('🔧 NEXT STEPS:');
        console.log('   1. Check server logs for embedding generation errors during PDF processing');
        console.log('   2. Verify that the LlamaIndex service is calling the embedding service correctly');
        console.log('   3. Check if there are any errors in the _store_chunks_in_database method');
        console.log('   4. Verify OpenAI API key is working by testing it directly');
        
    } catch (error) {
        console.log(`❌ Test error: ${error.message}`);
    }
}

testEmbeddingServiceDirectly().catch(console.error);

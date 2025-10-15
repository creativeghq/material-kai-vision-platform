#!/usr/bin/env node

/**
 * TEST NEW JOB WITH EMBEDDINGS
 * Submit a new job and monitor if embeddings are generated
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

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testNewJobWithEmbeddings() {
    console.log('🔧 TESTING NEW JOB WITH EMBEDDINGS');
    console.log('==================================================');
    
    // Submit a new job to test embedding generation
    console.log('\n1. Submitting new job to test embedding generation...');
    try {
        const testPdf = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
        
        const jobPayload = {
            urls: [testPdf],
            processing_options: {
                extract_images: true,
                extract_text: true
            }
        };
        
        const jobResponse = await makeRequest(`${BASE_URL}/api/bulk/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(jobPayload)
        });
        
        console.log(`📊 Job submission: ${jobResponse.status}`);
        
        if (jobResponse.status === 200 && jobResponse.data.data && jobResponse.data.data.job_id) {
            const jobId = jobResponse.data.data.job_id;
            console.log(`✅ Job submitted: ${jobId}`);
            
            // Wait for completion
            console.log('\n2. Waiting for job completion...');
            let attempts = 0;
            const maxAttempts = 20;
            
            while (attempts < maxAttempts) {
                await sleep(3000);
                attempts++;
                
                const statusResponse = await makeRequest(`${BASE_URL}/api/jobs/${jobId}/status`);
                
                if (statusResponse.status === 200) {
                    const status = statusResponse.data;
                    console.log(`⏳ Job status: ${status.status} (attempt ${attempts})`);
                    
                    if (status.status === 'completed') {
                        console.log(`✅ Job completed!`);
                        
                        // Check if document was created
                        if (status.document_ids && status.document_ids.length > 0) {
                            const docId = status.document_ids[0];
                            console.log(`📄 Document created: ${docId}`);
                            
                            // Wait a bit for embeddings to be processed
                            console.log('\n3. Waiting for embeddings to be processed...');
                            await sleep(5000);
                            
                            // Check chunks and embeddings
                            console.log('\n4. Checking chunks and embeddings...');
                            
                            const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${docId}/chunks`);
                            
                            if (chunksResponse.status === 200 && chunksResponse.data.data) {
                                const chunks = chunksResponse.data.data;
                                console.log(`📄 Document has ${chunks.length} chunks`);
                                
                                if (chunks.length > 0) {
                                    const chunksWithEmbeddings = chunks.filter(chunk => 
                                        chunk.embedding && Array.isArray(chunk.embedding) && chunk.embedding.length > 0
                                    );
                                    
                                    console.log(`🔧 Chunks with embeddings: ${chunksWithEmbeddings.length}/${chunks.length}`);
                                    
                                    if (chunksWithEmbeddings.length > 0) {
                                        console.log(`✅ EMBEDDINGS GENERATED SUCCESSFULLY!`);
                                        console.log(`📊 Embedding dimensions: ${chunksWithEmbeddings[0].embedding.length}`);
                                        console.log(`📄 Sample embedding: [${chunksWithEmbeddings[0].embedding.slice(0, 3).join(', ')}...]`);
                                        
                                        // Test search with new embeddings
                                        console.log('\n5. Testing search with new embeddings...');
                                        
                                        const searchPayload = {
                                            query: "dummy",
                                            document_ids: [docId],
                                            limit: 5,
                                            similarity_threshold: 0.1,
                                            search_type: "semantic"
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
                                                console.log(`📄 Found ${results.length} relevant results`);
                                            } else {
                                                console.log(`⚠️ Search working but no results`);
                                            }
                                        } else {
                                            console.log(`❌ Search error: ${searchResponse.status}`);
                                        }
                                    } else {
                                        console.log(`❌ NO EMBEDDINGS GENERATED - Issue persists`);
                                        
                                        // Check RAG health again to see if embedding service is still working
                                        console.log('\n6. Checking embedding service health after processing...');
                                        
                                        const ragHealthResponse = await makeRequest(`${BASE_URL}/api/rag/health`);
                                        
                                        if (ragHealthResponse.status === 200) {
                                            const embeddingMetrics = ragHealthResponse.data.services?.embedding?.metrics;
                                            if (embeddingMetrics) {
                                                console.log(`📊 Embedding service metrics:`);
                                                console.log(`   - Total embeddings generated: ${embeddingMetrics.total_embeddings_generated}`);
                                                console.log(`   - Total tokens processed: ${embeddingMetrics.total_tokens_processed}`);
                                                console.log(`   - Cache hits: ${embeddingMetrics.cache_hits}`);
                                                console.log(`   - Cache misses: ${embeddingMetrics.cache_misses}`);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        break;
                    } else if (status.status === 'failed') {
                        console.log(`❌ Job failed: ${status.error_message || 'Unknown error'}`);
                        break;
                    }
                }
            }
            
            if (attempts >= maxAttempts) {
                console.log('⏰ Job monitoring timeout');
            }
            
        } else {
            console.log(`❌ Job submission failed: ${JSON.stringify(jobResponse.data)}`);
        }
    } catch (error) {
        console.log(`❌ Test error: ${error.message}`);
    }
    
    console.log('\n🎯 NEW JOB EMBEDDING TEST SUMMARY');
    console.log('==================================================');
    console.log('🔧 TESTING RESULTS:');
    console.log('   - Job submission and completion');
    console.log('   - Embedding generation during processing');
    console.log('   - Embedding storage in database');
    console.log('   - Search functionality with embeddings');
}

testNewJobWithEmbeddings().catch(console.error);

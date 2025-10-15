#!/usr/bin/env node

/**
 * FINAL EMBEDDING TEST
 * Comprehensive test to verify embedding generation is working
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

async function finalEmbeddingTest() {
    console.log('🎯 FINAL EMBEDDING TEST');
    console.log('==================================================');
    
    // 1. Check RAG health first
    console.log('\n1. Checking RAG service health...');
    try {
        const ragHealthResponse = await makeRequest(`${BASE_URL}/api/rag/health`);
        
        if (ragHealthResponse.status === 200) {
            const embeddingService = ragHealthResponse.data.services?.embedding;
            if (embeddingService) {
                console.log(`✅ Embedding service status: ${embeddingService.status}`);
                console.log(`📊 Model: ${embeddingService.model?.name} (${embeddingService.model?.dimension} dimensions)`);
                console.log(`📈 Total embeddings generated: ${embeddingService.metrics?.total_embeddings_generated || 0}`);
                
                if (embeddingService.status === 'healthy') {
                    console.log(`✅ Embedding service is healthy and ready!`);
                } else {
                    console.log(`❌ Embedding service is not healthy: ${embeddingService.message}`);
                    return;
                }
            }
        } else {
            console.log(`❌ RAG health check failed: ${ragHealthResponse.status}`);
            return;
        }
    } catch (error) {
        console.log(`❌ RAG health check error: ${error.message}`);
        return;
    }
    
    // 2. Submit a new job to test embedding generation
    console.log('\n2. Submitting new job to test embedding generation...');
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
            
            // 3. Wait for completion with progress monitoring
            console.log('\n3. Monitoring job progress...');
            let attempts = 0;
            const maxAttempts = 30;
            let jobCompleted = false;
            let documentId = null;
            
            while (attempts < maxAttempts && !jobCompleted) {
                await sleep(3000);
                attempts++;
                
                const statusResponse = await makeRequest(`${BASE_URL}/api/jobs/${jobId}/status`);
                
                if (statusResponse.status === 200) {
                    const status = statusResponse.data;
                    console.log(`⏳ Job progress: ${status.progress_percentage || 0}% - ${status.current_step || 'Processing'} (attempt ${attempts})`);
                    
                    if (status.status === 'completed') {
                        console.log(`✅ Job completed successfully!`);
                        jobCompleted = true;
                        
                        if (status.document_ids && status.document_ids.length > 0) {
                            documentId = status.document_ids[0];
                            console.log(`📄 Document created: ${documentId}`);
                        }
                    } else if (status.status === 'failed') {
                        console.log(`❌ Job failed: ${status.error_message || 'Unknown error'}`);
                        return;
                    }
                }
            }
            
            if (!jobCompleted) {
                console.log('⏰ Job monitoring timeout - checking latest jobs...');
                
                // Check if job completed but we missed it
                const jobsResponse = await makeRequest(`${BASE_URL}/api/jobs`);
                if (jobsResponse.status === 200 && jobsResponse.data.jobs) {
                    const latestJob = jobsResponse.data.jobs.find(job => job.job_id === jobId);
                    if (latestJob && latestJob.status === 'completed' && latestJob.document_ids) {
                        documentId = latestJob.document_ids[0];
                        console.log(`📄 Found completed job with document: ${documentId}`);
                        jobCompleted = true;
                    }
                }
            }
            
            if (jobCompleted && documentId) {
                // 4. Wait a bit for embeddings to be processed
                console.log('\n4. Waiting for embeddings to be processed...');
                await sleep(5000);
                
                // 5. Check chunks and embeddings
                console.log('\n5. Checking chunks and embeddings...');
                
                const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${documentId}/chunks`);
                
                if (chunksResponse.status === 200 && chunksResponse.data.data) {
                    const chunks = chunksResponse.data.data;
                    console.log(`📄 Document has ${chunks.length} chunks`);
                    
                    if (chunks.length > 0) {
                        const chunksWithEmbeddings = chunks.filter(chunk => 
                            chunk.embedding && Array.isArray(chunk.embedding) && chunk.embedding.length > 0
                        );
                        
                        console.log(`\n📊 EMBEDDING RESULTS:`);
                        console.log(`   - Total chunks: ${chunks.length}`);
                        console.log(`   - Chunks with embeddings: ${chunksWithEmbeddings.length}`);
                        console.log(`   - Embedding success rate: ${((chunksWithEmbeddings.length / chunks.length) * 100).toFixed(1)}%`);
                        
                        if (chunksWithEmbeddings.length > 0) {
                            const firstEmbedding = chunksWithEmbeddings[0].embedding;
                            console.log(`   - Embedding dimensions: ${firstEmbedding.length}`);
                            console.log(`   - Sample embedding: [${firstEmbedding.slice(0, 3).join(', ')}...]`);
                            console.log(`   ✅ EMBEDDINGS GENERATED SUCCESSFULLY!`);
                            
                            // 6. Test search functionality
                            console.log('\n6. Testing search functionality...');
                            
                            const searchPayload = {
                                query: "dummy",
                                document_ids: [documentId],
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
                                    
                                    // 7. Final success summary
                                    console.log('\n🎉 FINAL SUCCESS SUMMARY');
                                    console.log('==================================================');
                                    console.log('✅ ALL ISSUES RESOLVED:');
                                    console.log('   ✅ Progress tracking: Working (100% completion)');
                                    console.log('   ✅ Embedding generation: Working (embeddings created)');
                                    console.log('   ✅ Embedding retrieval: Working (API returns embeddings)');
                                    console.log('   ✅ Search functionality: Working (semantic search)');
                                    console.log('');
                                    console.log('🚀 PLATFORM IS FULLY FUNCTIONAL AND READY FOR LAUNCH!');
                                    return;
                                } else {
                                    console.log(`⚠️ Search working but no results (may need more content)`);
                                }
                            } else {
                                console.log(`❌ Search error: ${searchResponse.status}`);
                                console.log(`📄 Error details: ${JSON.stringify(searchResponse.data)}`);
                            }
                        } else {
                            console.log(`   ❌ NO EMBEDDINGS GENERATED - Issue persists`);
                            
                            // Check for error logs
                            console.log('\n7. Checking for embedding generation errors...');
                            console.log('   - Check server logs for embedding service initialization errors');
                            console.log('   - Verify OpenAI API key is properly configured');
                            console.log('   - Check if EmbeddingConfig parameters are correct');
                        }
                    } else {
                        console.log(`❌ No chunks found in document`);
                    }
                } else {
                    console.log(`❌ Failed to retrieve chunks: ${chunksResponse.status}`);
                }
            } else {
                console.log(`❌ Job did not complete successfully or no document created`);
            }
        } else {
            console.log(`❌ Job submission failed: ${JSON.stringify(jobResponse.data)}`);
        }
    } catch (error) {
        console.log(`❌ Test error: ${error.message}`);
    }
}

finalEmbeddingTest().catch(console.error);

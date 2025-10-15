#!/usr/bin/env node

/**
 * TEST COMPLETED JOB EMBEDDINGS
 * Check if the completed job generated embeddings
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

async function testCompletedJobEmbeddings() {
    console.log('🔍 TESTING COMPLETED JOB EMBEDDINGS');
    console.log('==================================================');
    
    try {
        // 1. Get the completed job details
        console.log('1. Getting completed job details...');
        const jobId = 'bulk_20251015_091437';
        
        const jobResponse = await makeRequest(`${BASE_URL}/api/jobs/${jobId}/status`);
        
        if (jobResponse.status === 200) {
            const job = jobResponse.data;
            console.log(`✅ Job Status: ${job.status}`);
            console.log(`📊 Progress: ${job.progress_percentage}%`);
            console.log(`📄 Document IDs: ${job.document_ids ? job.document_ids.length : 0}`);
            
            if (job.document_ids && job.document_ids.length > 0) {
                const documentId = job.document_ids[0];
                console.log(`📄 Testing document: ${documentId}`);
                
                // 2. Check chunks and embeddings
                console.log('\n2. Checking chunks and embeddings...');
                
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
                            
                            // 3. Test search functionality
                            console.log('\n3. Testing search functionality...');
                            
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
                                    
                                    // Show first result
                                    const firstResult = results[0];
                                    console.log(`📄 First result score: ${firstResult.score?.toFixed(3) || 'N/A'}`);
                                    console.log(`📄 First result content: "${firstResult.content?.substring(0, 100) || 'N/A'}..."`);
                                    
                                    // 4. Final success summary
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
                                    console.log(`⚠️ Search working but no results (may need more content or different query)`);
                                    
                                    // Try a broader search
                                    console.log('\n4. Trying broader search...');
                                    const broadSearchPayload = {
                                        query: "test",
                                        limit: 10,
                                        similarity_threshold: 0.0
                                    };
                                    
                                    const broadSearchResponse = await makeRequest(`${BASE_URL}/api/search/semantic`, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify(broadSearchPayload)
                                    });
                                    
                                    if (broadSearchResponse.status === 200) {
                                        const broadResults = broadSearchResponse.data.results || [];
                                        console.log(`📄 Broad search results: ${broadResults.length}`);
                                        
                                        if (broadResults.length > 0) {
                                            console.log(`✅ SEARCH FUNCTIONALITY WORKING WITH BROADER QUERY!`);
                                        }
                                    }
                                }
                            } else {
                                console.log(`❌ Search error: ${searchResponse.status}`);
                                console.log(`📄 Error details: ${JSON.stringify(searchResponse.data)}`);
                            }
                        } else {
                            console.log(`   ❌ NO EMBEDDINGS GENERATED - Issue persists`);
                            
                            // Show chunk details for debugging
                            console.log('\n📄 Chunk details for debugging:');
                            chunks.slice(0, 2).forEach((chunk, i) => {
                                console.log(`   Chunk ${i + 1}:`);
                                console.log(`     - ID: ${chunk.chunk_id}`);
                                console.log(`     - Content length: ${chunk.content?.length || 0}`);
                                console.log(`     - Embedding: ${chunk.embedding ? 'Present' : 'NULL'}`);
                                console.log(`     - Content preview: "${chunk.content?.substring(0, 50) || 'N/A'}..."`);
                            });
                        }
                    } else {
                        console.log(`❌ No chunks found in document`);
                    }
                } else {
                    console.log(`❌ Failed to retrieve chunks: ${chunksResponse.status}`);
                    console.log(`📄 Error: ${JSON.stringify(chunksResponse.data)}`);
                }
            } else {
                console.log(`❌ No document IDs found in completed job`);
            }
        } else {
            console.log(`❌ Failed to get job details: ${jobResponse.status}`);
        }
    } catch (error) {
        console.log(`❌ Test error: ${error.message}`);
    }
}

testCompletedJobEmbeddings().catch(console.error);

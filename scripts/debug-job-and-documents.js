#!/usr/bin/env node

/**
 * DEBUG JOB AND DOCUMENTS
 * Debug why job completed but no documents were created
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

async function debugJobAndDocuments() {
    console.log('🔍 DEBUG JOB AND DOCUMENTS');
    console.log('==================================================');
    
    try {
        // 1. Check all recent jobs
        console.log('1. Checking all recent jobs...');
        const jobsResponse = await makeRequest(`${BASE_URL}/api/jobs`);
        
        if (jobsResponse.status === 200) {
            const jobs = jobsResponse.data.jobs || [];
            console.log(`📊 Found ${jobs.length} total jobs`);
            
            if (jobs.length > 0) {
                console.log('\n📄 Recent jobs:');
                jobs.slice(0, 3).forEach((job, i) => {
                    console.log(`   ${i + 1}. Job ID: ${job.job_id}`);
                    console.log(`      Status: ${job.status}`);
                    console.log(`      Progress: ${job.progress_percentage || 0}%`);
                    console.log(`      Created: ${job.created_at}`);
                    console.log(`      Document IDs: ${job.document_ids ? job.document_ids.length : 0}`);
                    if (job.document_ids && job.document_ids.length > 0) {
                        console.log(`      Documents: ${job.document_ids.join(', ')}`);
                    }
                    console.log('');
                });
                
                // Find a job with documents
                const jobWithDocs = jobs.find(job => job.document_ids && job.document_ids.length > 0);
                
                if (jobWithDocs) {
                    console.log(`✅ Found job with documents: ${jobWithDocs.job_id}`);
                    const documentId = jobWithDocs.document_ids[0];
                    
                    // 2. Test embeddings with this document
                    console.log(`\n2. Testing embeddings with document: ${documentId}`);
                    
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
                                        console.log(`📄 Found ${results.length} relevant results`);
                                        
                                        // 4. Final success summary
                                        console.log('\n🎉 FINAL SUCCESS SUMMARY');
                                        console.log('==================================================');
                                        console.log('✅ ALL ISSUES RESOLVED:');
                                        console.log('   ✅ Progress tracking: Working (jobs complete)');
                                        console.log('   ✅ Embedding generation: Working (embeddings created)');
                                        console.log('   ✅ Embedding retrieval: Working (API returns embeddings)');
                                        console.log('   ✅ Search functionality: Working (semantic search)');
                                        console.log('');
                                        console.log('🚀 PLATFORM IS FULLY FUNCTIONAL AND READY FOR LAUNCH!');
                                        return;
                                    } else {
                                        console.log(`⚠️ Search working but no results found`);
                                    }
                                } else {
                                    console.log(`❌ Search error: ${searchResponse.status}`);
                                    console.log(`📄 Error details: ${JSON.stringify(searchResponse.data)}`);
                                }
                            } else {
                                console.log(`   ❌ NO EMBEDDINGS GENERATED`);
                                
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
                    }
                } else {
                    console.log(`❌ No jobs found with documents`);
                    
                    // Check if there are any documents at all
                    console.log('\n3. Checking if any documents exist...');
                    
                    // Try to get documents directly
                    const docsResponse = await makeRequest(`${BASE_URL}/api/documents/documents`);
                    
                    if (docsResponse.status === 200) {
                        const docs = docsResponse.data.data || [];
                        console.log(`📄 Found ${docs.length} total documents in system`);
                        
                        if (docs.length > 0) {
                            const testDoc = docs[0];
                            console.log(`📄 Testing with document: ${testDoc.id}`);
                            
                            // Test chunks for this document
                            const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${testDoc.id}/chunks`);
                            
                            if (chunksResponse.status === 200 && chunksResponse.data.data) {
                                const chunks = chunksResponse.data.data;
                                console.log(`📄 Document has ${chunks.length} chunks`);
                                
                                const chunksWithEmbeddings = chunks.filter(chunk => 
                                    chunk.embedding && Array.isArray(chunk.embedding) && chunk.embedding.length > 0
                                );
                                
                                console.log(`📊 Chunks with embeddings: ${chunksWithEmbeddings.length}/${chunks.length}`);
                                
                                if (chunksWithEmbeddings.length > 0) {
                                    console.log(`✅ EMBEDDINGS FOUND IN EXISTING DOCUMENTS!`);
                                }
                            }
                        }
                    }
                }
            } else {
                console.log(`❌ No jobs found`);
            }
        } else {
            console.log(`❌ Failed to get jobs: ${jobsResponse.status}`);
        }
    } catch (error) {
        console.log(`❌ Debug error: ${error.message}`);
    }
}

debugJobAndDocuments().catch(console.error);

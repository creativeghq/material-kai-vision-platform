#!/usr/bin/env node

/**
 * TEST FINAL FIXES
 * Test progress tracking and embedding generation fixes
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

async function testFinalFixes() {
    console.log('🎯 TESTING FINAL FIXES');
    console.log('==================================================');
    
    // Test 1: Submit a new job to test progress tracking
    console.log('\n1. Testing Progress Tracking Fix...');
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
            
            // Monitor progress in real-time
            console.log('\n⏱️ Monitoring progress tracking (expecting 10% → 15% → 40% → 60% → 70% → 85% → 100%)...');
            
            let attempts = 0;
            const maxAttempts = 20;
            let progressHistory = [];
            
            while (attempts < maxAttempts) {
                await sleep(3000); // Check every 3 seconds
                attempts++;
                
                const statusResponse = await makeRequest(`${BASE_URL}/api/jobs/${jobId}/status`);
                
                if (statusResponse.status === 200) {
                    const status = statusResponse.data;
                    const currentProgress = parseFloat(status.progress_percentage || status.progress) || 0;
                    
                    progressHistory.push({
                        attempt: attempts,
                        progress: currentProgress,
                        status: status.status,
                        step: status.current_step || 'Unknown'
                    });
                    
                    console.log(`   Check ${attempts}: ${status.status} (${currentProgress}%) - ${status.current_step || 'Processing'}`);
                    
                    // Analyze progress changes
                    if (progressHistory.length > 1) {
                        const lastProgress = progressHistory[progressHistory.length - 2].progress;
                        if (currentProgress > lastProgress) {
                            console.log(`      ✅ Progress increased: ${lastProgress}% → ${currentProgress}%`);
                        } else if (currentProgress === lastProgress && currentProgress <= 10 && attempts > 3) {
                            console.log(`      ⚠️ Progress might be stuck at ${currentProgress}%`);
                        }
                    }
                    
                    if (status.status === 'completed') {
                        console.log('🎉 Job completed!');
                        
                        // Analyze progress tracking
                        console.log('\n📊 PROGRESS TRACKING ANALYSIS:');
                        const uniqueProgress = [...new Set(progressHistory.map(p => p.progress))];
                        console.log(`   📈 Progress values seen: ${uniqueProgress.join('%, ')}%`);
                        
                        if (uniqueProgress.length === 1 && uniqueProgress[0] <= 10) {
                            console.log(`   ❌ ISSUE: Progress still stuck at ${uniqueProgress[0]}%`);
                        } else if (uniqueProgress.length >= 3) {
                            console.log(`   ✅ FIXED: Progress tracking working with ${uniqueProgress.length} different values!`);
                        } else {
                            console.log(`   ⚠️ PARTIAL: Progress tracking improved but could be better`);
                        }
                        
                        // Test 2: Check if embeddings are generated
                        console.log('\n2. Testing Embedding Generation Fix...');
                        
                        if (status.document_ids && status.document_ids.length > 0) {
                            const docId = status.document_ids[0];
                            console.log(`📄 Testing embeddings for document: ${docId}`);
                            
                            const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${docId}/chunks`);
                            
                            if (chunksResponse.status === 200 && chunksResponse.data.data) {
                                const chunks = chunksResponse.data.data;
                                console.log(`📄 Document has ${chunks.length} chunks`);
                                
                                if (chunks.length > 0) {
                                    const chunksWithEmbeddings = chunks.filter(chunk => chunk.embedding && chunk.embedding.length > 0);
                                    console.log(`🔧 Chunks with embeddings: ${chunksWithEmbeddings.length}/${chunks.length}`);
                                    
                                    if (chunksWithEmbeddings.length > 0) {
                                        console.log(`✅ FIXED: Embeddings are being generated!`);
                                        console.log(`   📊 Embedding dimensions: ${chunksWithEmbeddings[0].embedding.length}`);
                                        
                                        // Test 3: Test search functionality with embeddings
                                        console.log('\n3. Testing Search with New Embeddings...');
                                        
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
                                                console.log(`✅ SEARCH WORKING! Found ${results.length} results with embeddings`);
                                            } else {
                                                console.log(`⚠️ Search working but no results (may need time for indexing)`);
                                            }
                                        }
                                    } else {
                                        console.log(`❌ ISSUE: No embeddings found in chunks`);
                                    }
                                }
                            }
                        }
                        break;
                    } else if (status.status === 'failed') {
                        console.log('❌ Job failed!');
                        break;
                    }
                }
            }
            
            if (attempts >= maxAttempts) {
                console.log('⏰ Monitoring timeout');
            }
            
        } else {
            console.log(`❌ Job submission failed: ${JSON.stringify(jobResponse.data)}`);
        }
    } catch (error) {
        console.log(`❌ Test error: ${error.message}`);
    }
    
    console.log('\n🎯 FINAL FIXES TEST COMPLETE');
    console.log('==================================================');
    console.log('✅ EXPECTED RESULTS:');
    console.log('   - Progress tracking: 10% → 15% → 40% → 60% → 70% → 85% → 100%');
    console.log('   - Embeddings: Generated for all chunks');
    console.log('   - Search: Working with embedding-based results');
}

testFinalFixes().catch(console.error);

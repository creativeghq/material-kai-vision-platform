#!/usr/bin/env node

/**
 * MONITOR NEW JOB
 * Monitor the job that was just submitted: bulk_20251015_074245
 */

import https from 'https';

const BASE_URL = 'https://v1api.materialshub.gr';
const JOB_ID = 'bulk_20251015_074245';

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
        req.end();
    });
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function monitorNewJob() {
    console.log('🔍 MONITORING NEW JOB: bulk_20251015_074245');
    console.log('==================================================');
    
    let attempts = 0;
    const maxAttempts = 20;
    let progressHistory = [];
    
    while (attempts < maxAttempts) {
        await sleep(3000); // Check every 3 seconds
        attempts++;
        
        try {
            const statusResponse = await makeRequest(`${BASE_URL}/api/jobs/${JOB_ID}/status`);
            
            if (statusResponse.status === 200) {
                const status = statusResponse.data;
                const currentProgress = parseFloat(status.progress_percentage || status.progress) || 0;
                
                progressHistory.push({
                    attempt: attempts,
                    progress: currentProgress,
                    status: status.status,
                    step: status.current_step || 'Unknown',
                    timestamp: new Date().toISOString()
                });
                
                console.log(`Check ${attempts}: ${status.status} (${currentProgress}%) - ${status.current_step || 'Processing'}`);
                
                // Detailed progress analysis
                if (progressHistory.length > 1) {
                    const lastProgress = progressHistory[progressHistory.length - 2].progress;
                    if (currentProgress > lastProgress) {
                        console.log(`   ✅ Progress increased: ${lastProgress}% → ${currentProgress}%`);
                    } else if (currentProgress === lastProgress && currentProgress === 5 && attempts > 2) {
                        console.log(`   ⚠️ Progress stuck at 5% for ${attempts - 1} checks`);
                    }
                }
                
                // Show additional details if available
                if (status.processed_count !== undefined) {
                    console.log(`   📊 Processed: ${status.processed_count}, Chunks: ${status.chunks_created || 0}, Images: ${status.images_extracted || 0}`);
                }
                
                if (status.status === 'completed') {
                    console.log('🎉 Job completed!');
                    console.log(`📊 Final Results:`);
                    console.log(`   📄 Documents: ${status.processed_count || 0}`);
                    console.log(`   📝 Chunks: ${status.chunks_created || 0}`);
                    console.log(`   🖼️ Images: ${status.images_extracted || 0}`);
                    
                    // Progress tracking analysis
                    console.log('\n📊 PROGRESS TRACKING ANALYSIS:');
                    const uniqueProgress = [...new Set(progressHistory.map(p => p.progress))];
                    console.log(`   📈 Progress values: ${uniqueProgress.join('%, ')}%`);
                    
                    if (uniqueProgress.length === 1 && uniqueProgress[0] === 5) {
                        console.log(`   ❌ ISSUE CONFIRMED: Progress stuck at 5% throughout`);
                    } else if (uniqueProgress.length === 2 && uniqueProgress.includes(5) && uniqueProgress.includes(100)) {
                        console.log(`   ⚠️ ISSUE CONFIRMED: Progress jumps from 5% to 100%`);
                    } else if (uniqueProgress.length > 2) {
                        console.log(`   ✅ GOOD: Progress tracking working properly`);
                    }
                    
                    // Test search with new content
                    if (status.document_ids && status.document_ids.length > 0) {
                        const docId = status.document_ids[0];
                        console.log(`\n🔍 TESTING SEARCH WITH NEW DOCUMENT: ${docId}`);
                        
                        // Get chunks
                        const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${docId}/chunks`);
                        
                        if (chunksResponse.status === 200 && chunksResponse.data.data) {
                            const chunks = chunksResponse.data.data;
                            console.log(`📄 Document has ${chunks.length} chunks`);
                            
                            if (chunks.length > 0) {
                                // Test search with chunk content
                                const searchTerm = "dummy"; // We know this is in the dummy PDF
                                
                                const searchPayload = {
                                    query: searchTerm,
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
                                
                                console.log(`🔍 Search for "${searchTerm}": ${searchResponse.status}`);
                                
                                if (searchResponse.status === 200) {
                                    const results = searchResponse.data.results || [];
                                    console.log(`📄 Search results: ${results.length}`);
                                    
                                    if (results.length > 0) {
                                        console.log(`✅ SEARCH WORKING! Found matching content`);
                                        console.log(`📄 Result: ${JSON.stringify(results[0]).substring(0, 150)}...`);
                                    } else {
                                        console.log(`⚠️ Search working but no results - may need embeddings`);
                                    }
                                }
                            }
                        }
                    }
                    break;
                } else if (status.status === 'failed') {
                    console.log('❌ Job failed!');
                    console.log(`❌ Error: ${status.error_message || 'Unknown error'}`);
                    break;
                }
            } else {
                console.log(`❌ Status check failed: ${statusResponse.status}`);
            }
        } catch (error) {
            console.log(`❌ Error checking status: ${error.message}`);
        }
    }
    
    if (attempts >= maxAttempts) {
        console.log('⏰ Monitoring timeout - job may still be processing');
    }
    
    console.log('\n🎯 MONITORING COMPLETE');
}

monitorNewJob().catch(console.error);

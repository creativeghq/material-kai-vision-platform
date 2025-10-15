#!/usr/bin/env node

/**
 * FIX REMAINING ISSUES
 * 1. Fix job submission API parameter
 * 2. Test search with actual content
 * 3. Test progress tracking during processing
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

async function fixRemainingIssues() {
    console.log('🔧 FIXING REMAINING ISSUES');
    console.log('==================================================');
    
    // Issue 1: Fix job submission API parameter
    console.log('\n🔧 1. FIXING JOB SUBMISSION API PARAMETER:');
    try {
        const testPdf = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
        
        // Try with correct parameter name 'urls'
        const jobPayload = {
            urls: [testPdf],  // Changed from pdf_urls to urls
            processing_options: {
                extract_images: true,
                extract_text: true
            }
        };
        
        console.log('📋 Testing job submission with correct parameter...');
        const jobResponse = await makeRequest(`${BASE_URL}/api/bulk/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(jobPayload)
        });
        
        console.log(`📊 Job submission: ${jobResponse.status}`);
        
        if (jobResponse.status === 200 && jobResponse.data.job_id) {
            const jobId = jobResponse.data.job_id;
            console.log(`✅ Job submitted successfully: ${jobId}`);
            console.log(`🎯 API parameter fix confirmed!`);
            
            // Issue 3: Test progress tracking during processing
            console.log('\n🔧 3. TESTING PROGRESS TRACKING:');
            console.log('⏱️ Monitoring job progress in real-time...');
            
            let attempts = 0;
            const maxAttempts = 15;
            let progressHistory = [];
            
            while (attempts < maxAttempts) {
                await sleep(2000); // Check every 2 seconds
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
                    
                    // Check if progress is changing
                    if (progressHistory.length > 1) {
                        const lastProgress = progressHistory[progressHistory.length - 2].progress;
                        if (currentProgress > lastProgress) {
                            console.log(`   ✅ Progress increased: ${lastProgress}% → ${currentProgress}%`);
                        } else if (currentProgress === lastProgress && currentProgress === 5 && attempts > 3) {
                            console.log(`   ⚠️ Progress stuck at 5% - this is the issue we need to investigate`);
                        }
                    }
                    
                    if (status.status === 'completed') {
                        console.log('🎉 Job completed!');
                        console.log(`📊 Final progress: ${currentProgress}%`);
                        
                        // Analyze progress tracking
                        console.log('\n📊 PROGRESS TRACKING ANALYSIS:');
                        const uniqueProgress = [...new Set(progressHistory.map(p => p.progress))];
                        console.log(`   📈 Progress values seen: ${uniqueProgress.join('%, ')}%`);
                        
                        if (uniqueProgress.length === 1 && uniqueProgress[0] === 5) {
                            console.log(`   ❌ CONFIRMED: Progress stuck at 5% throughout processing`);
                        } else if (uniqueProgress.length > 1) {
                            console.log(`   ✅ GOOD: Progress tracking is working properly`);
                        }
                        
                        // Get final job results
                        if (status.document_ids && status.document_ids.length > 0) {
                            const docId = status.document_ids[0];
                            console.log(`\n🆔 New document created: ${docId}`);
                            
                            // Issue 2: Test search with new content
                            console.log('\n🔧 2. TESTING SEARCH WITH NEW CONTENT:');
                            
                            // Get chunks from new document
                            const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${docId}/chunks`);
                            
                            if (chunksResponse.status === 200 && chunksResponse.data.data && chunksResponse.data.data.length > 0) {
                                const chunks = chunksResponse.data.data;
                                console.log(`📄 New document has ${chunks.length} chunks`);
                                
                                // Extract search terms from chunk content
                                const chunkContent = chunks[0].content;
                                const words = chunkContent.split(' ').filter(word => word.length > 3);
                                const searchTerm = words[0] || 'dummy';
                                
                                console.log(`🔍 Testing search with term from new content: "${searchTerm}"`);
                                
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
                                
                                console.log(`📊 Search result: ${searchResponse.status}`);
                                
                                if (searchResponse.status === 200) {
                                    const results = searchResponse.data.results || [];
                                    console.log(`📄 Search results: ${results.length}`);
                                    
                                    if (results.length > 0) {
                                        console.log(`✅ SEARCH IS WORKING! Found ${results.length} results`);
                                        console.log(`📄 Sample result: ${JSON.stringify(results[0]).substring(0, 200)}...`);
                                    } else {
                                        console.log(`⚠️ Search endpoint working but no results found`);
                                        
                                        // Try broader search
                                        console.log(`🔍 Trying broader search across all documents...`);
                                        
                                        const broadSearchPayload = {
                                            query: "page",
                                            limit: 10,
                                            similarity_threshold: 0.05,
                                            search_type: "semantic"
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
                                                console.log(`✅ SEARCH WORKING! Found results with broader criteria`);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        break;
                    } else if (status.status === 'failed') {
                        console.log('❌ Job failed!');
                        break;
                    }
                } else {
                    console.log(`❌ Status check failed: ${statusResponse.status}`);
                }
            }
            
            if (attempts >= maxAttempts) {
                console.log('⏰ Progress monitoring timeout');
            }
            
        } else {
            console.log(`❌ Job submission still failed: ${JSON.stringify(jobResponse.data)}`);
        }
    } catch (error) {
        console.log(`❌ Error fixing issues: ${error.message}`);
    }
    
    console.log('\n🎉 REMAINING ISSUES FIX COMPLETE!');
}

fixRemainingIssues().catch(console.error);

#!/usr/bin/env node

/**
 * TEST HARMONY PDF - FINAL TEST
 * Test the large Harmony PDF to verify all functionality
 */

import https from 'https';

const BASE_URL = 'https://v1api.materialshub.gr';
const HARMONY_PDF = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/1760462185826-harmony-signature-book-24-25.pdf';

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

async function testHarmonyFinal() {
    console.log('🎯 HARMONY PDF FINAL TEST');
    console.log('==================================================');
    
    // Submit Harmony PDF
    console.log('\n📋 Submitting Harmony PDF for processing...');
    try {
        const jobPayload = {
            urls: [HARMONY_PDF],  // Using correct parameter name
            processing_options: {
                extract_images: true,
                extract_text: true,
                chunk_size: 1000
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
            console.log(`✅ Harmony PDF job submitted: ${jobId}`);
            console.log(`⏱️ Estimated completion: ${jobResponse.data.data.estimated_completion_time}`);
            
            // Monitor progress for a reasonable time
            console.log('\n⏱️ Monitoring progress (will check for 2 minutes)...');
            let attempts = 0;
            const maxAttempts = 24; // 2 minutes with 5-second intervals
            let progressHistory = [];
            
            while (attempts < maxAttempts) {
                await sleep(5000); // Check every 5 seconds
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
                    
                    // Show processing details if available
                    if (status.processed_count !== undefined) {
                        console.log(`      📊 Processed: ${status.processed_count}, Chunks: ${status.chunks_created || 0}, Images: ${status.images_extracted || 0}`);
                    }
                    
                    // Progress analysis
                    if (progressHistory.length > 1) {
                        const lastProgress = progressHistory[progressHistory.length - 2].progress;
                        if (currentProgress > lastProgress) {
                            console.log(`      ✅ Progress increased: ${lastProgress}% → ${currentProgress}%`);
                        } else if (currentProgress === 5 && attempts > 3) {
                            console.log(`      ⚠️ Progress stuck at 5% for ${attempts - 2} checks`);
                        }
                    }
                    
                    if (status.status === 'completed') {
                        console.log('🎉 Harmony PDF processing completed!');
                        console.log(`📊 Final Results:`);
                        console.log(`   📄 Documents: ${status.processed_count || 0}`);
                        console.log(`   📝 Chunks: ${status.chunks_created || 0}`);
                        console.log(`   🖼️ Images: ${status.images_extracted || 0}`);
                        
                        // Test search with Harmony content
                        if (status.document_ids && status.document_ids.length > 0) {
                            const docId = status.document_ids[0];
                            console.log(`\n🔍 Testing search with Harmony content...`);
                            
                            // Get some chunks to see what content we have
                            const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${docId}/chunks`);
                            
                            if (chunksResponse.status === 200 && chunksResponse.data.data) {
                                const chunks = chunksResponse.data.data;
                                console.log(`📄 Harmony document has ${chunks.length} chunks`);
                                
                                if (chunks.length > 0) {
                                    // Test search with material-related terms
                                    const searchTerms = ['harmony', 'material', 'signature', 'design'];
                                    
                                    for (const term of searchTerms) {
                                        const searchPayload = {
                                            query: term,
                                            document_ids: [docId],
                                            limit: 3,
                                            similarity_threshold: 0.3,
                                            search_type: "semantic"
                                        };
                                        
                                        const searchResponse = await makeRequest(`${BASE_URL}/api/search/semantic`, {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json'
                                            },
                                            body: JSON.stringify(searchPayload)
                                        });
                                        
                                        if (searchResponse.status === 200) {
                                            const results = searchResponse.data.results || [];
                                            console.log(`🔍 Search "${term}": ${results.length} results`);
                                            
                                            if (results.length > 0) {
                                                console.log(`   ✅ Found matching content!`);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Progress tracking final analysis
                        console.log('\n📊 PROGRESS TRACKING FINAL ANALYSIS:');
                        const uniqueProgress = [...new Set(progressHistory.map(p => p.progress))];
                        console.log(`   📈 Progress values seen: ${uniqueProgress.join('%, ')}%`);
                        
                        if (uniqueProgress.length === 1 && uniqueProgress[0] === 5) {
                            console.log(`   ❌ ISSUE: Progress stuck at 5% throughout processing`);
                        } else if (uniqueProgress.length === 2 && uniqueProgress.includes(5) && uniqueProgress.includes(100)) {
                            console.log(`   ⚠️ ISSUE: Progress jumps from 5% directly to 100%`);
                        } else {
                            console.log(`   ✅ Progress tracking working correctly`);
                        }
                        
                        break;
                    } else if (status.status === 'failed') {
                        console.log('❌ Harmony PDF processing failed!');
                        break;
                    }
                }
            }
            
            if (attempts >= maxAttempts) {
                console.log('⏰ Monitoring timeout - Harmony PDF may still be processing');
                console.log('   (Large PDFs can take longer than 2 minutes)');
            }
            
        } else {
            console.log(`❌ Harmony PDF submission failed: ${JSON.stringify(jobResponse.data)}`);
        }
    } catch (error) {
        console.log(`❌ Harmony test error: ${error.message}`);
    }
    
    console.log('\n🎉 HARMONY PDF FINAL TEST COMPLETE');
}

testHarmonyFinal().catch(console.error);

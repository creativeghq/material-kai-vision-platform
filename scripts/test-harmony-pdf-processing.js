#!/usr/bin/env node

/**
 * TEST HARMONY PDF PROCESSING
 * Tests the Harmony PDF with progress tracking and search
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

async function testHarmonyProcessing() {
    console.log('🎯 TESTING HARMONY PDF PROCESSING');
    console.log('==================================================');
    
    // Step 1: Submit Harmony PDF for processing
    console.log('\n📋 Step 1: Submitting Harmony PDF...');
    try {
        const jobPayload = {
            pdf_urls: [HARMONY_PDF],
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
        
        if (jobResponse.status === 200 && jobResponse.data.job_id) {
            const jobId = jobResponse.data.job_id;
            console.log(`✅ Job submitted: ${jobId}`);
            
            // Step 2: Monitor progress in detail
            console.log('\n📋 Step 2: Monitoring detailed progress...');
            let attempts = 0;
            const maxAttempts = 30;
            let lastProgress = 0;
            
            while (attempts < maxAttempts) {
                await sleep(5000); // Check every 5 seconds
                attempts++;
                
                const statusResponse = await makeRequest(`${BASE_URL}/api/jobs/${jobId}/status`);
                
                if (statusResponse.status === 200) {
                    const status = statusResponse.data;
                    const currentProgress = parseFloat(status.progress) || 0;
                    
                    console.log(`   Check ${attempts}: ${status.status} (${status.progress}%) - Step: ${status.current_step || 'Unknown'}`);
                    
                    // Check if progress is actually changing
                    if (currentProgress > lastProgress) {
                        console.log(`   ✅ Progress increased: ${lastProgress}% → ${currentProgress}%`);
                        lastProgress = currentProgress;
                    } else if (attempts > 3 && currentProgress === lastProgress) {
                        console.log(`   ⚠️ Progress stuck at ${currentProgress}% for ${attempts - 3} checks`);
                    }
                    
                    // Show detailed status
                    if (status.processed_count !== undefined) {
                        console.log(`   📊 Processed: ${status.processed_count}, Chunks: ${status.chunks_created}, Images: ${status.images_extracted}`);
                    }
                    
                    if (status.status === 'completed') {
                        console.log('🎉 Job completed!');
                        console.log(`📊 Final Results:`);
                        console.log(`   📄 Documents: ${status.processed_count}`);
                        console.log(`   📝 Chunks: ${status.chunks_created}`);
                        console.log(`   🖼️ Images: ${status.images_extracted}`);
                        
                        // Step 3: Test document retrieval
                        if (status.document_ids && status.document_ids.length > 0) {
                            const docId = status.document_ids[0];
                            console.log(`\n📋 Step 3: Testing document retrieval...`);
                            console.log(`🆔 Document ID: ${docId}`);
                            
                            // Test chunks
                            const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${docId}/chunks`);
                            console.log(`📄 Chunks endpoint: ${chunksResponse.status}`);
                            
                            if (chunksResponse.status === 200 && chunksResponse.data.data) {
                                const chunks = chunksResponse.data.data;
                                console.log(`✅ Retrieved ${chunks.length} chunks`);
                                
                                if (chunks.length > 0) {
                                    console.log(`📄 Sample chunk: "${chunks[0].content.substring(0, 100)}..."`);
                                    console.log(`📊 Chunk metadata: ${JSON.stringify(chunks[0].metadata)}`);
                                }
                                
                                // Step 4: Test search with actual content
                                console.log(`\n📋 Step 4: Testing search with chunk content...`);
                                
                                if (chunks.length > 0) {
                                    // Extract a word from the first chunk to search for
                                    const searchTerm = chunks[0].content.split(' ').find(word => word.length > 3) || 'material';
                                    console.log(`🔍 Searching for: "${searchTerm}"`);
                                    
                                    const searchPayload = {
                                        query: searchTerm,
                                        document_ids: [docId],
                                        limit: 5,
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
                                    
                                    console.log(`📊 Search result: ${searchResponse.status}`);
                                    
                                    if (searchResponse.status === 200) {
                                        console.log(`✅ Search successful!`);
                                        console.log(`📄 Results: ${searchResponse.data.results?.length || 0}`);
                                        
                                        if (searchResponse.data.results && searchResponse.data.results.length > 0) {
                                            console.log(`📄 Found matching content!`);
                                        } else {
                                            console.log(`⚠️ No search results found`);
                                        }
                                    }
                                }
                            }
                            
                            // Test images
                            const imagesResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${docId}/images`);
                            console.log(`🖼️ Images endpoint: ${imagesResponse.status}`);
                            
                            if (imagesResponse.status === 200 && imagesResponse.data.data) {
                                const images = imagesResponse.data.data;
                                console.log(`✅ Retrieved ${images.length} images`);
                                
                                if (images.length > 0) {
                                    console.log(`🖼️ Sample image: ${JSON.stringify(images[0]).substring(0, 200)}...`);
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
            }
            
            if (attempts >= maxAttempts) {
                console.log('⏰ Job monitoring timeout - job may still be processing');
            }
        } else {
            console.log(`❌ Job submission failed: ${JSON.stringify(jobResponse.data)}`);
        }
    } catch (error) {
        console.log(`❌ Processing error: ${error.message}`);
    }
    
    console.log('\n🎉 HARMONY PDF PROCESSING TEST COMPLETE!');
}

testHarmonyProcessing().catch(console.error);

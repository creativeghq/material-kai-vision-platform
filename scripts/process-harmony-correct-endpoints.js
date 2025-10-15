#!/usr/bin/env node

/**
 * PROCESS HARMONY PDF - CORRECT ENDPOINTS
 * Use the discovered endpoints to process harmony-signature-book-24-25.pdf
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

async function processHarmonyWithCorrectEndpoints() {
    console.log('🚀 PROCESSING HARMONY PDF - CORRECT ENDPOINTS');
    console.log('==================================================');
    
    try {
        console.log('\n📋 STEP 1: PREPARATION');
        console.log('--------------------------------------------------');
        
        const storagePath = "49f683ad-ebf2-4296-a410-0d8c011ce0be/1760462185826-harmony-signature-book-24-25.pdf";
        const supabaseUrl = `https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/${storagePath}`;
        
        console.log('📄 Target: harmony-signature-book-24-25.pdf');
        console.log(`📁 Storage Path: ${storagePath}`);
        console.log(`🔗 Public URL: ${supabaseUrl}`);
        
        console.log('\n🚀 STEP 2: METHOD 1 - /api/documents/process');
        console.log('--------------------------------------------------');
        
        // Try processing with file content/URL
        const processPayload1 = {
            file_url: supabaseUrl,
            filename: "harmony-signature-book-24-25.pdf",
            workspace_id: "49f683ad-ebf2-4296-a410-0d8c011ce0be"
        };
        
        console.log('📤 Sending process request...');
        const processResponse1 = await makeRequest(`${BASE_URL}/api/documents/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(processPayload1)
        });
        
        console.log(`📊 Response Status: ${processResponse1.status}`);
        console.log(`📋 Response: ${JSON.stringify(processResponse1.data, null, 2)}`);
        
        if (processResponse1.status === 200 || processResponse1.status === 201) {
            console.log('✅ Processing started with /api/documents/process!');
            
            if (processResponse1.data.job_id) {
                console.log(`🆔 Job ID: ${processResponse1.data.job_id}`);
                
                // Monitor the job
                await monitorJob(processResponse1.data.job_id);
            }
        } else {
            console.log('❌ Method 1 failed, trying Method 2...');
            
            console.log('\n🚀 STEP 3: METHOD 2 - /api/documents/process-url');
            console.log('--------------------------------------------------');
            
            const processPayload2 = {
                url: supabaseUrl,
                filename: "harmony-signature-book-24-25.pdf"
            };
            
            const processResponse2 = await makeRequest(`${BASE_URL}/api/documents/process-url`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(processPayload2)
            });
            
            console.log(`📊 Response Status: ${processResponse2.status}`);
            console.log(`📋 Response: ${JSON.stringify(processResponse2.data, null, 2)}`);
            
            if (processResponse2.status === 200 || processResponse2.status === 201) {
                console.log('✅ Processing started with /api/documents/process-url!');
                
                if (processResponse2.data.job_id) {
                    await monitorJob(processResponse2.data.job_id);
                }
            } else {
                console.log('❌ Method 2 failed, trying Method 3...');
                
                console.log('\n🚀 STEP 4: METHOD 3 - /api/rag/documents/upload');
                console.log('--------------------------------------------------');
                
                const ragPayload = {
                    url: supabaseUrl,
                    filename: "harmony-signature-book-24-25.pdf",
                    workspace_id: "49f683ad-ebf2-4296-a410-0d8c011ce0be"
                };
                
                const ragResponse = await makeRequest(`${BASE_URL}/api/rag/documents/upload`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(ragPayload)
                });
                
                console.log(`📊 Response Status: ${ragResponse.status}`);
                console.log(`📋 Response: ${JSON.stringify(ragResponse.data, null, 2)}`);
                
                if (ragResponse.status === 200 || ragResponse.status === 201) {
                    console.log('✅ Processing started with /api/rag/documents/upload!');
                    
                    if (ragResponse.data.job_id) {
                        await monitorJob(ragResponse.data.job_id);
                    }
                } else {
                    console.log('❌ Method 3 failed, trying Method 4...');
                    
                    console.log('\n🚀 STEP 5: METHOD 4 - /api/bulk/process');
                    console.log('--------------------------------------------------');
                    
                    const bulkPayload = {
                        documents: [{
                            url: supabaseUrl,
                            filename: "harmony-signature-book-24-25.pdf",
                            workspace_id: "49f683ad-ebf2-4296-a410-0d8c011ce0be"
                        }]
                    };
                    
                    const bulkResponse = await makeRequest(`${BASE_URL}/api/bulk/process`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(bulkPayload)
                    });
                    
                    console.log(`📊 Response Status: ${bulkResponse.status}`);
                    console.log(`📋 Response: ${JSON.stringify(bulkResponse.data, null, 2)}`);
                    
                    if (bulkResponse.status === 200 || bulkResponse.status === 201) {
                        console.log('✅ Processing started with /api/bulk/process!');
                        
                        if (bulkResponse.data.job_id || bulkResponse.data.jobs) {
                            const jobId = bulkResponse.data.job_id || (bulkResponse.data.jobs && bulkResponse.data.jobs[0]?.job_id);
                            if (jobId) {
                                await monitorJob(jobId);
                            }
                        }
                    } else {
                        console.log('❌ All processing methods failed');
                    }
                }
            }
        }
        
        console.log('\n🔍 STEP 6: VERIFY RESULTS');
        console.log('--------------------------------------------------');
        
        // Check documents
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/documents`);
        if (docsResponse.status === 200) {
            const docs = docsResponse.data.documents || docsResponse.data || [];
            console.log(`📄 Total documents: ${docs.length}`);
            
            const harmonyDocs = docs.filter(doc => 
                (doc.filename && doc.filename.toLowerCase().includes('harmony')) ||
                (doc.original_filename && doc.original_filename.toLowerCase().includes('harmony'))
            );
            
            if (harmonyDocs.length > 0) {
                console.log('\n✅ HARMONY DOCUMENTS FOUND:');
                harmonyDocs.forEach((doc, idx) => {
                    console.log(`   ${idx + 1}. ${doc.filename || doc.original_filename} (${doc.status || doc.processing_status})`);
                });
            } else {
                console.log('❌ No harmony documents found yet');
            }
        }
        
        // Test search
        console.log('\n🔍 STEP 7: TEST VALENOVA SEARCH');
        console.log('--------------------------------------------------');
        
        const searchResponse = await makeRequest(`${BASE_URL}/api/search/semantic`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: "VALENOVA by SG NY",
                max_results: 5,
                similarity_threshold: 0.1
            })
        });
        
        if (searchResponse.status === 200) {
            const results = searchResponse.data.results || [];
            console.log(`🔍 Search results: ${results.length} found`);
            
            const highQualityResults = results.filter(r => r.score > 0.5);
            if (highQualityResults.length > 0) {
                console.log('\n🎉 HIGH-QUALITY VALENOVA RESULTS FOUND!');
                highQualityResults.forEach((result, idx) => {
                    console.log(`\n   ${idx + 1}. Score: ${result.score?.toFixed(4)} (${(result.score * 100).toFixed(1)}%)`);
                    console.log(`      📝 Content: "${result.content?.substring(0, 150)}..."`);
                    if (result.metadata?.original_filename) {
                        console.log(`      📁 File: ${result.metadata.original_filename}`);
                    }
                });
            } else {
                console.log('⚠️ No high-quality results yet - processing may still be in progress');
            }
        }
        
    } catch (error) {
        console.log(`❌ Processing Error: ${error.message}`);
    }
    
    console.log('\n==================================================');
    console.log('🎉 HARMONY PDF PROCESSING ATTEMPT COMPLETED');
    console.log('==================================================');
}

async function monitorJob(jobId) {
    console.log(`\n👀 MONITORING JOB: ${jobId}`);
    console.log('--------------------------------------------------');
    
    let attempts = 0;
    const maxAttempts = 24; // 2 minutes with 5-second intervals
    
    while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
        
        try {
            const statusResponse = await makeRequest(`${BASE_URL}/api/jobs/${jobId}/status`);
            
            if (statusResponse.status === 200) {
                const job = statusResponse.data;
                console.log(`   📊 Attempt ${attempts}: ${job.status} (${job.progress || 0}%)`);
                
                if (job.status === 'completed') {
                    console.log('✅ Job completed successfully!');
                    console.log(`   ⏱️ Total time: ${attempts * 5} seconds`);
                    
                    if (job.results) {
                        console.log(`   📄 Chunks: ${job.results.chunks_created || 'N/A'}`);
                        console.log(`   🖼️ Images: ${job.results.images_extracted || 'N/A'}`);
                        console.log(`   🤖 Embeddings: ${job.results.embeddings_generated || 'N/A'}`);
                    }
                    break;
                } else if (job.status === 'failed') {
                    console.log('❌ Job failed!');
                    console.log(`   🚨 Error: ${job.error || 'Unknown error'}`);
                    break;
                }
            } else {
                console.log(`   ⚠️ Status check failed: ${statusResponse.status}`);
            }
        } catch (error) {
            console.log(`   ❌ Monitoring error: ${error.message}`);
        }
    }
    
    if (attempts >= maxAttempts) {
        console.log('⏰ Monitoring timeout - job may still be processing');
    }
}

processHarmonyWithCorrectEndpoints().catch(console.error);

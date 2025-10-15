#!/usr/bin/env node

/**
 * PROCESS HARMONY PDF
 * Trigger processing of harmony-signature-book-24-25.pdf from Supabase Storage
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

async function processHarmonyPDF() {
    console.log('🚀 PROCESSING HARMONY SIGNATURE BOOK PDF');
    console.log('==================================================');
    
    try {
        console.log('\n📋 STEP 1: PREPARATION');
        console.log('--------------------------------------------------');
        console.log('📄 Target PDF: harmony-signature-book-24-25.pdf');
        console.log('💾 Size: ~11.2 MB');
        console.log('📁 Storage: Supabase pdf-documents bucket');
        console.log('🎯 Goal: Extract VALENOVA by SG NY content');
        
        console.log('\n🔍 STEP 2: HEALTH CHECK');
        console.log('--------------------------------------------------');
        
        const healthResponse = await makeRequest(`${BASE_URL}/api/rag/health`);
        
        if (healthResponse.status === 200) {
            console.log('✅ MIVAA Service: HEALTHY');
            console.log(`   🤖 Embedding Model: ${healthResponse.data.services.embedding.model.name}`);
            console.log(`   📐 Dimensions: ${healthResponse.data.services.embedding.model.dimension}`);
        } else {
            console.log('❌ MIVAA Service: UNHEALTHY');
            return;
        }
        
        console.log('\n🚀 STEP 3: TRIGGER PDF PROCESSING');
        console.log('--------------------------------------------------');
        
        // Try different approaches to trigger processing
        const storagePath = "49f683ad-ebf2-4296-a410-0d8c011ce0be/1760462185826-harmony-signature-book-24-25.pdf";
        
        console.log(`📤 Attempting to process: ${storagePath}`);
        
        // Method 1: Try process-from-storage endpoint
        console.log('\n🔄 Method 1: process-from-storage endpoint...');
        
        const processPayload = {
            storage_path: storagePath,
            bucket: "pdf-documents",
            filename: "harmony-signature-book-24-25.pdf"
        };
        
        const processResponse = await makeRequest(`${BASE_URL}/api/documents/process-from-storage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(processPayload)
        });
        
        console.log(`   📊 Response Status: ${processResponse.status}`);
        
        if (processResponse.status === 200 || processResponse.status === 201) {
            console.log('✅ Processing job started successfully!');
            console.log(`   🆔 Job ID: ${processResponse.data.job_id || processResponse.data.id || 'N/A'}`);
            console.log(`   📋 Status: ${processResponse.data.status || 'queued'}`);
            
            if (processResponse.data.job_id) {
                console.log('\n👀 STEP 4: MONITOR PROCESSING JOB');
                console.log('--------------------------------------------------');
                
                const jobId = processResponse.data.job_id;
                let attempts = 0;
                const maxAttempts = 20;
                
                while (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                    attempts++;
                    
                    const statusResponse = await makeRequest(`${BASE_URL}/api/jobs/${jobId}/status`);
                    
                    if (statusResponse.status === 200) {
                        const job = statusResponse.data;
                        console.log(`   📊 Attempt ${attempts}: ${job.status} (${job.progress || 0}%)`);
                        
                        if (job.status === 'completed') {
                            console.log('✅ Processing completed successfully!');
                            console.log(`   ⏱️ Total time: ${attempts * 5} seconds`);
                            console.log(`   📊 Progress: ${job.progress}%`);
                            
                            if (job.results) {
                                console.log(`   📄 Chunks created: ${job.results.chunks_created || 'N/A'}`);
                                console.log(`   🖼️ Images extracted: ${job.results.images_extracted || 'N/A'}`);
                                console.log(`   🤖 Embeddings generated: ${job.results.embeddings_generated || 'N/A'}`);
                            }
                            break;
                        } else if (job.status === 'failed') {
                            console.log('❌ Processing failed!');
                            console.log(`   🚨 Error: ${job.error || 'Unknown error'}`);
                            break;
                        }
                    } else {
                        console.log(`   ⚠️ Status check failed: ${statusResponse.status}`);
                    }
                }
                
                if (attempts >= maxAttempts) {
                    console.log('⏰ Monitoring timeout reached. Job may still be processing...');
                }
            }
            
        } else if (processResponse.status === 404) {
            console.log('❌ Endpoint not found. Trying alternative methods...');
            
            // Method 2: Try bulk processing endpoint
            console.log('\n🔄 Method 2: bulk processing endpoint...');
            
            const bulkPayload = {
                documents: [{
                    storage_path: storagePath,
                    filename: "harmony-signature-book-24-25.pdf"
                }]
            };
            
            const bulkResponse = await makeRequest(`${BASE_URL}/api/documents/bulk-process`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bulkPayload)
            });
            
            console.log(`   📊 Bulk Response Status: ${bulkResponse.status}`);
            
            if (bulkResponse.status === 200) {
                console.log('✅ Bulk processing started!');
                console.log(`   📋 Response: ${JSON.stringify(bulkResponse.data, null, 2)}`);
            } else {
                console.log('❌ Bulk processing failed');
                console.log(`   📋 Response: ${JSON.stringify(bulkResponse.data, null, 2)}`);
            }
            
        } else {
            console.log('❌ Processing failed to start');
            console.log(`   📋 Response: ${JSON.stringify(processResponse.data, null, 2)}`);
        }
        
        console.log('\n🔍 STEP 5: VERIFY PROCESSING RESULTS');
        console.log('--------------------------------------------------');
        
        // Check if documents were created
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/list?limit=10`);
        
        if (docsResponse.status === 200) {
            const documents = docsResponse.data.documents || [];
            const harmonyDocs = documents.filter(doc => 
                doc.filename && doc.filename.toLowerCase().includes('harmony')
            );
            
            console.log(`📄 Total documents: ${documents.length}`);
            console.log(`📚 Harmony documents: ${harmonyDocs.length}`);
            
            if (harmonyDocs.length > 0) {
                console.log('\n✅ HARMONY DOCUMENTS FOUND:');
                harmonyDocs.forEach((doc, idx) => {
                    console.log(`   ${idx + 1}. ${doc.filename} (${doc.processing_status})`);
                });
            }
        }
        
        console.log('\n🎯 STEP 6: TEST VALENOVA SEARCH');
        console.log('--------------------------------------------------');
        
        // Test search for VALENOVA
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
            
            if (results.length > 0) {
                console.log('\n📄 SEARCH RESULTS:');
                results.forEach((result, idx) => {
                    console.log(`\n   ${idx + 1}. Score: ${result.score?.toFixed(4)} (${(result.score * 100).toFixed(1)}%)`);
                    if (result.metadata?.original_filename) {
                        console.log(`      📁 File: ${result.metadata.original_filename}`);
                    }
                    console.log(`      📝 Content: "${result.content?.substring(0, 100)}..."`);
                });
                
                // Check if we have high-quality results
                const highQualityResults = results.filter(r => r.score > 0.5);
                if (highQualityResults.length > 0) {
                    console.log('\n🎉 HIGH-QUALITY RESULTS FOUND!');
                    console.log('✅ VALENOVA content successfully processed and searchable!');
                } else {
                    console.log('\n⚠️ Results found but similarity scores are low');
                    console.log('   This may indicate processing is still in progress or content needs optimization');
                }
            } else {
                console.log('❌ No search results found yet');
                console.log('   Processing may still be in progress or failed');
            }
        }
        
    } catch (error) {
        console.log(`❌ Processing Error: ${error.message}`);
    }
    
    console.log('\n==================================================');
    console.log('🎉 HARMONY PDF PROCESSING COMPLETED');
    console.log('==================================================');
}

processHarmonyPDF().catch(console.error);

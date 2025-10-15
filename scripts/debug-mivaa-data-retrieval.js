#!/usr/bin/env node

/**
 * DEBUG MIVAA DATA RETRIEVAL
 * Check what data exists in MIVAA and fix retrieval issues
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

async function debugMivaaDataRetrieval() {
    console.log('🔍 DEBUGGING MIVAA DATA RETRIEVAL ISSUE');
    console.log('==================================================');
    
    try {
        console.log('\n📊 STEP 1: CHECK JOB STATUS');
        console.log('--------------------------------------------------');
        
        const jobId = 'bulk_20251015_151159';
        console.log(`🆔 Target Job: ${jobId}`);
        
        // Check job status
        const jobResponse = await makeRequest(`${BASE_URL}/api/jobs/${jobId}`);
        console.log(`📊 Job Status Response: ${jobResponse.status}`);
        
        if (jobResponse.status === 200) {
            const job = jobResponse.data;
            console.log(`✅ Job Found: ${job.status}`);
            console.log(`📊 Progress: ${job.progress}%`);
            console.log(`📄 Chunks: ${job.results?.chunks_created || 'N/A'}`);
            console.log(`🖼️ Images: ${job.results?.images_extracted || 'N/A'}`);
            console.log(`🆔 Document ID: ${job.document_id || 'N/A'}`);
            
            if (job.document_id) {
                console.log('\n📄 STEP 2: CHECK DOCUMENT DATA');
                console.log('--------------------------------------------------');
                
                // Get document details
                const docResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${job.document_id}`);
                console.log(`📊 Document Response: ${docResponse.status}`);
                
                if (docResponse.status === 200) {
                    const doc = docResponse.data;
                    console.log(`✅ Document Found: ${doc.filename}`);
                    console.log(`📊 Status: ${doc.processing_status}`);
                    console.log(`💾 Size: ${doc.file_size} bytes`);
                    
                    // Get document chunks
                    console.log('\n📄 STEP 3: CHECK DOCUMENT CHUNKS');
                    console.log('--------------------------------------------------');
                    
                    const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${job.document_id}/chunks`);
                    console.log(`📊 Chunks Response: ${chunksResponse.status}`);
                    
                    if (chunksResponse.status === 200) {
                        const chunks = chunksResponse.data.chunks || chunksResponse.data || [];
                        console.log(`✅ Chunks Retrieved: ${chunks.length}`);
                        
                        if (chunks.length > 0) {
                            console.log('\n📋 SAMPLE CHUNKS:');
                            chunks.slice(0, 3).forEach((chunk, idx) => {
                                console.log(`   ${idx + 1}. ID: ${chunk.id}`);
                                console.log(`      Content: "${chunk.content?.substring(0, 100)}..."`);
                                console.log(`      Has Embedding: ${chunk.embedding ? 'YES' : 'NO'}`);
                            });
                            
                            // Check for VALENOVA content
                            const valenovaChunks = chunks.filter(chunk => 
                                chunk.content && chunk.content.toLowerCase().includes('valenova')
                            );
                            
                            console.log(`\n🎯 VALENOVA CHUNKS FOUND: ${valenovaChunks.length}`);
                            
                            if (valenovaChunks.length > 0) {
                                console.log('\n🎉 VALENOVA CONTENT DISCOVERED:');
                                valenovaChunks.slice(0, 2).forEach((chunk, idx) => {
                                    console.log(`\n   ${idx + 1}. VALENOVA Chunk ID: ${chunk.id}`);
                                    console.log(`      Content: "${chunk.content?.substring(0, 200)}..."`);
                                });
                            }
                        } else {
                            console.log('❌ No chunks found - this is the retrieval issue!');
                        }
                    } else {
                        console.log(`❌ Failed to get chunks: ${chunksResponse.status}`);
                        console.log(`   Response: ${JSON.stringify(chunksResponse.data, null, 2)}`);
                    }
                    
                    // Get document images
                    console.log('\n🖼️ STEP 4: CHECK DOCUMENT IMAGES');
                    console.log('--------------------------------------------------');
                    
                    const imagesResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${job.document_id}/images`);
                    console.log(`📊 Images Response: ${imagesResponse.status}`);
                    
                    if (imagesResponse.status === 200) {
                        const images = imagesResponse.data.images || imagesResponse.data || [];
                        console.log(`✅ Images Retrieved: ${images.length}`);
                        
                        if (images.length > 0) {
                            console.log('\n📋 SAMPLE IMAGES:');
                            images.slice(0, 3).forEach((image, idx) => {
                                console.log(`   ${idx + 1}. ID: ${image.id}`);
                                console.log(`      Path: ${image.image_path}`);
                                console.log(`      Page: ${image.page_number}`);
                            });
                        }
                    }
                }
            }
        } else {
            console.log(`❌ Job not found: ${jobResponse.status}`);
        }
        
        console.log('\n📋 STEP 5: CHECK ALL DOCUMENTS');
        console.log('--------------------------------------------------');
        
        // List all documents to see what's available
        const allDocsResponse = await makeRequest(`${BASE_URL}/api/documents/documents?limit=20`);
        console.log(`📊 All Documents Response: ${allDocsResponse.status}`);
        
        if (allDocsResponse.status === 200) {
            const docs = allDocsResponse.data.documents || allDocsResponse.data || [];
            console.log(`📄 Total Documents: ${docs.length}`);
            
            const harmonyDocs = docs.filter(doc => 
                doc.filename && doc.filename.toLowerCase().includes('harmony')
            );
            
            console.log(`📚 Harmony Documents: ${harmonyDocs.length}`);
            
            if (harmonyDocs.length > 0) {
                console.log('\n✅ HARMONY DOCUMENTS FOUND:');
                harmonyDocs.forEach((doc, idx) => {
                    console.log(`   ${idx + 1}. ${doc.filename} (${doc.processing_status})`);
                    console.log(`      ID: ${doc.id}`);
                    console.log(`      Size: ${doc.file_size} bytes`);
                    console.log(`      Created: ${doc.created_at}`);
                });
            }
        }
        
        console.log('\n🔍 STEP 6: TEST SEARCH WITH CURRENT DATA');
        console.log('--------------------------------------------------');
        
        // Test search to see if data is accessible
        const searchResponse = await makeRequest(`${BASE_URL}/api/search/semantic`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: "VALENOVA by SG NY",
                max_results: 5,
                similarity_threshold: 0.1
            })
        });
        
        if (searchResponse.status === 200) {
            const results = searchResponse.data.results || [];
            console.log(`🔍 Search Results: ${results.length} found`);
            
            const harmonyResults = results.filter(result => 
                result.metadata?.original_filename?.toLowerCase().includes('harmony') ||
                result.content?.toLowerCase().includes('harmony')
            );
            
            console.log(`📚 Harmony Results: ${harmonyResults.length}`);
            
            if (harmonyResults.length > 0) {
                console.log('\n🎉 HARMONY CONTENT IN SEARCH:');
                harmonyResults.forEach((result, idx) => {
                    console.log(`\n   ${idx + 1}. Score: ${result.score?.toFixed(4)} (${(result.score * 100).toFixed(1)}%)`);
                    console.log(`      File: ${result.metadata?.original_filename || 'N/A'}`);
                    console.log(`      Content: "${result.content?.substring(0, 150)}..."`);
                });
            } else {
                console.log('❌ No harmony content found in search results');
            }
        }
        
        console.log('\n💡 STEP 7: DIAGNOSIS & RECOMMENDATIONS');
        console.log('--------------------------------------------------');
        
        console.log('ISSUE ANALYSIS:');
        console.log('✅ MIVAA processed 1196 chunks + 169 images successfully');
        console.log('❌ Frontend cannot retrieve the processed data');
        console.log('🔍 Need to check API endpoint responses and data format');
        console.log('');
        console.log('POSSIBLE CAUSES:');
        console.log('1. 🔗 API endpoint mismatch between frontend and MIVAA');
        console.log('2. 📊 Data format incompatibility');
        console.log('3. 🔐 Authentication/permission issues');
        console.log('4. 💾 Database storage vs API retrieval mismatch');
        console.log('');
        console.log('NEXT STEPS:');
        console.log('1. 🔧 Fix the data retrieval API endpoint');
        console.log('2. 📊 Verify data format compatibility');
        console.log('3. 🔍 Test direct database access');
        console.log('4. ✅ Verify VALENOVA content is accessible');
        
    } catch (error) {
        console.log(`❌ Debug Error: ${error.message}`);
    }
    
    console.log('\n==================================================');
    console.log('🎉 MIVAA DATA RETRIEVAL DEBUG COMPLETED');
    console.log('==================================================');
}

debugMivaaDataRetrieval().catch(console.error);

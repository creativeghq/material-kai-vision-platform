#!/usr/bin/env node

/**
 * DETAILED STATUS CHECK
 * Shows detailed information about current platform state
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

async function detailedStatusCheck() {
    console.log('🔍 DETAILED PLATFORM STATUS CHECK');
    console.log('==================================================');
    
    // Check jobs in detail
    console.log('\n📋 JOBS ANALYSIS:');
    try {
        const jobsResponse = await makeRequest(`${BASE_URL}/api/jobs`);
        
        if (jobsResponse.status === 200 && jobsResponse.data.data) {
            const jobs = jobsResponse.data.data;
            console.log(`📊 Total jobs: ${jobs.length}`);
            
            jobs.forEach((job, index) => {
                console.log(`\n${index + 1}. Job: ${job.job_id}`);
                console.log(`   Status: ${job.status}`);
                console.log(`   Progress: ${job.progress}%`);
                console.log(`   Created: ${job.created_at}`);
                console.log(`   Processed: ${job.processed_count || 0}`);
                console.log(`   Chunks: ${job.chunks_created || 0}`);
                console.log(`   Images: ${job.images_extracted || 0}`);
                console.log(`   Step: ${job.current_step || 'Unknown'}`);
                
                if (job.document_ids && job.document_ids.length > 0) {
                    console.log(`   Document IDs: ${job.document_ids.join(', ')}`);
                }
            });
        }
    } catch (error) {
        console.log(`❌ Jobs analysis error: ${error.message}`);
    }
    
    // Check documents in detail
    console.log('\n📄 DOCUMENTS ANALYSIS:');
    try {
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/documents`);
        
        if (docsResponse.status === 200 && docsResponse.data.data) {
            const docs = docsResponse.data.data;
            console.log(`📊 Total documents: ${docs.length}`);
            
            for (let i = 0; i < Math.min(docs.length, 3); i++) {
                const doc = docs[i];
                console.log(`\n${i + 1}. Document: ${doc.document_id}`);
                console.log(`   Name: ${doc.document_name}`);
                console.log(`   Status: ${doc.status}`);
                console.log(`   Created: ${doc.created_at}`);
                console.log(`   Pages: ${doc.page_count}`);
                console.log(`   Words: ${doc.word_count}`);
                console.log(`   Size: ${doc.file_size} bytes`);
                
                // Check chunks for this document
                try {
                    const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${doc.document_id}/chunks`);
                    console.log(`   Chunks endpoint: ${chunksResponse.status}`);
                    
                    if (chunksResponse.status === 200 && chunksResponse.data.data) {
                        const chunks = chunksResponse.data.data;
                        console.log(`   📄 Chunks: ${chunks.length}`);
                        
                        if (chunks.length > 0) {
                            console.log(`   📄 Sample chunk: "${chunks[0].content.substring(0, 50)}..."`);
                        }
                    }
                } catch (e) {
                    console.log(`   ❌ Chunks check error: ${e.message}`);
                }
                
                // Check images for this document
                try {
                    const imagesResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${doc.document_id}/images`);
                    console.log(`   Images endpoint: ${imagesResponse.status}`);
                    
                    if (imagesResponse.status === 200 && imagesResponse.data.data) {
                        const images = imagesResponse.data.data;
                        console.log(`   🖼️ Images: ${images.length}`);
                    }
                } catch (e) {
                    console.log(`   ❌ Images check error: ${e.message}`);
                }
            }
        }
    } catch (error) {
        console.log(`❌ Documents analysis error: ${error.message}`);
    }
    
    // Test search with existing content
    console.log('\n🔍 SEARCH ANALYSIS:');
    try {
        // Try searching for content we know exists
        const searchQueries = ['dummy', 'PDF', 'page', 'material'];
        
        for (const query of searchQueries) {
            const searchPayload = {
                query: query,
                limit: 5,
                similarity_threshold: 0.1, // Lower threshold
                search_type: "semantic"
            };
            
            const searchResponse = await makeRequest(`${BASE_URL}/api/search/semantic`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(searchPayload)
            });
            
            console.log(`🔍 Search "${query}": ${searchResponse.status} - ${searchResponse.data?.results?.length || 0} results`);
        }
    } catch (error) {
        console.log(`❌ Search analysis error: ${error.message}`);
    }
    
    console.log('\n🎯 SUMMARY:');
    console.log('==================================================');
}

detailedStatusCheck().catch(console.error);

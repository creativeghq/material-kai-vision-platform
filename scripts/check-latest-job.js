#!/usr/bin/env node

/**
 * CHECK LATEST JOB
 * Check the status of the latest job
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
        req.end();
    });
}

async function checkLatestJob() {
    console.log('🔍 CHECKING LATEST JOB');
    console.log('==================================================');
    
    try {
        const jobsResponse = await makeRequest(`${BASE_URL}/api/jobs`);
        
        if (jobsResponse.status === 200 && jobsResponse.data.jobs) {
            const jobs = jobsResponse.data.jobs;
            console.log(`📊 Found ${jobs.length} jobs`);
            
            if (jobs.length > 0) {
                const latestJob = jobs[0];
                console.log(`📄 Latest job: ${latestJob.job_id}`);
                console.log(`   Status: ${latestJob.status}`);
                console.log(`   Progress: ${latestJob.progress_percentage}%`);
                console.log(`   Step: ${latestJob.current_step}`);
                console.log(`   Created: ${latestJob.created_at}`);
                
                if (latestJob.status === 'completed' && latestJob.document_ids) {
                    console.log(`   Document IDs: ${latestJob.document_ids.join(', ')}`);
                    
                    // Check the latest document for embeddings
                    const docId = latestJob.document_ids[0];
                    console.log(`\n📄 Checking document: ${docId}`);
                    
                    const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${docId}/chunks`);
                    
                    if (chunksResponse.status === 200 && chunksResponse.data.data) {
                        const chunks = chunksResponse.data.data;
                        console.log(`📄 Document has ${chunks.length} chunks`);
                        
                        const chunksWithEmbeddings = chunks.filter(chunk => 
                            chunk.embedding && Array.isArray(chunk.embedding) && chunk.embedding.length > 0
                        );
                        
                        console.log(`🔧 Chunks with embeddings: ${chunksWithEmbeddings.length}/${chunks.length}`);
                        
                        if (chunksWithEmbeddings.length > 0) {
                            console.log(`✅ EMBEDDINGS FOUND!`);
                            console.log(`📊 Embedding dimensions: ${chunksWithEmbeddings[0].embedding.length}`);
                        } else {
                            console.log(`❌ NO EMBEDDINGS FOUND`);
                        }
                    }
                }
            }
        } else {
            console.log(`❌ Failed to get jobs: ${jobsResponse.status}`);
        }
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

checkLatestJob().catch(console.error);

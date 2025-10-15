#!/usr/bin/env node

/**
 * COMPLETE WORKFLOW TEST - POST DEPLOYMENT
 * Tests the entire platform workflow after UUID fixes
 */

const https = require('https');

const BASE_URL = 'https://v1api.materialshub.gr';

// Test PDFs
const TEST_PDFS = {
    harmony: 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/1760462185826-harmony-signature-book-24-25.pdf',
    wifi_momo: 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/WIFI%20MOMO%20lookbook%2001s.pdf'
};

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

async function testCompleteWorkflow() {
    console.log('🎯 COMPLETE WORKFLOW TEST - POST DEPLOYMENT');
    console.log('==================================================');
    
    // Step 1: Test existing jobs and documents
    console.log('\n📋 Step 1: Checking existing documents...');
    try {
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/documents`);
        console.log(`📊 Documents endpoint: ${docsResponse.status}`);
        
        if (docsResponse.status === 200 && docsResponse.data.data) {
            const docs = docsResponse.data.data;
            console.log(`✅ Found ${docs.length} documents`);
            
            // Test chunks and images for existing documents
            for (let i = 0; i < Math.min(docs.length, 3); i++) {
                const doc = docs[i];
                console.log(`\n🔍 Testing document: ${doc.document_id}`);
                
                // Test chunks
                const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${doc.document_id}/chunks`);
                console.log(`   📄 Chunks: ${chunksResponse.status} (${chunksResponse.data?.data?.length || 0} chunks)`);
                
                // Test images
                const imagesResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${doc.document_id}/images`);
                console.log(`   🖼️ Images: ${imagesResponse.status} (${imagesResponse.data?.data?.length || 0} images)`);
                
                if (chunksResponse.data?.data?.length > 0) {
                    console.log(`   ✅ Sample chunk: "${chunksResponse.data.data[0].content.substring(0, 50)}..."`);
                }
            }
        }
    } catch (error) {
        console.log(`❌ Error checking documents: ${error.message}`);
    }
    
    // Step 2: Test search functionality
    console.log('\n📋 Step 2: Testing search functionality...');
    try {
        // Try different search endpoints
        const searchEndpoints = [
            '/api/search',
            '/api/documents/search',
            '/api/knowledge-base/search',
            '/api/search/documents',
            '/api/search/chunks'
        ];
        
        for (const endpoint of searchEndpoints) {
            try {
                const searchResponse = await makeRequest(`${BASE_URL}${endpoint}?q=material`);
                console.log(`   🔍 ${endpoint}: ${searchResponse.status}`);
                
                if (searchResponse.status === 200) {
                    console.log(`   ✅ Search working! Found ${searchResponse.data?.data?.length || 0} results`);
                    break;
                }
            } catch (e) {
                console.log(`   ❌ ${endpoint}: Error`);
            }
        }
    } catch (error) {
        console.log(`❌ Search test error: ${error.message}`);
    }
    
    // Step 3: Test new PDF processing
    console.log('\n📋 Step 3: Testing new PDF processing...');
    try {
        const jobPayload = {
            pdf_urls: [TEST_PDFS.harmony],
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
            
            // Monitor job progress
            console.log('\n⏱️ Monitoring job progress...');
            let attempts = 0;
            const maxAttempts = 20;
            
            while (attempts < maxAttempts) {
                await sleep(3000);
                attempts++;
                
                const statusResponse = await makeRequest(`${BASE_URL}/api/jobs/${jobId}/status`);
                
                if (statusResponse.status === 200) {
                    const status = statusResponse.data;
                    console.log(`   Check ${attempts}: ${status.status} (${status.progress}%)`);
                    
                    if (status.status === 'completed') {
                        console.log('🎉 Job completed!');
                        console.log(`📊 Results: ${status.processed_count} processed, ${status.chunks_created} chunks, ${status.images_extracted} images`);
                        
                        // Get document ID and test retrieval
                        if (status.document_ids && status.document_ids.length > 0) {
                            const docId = status.document_ids[0];
                            console.log(`🆔 Document ID: ${docId}`);
                            
                            // Test chunks retrieval
                            const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${docId}/chunks`);
                            console.log(`📄 Chunks retrieval: ${chunksResponse.status} (${chunksResponse.data?.data?.length || 0} chunks)`);
                            
                            // Test images retrieval
                            const imagesResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${docId}/images`);
                            console.log(`🖼️ Images retrieval: ${imagesResponse.status} (${imagesResponse.data?.data?.length || 0} images)`);
                        }
                        break;
                    } else if (status.status === 'failed') {
                        console.log('❌ Job failed!');
                        break;
                    }
                }
            }
            
            if (attempts >= maxAttempts) {
                console.log('⏰ Job monitoring timeout');
            }
        }
    } catch (error) {
        console.log(`❌ PDF processing test error: ${error.message}`);
    }
    
    // Step 4: Final platform status
    console.log('\n📋 Step 4: Final platform status check...');
    try {
        const healthResponse = await makeRequest(`${BASE_URL}/health`);
        console.log(`🏥 Health check: ${healthResponse.status}`);
        
        const jobsResponse = await makeRequest(`${BASE_URL}/api/jobs`);
        console.log(`📋 Jobs endpoint: ${jobsResponse.status}`);
        
        if (jobsResponse.status === 200 && jobsResponse.data.data) {
            const jobs = jobsResponse.data.data;
            const completedJobs = jobs.filter(j => j.status === 'completed');
            const runningJobs = jobs.filter(j => j.status === 'running');
            
            console.log(`✅ Total jobs: ${jobs.length}`);
            console.log(`✅ Completed jobs: ${completedJobs.length}`);
            console.log(`⏳ Running jobs: ${runningJobs.length}`);
        }
    } catch (error) {
        console.log(`❌ Final status error: ${error.message}`);
    }
    
    console.log('\n🎉 COMPLETE WORKFLOW TEST FINISHED!');
}

testCompleteWorkflow().catch(console.error);

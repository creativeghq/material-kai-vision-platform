#!/usr/bin/env node

import fetch from 'node-fetch';

const MIVAA_BASE_URL = 'http://localhost:8000';
const PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/WIFI%20MOMO%20lookbook%2001s.pdf';

async function testDirectPDFProcessing() {
    console.log('🔍 TESTING DIRECT PDF PROCESSING');
    console.log('================================');
    console.log(`📄 PDF URL: ${PDF_URL}`);
    console.log('');

    try {
        // Test 1: Check if MIVAA service is running
        console.log('📊 Step 1: Checking MIVAA service health...');
        const healthResponse = await fetch(`${MIVAA_BASE_URL}/health`);
        const healthData = await healthResponse.json();
        console.log('✅ MIVAA service is healthy:', healthData);
        console.log('');

        // Test 2: Submit a bulk processing job
        console.log('📤 Step 2: Submitting bulk processing job...');
        const bulkRequest = {
            urls: [PDF_URL],
            batch_size: 1,
            options: {
                extract_text: true,
                extract_images: true,
                extract_tables: true
            }
        };

        const bulkResponse = await fetch(`${MIVAA_BASE_URL}/api/bulk/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bulkRequest)
        });

        const bulkData = await bulkResponse.json();
        console.log('📊 Bulk processing response:', JSON.stringify(bulkData, null, 2));
        
        if (bulkData.data && bulkData.data.job_id) {
            const jobId = bulkData.data.job_id;
            console.log(`🎯 Job ID: ${jobId}`);
            console.log('');

            // Test 3: Monitor job progress
            console.log('🔄 Step 3: Monitoring job progress...');
            let attempts = 0;
            const maxAttempts = 60; // 5 minutes max
            let jobCompleted = false;

            while (attempts < maxAttempts && !jobCompleted) {
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

                try {
                    const jobResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/${jobId}`);
                    const jobResponseData = await jobResponse.json();
                    const job = jobResponseData.data;
                    
                    console.log(`⏰ [${attempts * 5}s] Attempt ${attempts}/${maxAttempts} | Status: ${job.status} | Progress: ${job.progress_percentage || 'N/A'}%`);
                    
                    if (job.status === 'completed') {
                        jobCompleted = true;
                        console.log('');
                        console.log('🎉 JOB COMPLETED!');
                        console.log('📊 Final job details:', JSON.stringify(job, null, 2));
                        
                        // Check if there are actual results
                        if (job.details && job.details.results) {
                            console.log('');
                            console.log('📋 PROCESSING RESULTS:');
                            console.log('=====================');
                            
                            job.details.results.forEach((result, index) => {
                                console.log(`\n📄 Document ${index + 1}:`);
                                console.log(`   URL: ${result.url}`);
                                console.log(`   Status: ${result.status}`);
                                
                                if (result.chunks !== undefined) {
                                    console.log(`   📝 Chunks: ${result.chunks}`);
                                }
                                if (result.images !== undefined) {
                                    console.log(`   🖼️ Images: ${result.images}`);
                                }
                                if (result.metadata) {
                                    console.log(`   📊 Metadata:`, JSON.stringify(result.metadata, null, 6));
                                }
                                if (result.text_content) {
                                    console.log(`   📄 Text Content (first 500 chars):`);
                                    console.log(`   ${result.text_content.substring(0, 500)}...`);
                                }
                            });
                        } else {
                            console.log('⚠️ No detailed results found in job data');
                        }
                        
                    } else if (job.status === 'failed') {
                        console.log('❌ Job failed:', job.error_message || 'Unknown error');
                        break;
                    }
                } catch (error) {
                    console.log(`❌ Error checking job status: ${error.message}`);
                }
            }

            if (!jobCompleted && attempts >= maxAttempts) {
                console.log('⏰ Job monitoring timed out after 5 minutes');
            }
        } else {
            console.log('❌ No job ID returned from bulk processing');
        }

    } catch (error) {
        console.log('❌ Error in direct PDF processing test:', error.message);
        console.log('📊 Full error:', error);
    }
}

// Run the test
testDirectPDFProcessing().catch(console.error);

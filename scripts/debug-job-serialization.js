#!/usr/bin/env node

/**
 * Debug job serialization issues by testing different endpoints
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function debugJobSerialization() {
    console.log('🔍 Debugging Job Serialization Issues');
    console.log('==================================================');
    
    try {
        // Test 1: Try to get job statistics (simpler endpoint)
        console.log('\n🧪 Test 1: Job Statistics Endpoint');
        try {
            const statsResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/statistics`);
            console.log(`   Status: ${statsResponse.status} ${statsResponse.statusText}`);
            
            if (statsResponse.ok) {
                const statsData = await statsResponse.json();
                console.log(`   ✅ Statistics work: ${JSON.stringify(statsData, null, 2)}`);
            } else {
                const errorText = await statsResponse.text();
                console.log(`   ❌ Statistics failed: ${errorText}`);
            }
        } catch (e) {
            console.log(`   ❌ Statistics error: ${e.message}`);
        }
        
        // Test 2: Try to get active progress (might be simpler)
        console.log('\n🧪 Test 2: Active Progress Endpoint');
        try {
            const progressResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/progress/active`);
            console.log(`   Status: ${progressResponse.status} ${progressResponse.statusText}`);
            
            if (progressResponse.ok) {
                const progressData = await progressResponse.json();
                console.log(`   ✅ Active progress works: ${JSON.stringify(progressData, null, 2)}`);
            } else {
                const errorText = await progressResponse.text();
                console.log(`   ❌ Active progress failed: ${errorText}`);
            }
        } catch (e) {
            console.log(`   ❌ Active progress error: ${e.message}`);
        }
        
        // Test 3: Try to submit a simple job to see if new jobs work
        console.log('\n🧪 Test 3: Submit Simple Job');
        try {
            const simpleJobResponse = await fetch(`${MIVAA_BASE_URL}/api/bulk/process`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    urls: ['https://www.adobe.com/support/products/enterprise/knowledgecenter/media/c4611_sample_explain.pdf'],
                    options: {
                        extract_images: false,  // Simplified options
                        enable_multimodal: false,
                        timeout_seconds: 60
                    },
                    batch_size: 1
                })
            });
            
            console.log(`   Status: ${simpleJobResponse.status} ${simpleJobResponse.statusText}`);
            
            if (simpleJobResponse.ok) {
                const jobData = await simpleJobResponse.json();
                console.log(`   ✅ Job submitted: ${JSON.stringify(jobData, null, 2)}`);
                
                const newJobId = jobData.data?.job_id;
                if (newJobId) {
                    console.log(`\n🔍 Testing new job status: ${newJobId}`);
                    
                    // Wait a moment for job to initialize
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Try to get status of the new job
                    const newJobStatusResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/${newJobId}`);
                    console.log(`   New job status: ${newJobStatusResponse.status} ${newJobStatusResponse.statusText}`);
                    
                    if (newJobStatusResponse.ok) {
                        const newJobStatusData = await newJobStatusResponse.json();
                        console.log(`   ✅ New job status works: ${JSON.stringify(newJobStatusData, null, 2)}`);
                    } else {
                        const errorText = await newJobStatusResponse.text();
                        console.log(`   ❌ New job status failed: ${errorText}`);
                    }
                }
            } else {
                const errorText = await simpleJobResponse.text();
                console.log(`   ❌ Job submission failed: ${errorText}`);
            }
        } catch (e) {
            console.log(`   ❌ Job submission error: ${e.message}`);
        }
        
        // Test 4: Try different job endpoints to isolate the issue
        console.log('\n🧪 Test 4: Testing Different Job Endpoints');
        
        const endpoints = [
            '/api/jobs',
            '/api/jobs/statistics',
            '/api/jobs/progress/active'
        ];
        
        for (const endpoint of endpoints) {
            try {
                console.log(`   Testing: ${endpoint}`);
                const response = await fetch(`${MIVAA_BASE_URL}${endpoint}`);
                console.log(`      Status: ${response.status} ${response.statusText}`);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log(`      ✅ Works - Response size: ${JSON.stringify(data).length} chars`);
                } else {
                    const errorText = await response.text();
                    console.log(`      ❌ Failed: ${errorText.substring(0, 200)}...`);
                }
            } catch (e) {
                console.log(`      ❌ Error: ${e.message}`);
            }
        }
        
        console.log('\n💡 Analysis:');
        console.log('==================================================');
        console.log('If ALL job endpoints fail with serialization_error:');
        console.log('- There are existing jobs with non-serializable data');
        console.log('- The active_jobs dictionary contains problematic objects');
        console.log('- Need to clear/fix the job storage system');
        console.log('');
        console.log('If NEW jobs work but old ones fail:');
        console.log('- The issue is with existing job data');
        console.log('- New jobs are created properly');
        console.log('- Need to clear old problematic jobs');
        console.log('');
        console.log('If statistics/progress work but job list fails:');
        console.log('- The issue is specifically in job serialization');
        console.log('- Aggregated data works but individual job data fails');
        
    } catch (error) {
        console.error('❌ Debug failed:', error.message);
    }
}

// Run the debug
debugJobSerialization().catch(console.error);

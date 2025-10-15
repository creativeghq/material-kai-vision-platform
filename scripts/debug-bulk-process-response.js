#!/usr/bin/env node

/**
 * Debug the bulk process endpoint response format
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function debugBulkProcessResponse() {
    console.log('🔍 Debugging Bulk Process Response Format');
    console.log('==================================================');
    
    const testPdf = 'https://www.adobe.com/support/products/enterprise/knowledgecenter/media/c4611_sample_explain.pdf';
    console.log(`📄 Testing with: ${testPdf}`);
    
    try {
        console.log('\n📤 Submitting PDF for processing...');
        const submitResponse = await fetch(`${MIVAA_BASE_URL}/api/bulk/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                urls: [testPdf],
                options: {
                    extract_images: true,
                    enable_multimodal: true,
                    ocr_languages: ['en'],
                    timeout_seconds: 900
                },
                batch_size: 1
            })
        });

        console.log(`   Status: ${submitResponse.status} ${submitResponse.statusText}`);
        console.log(`   Headers: ${JSON.stringify(Object.fromEntries(submitResponse.headers.entries()), null, 2)}`);
        
        if (!submitResponse.ok) {
            const errorText = await submitResponse.text();
            console.log(`   Error Response: ${errorText}`);
            return;
        }

        const responseText = await submitResponse.text();
        console.log(`   Raw Response: ${responseText}`);
        
        try {
            const responseData = JSON.parse(responseText);
            console.log(`   Parsed Response: ${JSON.stringify(responseData, null, 2)}`);
            
            // Check for different possible job ID fields
            const possibleJobIdFields = ['job_id', 'jobId', 'id', 'task_id', 'taskId', 'bulk_job_id'];
            let foundJobId = null;
            
            for (const field of possibleJobIdFields) {
                if (responseData[field]) {
                    foundJobId = responseData[field];
                    console.log(`   ✅ Found job ID in field '${field}': ${foundJobId}`);
                    break;
                }
            }
            
            if (!foundJobId) {
                console.log('   ❌ No job ID found in response');
                console.log('   Available fields:', Object.keys(responseData));
            }
            
            // If we found a job ID, test the status endpoint
            if (foundJobId) {
                console.log(`\n🔍 Testing status endpoint with job ID: ${foundJobId}`);
                
                // Try different status endpoint formats
                const statusEndpoints = [
                    `/api/jobs/${foundJobId}`,
                    `/api/jobs/${foundJobId}/status`,
                    `/api/documents/job/${foundJobId}`,
                    `/api/bulk/status/${foundJobId}`
                ];
                
                for (const endpoint of statusEndpoints) {
                    try {
                        console.log(`   Testing: ${endpoint}`);
                        const statusResponse = await fetch(`${MIVAA_BASE_URL}${endpoint}`);
                        console.log(`      Status: ${statusResponse.status} ${statusResponse.statusText}`);
                        
                        if (statusResponse.ok) {
                            const statusData = await statusResponse.json();
                            console.log(`      Response: ${JSON.stringify(statusData, null, 2)}`);
                            break; // Found working endpoint
                        } else {
                            const errorText = await statusResponse.text();
                            console.log(`      Error: ${errorText.substring(0, 200)}...`);
                        }
                    } catch (e) {
                        console.log(`      Error: ${e.message}`);
                    }
                }
            }
            
        } catch (parseError) {
            console.log(`   ❌ Failed to parse JSON: ${parseError.message}`);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the debug
debugBulkProcessResponse().catch(console.error);

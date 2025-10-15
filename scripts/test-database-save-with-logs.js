#!/usr/bin/env node

/**
 * Test PDF processing with detailed database save monitoring
 * This script submits a PDF, monitors processing, and checks database saves
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function testDatabaseSave() {
    console.log('🔍 Testing PDF Processing with Database Save Monitoring');
    console.log('==================================================');
    
    // Test with a simple PDF
    const testPdf = 'https://www.adobe.com/support/products/enterprise/knowledgecenter/media/c4611_sample_explain.pdf';
    console.log(`📄 Testing with: ${testPdf}`);
    
    try {
        // Step 1: Submit PDF for processing
        console.log('\n📤 Step 1: Submitting PDF for processing...');
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

        if (!submitResponse.ok) {
            throw new Error(`Submit failed: ${submitResponse.status} ${submitResponse.statusText}`);
        }

        const submitData = await submitResponse.json();
        console.log('   Response: ✅');
        console.log(`   ✅ Job submitted: ${submitData.data.job_id}`);

        const jobId = submitData.data.job_id;

        // Step 2: Monitor job progress with detailed logging
        console.log('\n📊 Step 2: Monitoring job progress with database save details...');
        
        let completed = false;
        let checkCount = 0;
        
        while (!completed && checkCount < 30) {
            checkCount++;
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
            
            try {
                const statusResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/${jobId}`);
                if (!statusResponse.ok) {
                    console.log(`   ❌ Status check failed: ${statusResponse.status}`);
                    continue;
                }
                
                const statusData = await statusResponse.json();
                const status = statusData.status;
                const progress = statusData.progress_percentage || 0;
                
                console.log(`\n   📊 Check ${checkCount}: ${status} (${progress}%)`);
                
                // Show detailed progress information
                if (statusData.chunks_created !== undefined) {
                    console.log(`      Chunks Created: ${statusData.chunks_created}`);
                }
                if (statusData.images_extracted !== undefined) {
                    console.log(`      Images Extracted: ${statusData.images_extracted}`);
                }
                if (statusData.kb_entries_saved !== undefined) {
                    console.log(`      KB Entries Saved: ${statusData.kb_entries_saved} 🔍`);
                }
                if (statusData.processed_count !== undefined) {
                    console.log(`      Processed Count: ${statusData.processed_count}`);
                }
                if (statusData.failed_count !== undefined) {
                    console.log(`      Failed Count: ${statusData.failed_count}`);
                }
                if (statusData.current_step) {
                    console.log(`      Current Step: ${statusData.current_step}`);
                }
                
                // Check for document ID
                if (statusData.document_id) {
                    console.log(`      Document ID: ${statusData.document_id}`);
                }
                
                // Check for results array
                if (statusData.results && statusData.results.length > 0) {
                    console.log(`      Results Available: ${statusData.results.length} documents`);
                    statusData.results.forEach((result, i) => {
                        console.log(`         ${i+1}. Document ID: ${result.document_id || 'N/A'}`);
                        console.log(`            Status: ${result.status || 'N/A'}`);
                        console.log(`            Chunks: ${result.chunks || 0}`);
                        console.log(`            Images: ${result.images || 0}`);
                    });
                }
                
                if (status === 'completed' || status === 'failed') {
                    completed = true;
                    console.log(`\n🎉 Job ${status}!`);
                    
                    // Get final document ID
                    let documentId = statusData.document_id;
                    if (!documentId && statusData.results && statusData.results.length > 0) {
                        documentId = statusData.results[0].document_id;
                    }
                    
                    if (documentId) {
                        console.log(`\n🔍 Step 3: Testing document retrieval for ${documentId}...`);
                        
                        // Test document content retrieval
                        try {
                            const contentResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${documentId}/content`);
                            if (contentResponse.ok) {
                                const contentData = await contentResponse.json();
                                console.log('   Document Content: ✅');
                                console.log(`      Chunks: ${contentData.chunks ? contentData.chunks.length : 0}`);
                                console.log(`      Images: ${contentData.images ? contentData.images.length : 0}`);
                            } else {
                                console.log(`   Document Content: ❌ ${contentResponse.status} ${contentResponse.statusText}`);
                                const errorText = await contentResponse.text();
                                console.log(`      Error: ${errorText}`);
                            }
                        } catch (contentError) {
                            console.log(`   Document Content: ❌ ${contentError.message}`);
                        }
                        
                        // Test chunks endpoint
                        try {
                            const chunksResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${documentId}/chunks`);
                            if (chunksResponse.ok) {
                                const chunksData = await chunksResponse.json();
                                console.log('   Document Chunks: ✅');
                                console.log(`      Count: ${chunksData.length || 0}`);
                            } else {
                                console.log(`   Document Chunks: ❌ ${chunksResponse.status} ${chunksResponse.statusText}`);
                            }
                        } catch (chunksError) {
                            console.log(`   Document Chunks: ❌ ${chunksError.message}`);
                        }
                        
                        // Test images endpoint
                        try {
                            const imagesResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${documentId}/images`);
                            if (imagesResponse.ok) {
                                const imagesData = await imagesResponse.json();
                                console.log('   Document Images: ✅');
                                console.log(`      Count: ${imagesData.length || 0}`);
                            } else {
                                console.log(`   Document Images: ❌ ${imagesResponse.status} ${imagesResponse.statusText}`);
                            }
                        } catch (imagesError) {
                            console.log(`   Document Images: ❌ ${imagesError.message}`);
                        }
                    } else {
                        console.log('\n⚠️ No document ID found in results');
                    }
                    
                    break;
                }
                
            } catch (statusError) {
                console.log(`   ❌ Status check error: ${statusError.message}`);
            }
        }
        
        if (!completed) {
            console.log('\n⏰ Timeout waiting for job completion');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testDatabaseSave().catch(console.error);

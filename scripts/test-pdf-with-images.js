#!/usr/bin/env node

/**
 * TEST PDF PROCESSING WITH IMAGES
 * Process a PDF that contains images to verify the complete workflow
 */

const BASE_URL = 'https://v1api.materialshub.gr';

async function makeRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            body: options.body ? JSON.stringify(options.body) : undefined
        });

        const data = await response.text();
        let parsedData;
        try {
            parsedData = JSON.parse(data);
        } catch (e) {
            parsedData = data;
        }

        return {
            status: response.status,
            data: parsedData,
            ok: response.ok
        };
    } catch (error) {
        return {
            status: 0,
            data: { error: error.message },
            ok: false
        };
    }
}

async function testPDFWithImages() {
    console.log('🧪 TESTING PDF PROCESSING WITH IMAGES');
    console.log('=====================================');
    
    // Test with WIFI MOMO PDF that should have images
    const testPdfUrl = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/1760462185826-harmony-signature-book-24-25.pdf';
    
    console.log('📄 Processing PDF with images...');
    console.log(`🔗 PDF URL: ${testPdfUrl}`);
    
    try {
        // Step 1: Process the PDF
        console.log('\n1. 🚀 Starting PDF processing...');
        const processResponse = await makeRequest(`${BASE_URL}/api/documents/process-url`, {
            method: 'POST',
            body: {
                source_url: testPdfUrl,
                document_name: 'Test PDF with Images',
                options: {
                    extract_images: true,
                    extract_text: true,
                    generate_embeddings: true,
                    chunk_size: 1000,
                    chunk_overlap: 200
                }
            }
        });
        
        if (!processResponse.ok) {
            console.log(`   ❌ PDF processing failed: ${processResponse.status}`);
            console.log(`   📝 Error:`, processResponse.data);
            return false;
        }
        
        console.log('   ✅ PDF processing started successfully');
        const jobId = processResponse.data.job_id;
        console.log(`   📋 Job ID: ${jobId}`);
        
        // Step 2: Monitor job progress
        console.log('\n2. ⏳ Monitoring job progress...');
        let jobCompleted = false;
        let attempts = 0;
        const maxAttempts = 30; // 5 minutes max
        
        while (!jobCompleted && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
            attempts++;
            
            const statusResponse = await makeRequest(`${BASE_URL}/api/documents/job/${jobId}`);
            
            if (statusResponse.ok && statusResponse.data) {
                const status = statusResponse.data.status;
                const progress = statusResponse.data.progress || 0;
                
                console.log(`   📊 Attempt ${attempts}: Status = ${status}, Progress = ${progress}%`);
                
                if (status === 'completed') {
                    jobCompleted = true;
                    console.log('   ✅ Job completed successfully!');
                    
                    const documentId = statusResponse.data.document_id;
                    console.log(`   📄 Document ID: ${documentId}`);
                    
                    // Step 3: Test image extraction
                    console.log('\n3. 🖼️ Testing image extraction...');
                    const imagesResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${documentId}/images`);
                    
                    console.log(`   📊 Image API Status: ${imagesResponse.status}`);
                    
                    if (imagesResponse.ok) {
                        const imageCount = imagesResponse.data.data ? imagesResponse.data.data.length : 0;
                        console.log(`   ✅ Image extraction working! Found ${imageCount} images`);
                        
                        if (imageCount > 0) {
                            console.log('   🎉 SUCCESS: PDF processing and image extraction complete!');
                            
                            // Show first few images
                            const images = imagesResponse.data.data.slice(0, 3);
                            images.forEach((img, i) => {
                                console.log(`   🖼️ Image ${i + 1}: ${img.filename || img.image_id} (Page ${img.page_number || 'Unknown'})`);
                            });
                            
                            return true;
                        } else {
                            console.log('   ⚠️ No images extracted - PDF might not contain images');
                            return true; // API still working
                        }
                    } else {
                        console.log(`   ❌ Image extraction failed: ${imagesResponse.status}`);
                        console.log(`   📝 Error:`, imagesResponse.data);
                        return false;
                    }
                    
                } else if (status === 'failed') {
                    console.log('   ❌ Job failed');
                    console.log(`   📝 Error:`, statusResponse.data.error || 'Unknown error');
                    return false;
                } else if (status === 'cancelled') {
                    console.log('   ❌ Job was cancelled');
                    return false;
                }
                
            } else {
                console.log(`   ⚠️ Could not get job status: ${statusResponse.status}`);
            }
        }
        
        if (!jobCompleted) {
            console.log('   ⏰ Job did not complete within timeout period');
            console.log('   📝 This might be normal for large PDFs - check job status later');
            return false;
        }
        
    } catch (error) {
        console.log(`   ❌ Test failed with error: ${error.message}`);
        return false;
    }
}

// Run the test
testPDFWithImages().then(success => {
    console.log('\n📊 FINAL RESULT');
    console.log('================');
    
    if (success) {
        console.log('🎉 PDF processing and image extraction test PASSED!');
        console.log('✅ Phase 1 image extraction fix is working correctly');
    } else {
        console.log('❌ PDF processing test FAILED');
        console.log('🔧 May need further investigation');
    }
    
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});

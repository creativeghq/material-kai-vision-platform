#!/usr/bin/env node

/**
 * PROCESS PDF WITH IMAGES
 * Process a PDF that contains images to populate the knowledge base
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

async function processPDFWithImages() {
    console.log('🖼️ PROCESSING PDF WITH IMAGES FOR KNOWLEDGE BASE');
    console.log('================================================');
    
    // Use the Harmony Signature Book PDF which should have images
    const testPdfUrl = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/1760462185826-harmony-signature-book-24-25.pdf';
    
    console.log('📄 Processing Harmony Signature Book PDF...');
    console.log(`🔗 PDF URL: ${testPdfUrl}`);
    
    try {
        // Step 1: Process the PDF with image extraction
        console.log('\n1. 🚀 Starting PDF processing with image extraction...');
        const processResponse = await makeRequest(`${BASE_URL}/api/documents/process-url`, {
            method: 'POST',
            body: {
                source_url: testPdfUrl,
                document_name: 'Harmony Signature Book 2024-25',
                catalog_name: 'Harmony Collection',
                options: {
                    extract_images: true,
                    extract_text: true,
                    generate_embeddings: true,
                    chunk_size: 2000,  // Larger chunks for better context
                    chunk_overlap: 400,
                    image_analysis: true,
                    ocr_extraction: true
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
        
        // Step 2: Monitor job progress with detailed updates
        console.log('\n2. ⏳ Monitoring job progress...');
        let jobCompleted = false;
        let attempts = 0;
        const maxAttempts = 60; // 10 minutes max
        
        while (!jobCompleted && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
            attempts++;
            
            const statusResponse = await makeRequest(`${BASE_URL}/api/documents/job/${jobId}`);
            
            if (statusResponse.ok && statusResponse.data) {
                const status = statusResponse.data.status;
                const progress = statusResponse.data.progress || 0;
                const details = statusResponse.data.details || {};
                
                console.log(`   📊 Attempt ${attempts}: Status = ${status}, Progress = ${progress}%`);
                
                // Show detailed progress if available
                if (details.pages_processed) {
                    console.log(`   📄 Pages processed: ${details.pages_processed}`);
                }
                if (details.chunks_created) {
                    console.log(`   📝 Chunks created: ${details.chunks_created}`);
                }
                if (details.images_extracted) {
                    console.log(`   🖼️ Images extracted: ${details.images_extracted}`);
                }
                
                if (status === 'completed') {
                    jobCompleted = true;
                    console.log('   ✅ Job completed successfully!');
                    
                    const documentId = statusResponse.data.document_id;
                    console.log(`   📄 Document ID: ${documentId}`);
                    
                    // Step 3: Verify results
                    console.log('\n3. 🔍 Verifying processing results...');
                    
                    // Check chunks
                    const chunksResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${documentId}/chunks`);
                    if (chunksResponse.ok) {
                        const chunkCount = chunksResponse.data.data ? chunksResponse.data.data.length : 0;
                        console.log(`   ✅ Chunks: ${chunkCount} created`);
                        
                        if (chunkCount > 0) {
                            const avgChunkSize = chunksResponse.data.data.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunkCount;
                            console.log(`   📊 Average chunk size: ${Math.round(avgChunkSize)} characters`);
                        }
                    }
                    
                    // Check images
                    const imagesResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${documentId}/images`);
                    if (imagesResponse.ok) {
                        const imageCount = imagesResponse.data.data ? imagesResponse.data.data.length : 0;
                        console.log(`   ✅ Images: ${imageCount} extracted`);
                        
                        if (imageCount > 0) {
                            console.log('   🎉 SUCCESS: Images extracted and available in knowledge base!');
                            
                            // Show first few images
                            const images = imagesResponse.data.data.slice(0, 3);
                            images.forEach((img, i) => {
                                console.log(`   🖼️ Image ${i + 1}: ${img.filename || img.image_id} (Page ${img.page_number || 'Unknown'})`);
                                if (img.caption) {
                                    console.log(`      📝 Caption: ${img.caption}`);
                                }
                            });
                        } else {
                            console.log('   ⚠️ No images extracted - PDF might not contain extractable images');
                        }
                    }
                    
                    return true;
                    
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
            console.log('   📝 Check job status later or increase timeout');
            return false;
        }
        
    } catch (error) {
        console.log(`   ❌ Processing failed with error: ${error.message}`);
        return false;
    }
}

// Run the processing
processPDFWithImages().then(success => {
    console.log('\n📊 PROCESSING RESULT');
    console.log('====================');
    
    if (success) {
        console.log('🎉 PDF processing with images COMPLETED successfully!');
        console.log('✅ Knowledge base should now show:');
        console.log('   - Document with proper catalog name');
        console.log('   - Text chunks with larger, better context');
        console.log('   - Extracted images with metadata');
        console.log('   - Generated embeddings for search');
        console.log('');
        console.log('🔗 Check the Knowledge Base in the admin panel to see results!');
    } else {
        console.log('❌ PDF processing FAILED');
        console.log('🔧 Check the logs above for specific error details');
    }
    
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('❌ Processing failed:', error);
    process.exit(1);
});

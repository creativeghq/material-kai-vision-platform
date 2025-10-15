#!/usr/bin/env node

/**
 * CHECK VALENOVA IMAGES EXTRACTION
 * Verify if images were properly extracted from harmony PDF
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

async function checkValenovaImages() {
    console.log('🖼️ CHECKING VALENOVA IMAGES EXTRACTION');
    console.log('==================================================');
    
    try {
        console.log('\n📋 STEP 1: FIND HARMONY DOCUMENT ID');
        console.log('--------------------------------------------------');
        
        // Get all documents to find harmony PDF
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/documents?limit=50`);
        
        if (docsResponse.status !== 200) {
            console.log(`❌ Failed to get documents: ${docsResponse.status}`);
            return;
        }
        
        const docs = docsResponse.data.documents || docsResponse.data || [];
        const harmonyDoc = docs.find(doc => 
            doc.filename && doc.filename.toLowerCase().includes('harmony')
        );
        
        if (!harmonyDoc) {
            console.log('❌ Harmony document not found in documents list');
            return;
        }
        
        console.log(`✅ Found harmony document: ${harmonyDoc.filename}`);
        console.log(`🆔 Document ID: ${harmonyDoc.id}`);
        console.log(`📊 Status: ${harmonyDoc.processing_status}`);
        console.log(`💾 Size: ${harmonyDoc.file_size} bytes`);
        
        console.log('\n🖼️ STEP 2: GET DOCUMENT IMAGES');
        console.log('--------------------------------------------------');
        
        const imagesResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${harmonyDoc.id}/images`);
        console.log(`📊 Images API Response: ${imagesResponse.status}`);
        
        if (imagesResponse.status === 200) {
            const images = imagesResponse.data.images || imagesResponse.data || [];
            console.log(`✅ Images found: ${images.length}`);
            
            if (images.length > 0) {
                console.log('\n📋 IMAGE DETAILS:');
                images.slice(0, 10).forEach((image, idx) => {
                    console.log(`\n   ${idx + 1}. Image ID: ${image.id}`);
                    console.log(`      📁 Path: ${image.image_path || image.path || 'N/A'}`);
                    console.log(`      📄 Page: ${image.page_number || 'N/A'}`);
                    console.log(`      📐 Size: ${image.width}x${image.height} px`);
                    console.log(`      🔗 URL: ${image.url || 'N/A'}`);
                    if (image.metadata) {
                        console.log(`      📊 Metadata: ${JSON.stringify(image.metadata, null, 8)}`);
                    }
                });
                
                if (images.length > 10) {
                    console.log(`\n   ... and ${images.length - 10} more images`);
                }
                
                // Check for VALENOVA-related images
                console.log('\n🎯 STEP 3: SEARCH FOR VALENOVA-RELATED IMAGES');
                console.log('--------------------------------------------------');
                
                const valenovaImages = images.filter(image => {
                    const path = (image.image_path || image.path || '').toLowerCase();
                    const metadata = JSON.stringify(image.metadata || {}).toLowerCase();
                    return path.includes('valenova') || metadata.includes('valenova');
                });
                
                console.log(`🔍 VALENOVA-specific images: ${valenovaImages.length}`);
                
                if (valenovaImages.length > 0) {
                    console.log('\n🎉 VALENOVA IMAGES FOUND:');
                    valenovaImages.forEach((image, idx) => {
                        console.log(`   ${idx + 1}. ${image.image_path || image.path}`);
                        console.log(`      Page: ${image.page_number}, Size: ${image.width}x${image.height}`);
                    });
                } else {
                    console.log('⚠️ No images specifically tagged with VALENOVA');
                    console.log('   (Images may exist but not be properly tagged)');
                }
                
                // Test image accessibility
                console.log('\n🔗 STEP 4: TEST IMAGE ACCESSIBILITY');
                console.log('--------------------------------------------------');
                
                const testImage = images[0];
                if (testImage && testImage.url) {
                    console.log(`🔍 Testing image URL: ${testImage.url}`);
                    
                    try {
                        const imageTestResponse = await makeRequest(testImage.url);
                        console.log(`📊 Image accessibility: ${imageTestResponse.status}`);
                        
                        if (imageTestResponse.status === 200) {
                            console.log('✅ Images are accessible via URL');
                        } else {
                            console.log('❌ Images not accessible - URL issue');
                        }
                    } catch (error) {
                        console.log(`❌ Image URL test failed: ${error.message}`);
                    }
                } else {
                    console.log('⚠️ No image URL available for testing');
                }
                
            } else {
                console.log('❌ No images found for harmony document');
            }
        } else {
            console.log(`❌ Failed to get images: ${imagesResponse.status}`);
            console.log(`   Response: ${JSON.stringify(imagesResponse.data, null, 2)}`);
        }
        
        console.log('\n🔍 STEP 5: CHECK IMAGE SEARCH FUNCTIONALITY');
        console.log('--------------------------------------------------');
        
        // Test image search API
        const imageSearchResponse = await makeRequest(`${BASE_URL}/api/search/images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: "VALENOVA tiles",
                max_results: 5
            })
        });
        
        console.log(`📊 Image Search API: ${imageSearchResponse.status}`);
        
        if (imageSearchResponse.status === 200) {
            const imageResults = imageSearchResponse.data.results || imageSearchResponse.data || [];
            console.log(`🔍 Image search results: ${imageResults.length}`);
            
            if (imageResults.length > 0) {
                console.log('\n📋 IMAGE SEARCH RESULTS:');
                imageResults.forEach((result, idx) => {
                    console.log(`   ${idx + 1}. Score: ${result.score?.toFixed(4)}`);
                    console.log(`      Image: ${result.image_path || result.path}`);
                    console.log(`      Description: ${result.description || 'N/A'}`);
                });
            }
        } else {
            console.log(`❌ Image search failed: ${imageSearchResponse.status}`);
        }
        
        console.log('\n🔍 STEP 6: CHECK MULTIMODAL SEARCH');
        console.log('--------------------------------------------------');
        
        // Test multimodal search
        const multimodalResponse = await makeRequest(`${BASE_URL}/api/search/multimodal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: "VALENOVA ceramic tiles by Stacy Garcia",
                include_images: true,
                max_results: 5
            })
        });
        
        console.log(`📊 Multimodal Search API: ${multimodalResponse.status}`);
        
        if (multimodalResponse.status === 200) {
            const multiResults = multimodalResponse.data.results || multimodalResponse.data || [];
            console.log(`🔍 Multimodal results: ${multiResults.length}`);
            
            if (multiResults.length > 0) {
                console.log('\n📋 MULTIMODAL SEARCH RESULTS:');
                multiResults.forEach((result, idx) => {
                    console.log(`   ${idx + 1}. Score: ${result.score?.toFixed(4)}`);
                    console.log(`      Type: ${result.type || 'text'}`);
                    if (result.image_path) {
                        console.log(`      Image: ${result.image_path}`);
                    }
                    if (result.content) {
                        console.log(`      Content: "${result.content.substring(0, 100)}..."`);
                    }
                });
            }
        } else {
            console.log(`❌ Multimodal search failed: ${multimodalResponse.status}`);
        }
        
    } catch (error) {
        console.log(`❌ Image Check Error: ${error.message}`);
    }
    
    console.log('\n==================================================');
    console.log('🎉 VALENOVA IMAGES CHECK COMPLETED');
    console.log('==================================================');
}

checkValenovaImages().catch(console.error);

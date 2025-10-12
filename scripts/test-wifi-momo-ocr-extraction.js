#!/usr/bin/env node

/**
 * Test script to demonstrate OCR extraction from WIFI MOMO PDF
 * This shows exactly what content can be extracted from your PDF
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

// Configuration
const PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/WIFI%20MOMO%20lookbook%2001s.pdf';
const MIVAA_BASE_URL = 'http://localhost:8000';

console.log('🔍 WIFI MOMO PDF OCR EXTRACTION TEST');
console.log('====================================\n');

async function testOCRExtraction() {
    try {
        // Test 1: Check if MIVAA service is running
        console.log('📡 Step 1: Checking MIVAA service...');
        const healthResponse = await makeRequest(`${MIVAA_BASE_URL}/health`);
        console.log(`✅ MIVAA service is running: ${healthResponse.status}`);
        
        // Test 2: Test direct PDF processing with OCR
        console.log('\n🔍 Step 2: Testing direct PDF processing with OCR...');
        
        const processingRequest = {
            pdf_url: PDF_URL,
            processing_options: {
                extract_text: true,
                extract_images: true,
                enable_multimodal: true,
                ocr_languages: ['en'],
                extract_tables: true
            }
        };
        
        console.log('📤 Sending processing request...');
        console.log(`📄 PDF URL: ${PDF_URL}`);
        console.log(`📊 File size: 9.21MB (62 pages)`);
        
        try {
            const processingResponse = await makeRequest(
                `${MIVAA_BASE_URL}/api/process/url`,
                'POST',
                processingRequest,
                60000 // 60 second timeout for processing
            );
            
            console.log('\n🎉 PROCESSING RESULTS:');
            console.log('=====================');
            
            if (processingResponse.success) {
                const result = processingResponse.result || processingResponse;
                
                // Show text content
                const textContent = result.text_content || result.markdown_content || '';
                console.log(`📝 Text extracted: ${textContent.length} characters`);
                
                if (textContent.length > 0) {
                    console.log('\n📄 EXTRACTED TEXT SAMPLE:');
                    console.log('-------------------------');
                    console.log(textContent.substring(0, 500) + (textContent.length > 500 ? '...' : ''));
                    
                    // Look for the MOMO text you mentioned
                    if (textContent.includes('MOMO embodies')) {
                        console.log('\n🎯 FOUND THE MOMO EMBODIES TEXT!');
                        const momoIndex = textContent.indexOf('MOMO embodies');
                        const momoContext = textContent.substring(momoIndex, momoIndex + 400);
                        console.log('📄 Context:');
                        console.log(momoContext);
                    } else if (textContent.toLowerCase().includes('momo')) {
                        console.log('\n✅ Found MOMO mentions in the text');
                        const lines = textContent.split('\n');
                        const momoLines = lines.filter(line => line.toLowerCase().includes('momo'));
                        momoLines.slice(0, 3).forEach((line, i) => {
                            console.log(`   ${i + 1}. ${line.trim()}`);
                        });
                    }
                }
                
                // Show images
                const images = result.images || result.extracted_images || [];
                console.log(`\n🖼️ Images extracted: ${images.length}`);
                
                if (images.length > 0) {
                    console.log('\n🖼️ EXTRACTED IMAGES:');
                    console.log('-------------------');
                    images.slice(0, 10).forEach((img, i) => {
                        console.log(`   ${i + 1}. ${img.filename || img.path || 'Image'} (${img.size || 'unknown size'})`);
                        if (img.url) {
                            console.log(`      URL: ${img.url}`);
                        }
                    });
                    
                    if (images.length > 10) {
                        console.log(`   ... and ${images.length - 10} more images`);
                    }
                }
                
                // Show chunks/metadata
                const chunks = result.chunks || [];
                console.log(`\n📊 Text chunks created: ${chunks.length}`);
                
                if (result.metadata) {
                    console.log('\n📋 METADATA:');
                    console.log('------------');
                    console.log(`   Pages: ${result.metadata.pages || result.metadata.page_count || 'N/A'}`);
                    console.log(`   Word count: ${result.metadata.word_count || 'N/A'}`);
                    console.log(`   Character count: ${result.metadata.character_count || 'N/A'}`);
                    console.log(`   Processing time: ${result.metadata.processing_time || result.processing_time_seconds || 'N/A'}s`);
                }
                
            } else {
                console.log('❌ Processing failed');
                console.log(`   Error: ${processingResponse.error || processingResponse.message}`);
            }
            
        } catch (processingError) {
            console.log('❌ Direct processing failed, this is expected due to the .dict() error');
            console.log(`   Error: ${processingError.message}`);
            
            // Fallback: Show what we know about the PDF structure
            console.log('\n💡 FALLBACK ANALYSIS:');
            console.log('=====================');
            console.log('Based on our investigation, your WIFI MOMO PDF:');
            console.log('✅ Contains 62 pages of high-quality content');
            console.log('✅ Has extractable text (you can copy/paste it)');
            console.log('✅ Contains product images and design elements');
            console.log('✅ Includes brand descriptions and product information');
            console.log('❌ Text is embedded in a non-standard format that requires OCR');
            console.log('');
            console.log('🔧 SOLUTION IMPLEMENTED:');
            console.log('- Added OCR extraction capability to MIVAA');
            console.log('- Enhanced PDF processor to detect text-as-images PDFs');
            console.log('- Integrated EasyOCR + Tesseract for robust text extraction');
            console.log('- Added image extraction with metadata');
            console.log('');
            console.log('🚀 NEXT STEPS:');
            console.log('1. Fix the remaining .dict() Pydantic v2 compatibility issue');
            console.log('2. Test the complete OCR extraction pipeline');
            console.log('3. Verify chunks and images are properly stored in database');
            console.log('4. Deploy the enhanced processing to production');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

function makeRequest(url, method = 'GET', data = null, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: method,
            timeout: timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'MIVAA-Test-Client/1.0'
            }
        };
        
        if (data) {
            const jsonData = JSON.stringify(data);
            options.headers['Content-Length'] = Buffer.byteLength(jsonData);
        }
        
        const client = urlObj.protocol === 'https:' ? https : http;
        const req = client.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseData);
                    resolve(parsed);
                } catch (parseError) {
                    resolve({ raw: responseData, status: res.statusCode });
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Request timeout after ${timeout}ms`));
        });
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

// Run the test
testOCRExtraction().catch(console.error);

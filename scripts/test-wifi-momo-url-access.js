#!/usr/bin/env node

/**
 * Test if WIFI MOMO PDF URL is accessible
 */

const WIFI_MOMO_PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/WIFI%20MOMO%20lookbook%2001s.pdf';

async function testWifiMomoUrlAccess() {
  console.log('🔍 Testing WIFI MOMO PDF URL Access');
  console.log('==================================================\n');

  try {
    console.log(`📋 Testing URL: ${WIFI_MOMO_PDF_URL}`);
    
    const response = await fetch(WIFI_MOMO_PDF_URL, { method: 'HEAD' });
    
    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    console.log(`📊 Content-Type: ${response.headers.get('content-type')}`);
    console.log(`📊 Content-Length: ${response.headers.get('content-length')} bytes`);
    
    if (response.ok) {
      console.log('✅ WIFI MOMO PDF is accessible!');
      
      // Try to get a small portion of the content
      const contentResponse = await fetch(WIFI_MOMO_PDF_URL, {
        headers: {
          'Range': 'bytes=0-1023'  // First 1KB
        }
      });
      
      if (contentResponse.ok) {
        const content = await contentResponse.arrayBuffer();
        console.log(`📄 First 1KB downloaded successfully (${content.byteLength} bytes)`);
        
        // Check if it's a valid PDF
        const uint8Array = new Uint8Array(content);
        const pdfHeader = String.fromCharCode(...uint8Array.slice(0, 4));
        if (pdfHeader === '%PDF') {
          console.log('✅ Valid PDF file confirmed');
        } else {
          console.log(`⚠️ Unexpected file header: ${pdfHeader}`);
        }
      }
      
    } else {
      console.log('❌ WIFI MOMO PDF is not accessible');
    }
    
  } catch (error) {
    console.error(`❌ Error accessing WIFI MOMO PDF: ${error.message}`);
  }

  console.log('\n🎯 Summary');
  console.log('==================================================');
  console.log('💡 This verifies if the WIFI MOMO PDF URL is accessible');
  console.log('💡 If accessible, we can proceed with processing tests');
}

testWifiMomoUrlAccess().catch(console.error);

#!/usr/bin/env node

/**
 * Debug WIFI MOMO PDF submission to see exact response
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const WIFI_MOMO_PDF_URL = 'https://github.com/creativeghq/material-kai-vision-platform/raw/main/public/pdfs/wifi-momo-processing-test.pdf';

async function debugWifiMomoSubmission() {
  console.log('🔍 Debugging WIFI MOMO PDF Submission');
  console.log('==================================================\n');

  try {
    console.log('📋 Testing PDF submission...');
    console.log(`📄 PDF URL: ${WIFI_MOMO_PDF_URL}`);
    
    const response = await fetch(`${MIVAA_BASE_URL}/api/bulk/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        urls: [WIFI_MOMO_PDF_URL],
        processing_options: {
          extract_images: true,
          extract_tables: true,
          chunk_text: true,
          generate_embeddings: true
        }
      })
    });

    console.log(`📊 Response Status: ${response.status} ${response.statusText}`);
    console.log(`📊 Content-Type: ${response.headers.get('content-type')}`);
    
    const responseText = await response.text();
    console.log(`📊 Response Length: ${responseText.length} characters`);
    
    console.log('\n📄 FULL RESPONSE:');
    console.log('==================================================');
    console.log(responseText);
    
    if (response.ok) {
      try {
        const data = JSON.parse(responseText);
        console.log('\n🎯 PARSED RESPONSE ANALYSIS:');
        console.log('==================================================');
        console.log(`Success: ${data.success}`);
        console.log(`Message: ${data.message}`);
        console.log(`Job ID: ${data.job_id}`);
        console.log(`Timestamp: ${data.timestamp}`);
        
        // Check all fields
        console.log('\n📋 ALL RESPONSE FIELDS:');
        Object.keys(data).forEach(key => {
          console.log(`   ${key}: ${JSON.stringify(data[key])}`);
        });
        
      } catch (e) {
        console.log(`❌ JSON parse error: ${e.message}`);
      }
    } else {
      console.log('❌ Request failed');
      try {
        const errorData = JSON.parse(responseText);
        console.log('Error details:', errorData);
      } catch (e) {
        console.log('Raw error response:', responseText);
      }
    }

  } catch (error) {
    console.error(`❌ Request error: ${error.message}`);
  }

  console.log('\n🎯 Summary');
  console.log('==================================================');
  console.log('💡 This shows exactly what the bulk process endpoint returns');
  console.log('💡 We need to identify the correct field name for job ID');
}

debugWifiMomoSubmission().catch(console.error);

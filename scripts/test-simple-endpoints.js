#!/usr/bin/env node

/**
 * Test various endpoints to see which ones work and which fail
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function testSimpleEndpoints() {
  console.log('🔍 Testing Various MIVAA Endpoints');
  console.log('==================================================\n');

  const endpoints = [
    { name: 'Health', path: '/api/health' },
    { name: 'System Health', path: '/api/system/health' },
    { name: 'Job Statistics', path: '/api/jobs/statistics' },
    { name: 'Job List', path: '/api/jobs' },
    { name: 'Document List', path: '/api/documents/documents' },
    { name: 'PDF Health', path: '/api/pdf/health' },
    { name: 'Documents Health', path: '/api/documents/health' },
    { name: 'OpenAPI Docs', path: '/docs' },
    { name: 'Root', path: '/' }
  ];

  for (const endpoint of endpoints) {
    console.log(`📋 Testing ${endpoint.name}: ${endpoint.path}`);
    
    try {
      const response = await fetch(`${MIVAA_BASE_URL}${endpoint.path}`);
      
      console.log(`   📊 Status: ${response.status} ${response.statusText}`);
      console.log(`   📊 Content-Type: ${response.headers.get('content-type')}`);
      
      if (response.ok) {
        console.log('   ✅ Success');
        
        // Try to get response body
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          try {
            const data = await response.json();
            console.log(`   📄 Response: ${JSON.stringify(data).substring(0, 100)}...`);
          } catch (e) {
            console.log(`   ⚠️ JSON parse error: ${e.message}`);
          }
        } else if (contentType.includes('text/html')) {
          const text = await response.text();
          console.log(`   📄 HTML response (${text.length} chars)`);
        } else {
          const text = await response.text();
          console.log(`   📄 Text response: ${text.substring(0, 100)}...`);
        }
      } else {
        console.log('   ❌ Failed');
        
        // Try to get error details
        try {
          const errorText = await response.text();
          console.log(`   📄 Error: ${errorText.substring(0, 200)}...`);
        } catch (e) {
          console.log(`   📄 Could not read error response: ${e.message}`);
        }
      }
      
    } catch (error) {
      console.log(`   ❌ Request error: ${error.message}`);
    }
    
    console.log(''); // Empty line for readability
  }

  console.log('🎯 Endpoint Test Summary');
  console.log('==================================================');
  console.log('💡 This test shows which endpoints work and which fail');
  console.log('💡 Look for patterns in the failures to identify the root cause');
}

testSimpleEndpoints().catch(console.error);

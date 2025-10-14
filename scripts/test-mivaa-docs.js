#!/usr/bin/env node

/**
 * Test MIVAA Documentation Endpoints
 * Verify that /docs, /redoc, and /openapi.json are accessible through the gateway
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

async function testMivaaDocsEndpoints() {
  console.log('🔍 Testing MIVAA Documentation Endpoints...\n');

  const endpoints = [
    { name: 'Health Check', action: 'health_check', expectedType: 'json' },
    { name: 'OpenAPI JSON', action: 'openapi_json', expectedType: 'json' },
    { name: 'Swagger Docs', action: 'docs', expectedType: 'html' },
    { name: 'ReDoc', action: 'redoc', expectedType: 'html' }
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`📋 Testing ${endpoint.name}...`);
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: endpoint.action,
          payload: {}
        })
      });

      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Content-Type: ${response.headers.get('content-type')}`);
      
      if (response.ok) {
        const content = await response.text();
        
        if (endpoint.expectedType === 'html') {
          const isHtml = content.includes('<html') || content.includes('<!DOCTYPE html');
          console.log(`   ✅ ${endpoint.name} accessible - HTML content: ${isHtml}`);
          
          if (endpoint.action === 'docs') {
            const hasSwagger = content.includes('swagger') || content.includes('Swagger');
            console.log(`   📚 Swagger UI detected: ${hasSwagger}`);
          }
          
          if (endpoint.action === 'redoc') {
            const hasRedoc = content.includes('redoc') || content.includes('ReDoc');
            console.log(`   📖 ReDoc detected: ${hasRedoc}`);
          }
          
        } else if (endpoint.expectedType === 'json') {
          try {
            const jsonData = JSON.parse(content);
            console.log(`   ✅ ${endpoint.name} accessible - JSON response`);
            
            if (endpoint.action === 'openapi_json') {
              console.log(`   📋 OpenAPI version: ${jsonData.openapi || jsonData.swagger || 'Unknown'}`);
              console.log(`   📋 API title: ${jsonData.info?.title || 'Unknown'}`);
              console.log(`   📋 API version: ${jsonData.info?.version || 'Unknown'}`);
              console.log(`   📋 Endpoints count: ${Object.keys(jsonData.paths || {}).length}`);
            }
            
          } catch (parseError) {
            console.log(`   ⚠️  Response not valid JSON: ${parseError.message}`);
          }
        }
        
      } else {
        console.log(`   ❌ ${endpoint.name} failed: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.log(`   Error: ${errorText.substring(0, 200)}...`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error testing ${endpoint.name}: ${error.message}`);
    }
    
    console.log(''); // Empty line for readability
  }

  console.log('🎯 Test Complete!');
  console.log('\n📝 Summary:');
  console.log('   - Health check verifies MIVAA service is running');
  console.log('   - OpenAPI JSON provides API specification');
  console.log('   - /docs provides Swagger UI for interactive testing');
  console.log('   - /redoc provides ReDoc documentation interface');
  console.log('\n🌐 Direct URLs (after deployment):');
  console.log('   - Swagger UI: https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/mivaa-gateway (action: "docs")');
  console.log('   - ReDoc: https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/mivaa-gateway (action: "redoc")');
  console.log('   - OpenAPI: https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/mivaa-gateway (action: "openapi_json")');
}

// Run the test
testMivaaDocsEndpoints().catch(console.error);

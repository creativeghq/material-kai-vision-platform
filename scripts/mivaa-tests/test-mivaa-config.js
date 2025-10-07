#!/usr/bin/env node

/**
 * MIVAA Configuration Test Script
 * 
 * This script tests the MIVAA service configuration and tries to understand
 * the authentication requirements.
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function testMivaaConfiguration() {
  console.log('🔧 Testing MIVAA Service Configuration...\n');
  
  // Test 1: Check if service is running
  await testServiceHealth();
  
  // Test 2: Check OpenAPI documentation
  await testOpenAPISpec();
  
  // Test 3: Test different authentication approaches
  await testAuthenticationMethods();
}

async function testServiceHealth() {
  console.log('1️⃣ Testing Service Health...');
  
  try {
    const response = await fetch(`${MIVAA_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Service is running`);
      console.log(`   📊 Service: ${data.service || 'Unknown'}`);
      console.log(`   📊 Version: ${data.version || 'Unknown'}`);
      console.log(`   📊 Status: ${data.status || 'Unknown'}`);
    } else {
      console.log(`   ❌ Service health check failed: ${response.status}`);
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  console.log('');
}

async function testOpenAPISpec() {
  console.log('2️⃣ Testing OpenAPI Documentation...');
  
  const endpoints = [
    '/docs',
    '/openapi.json',
    '/redoc',
    '/api/docs',
    '/api/openapi.json'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${MIVAA_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/html',
        }
      });
      
      console.log(`   ${endpoint}: ${response.status}`);
      
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          if (data.info) {
            console.log(`     ✅ OpenAPI spec found - Title: ${data.info.title}`);
            console.log(`     📊 Version: ${data.info.version}`);
            
            // Check for authentication schemes
            if (data.components && data.components.securitySchemes) {
              console.log(`     🔐 Security schemes:`, Object.keys(data.components.securitySchemes));
            }
          }
        } else if (contentType && contentType.includes('text/html')) {
          console.log(`     ✅ Documentation UI available`);
        }
      }
      
    } catch (error) {
      console.log(`   ${endpoint}: Error - ${error.message}`);
    }
  }
  
  console.log('');
}

async function testAuthenticationMethods() {
  console.log('3️⃣ Testing Authentication Methods...');
  
  // Test different authentication approaches
  const authMethods = [
    {
      name: 'No Auth',
      headers: {}
    },
    {
      name: 'Basic Auth',
      headers: {
        'Authorization': 'Basic dGVzdDp0ZXN0' // test:test
      }
    },
    {
      name: 'API Key Header',
      headers: {
        'X-API-Key': 'test-key'
      }
    },
    {
      name: 'Bearer Token',
      headers: {
        'Authorization': 'Bearer test-token'
      }
    }
  ];
  
  for (const method of authMethods) {
    console.log(`   Testing: ${method.name}`);
    
    try {
      const response = await fetch(`${MIVAA_BASE_URL}/api/analyze/materials/image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...method.headers
        },
        body: JSON.stringify({
          test: 'auth method'
        })
      });
      
      console.log(`     Status: ${response.status}`);
      
      if (response.status === 401) {
        const errorData = await response.json().catch(() => ({}));
        console.log(`     ❌ Unauthorized: ${errorData.error || 'No error message'}`);
        
        // Check for specific error details that might give us clues
        if (errorData.type) {
          console.log(`     📊 Error Type: ${errorData.type}`);
        }
        if (errorData.detail) {
          console.log(`     📊 Detail: ${errorData.detail}`);
        }
      } else if (response.status === 422) {
        console.log(`     ✅ Auth method accepted - validation error (expected)`);
      } else if (response.status === 200) {
        console.log(`     ✅ Auth method accepted - request successful`);
      } else {
        console.log(`     ⚠️ Unexpected status: ${response.status}`);
      }
      
    } catch (error) {
      console.log(`     ❌ Error: ${error.message}`);
    }
    
    console.log('');
  }
}

// Run the tests
testMivaaConfiguration().catch(console.error);

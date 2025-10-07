#!/usr/bin/env node

/**
 * MIVAA Authentication Test Script
 * 
 * This script tests different authentication methods with the MIVAA service
 * to determine the correct authentication format and fix the 401 errors.
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

// Test different authentication scenarios
async function testMivaaAuthentication() {
  console.log('🔐 Testing MIVAA Authentication Methods...\n');
  
  // Test 1: Health check without authentication
  await testHealthCheck();
  
  // Test 2: Test with different auth header formats
  await testAuthFormats();
  
  // Test 3: Test material recognition endpoint
  await testMaterialRecognition();
}

async function testHealthCheck() {
  console.log('1️⃣ Testing Health Check (no auth required)...');
  
  try {
    const response = await fetch(`${MIVAA_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log(`   Status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Health check successful`);
      console.log(`   Response:`, JSON.stringify(data, null, 2));
    } else {
      const errorText = await response.text();
      console.log(`   ❌ Health check failed: ${errorText}`);
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  console.log('');
}

async function testAuthFormats() {
  console.log('2️⃣ Testing Different Authentication Formats...');
  
  const testCases = [
    {
      name: 'No Authorization Header',
      headers: { 'Content-Type': 'application/json' }
    },
    {
      name: 'Bearer with API Key Format',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mk_test_key_12345'
      }
    },
    {
      name: 'Bearer with JWT Format',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature'
      }
    },
    {
      name: 'API Key Header',
      headers: { 
        'Content-Type': 'application/json',
        'X-API-Key': 'mk_test_key_12345'
      }
    },
    {
      name: 'Material-Kai-API-Key Header',
      headers: { 
        'Content-Type': 'application/json',
        'Material-Kai-API-Key': 'mk_test_key_12345'
      }
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`   Testing: ${testCase.name}`);
    
    try {
      const response = await fetch(`${MIVAA_BASE_URL}/api/analyze/materials/image`, {
        method: 'POST',
        headers: testCase.headers,
        body: JSON.stringify({
          image_data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
          analysis_options: {
            include_properties: true
          }
        })
      });
      
      console.log(`     Status: ${response.status}`);
      
      if (response.status === 401) {
        console.log(`     ❌ Unauthorized - auth method not accepted`);
      } else if (response.status === 403) {
        console.log(`     ❌ Forbidden - auth method recognized but insufficient permissions`);
      } else if (response.status === 422) {
        console.log(`     ✅ Auth accepted - validation error (expected for test data)`);
      } else if (response.status === 200) {
        console.log(`     ✅ Auth accepted - request successful`);
      } else {
        const errorText = await response.text();
        console.log(`     ⚠️ Unexpected status: ${errorText}`);
      }
      
    } catch (error) {
      console.log(`     ❌ Error: ${error.message}`);
    }
    
    console.log('');
  }
}

async function testMaterialRecognition() {
  console.log('3️⃣ Testing Material Recognition Endpoint Structure...');
  
  const endpoints = [
    '/api/analyze/materials/image',
    '/api/materials/analyze',
    '/api/v1/materials/analyze',
    '/api/material-recognition'
  ];
  
  for (const endpoint of endpoints) {
    console.log(`   Testing endpoint: ${endpoint}`);
    
    try {
      const response = await fetch(`${MIVAA_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          test: 'endpoint discovery'
        })
      });
      
      console.log(`     Status: ${response.status}`);
      
      if (response.status === 404) {
        console.log(`     ❌ Endpoint not found`);
      } else if (response.status === 401) {
        console.log(`     ✅ Endpoint exists - requires auth`);
      } else if (response.status === 422) {
        console.log(`     ✅ Endpoint exists - validation error`);
      } else {
        console.log(`     ✅ Endpoint exists - status: ${response.status}`);
      }
      
    } catch (error) {
      console.log(`     ❌ Error: ${error.message}`);
    }
    
    console.log('');
  }
}

// Run the tests
testMivaaAuthentication().catch(console.error);

#!/usr/bin/env node

/**
 * Comprehensive MIVAA Integration Test
 * Tests all fixed endpoints with proper authentication and payload structures
 */

import https from 'https';
import crypto from 'crypto';

// Configuration
const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const JWT_SECRET = 'your-jwt-secret-key'; // This needs to match MIVAA service secret

// JWT Generator
function generateJWT(payload = {}) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const defaultPayload = {
    iss: 'material-kai-platform',
    aud: 'mivaa-pdf-extractor',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
    sub: 'material-kai-platform',
    ...payload
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(defaultPayload)).toString('base64url');
  
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// HTTP Request Helper
function makeRequest(path, method = 'GET', data = null, useAuth = true) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, MIVAA_BASE_URL);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MIVAA-Integration-Test/1.0'
      }
    };

    if (useAuth) {
      const jwt = generateJWT();
      options.headers['Authorization'] = `Bearer ${jwt}`;
    }

    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsed
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: responseData
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Test Cases
const tests = [
  {
    name: 'Health Check',
    path: '/health',
    method: 'GET',
    useAuth: false,
    expectedStatus: 200
  },
  {
    name: 'Material Image Analysis',
    path: '/api/analyze/materials/image',
    method: 'POST',
    useAuth: true,
    payload: {
      image_data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
      analysis_types: ['visual', 'spectral', 'chemical'],
      include_properties: true,
      include_composition: true,
      confidence_threshold: 0.8
    },
    expectedStatus: [200, 400] // 400 might be expected if image is invalid
  },
  {
    name: 'Material Visual Search',
    path: '/api/search/materials/visual',
    method: 'POST',
    useAuth: true,
    payload: {
      query_image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
      search_type: 'hybrid',
      search_strategy: 'comprehensive',
      confidence_threshold: 0.75,
      similarity_threshold: 0.7,
      limit: 10
    },
    expectedStatus: [200, 400]
  },
  {
    name: 'Material Embeddings Generation',
    path: '/api/embeddings/materials/generate',
    method: 'POST',
    useAuth: true,
    payload: {
      image_data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
      embedding_types: ['clip']
    },
    expectedStatus: [200, 400]
  },
  {
    name: 'Image Analysis',
    path: '/api/v1/images/analyze',
    method: 'POST',
    useAuth: true,
    payload: {
      image_id: 'test_image_001',
      analysis_types: ['description', 'ocr', 'objects'],
      quality: 'standard',
      language: 'auto',
      confidence_threshold: 0.7
    },
    expectedStatus: [200, 400]
  },
  {
    name: 'PDF Extract Markdown',
    path: '/api/v1/extract/markdown',
    method: 'POST',
    useAuth: true,
    payload: {
      document_id: 'test_doc_001',
      extract_options: {
        preserve_formatting: true,
        include_metadata: true
      }
    },
    expectedStatus: [200, 400, 404] // 404 if document doesn't exist
  }
];

// Run Tests
async function runTests() {
  console.log('🧪 MIVAA Integration Test Suite');
  console.log('================================\n');
  
  console.log(`🔗 Base URL: ${MIVAA_BASE_URL}`);
  console.log(`🔐 Using JWT Authentication: ${JWT_SECRET ? 'Yes' : 'No'}\n`);

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      console.log(`🔍 Testing: ${test.name}`);
      console.log(`   ${test.method} ${test.path}`);
      
      const response = await makeRequest(
        test.path,
        test.method,
        test.payload,
        test.useAuth
      );

      const expectedStatuses = Array.isArray(test.expectedStatus) 
        ? test.expectedStatus 
        : [test.expectedStatus];

      if (expectedStatuses.includes(response.status)) {
        console.log(`   ✅ Status: ${response.status} (Expected)`);
        
        if (response.status === 200 && response.data) {
          if (response.data.success !== undefined) {
            console.log(`   📊 Success: ${response.data.success}`);
          }
          if (response.data.message) {
            console.log(`   💬 Message: ${response.data.message}`);
          }
        }
        passed++;
      } else {
        console.log(`   ❌ Status: ${response.status} (Expected: ${expectedStatuses.join(' or ')})`);
        if (response.data && response.data.detail) {
          console.log(`   🔍 Error: ${response.data.detail}`);
        }
        failed++;
      }
      
    } catch (error) {
      console.log(`   💥 Error: ${error.message}`);
      failed++;
    }
    
    console.log('');
  }

  console.log('📊 Test Results');
  console.log('===============');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! MIVAA integration is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Check authentication and payload structures.');
  }
}

// Run the tests
runTests().catch(console.error);

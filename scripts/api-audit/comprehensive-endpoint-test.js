#!/usr/bin/env node

/**
 * Comprehensive API Endpoint Audit Script
 * 
 * This script systematically tests all MIVAA PDF Extractor API endpoints to ensure:
 * 1. Proper request/response handling
 * 2. Correct data validation
 * 3. Appropriate error handling
 * 4. JSON serialization works correctly
 * 5. Authentication and authorization
 */

import fs from 'fs';
import path from 'path';

// Configuration
const BASE_URL = 'https://v1api.materialshub.gr';
const API_KEY = 'mk_ITVyD3fyMtRdmnNK0';

// Test data
const TEST_PDF_BASE64 = 'data:application/pdf;base64,JVBERi0xLjQKJcOkw7zDtsO4CjIgMCBvYmoKPDwKL0xlbmd0aCAzIDAgUgovRmlsdGVyIC9GbGF0ZURlY29kZQo+PgpzdHJlYW0KeJxVjkEKwjAQRa8yZC2kSZq0XYnQjQiCuHFTwUVJm2k7kJmEmVTw9kZEwYWz+O+9/x8YgJ2dXez2+T7kMRwjTXAMBvAhOQM5QJXgFOQM5AJVglOQM5ALVAlOQc5ALlAl';
const TEST_IMAGE_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// API Endpoint Definitions
const API_ENDPOINTS = {
  // PDF Processing Endpoints (prefix: /api/v1)
  pdf: [
    {
      name: 'PDF Extract Markdown',
      method: 'POST',
      path: '/api/v1/extract/markdown',
      requiresFile: true,
      testData: { file: 'test.pdf' },
      expectedStatus: [200, 422], // 422 for validation errors is acceptable
      critical: true
    },
    {
      name: 'PDF Extract Tables',
      method: 'POST', 
      path: '/api/v1/extract/tables',
      requiresFile: true,
      testData: { file: 'test.pdf' },
      expectedStatus: [200, 422],
      critical: false
    },
    {
      name: 'PDF Extract Images',
      method: 'POST',
      path: '/api/v1/extract/images', 
      requiresFile: true,
      testData: { file: 'test.pdf' },
      expectedStatus: [200, 422],
      critical: false
    },
    {
      name: 'PDF Health Check',
      method: 'GET',
      path: '/api/v1/health',
      testData: {},
      expectedStatus: [200],
      critical: true
    }
  ],

  // Document Processing Endpoints
  documents: [
    {
      name: 'Process Document',
      method: 'POST',
      path: '/api/v1/documents/process',
      requiresFile: true,
      testData: { file: 'test.pdf', extract_images: true },
      expectedStatus: [200, 422],
      critical: true
    },
    {
      name: 'Process Document from URL',
      method: 'POST',
      path: '/api/v1/documents/process-url',
      testData: { url: 'https://example.com/test.pdf' },
      expectedStatus: [200, 422, 404],
      critical: false
    },
    {
      name: 'Analyze Document',
      method: 'POST',
      path: '/api/v1/documents/analyze',
      requiresFile: true,
      testData: { file: 'test.pdf' },
      expectedStatus: [200, 422],
      critical: false
    },
    {
      name: 'List Documents',
      method: 'GET',
      path: '/api/v1/documents/documents',
      testData: {},
      expectedStatus: [200],
      critical: true
    },
    {
      name: 'Document Health Check',
      method: 'GET',
      path: '/api/v1/documents/health',
      testData: {},
      expectedStatus: [200],
      critical: true
    }
  ],

  // Search Endpoints
  search: [
    {
      name: 'Semantic Search',
      method: 'POST',
      path: '/api/search/semantic',
      testData: {
        query: 'sustainable materials',
        limit: 5,
        similarity_threshold: 0.7
      },
      expectedStatus: [200],
      critical: true
    },
    {
      name: 'Similarity Search',
      method: 'POST',
      path: '/api/search/similarity',
      testData: {
        reference_text: 'carbon fiber composite',
        limit: 3
      },
      expectedStatus: [200],
      critical: true
    },
    {
      name: 'Multimodal Search',
      method: 'POST',
      path: '/api/search/multimodal',
      testData: {
        query: 'metal materials',
        include_images: true,
        limit: 5
      },
      expectedStatus: [200],
      critical: true
    },
    {
      name: 'Generate Material Embeddings',
      method: 'POST',
      path: '/api/embeddings/materials/generate',
      testData: {
        image_data: TEST_IMAGE_BASE64,
        material_type: 'composite'
      },
      expectedStatus: [200, 422],
      critical: true
    },
    {
      name: 'Search Health Check',
      method: 'GET',
      path: '/api/search/health',
      testData: {},
      expectedStatus: [200],
      critical: true
    }
  ],

  // Image Analysis Endpoints
  images: [
    {
      name: 'Analyze Image',
      method: 'POST',
      path: '/api/v1/images/analyze',
      testData: {
        image_data: TEST_IMAGE_BASE64,
        analysis_options: {
          include_properties: true,
          confidence_threshold: 0.8
        }
      },
      expectedStatus: [200, 422],
      critical: true
    },
    {
      name: 'Search Similar Images',
      method: 'POST',
      path: '/api/v1/images/search',
      testData: {
        query_description: 'test image',
        limit: 5
      },
      expectedStatus: [200, 422],
      critical: false
    },
    {
      name: 'Upload and Analyze Image',
      method: 'POST',
      path: '/api/v1/images/upload/analyze',
      requiresFile: true,
      testData: { file: 'test.png' },
      expectedStatus: [200, 422],
      critical: false
    },
    {
      name: 'Image Health Check',
      method: 'GET',
      path: '/api/v1/images/health',
      testData: {},
      expectedStatus: [200],
      critical: true
    }
  ]
};

// Test Results Storage
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  critical_passed: 0,
  critical_total: 0,
  endpoints: {},
  issues: []
};

/**
 * Create test file for file upload endpoints
 */
function createTestFile(filename) {
  // Create a completely fresh buffer each time
  const base64Data = filename.endsWith('.pdf') ?
    TEST_PDF_BASE64.split(',')[1] :
    TEST_IMAGE_BASE64.split(',')[1];

  const testContent = Buffer.from(base64Data, 'base64');

  // Create a new Blob with fresh content each time to avoid "Body is unusable" errors
  return new Blob([new Uint8Array(testContent)], {
    type: filename.endsWith('.pdf') ? 'application/pdf' : 'image/png'
  });
}

/**
 * Test a single API endpoint
 */
async function testEndpoint(category, endpoint) {
  const fullPath = endpoint.path;
  const url = `${BASE_URL}${fullPath}`;

  console.log(`\n  🧪 Testing: ${endpoint.name}`);
  console.log(`     ${endpoint.method} ${fullPath}`);

  try {
    // Create completely fresh request options for each test
    const requestOptions = {
      method: endpoint.method,
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    };

    // Handle file uploads - create fresh FormData for each request
    if (endpoint.requiresFile) {
      // Create a completely new FormData instance for each request
      const formData = new FormData();
      const filename = endpoint.testData.file;

      // Create a fresh file blob for each request to avoid "Body is unusable" errors
      const file = createTestFile(filename);
      formData.append('file', file, filename);

      // Add other form data
      Object.keys(endpoint.testData).forEach(key => {
        if (key !== 'file') {
          formData.append(key, JSON.stringify(endpoint.testData[key]));
        }
      });

      requestOptions.body = formData;
      // Don't set Content-Type for FormData - let browser handle it
    } else if (endpoint.method !== 'GET') {
      requestOptions.headers['Content-Type'] = 'application/json';
      requestOptions.body = JSON.stringify(endpoint.testData);
    }

    const startTime = Date.now();
    const response = await fetch(url, requestOptions);
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    let responseData;
    try {
      responseData = await response.json();
    } catch (e) {
      responseData = { error: 'Invalid JSON response', raw: await response.text() };
    }

    // Check if status is expected
    const statusOk = endpoint.expectedStatus.includes(response.status);
    const testPassed = statusOk;
    
    // Update counters
    testResults.total++;
    if (testPassed) {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
    
    if (endpoint.critical) {
      testResults.critical_total++;
      if (testPassed) {
        testResults.critical_passed++;
      }
    }

    // Store detailed results
    const result = {
      status: response.status,
      responseTime,
      passed: testPassed,
      critical: endpoint.critical,
      data: responseData,
      issues: []
    };

    // Analyze response for issues
    if (!testPassed) {
      result.issues.push(`Unexpected status ${response.status}, expected ${endpoint.expectedStatus.join(' or ')}`);
    }
    
    // Check for datetime serialization issues
    if (responseData.error && responseData.error.includes('datetime') && responseData.error.includes('JSON serializable')) {
      result.issues.push('DateTime serialization error detected');
      testResults.issues.push(`${endpoint.name}: DateTime serialization error`);
    }
    
    // Check for authentication issues
    if (response.status === 401 || response.status === 403) {
      result.issues.push('Authentication/Authorization issue');
    }
    
    // Check for missing endpoints
    if (response.status === 404) {
      result.issues.push('Endpoint not found');
    }

    testResults.endpoints[`${category}.${endpoint.name}`] = result;

    // Display results
    if (testPassed) {
      console.log(`     ✅ PASSED (${response.status}) - ${responseTime}ms`);
      if (responseData.success !== undefined) {
        console.log(`     📊 Success: ${responseData.success}`);
      }
    } else {
      console.log(`     ❌ FAILED (${response.status}) - ${responseTime}ms`);
      if (result.issues.length > 0) {
        console.log(`     🔍 Issues: ${result.issues.join(', ')}`);
      }
    }
    
    if (responseData.error) {
      console.log(`     ⚠️  Error: ${responseData.error}`);
    }

  } catch (error) {
    testResults.total++;
    testResults.failed++;
    if (endpoint.critical) {
      testResults.critical_total++;
    }
    
    console.log(`     ❌ EXCEPTION: ${error.message}`);
    
    testResults.endpoints[`${category}.${endpoint.name}`] = {
      status: 'ERROR',
      passed: false,
      critical: endpoint.critical,
      error: error.message,
      issues: ['Network or request error']
    };
    
    testResults.issues.push(`${endpoint.name}: ${error.message}`);
  }
}

/**
 * Run comprehensive API audit
 */
async function runComprehensiveAudit() {
  console.log('🔧 COMPREHENSIVE API ENDPOINT AUDIT');
  console.log('=' .repeat(70));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`API Key: ${API_KEY.substring(0, 8)}...`);
  console.log('=' .repeat(70));

  // Test each category of endpoints
  for (const [category, endpoints] of Object.entries(API_ENDPOINTS)) {
    console.log(`\n📂 Testing ${category.toUpperCase()} Endpoints:`);

    for (const endpoint of endpoints) {
      await testEndpoint(category, endpoint);
      // Add small delay between tests to prevent FormData reuse issues
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Generate comprehensive report
  generateAuditReport();
}

/**
 * Generate detailed audit report
 */
function generateAuditReport() {
  console.log('\n' + '=' .repeat(70));
  console.log('📊 COMPREHENSIVE AUDIT RESULTS');
  console.log('=' .repeat(70));

  // Overall statistics
  const passRate = Math.round((testResults.passed / testResults.total) * 100);
  const criticalPassRate = Math.round((testResults.critical_passed / testResults.critical_total) * 100);
  
  console.log(`\n📈 OVERALL STATISTICS:`);
  console.log(`  Total Endpoints Tested: ${testResults.total}`);
  console.log(`  Passed: ${testResults.passed}/${testResults.total} (${passRate}%)`);
  console.log(`  Failed: ${testResults.failed}/${testResults.total} (${100-passRate}%)`);
  console.log(`  Critical Endpoints: ${testResults.critical_passed}/${testResults.critical_total} (${criticalPassRate}%)`);

  // Category breakdown
  console.log(`\n📂 CATEGORY BREAKDOWN:`);
  for (const category of Object.keys(API_ENDPOINTS)) {
    const categoryResults = Object.entries(testResults.endpoints)
      .filter(([key]) => key.startsWith(category))
      .map(([, result]) => result);
    
    const categoryPassed = categoryResults.filter(r => r.passed).length;
    const categoryTotal = categoryResults.length;
    const categoryRate = Math.round((categoryPassed / categoryTotal) * 100);
    
    console.log(`  ${category.toUpperCase()}: ${categoryPassed}/${categoryTotal} (${categoryRate}%)`);
  }

  // Critical issues
  if (testResults.issues.length > 0) {
    console.log(`\n🚨 CRITICAL ISSUES FOUND:`);
    testResults.issues.forEach((issue, index) => {
      console.log(`  ${index + 1}. ${issue}`);
    });
  }

  // Recommendations
  console.log(`\n💡 RECOMMENDATIONS:`);
  if (criticalPassRate < 100) {
    console.log(`  🔧 Fix critical endpoint failures (${testResults.critical_total - testResults.critical_passed} remaining)`);
  }
  if (testResults.issues.some(issue => issue.includes('DateTime'))) {
    console.log(`  📅 Implement proper datetime serialization across all endpoints`);
  }
  if (testResults.issues.some(issue => issue.includes('not found'))) {
    console.log(`  🔗 Add missing endpoint implementations or update routing`);
  }
  if (testResults.issues.some(issue => issue.includes('Authentication'))) {
    console.log(`  🔐 Review authentication and authorization middleware`);
  }

  console.log('\n' + '=' .repeat(70));
  console.log('✅ COMPREHENSIVE AUDIT COMPLETE');
  console.log('=' .repeat(70));
}

// Run the audit
runComprehensiveAudit().catch(console.error);

export { runComprehensiveAudit, testResults };

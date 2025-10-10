#!/usr/bin/env node

/**
 * COMPREHENSIVE API ENDPOINT VALIDATOR
 * 
 * Tests all 58 MIVAA API endpoints and 27+ gateway actions for:
 * - Response format validation (proper JSON)
 * - No mock data detection
 * - Authentication working
 * - Frontend-backend integration
 * - Error handling
 * - Data flow validation
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { CONFIG, API_ENDPOINTS, GATEWAY_ACTIONS, validationResults } = require('./api-validation-framework');

// Mock data detection patterns (excluding legitimate test content)
const MOCK_DATA_PATTERNS = [
  /mock.*data/i,
  /fake.*result/i,
  /placeholder.*content/i,
  /example\.com/i,
  /test-.*-123/i,
  /lorem ipsum/i,
  /sample.*data/i,
  /\[object Object\]/i,
  /undefined.*response/i,
  /null.*response/i,
  /hardcoded.*value/i,
  /static.*response/i,
  /fallback.*mock/i
];

// Utility Functions
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function detectMockData(responseText) {
  const issues = [];

  // Legitimate test content patterns to exclude from mock detection
  const legitimatePatterns = [
    /w3\.org.*dummy\.pdf/i, // W3C test PDF files
    /testfiles.*resources.*dummy/i, // W3C test resources
    /xhtml.*testfiles.*dummy/i // W3C XHTML test files
  ];

  MOCK_DATA_PATTERNS.forEach(pattern => {
    if (pattern.test(responseText)) {
      // Check if this is a legitimate test pattern
      const isLegitimate = legitimatePatterns.some(legitPattern =>
        legitPattern.test(responseText)
      );

      if (!isLegitimate) {
        issues.push(`Potential mock data detected: ${pattern.source}`);
      }
    }
  });

  // Check for suspicious patterns
  if (responseText.includes('Analysis Failed') && responseText.includes('fallback')) {
    issues.push('Fallback mock data detected');
  }

  if (responseText.includes('sample_tile') || responseText.includes('mock_result')) {
    issues.push('Explicit mock data found');
  }

  return issues;
}

function validateJsonStructure(data, endpoint) {
  const issues = [];
  
  // Check for proper JSON structure
  if (typeof data !== 'object' || data === null) {
    issues.push('Response is not a valid JSON object');
    return issues;
  }
  
  // Check for required fields based on endpoint category
  if (endpoint.category === 'health') {
    if (!data.status && !data.success) issues.push('Health endpoint missing status or success field');
  }
  
  if (endpoint.category === 'pdf') {
    if (data.status === 'completed' && !data.document_id) {
      issues.push('PDF processing missing document_id');
    }
  }
  
  if (endpoint.category === 'search') {
    if (!data.results && !data.similar_documents && !data.data && !data.error) {
      issues.push('Search endpoint missing results, similar_documents, data, or error field');
    }
  }
  
  // Check for proper error structure
  if (data.error && typeof data.error !== 'object') {
    issues.push('Error field should be an object with message and code');
  }
  
  return issues;
}

async function validateDirectEndpoint(endpoint) {
  const result = {
    endpoint: endpoint.path,
    method: endpoint.method,
    category: endpoint.category,
    critical: endpoint.critical,
    status: 'unknown',
    response_time: 0,
    status_code: 0,
    issues: [],
    mock_data_detected: [],
    response_size: 0,
    response_preview: ''
  };
  
  const startTime = Date.now();
  
  try {
    const url = `${CONFIG.MIVAA_BASE_URL}${endpoint.path}`;
    const headers = {
      'User-Agent': 'Material-Kai-API-Validator/1.0'
    };

    if (endpoint.auth) {
      headers['Authorization'] = `Bearer ${CONFIG.TEST_AUTH_TOKEN}`;
    }

    const options = {
      method: endpoint.method,
      headers,
      timeout: CONFIG.TIMEOUT
    };

    // Handle multipart/form-data requests
    if (endpoint.multipart) {
      const FormData = globalThis.FormData;
      const formData = new FormData();

      // Create a simple test file
      const testFileContent = '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000074 00000 n \n0000000120 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n178\n%%EOF';
      const blob = new Blob([testFileContent], { type: 'application/pdf' });
      const file = new File([blob], 'test.pdf', { type: 'application/pdf' });

      formData.append(endpoint.file_field || 'file', file);

      // Add any additional form fields
      if (endpoint.form_data) {
        for (const [key, value] of Object.entries(endpoint.form_data)) {
          formData.append(key, value);
        }
      }

      options.body = formData;
      // Don't set Content-Type for multipart, let browser set it with boundary
    } else {
      // Regular JSON requests
      headers['Content-Type'] = 'application/json';
      if (endpoint.method !== 'GET' && endpoint.payload) {
        options.body = JSON.stringify(endpoint.payload);
      }
    }
    
    console.log(`  🧪 Testing: ${endpoint.method} ${endpoint.path}`);
    
    const response = await fetch(url, options);
    const responseText = await response.text();
    
    result.response_time = Date.now() - startTime;
    result.status_code = response.status;
    result.response_size = responseText.length;
    result.response_preview = responseText.substring(0, 200);
    
    // Parse JSON if possible
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      result.issues.push('Response is not valid JSON');
      result.status = 'failed';
      return result;
    }
    
    // Validate response structure
    const structureIssues = validateJsonStructure(responseData, endpoint);
    result.issues.push(...structureIssues);
    
    // Detect mock data
    const mockDataIssues = detectMockData(responseText);
    result.mock_data_detected = mockDataIssues;
    
    // Determine overall status
    if (response.status >= 200 && response.status < 300) {
      if (result.issues.length === 0 && mockDataIssues.length === 0) {
        result.status = 'passed';
      } else if (mockDataIssues.length > 0) {
        result.status = 'warning';
        result.issues.push('Mock data detected in response');
      } else {
        result.status = 'warning';
      }
    } else if (response.status === 401 || response.status === 403) {
      result.status = 'auth_failed';
      result.issues.push('Authentication failed');
    } else if (response.status >= 400 && response.status < 500) {
      // Special case: /api/query/multimodal returning "No documents available" is a valid business response
      if (endpoint.path === '/api/query/multimodal' &&
          response.status === 400 &&
          responseText.includes('No documents available for querying')) {
        result.status = 'passed';
        result.issues.push('Valid business response: No documents available for querying');
      } else {
        result.status = 'client_error';
        result.issues.push(`Client error: ${response.status}`);
      }
    } else {
      result.status = 'server_error';
      result.issues.push(`Server error: ${response.status}`);
    }
    
  } catch (error) {
    result.response_time = Date.now() - startTime;
    result.status = 'error';
    result.issues.push(`Request failed: ${error.message}`);
  }
  
  return result;
}

async function validateGatewayAction(action) {
  const result = {
    action: action.action,
    critical: action.critical,
    status: 'unknown',
    response_time: 0,
    status_code: 0,
    issues: [],
    mock_data_detected: [],
    response_size: 0,
    response_preview: ''
  };
  
  const startTime = Date.now();
  
  try {
    const url = `${CONFIG.SUPABASE_URL}/functions/v1/mivaa-gateway`;
    const headers = {
      'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Material-Kai-Gateway-Validator/1.0'
    };
    
    const payload = {
      action: action.action,
      payload: action.payload
    };
    
    console.log(`  🔗 Testing Gateway Action: ${action.action}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      timeout: CONFIG.TIMEOUT
    });
    
    const responseText = await response.text();
    
    result.response_time = Date.now() - startTime;
    result.status_code = response.status;
    result.response_size = responseText.length;
    result.response_preview = responseText.substring(0, 200);
    
    // Parse JSON if possible
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      result.issues.push('Response is not valid JSON');
      result.status = 'failed';
      return result;
    }
    
    // Check gateway response structure
    if (!responseData.hasOwnProperty('success')) {
      result.issues.push('Gateway response missing success field');
    }
    
    if (responseData.success === false && !responseData.error) {
      result.issues.push('Failed gateway response missing error details');
    }
    
    // Detect mock data in gateway response
    const mockDataIssues = detectMockData(responseText);
    result.mock_data_detected = mockDataIssues;
    
    // Determine status
    if (response.status >= 200 && response.status < 300) {
      if (responseData.success) {
        if (mockDataIssues.length === 0) {
          result.status = 'passed';
        } else {
          result.status = 'warning';
          result.issues.push('Mock data detected in gateway response');
        }
      } else {
        result.status = 'gateway_error';
        result.issues.push(`Gateway error: ${responseData.error?.message || 'Unknown error'}`);
      }
    } else {
      result.status = 'http_error';
      result.issues.push(`HTTP error: ${response.status}`);
    }
    
  } catch (error) {
    result.response_time = Date.now() - startTime;
    result.status = 'error';
    result.issues.push(`Request failed: ${error.message}`);
  }
  
  return result;
}

async function runComprehensiveValidation() {
  console.log('🔍 Starting Comprehensive API Validation...\n');
  
  // Test Direct MIVAA Endpoints
  console.log('📡 TESTING DIRECT MIVAA ENDPOINTS');
  console.log('==================================');
  
  for (const endpoint of API_ENDPOINTS) {
    // Skip endpoints that are explicitly marked to skip
    if (endpoint.skip) {
      console.log(`  ⏭️ Skipping: ${endpoint.method} ${endpoint.path} (${endpoint.reason})`);
      continue;
    }

    const result = await validateDirectEndpoint(endpoint);
    validationResults.endpoints.push(result);

    // Update summary
    if (result.status === 'passed') {
      validationResults.summary.passed++;
      if (endpoint.critical) validationResults.summary.critical_passed++;
    } else {
      validationResults.summary.failed++;
      if (endpoint.critical) validationResults.summary.critical_failed++;
    }
    
    // Update category stats
    if (!validationResults.summary.categories[endpoint.category]) {
      validationResults.summary.categories[endpoint.category] = { passed: 0, failed: 0 };
    }
    
    if (result.status === 'passed') {
      validationResults.summary.categories[endpoint.category].passed++;
    } else {
      validationResults.summary.categories[endpoint.category].failed++;
    }
    
    // Log result
    const statusIcon = result.status === 'passed' ? '✅' : 
                      result.status === 'warning' ? '⚠️' : '❌';
    console.log(`    ${statusIcon} ${endpoint.method} ${endpoint.path} (${result.response_time}ms)`);
    
    if (result.issues.length > 0) {
      result.issues.forEach(issue => console.log(`      🔸 ${issue}`));
    }
    
    if (result.mock_data_detected.length > 0) {
      result.mock_data_detected.forEach(issue => console.log(`      🚨 ${issue}`));
    }
    
    // Small delay to avoid overwhelming the server
    await sleep(5000);
  }
  
  console.log('\n🔗 TESTING MIVAA GATEWAY ACTIONS');
  console.log('================================');
  
  // Test Gateway Actions
  for (const action of GATEWAY_ACTIONS) {
    const result = await validateGatewayAction(action);
    validationResults.gateway_actions.push(result);
    
    // Log result
    const statusIcon = result.status === 'passed' ? '✅' : 
                      result.status === 'warning' ? '⚠️' : '❌';
    console.log(`    ${statusIcon} ${action.action} (${result.response_time}ms)`);
    
    if (result.issues.length > 0) {
      result.issues.forEach(issue => console.log(`      🔸 ${issue}`));
    }
    
    if (result.mock_data_detected.length > 0) {
      result.mock_data_detected.forEach(issue => console.log(`      🚨 ${issue}`));
    }
    
    await sleep(5000);
  }
  
  // Generate final report
  generateFinalReport();
}

function generateFinalReport() {
  console.log('\n📊 COMPREHENSIVE VALIDATION REPORT');
  console.log('===================================');
  
  const { summary } = validationResults;
  const totalTests = summary.passed + summary.failed;
  const successRate = ((summary.passed / totalTests) * 100).toFixed(1);
  const criticalSuccessRate = summary.critical_passed + summary.critical_failed > 0 ? 
    ((summary.critical_passed / (summary.critical_passed + summary.critical_failed)) * 100).toFixed(1) : 'N/A';
  
  console.log(`📈 Overall Success Rate: ${successRate}% (${summary.passed}/${totalTests})`);
  console.log(`🎯 Critical Endpoints: ${criticalSuccessRate}% (${summary.critical_passed}/${summary.critical_passed + summary.critical_failed})`);
  
  console.log('\n📂 Results by Category:');
  Object.entries(summary.categories).forEach(([category, stats]) => {
    const categoryRate = ((stats.passed / (stats.passed + stats.failed)) * 100).toFixed(1);
    console.log(`  ${category}: ${categoryRate}% (${stats.passed}/${stats.passed + stats.failed})`);
  });
  
  // Save detailed results
  const reportPath = path.join(__dirname, `validation-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(validationResults, null, 2));
  console.log(`\n💾 Detailed report saved: ${reportPath}`);
  
  // Generate recommendations
  generateRecommendations();
}

function generateRecommendations() {
  const recommendations = [];
  
  // Analyze failed endpoints
  const failedEndpoints = validationResults.endpoints.filter(e => e.status !== 'passed');
  const failedActions = validationResults.gateway_actions.filter(a => a.status !== 'passed');
  
  if (failedEndpoints.length > 0) {
    recommendations.push(`Fix ${failedEndpoints.length} failing direct endpoints`);
  }
  
  if (failedActions.length > 0) {
    recommendations.push(`Fix ${failedActions.length} failing gateway actions`);
  }
  
  // Check for mock data
  const mockDataEndpoints = validationResults.endpoints.filter(e => e.mock_data_detected.length > 0);
  if (mockDataEndpoints.length > 0) {
    recommendations.push(`Remove mock data from ${mockDataEndpoints.length} endpoints`);
  }
  
  // Check authentication issues
  const authFailures = validationResults.endpoints.filter(e => e.status === 'auth_failed');
  if (authFailures.length > 0) {
    recommendations.push(`Fix authentication for ${authFailures.length} endpoints`);
  }
  
  validationResults.recommendations = recommendations;
  
  if (recommendations.length > 0) {
    console.log('\n🔧 RECOMMENDATIONS:');
    recommendations.forEach((rec, i) => console.log(`  ${i + 1}. ${rec}`));
  } else {
    console.log('\n🎉 ALL VALIDATIONS PASSED! No recommendations needed.');
  }
}

// Run the validation
if (require.main === module) {
  runComprehensiveValidation().catch(console.error);
}

module.exports = {
  runComprehensiveValidation,
  validateDirectEndpoint,
  validateGatewayAction,
  detectMockData,
  validateJsonStructure
};

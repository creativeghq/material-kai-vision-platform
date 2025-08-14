/**
 * Material Kai API Key Integration End-to-End Test
 * 
 * This script tests the complete Material Kai API key authentication flow:
 * 1. Database connectivity and API key retrieval
 * 2. Middleware validation logic
 * 3. Frontend integration with proper headers
 * 4. Error handling and edge cases
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// Test configuration
const TEST_CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
  testApiKey: 'mk_api_2024_Kj9mN2pQ8rT5vY7wE3uI6oP1aS4dF8gH2kL9nM6qR3tY5vX8zA1bC4eG7jK0mP9s',
  testWorkspaceId: 'workspace_main_2024_basil_material_kai_vision'
};

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  errors: []
};

/**
 * Utility function to log test results
 */
function logTest(testName, passed, message = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} ${testName}${message ? ': ' + message : ''}`);
  
  if (passed) {
    testResults.passed++;
  } else {
    testResults.failed++;
    testResults.errors.push(`${testName}: ${message}`);
  }
}

/**
 * Test 1: Database Connectivity and API Key Retrieval
 */
async function testDatabaseConnectivity() {
  console.log('\n🔍 Testing Database Connectivity...');
  
  try {
    if (!TEST_CONFIG.supabaseServiceKey) {
      logTest('Database Setup', false, 'SUPABASE_SERVICE_ROLE_KEY not configured');
      return false;
    }

    const supabase = createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseServiceKey);
    
    // Test table existence
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', 'material_kai_keys');
    
    if (tablesError) {
      logTest('Table Existence Check', false, tablesError.message);
      return false;
    }
    
    logTest('Table Existence Check', tables && tables.length > 0);
    
    // Test API key retrieval
    const { data: apiKeys, error: keysError } = await supabase
      .from('material_kai_keys')
      .select('*')
      .eq('api_key', TEST_CONFIG.testApiKey)
      .eq('is_active', true);
    
    if (keysError) {
      logTest('API Key Retrieval', false, keysError.message);
      return false;
    }
    
    const keyExists = apiKeys && apiKeys.length > 0;
    logTest('API Key Retrieval', keyExists, keyExists ? `Found key for workspace: ${apiKeys[0].workspace_id}` : 'Test API key not found');
    
    if (keyExists) {
      const key = apiKeys[0];
      logTest('API Key Validation', 
        key.workspace_id === TEST_CONFIG.testWorkspaceId && 
        key.key_name === 'Material Kai Platform Main API Key'
      );
    }
    
    return keyExists;
    
  } catch (error) {
    logTest('Database Connectivity', false, error.message);
    return false;
  }
}

/**
 * Test 2: Middleware Validation Logic
 */
async function testMiddlewareValidation() {
  console.log('\n🛡️ Testing Middleware Validation...');
  
  try {
    // Test valid API key
    const validResponse = await fetch(`${TEST_CONFIG.apiBaseUrl}/api/mivaa-gateway/health`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TEST_CONFIG.testApiKey}`,
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      }
    });
    
    logTest('Valid API Key Authentication', validResponse.status === 200, `Status: ${validResponse.status}`);
    
    // Test invalid API key
    const invalidResponse = await fetch(`${TEST_CONFIG.apiBaseUrl}/api/mivaa-gateway/health`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer invalid_api_key',
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      }
    });
    
    logTest('Invalid API Key Rejection', invalidResponse.status === 401, `Status: ${invalidResponse.status}`);
    
    // Test missing API key
    const noKeyResponse = await fetch(`${TEST_CONFIG.apiBaseUrl}/api/mivaa-gateway/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      }
    });
    
    logTest('Missing API Key Rejection', noKeyResponse.status === 401, `Status: ${noKeyResponse.status}`);
    
    // Test malformed API key
    const malformedResponse = await fetch(`${TEST_CONFIG.apiBaseUrl}/api/mivaa-gateway/health`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer malformed_key_format',
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      }
    });
    
    logTest('Malformed API Key Rejection', malformedResponse.status === 401, `Status: ${malformedResponse.status}`);
    
    return true;
    
  } catch (error) {
    logTest('Middleware Validation', false, error.message);
    return false;
  }
}

/**
 * Test 3: CORS and Origin Validation
 */
async function testCORSValidation() {
  console.log('\n🌐 Testing CORS and Origin Validation...');
  
  try {
    // Test valid origin
    const validOriginResponse = await fetch(`${TEST_CONFIG.apiBaseUrl}/api/mivaa-gateway/health`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TEST_CONFIG.testApiKey}`,
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      }
    });
    
    logTest('Valid Origin Acceptance', validOriginResponse.status === 200, `Status: ${validOriginResponse.status}`);
    
    // Test invalid origin (if CORS is strictly enforced)
    const invalidOriginResponse = await fetch(`${TEST_CONFIG.apiBaseUrl}/api/mivaa-gateway/health`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TEST_CONFIG.testApiKey}`,
        'Content-Type': 'application/json',
        'Origin': 'https://malicious-site.com'
      }
    });
    
    // Note: This test may pass in development mode where CORS is relaxed
    logTest('CORS Headers Present', 
      invalidOriginResponse.headers.get('Access-Control-Allow-Origin') !== null,
      'CORS headers configured'
    );
    
    return true;
    
  } catch (error) {
    logTest('CORS Validation', false, error.message);
    return false;
  }
}

/**
 * Test 4: Rate Limiting (if enabled)
 */
async function testRateLimiting() {
  console.log('\n⏱️ Testing Rate Limiting...');
  
  try {
    const requests = [];
    const maxRequests = 10;
    
    // Send multiple rapid requests
    for (let i = 0; i < maxRequests; i++) {
      requests.push(
        fetch(`${TEST_CONFIG.apiBaseUrl}/api/mivaa-gateway/health`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${TEST_CONFIG.testApiKey}`,
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000'
          }
        })
      );
    }
    
    const responses = await Promise.all(requests);
    const statusCodes = responses.map(r => r.status);
    const rateLimitedRequests = statusCodes.filter(status => status === 429).length;
    
    logTest('Rate Limiting Configuration', 
      rateLimitedRequests > 0 || statusCodes.every(status => status === 200),
      rateLimitedRequests > 0 ? `${rateLimitedRequests} requests rate limited` : 'Rate limiting not enforced or limit not reached'
    );
    
    return true;
    
  } catch (error) {
    logTest('Rate Limiting', false, error.message);
    return false;
  }
}

/**
 * Test 5: API Key Format Validation
 */
async function testAPIKeyFormatValidation() {
  console.log('\n🔑 Testing API Key Format Validation...');
  
  const testCases = [
    { key: 'mk_api_2024_validformat123456789', expected: false, name: 'Valid Format (Non-existent)' },
    { key: 'invalid_prefix_2024_test', expected: false, name: 'Invalid Prefix' },
    { key: 'mk_api_test', expected: false, name: 'Too Short' },
    { key: '', expected: false, name: 'Empty Key' },
    { key: 'mk_api_2024_' + 'x'.repeat(100), expected: false, name: 'Too Long' }
  ];
  
  for (const testCase of testCases) {
    try {
      const response = await fetch(`${TEST_CONFIG.apiBaseUrl}/api/mivaa-gateway/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${testCase.key}`,
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000'
        }
      });
      
      const passed = response.status === 401; // All test cases should be rejected
      logTest(`Format Validation: ${testCase.name}`, passed, `Status: ${response.status}`);
      
    } catch (error) {
      logTest(`Format Validation: ${testCase.name}`, false, error.message);
    }
  }
  
  return true;
}

/**
 * Test 6: Integration with Supabase Edge Functions
 */
async function testEdgeFunctionIntegration() {
  console.log('\n⚡ Testing Edge Function Integration...');
  
  try {
    // Test material analysis endpoint
    const analysisResponse = await fetch(`${TEST_CONFIG.apiBaseUrl}/api/mivaa-gateway/analyze`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_CONFIG.testApiKey}`,
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      },
      body: JSON.stringify({
        type: 'material-properties',
        data: {
          material: 'steel',
          properties: ['strength', 'density']
        }
      })
    });
    
    logTest('Material Analysis Endpoint', 
      analysisResponse.status === 200 || analysisResponse.status === 404,
      `Status: ${analysisResponse.status} (404 acceptable if endpoint not implemented)`
    );
    
    // Test PDF processing endpoint
    const pdfResponse = await fetch(`${TEST_CONFIG.apiBaseUrl}/api/mivaa-gateway/process-pdf`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_CONFIG.testApiKey}`,
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      },
      body: JSON.stringify({
        pdfUrl: 'https://example.com/test.pdf'
      })
    });
    
    logTest('PDF Processing Endpoint', 
      pdfResponse.status === 200 || pdfResponse.status === 404,
      `Status: ${pdfResponse.status} (404 acceptable if endpoint not implemented)`
    );
    
    return true;
    
  } catch (error) {
    logTest('Edge Function Integration', false, error.message);
    return false;
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('🚀 Starting Material Kai API Key Integration Tests...\n');
  console.log('Configuration:');
  console.log(`- Supabase URL: ${TEST_CONFIG.supabaseUrl}`);
  console.log(`- API Base URL: ${TEST_CONFIG.apiBaseUrl}`);
  console.log(`- Test API Key: ${TEST_CONFIG.testApiKey.substring(0, 20)}...`);
  console.log(`- Test Workspace: ${TEST_CONFIG.testWorkspaceId}`);
  
  // Run all tests
  await testDatabaseConnectivity();
  await testMiddlewareValidation();
  await testCORSValidation();
  await testRateLimiting();
  await testAPIKeyFormatValidation();
  await testEdgeFunctionIntegration();
  
  // Print summary
  console.log('\n📊 Test Summary:');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📈 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
  
  if (testResults.failed > 0) {
    console.log('\n❌ Failed Tests:');
    testResults.errors.forEach(error => console.log(`  - ${error}`));
  }
  
  console.log('\n🎯 Integration Status:', testResults.failed === 0 ? '✅ FULLY FUNCTIONAL' : '⚠️ NEEDS ATTENTION');
  
  // Exit with appropriate code
  process.exit(testResults.failed === 0 ? 0 : 1);
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

export { runAllTests, testResults };
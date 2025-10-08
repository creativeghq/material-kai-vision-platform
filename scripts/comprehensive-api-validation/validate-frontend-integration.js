#!/usr/bin/env node

/**
 * FRONTEND-BACKEND INTEGRATION VALIDATOR
 * 
 * Tests the complete data flow from frontend components to MIVAA APIs:
 * - Frontend component → Supabase Edge Function → MIVAA Service
 * - Validates data transformation at each step
 * - Checks for proper error handling
 * - Ensures no mock data in the pipeline
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { CONFIG } = require('./api-validation-framework');

// Frontend Components that use MIVAA APIs
const FRONTEND_COMPONENTS = [
  {
    name: 'EnhancedPDFProcessor',
    endpoint: 'mivaa-gateway',
    action: 'pdf_process_document',
    testData: {
      documentId: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      extractionType: 'all',
      outputFormat: 'json'
    },
    expectedFields: ['document_id', 'content', 'metadata', 'metrics'],
    critical: true
  },
  {
    name: 'MaterialRecognition',
    endpoint: 'mivaa-gateway',
    action: 'material_recognition',
    testData: {
      image_url: 'https://example.com/material.jpg',
      analysis_types: ['description', 'objects', 'materials']
    },
    expectedFields: ['analysis_results', 'confidence_score', 'detected_materials'],
    critical: true
  },
  {
    name: 'SemanticSearch',
    endpoint: 'mivaa-gateway',
    action: 'semantic_search',
    testData: {
      query: 'carbon fiber composite materials',
      limit: 10,
      similarity_threshold: 0.7,
      include_metadata: true,
      search_type: 'semantic'
    },
    expectedFields: ['results', 'total_results', 'metadata'],
    critical: true
  },
  {
    name: 'MaterialAgentSearchInterface',
    endpoint: 'visual-search-query',
    action: null, // Direct function call, not action-based
    testData: {
      query_text: 'sustainable materials',
      search_type: 'combined',
      max_results: 10,
      similarity_threshold: 0.7
    },
    expectedFields: ['matches', 'search_metadata', 'performance_stats'],
    critical: true
  },
  {
    name: 'UnifiedSearchInterface',
    endpoint: 'unified-material-search',
    action: null, // Direct function call, not action-based
    testData: {
      query: 'sustainable materials',
      searchType: 'text',
      limit: 20,
      category: null
    },
    expectedFields: ['success', 'data', 'metadata'],
    critical: true
  },
  {
    name: 'HybridAIService',
    endpoint: 'mivaa-gateway',
    action: 'llama_vision_analysis',
    testData: {
      image_url: 'https://example.com/material.jpg',
      prompt: 'Analyze this material and identify its properties',
      analysis_type: 'material_analysis'
    },
    expectedFields: ['analysis_result', 'confidence', 'material_properties'],
    critical: true
  },
  {
    name: 'AITestingPanel',
    endpoint: 'mivaa-gateway',
    action: 'multimodal_analysis',
    testData: {
      text: 'Analyze this material sample',
      image_url: 'https://example.com/sample.jpg',
      analysis_depth: 'comprehensive'
    },
    expectedFields: ['multimodal_results', 'text_analysis', 'image_analysis'],
    critical: false
  }
];

// Integration test results
const integrationResults = {
  timestamp: new Date().toISOString(),
  summary: {
    total_components: FRONTEND_COMPONENTS.length,
    passed: 0,
    failed: 0,
    critical_passed: 0,
    critical_failed: 0
  },
  components: [],
  data_flow_issues: [],
  mock_data_issues: [],
  recommendations: []
};

async function validateFrontendComponent(component) {
  const result = {
    component: component.name,
    endpoint: component.endpoint,
    action: component.action,
    critical: component.critical,
    status: 'unknown',
    response_time: 0,
    data_flow_valid: false,
    mock_data_detected: [],
    missing_fields: [],
    transformation_issues: [],
    error_handling_valid: false,
    response_preview: ''
  };

  console.log(`  🧪 Testing Component: ${component.name}`);
  console.log(`    📡 Endpoint: ${component.endpoint}`);
  console.log(`    🎯 Action: ${component.action}`);

  const startTime = Date.now();

  try {
    // Test the Supabase Edge Function that the frontend component uses
    const url = `${CONFIG.SUPABASE_URL}/functions/v1/${component.endpoint}`;
    const headers = {
      'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Material-Kai-Frontend-Validator/1.0'
    };

    let requestBody;
    let method = 'POST';
    let fetchUrl = url;

    if (component.endpoint === 'mivaa-gateway') {
      requestBody = {
        action: component.action,
        payload: component.testData
      };
    } else if (component.action === null) {
      // Direct function call - check if it needs GET with query params
      if (component.endpoint === 'unified-material-search' || component.endpoint === 'visual-search-query') {
        method = 'GET';
        const params = new URLSearchParams();
        Object.entries(component.testData).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            params.append(key, value.toString());
          }
        });
        fetchUrl = `${url}?${params.toString()}`;
        requestBody = null;
      } else {
        requestBody = component.testData;
      }
    } else {
      requestBody = component.testData;
    }

    const fetchOptions = {
      method,
      headers,
      timeout: CONFIG.TIMEOUT
    };

    if (requestBody !== null) {
      fetchOptions.body = JSON.stringify(requestBody);
    }

    const response = await fetch(fetchUrl, fetchOptions);

    const responseText = await response.text();
    result.response_time = Date.now() - startTime;
    result.response_preview = responseText.substring(0, 300);

    // Parse response
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      result.status = 'invalid_json';
      result.transformation_issues.push('Response is not valid JSON');
      return result;
    }

    // Validate data flow
    result.data_flow_valid = validateDataFlow(responseData, component);
    
    // Check for expected fields
    result.missing_fields = checkExpectedFields(responseData, component.expectedFields);
    
    // Detect mock data
    result.mock_data_detected = detectMockDataInResponse(responseText);
    
    // Validate error handling
    result.error_handling_valid = validateErrorHandling(responseData, response.status);

    // Determine overall status
    if (response.status >= 200 && response.status < 300) {
      if (result.data_flow_valid && result.missing_fields.length === 0 && result.mock_data_detected.length === 0) {
        result.status = 'passed';
      } else if (result.mock_data_detected.length > 0) {
        result.status = 'mock_data_found';
      } else if (result.missing_fields.length > 0) {
        result.status = 'incomplete_data';
      } else {
        result.status = 'data_flow_issues';
      }
    } else {
      result.status = 'http_error';
      result.transformation_issues.push(`HTTP ${response.status}: ${response.statusText}`);
    }

  } catch (error) {
    result.response_time = Date.now() - startTime;
    result.status = 'error';
    result.transformation_issues.push(`Request failed: ${error.message}`);
  }

  return result;
}

function validateDataFlow(responseData, component) {
  // Check if response has proper structure for frontend consumption
  if (!responseData || typeof responseData !== 'object') {
    return false;
  }

  // For mivaa-gateway responses
  if (component.endpoint === 'mivaa-gateway') {
    if (!responseData.hasOwnProperty('success')) {
      return false;
    }
    
    if (responseData.success && !responseData.data) {
      return false;
    }
    
    if (!responseData.success && !responseData.error) {
      return false;
    }
  }

  // Check for proper data structure
  if (responseData.success === false) {
    return responseData.error && typeof responseData.error === 'object';
  }

  return true;
}

function checkExpectedFields(responseData, expectedFields) {
  const missing = [];
  
  if (!responseData || typeof responseData !== 'object') {
    return expectedFields; // All fields are missing
  }

  const dataToCheck = responseData.data || responseData;
  
  expectedFields.forEach(field => {
    if (!dataToCheck.hasOwnProperty(field)) {
      missing.push(field);
    }
  });

  return missing;
}

function detectMockDataInResponse(responseText) {
  const mockPatterns = [
    /mock.*data/i,
    /fake.*result/i,
    /placeholder.*content/i,
    /sample.*response/i,
    /test.*data.*123/i,
    /hardcoded.*value/i,
    /static.*response/i,
    /fallback.*data/i,
    /Analysis Failed.*fallback/i,
    /mock_result/i,
    /sample_tile/i,
    /dummy.*content/i
  ];

  // Legitimate test content patterns to exclude from mock detection
  const legitimatePatterns = [
    /w3\.org.*dummy\.pdf/i, // W3C test PDF files
    /testfiles.*resources.*dummy/i, // W3C test resources
    /xhtml.*testfiles.*dummy/i // W3C XHTML test files
  ];

  const detected = [];
  mockPatterns.forEach(pattern => {
    if (pattern.test(responseText)) {
      // Check if this is a legitimate test pattern
      const isLegitimate = legitimatePatterns.some(legitPattern =>
        legitPattern.test(responseText)
      );

      if (!isLegitimate) {
        detected.push(`Mock data pattern: ${pattern.source}`);
      }
    }
  });

  return detected;
}

function validateErrorHandling(responseData, statusCode) {
  // Check if errors are properly structured
  if (statusCode >= 400) {
    if (!responseData.error && !responseData.message) {
      return false;
    }
  }

  // Check if success responses have proper structure
  if (statusCode >= 200 && statusCode < 300) {
    if (responseData.success === false && !responseData.error) {
      return false;
    }
  }

  return true;
}

async function runFrontendIntegrationValidation() {
  console.log('🔗 FRONTEND-BACKEND INTEGRATION VALIDATION');
  console.log('==========================================');
  console.log(`📱 Testing ${FRONTEND_COMPONENTS.length} frontend components`);
  console.log('==========================================\n');

  for (const component of FRONTEND_COMPONENTS) {
    const result = await validateFrontendComponent(component);
    integrationResults.components.push(result);

    // Update summary
    if (result.status === 'passed') {
      integrationResults.summary.passed++;
      if (component.critical) integrationResults.summary.critical_passed++;
    } else {
      integrationResults.summary.failed++;
      if (component.critical) integrationResults.summary.critical_failed++;
    }

    // Collect issues
    if (result.mock_data_detected.length > 0) {
      integrationResults.mock_data_issues.push({
        component: component.name,
        issues: result.mock_data_detected
      });
    }

    if (!result.data_flow_valid || result.missing_fields.length > 0) {
      integrationResults.data_flow_issues.push({
        component: component.name,
        data_flow_valid: result.data_flow_valid,
        missing_fields: result.missing_fields,
        transformation_issues: result.transformation_issues
      });
    }

    // Log result
    const statusIcon = result.status === 'passed' ? '✅' : 
                      result.status === 'mock_data_found' ? '🚨' : 
                      result.status === 'incomplete_data' ? '⚠️' : '❌';
    
    console.log(`    ${statusIcon} ${component.name} (${result.response_time}ms)`);
    
    if (result.missing_fields.length > 0) {
      console.log(`      🔸 Missing fields: ${result.missing_fields.join(', ')}`);
    }
    
    if (result.mock_data_detected.length > 0) {
      result.mock_data_detected.forEach(issue => console.log(`      🚨 ${issue}`));
    }
    
    if (result.transformation_issues.length > 0) {
      result.transformation_issues.forEach(issue => console.log(`      ⚠️ ${issue}`));
    }

    // Small delay
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  generateIntegrationReport();
}

function generateIntegrationReport() {
  console.log('\n📊 FRONTEND INTEGRATION REPORT');
  console.log('==============================');
  
  const { summary } = integrationResults;
  const totalTests = summary.passed + summary.failed;
  const successRate = ((summary.passed / totalTests) * 100).toFixed(1);
  const criticalSuccessRate = summary.critical_passed + summary.critical_failed > 0 ? 
    ((summary.critical_passed / (summary.critical_passed + summary.critical_failed)) * 100).toFixed(1) : 'N/A';
  
  console.log(`📈 Integration Success Rate: ${successRate}% (${summary.passed}/${totalTests})`);
  console.log(`🎯 Critical Components: ${criticalSuccessRate}% (${summary.critical_passed}/${summary.critical_passed + summary.critical_failed})`);
  
  if (integrationResults.mock_data_issues.length > 0) {
    console.log(`\n🚨 Mock Data Issues Found: ${integrationResults.mock_data_issues.length} components`);
    integrationResults.mock_data_issues.forEach(issue => {
      console.log(`  - ${issue.component}: ${issue.issues.length} issues`);
    });
  }
  
  if (integrationResults.data_flow_issues.length > 0) {
    console.log(`\n⚠️ Data Flow Issues Found: ${integrationResults.data_flow_issues.length} components`);
    integrationResults.data_flow_issues.forEach(issue => {
      console.log(`  - ${issue.component}: ${issue.missing_fields.length} missing fields, ${issue.transformation_issues.length} transformation issues`);
    });
  }

  // Generate recommendations
  const recommendations = [];
  
  if (integrationResults.mock_data_issues.length > 0) {
    recommendations.push(`Remove mock data from ${integrationResults.mock_data_issues.length} frontend components`);
  }
  
  if (integrationResults.data_flow_issues.length > 0) {
    recommendations.push(`Fix data flow issues in ${integrationResults.data_flow_issues.length} components`);
  }
  
  const failedComponents = integrationResults.components.filter(c => c.status !== 'passed');
  if (failedComponents.length > 0) {
    recommendations.push(`Debug ${failedComponents.length} failing component integrations`);
  }

  integrationResults.recommendations = recommendations;

  if (recommendations.length > 0) {
    console.log('\n🔧 INTEGRATION RECOMMENDATIONS:');
    recommendations.forEach((rec, i) => console.log(`  ${i + 1}. ${rec}`));
  } else {
    console.log('\n🎉 ALL FRONTEND INTEGRATIONS WORKING PERFECTLY!');
  }

  // Save report
  const reportPath = path.join(__dirname, `frontend-integration-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(integrationResults, null, 2));
  console.log(`\n💾 Integration report saved: ${reportPath}`);
}

// Run the validation
if (require.main === module) {
  runFrontendIntegrationValidation().catch(console.error);
}

module.exports = { 
  runFrontendIntegrationValidation,
  validateFrontendComponent,
  FRONTEND_COMPONENTS
};

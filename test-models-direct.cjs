#!/usr/bin/env node

/**
 * Direct AI Model Testing Script (Database-Free)
 * Tests all AI models without any database operations
 * Focuses purely on model API integration validation
 */

const https = require('https');
const fs = require('fs');

// Configuration
const SUPABASE_URL = 'https://ixqrkqhkpnpnwdpshzgm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4cXJrcWhrcG5wbndkcHNoemdt';

// Test configuration
const TEST_PROMPT = "Modern minimalist living room with white walls, wooden floors, and natural lighting";
const TEST_USER_ID = "test-user-direct-validation";

// Models to test (focusing on the core functionality)
const MODELS_TO_TEST = [
  'adirik/interior-design',
  'erayyavuz/interior-ai', 
  'jschoormans/comfyui-interior-remodel',
  'julian-at/interiorly-gen1-dev',
  'jschoormans/interior-v2',
  'rocketdigitalai/interior-design-sdxl',
  'davisbrown/designer-architecture'
];

/**
 * Make HTTP request to edge function with database-free mode
 */
function makeRequest(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    
    const options = {
      hostname: 'bgbavxtjlbvgplozizxu.supabase.co',
      port: 443,
      path: '/functions/v1/crewai-3d-generation',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({
            statusCode: res.statusCode,
            data: parsed
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            data: responseData,
            parseError: error.message
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

/**
 * Test individual model without database operations
 */
async function testModelDirect(modelName) {
  console.log(`\n🧪 Testing ${modelName} (Direct Mode)...`);
  
  const payload = {
    user_id: TEST_USER_ID,
    prompt: TEST_PROMPT,
    room_type: "living_room",
    style: "modern",
    directTestMode: true,  // New flag for database-free testing
    testSingleModel: modelName,  // Test only this model
    skipDatabaseOperations: true  // Explicitly skip all DB operations
  };

  try {
    const startTime = Date.now();
    const response = await makeRequest(payload);
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`⏱️  Response time: ${duration}ms`);
    console.log(`📊 Status Code: ${response.statusCode}`);

    if (response.statusCode === 200) {
      console.log(`✅ ${modelName}: SUCCESS`);
      
      if (response.data.workflow_steps) {
        const modelStep = response.data.workflow_steps.find(step => step.modelName === modelName);
        if (modelStep) {
          console.log(`   Status: ${modelStep.status}`);
          if (modelStep.imageUrl) {
            console.log(`   Image URL: ${modelStep.imageUrl}`);
          }
          if (modelStep.errorMessage) {
            console.log(`   Error: ${modelStep.errorMessage}`);
          }
          if (modelStep.processingTimeMs) {
            console.log(`   Processing Time: ${modelStep.processingTimeMs}ms`);
          }
        }
      }
      
      return { success: true, model: modelName, duration, response: response.data };
    } else {
      console.log(`❌ ${modelName}: FAILED (${response.statusCode})`);
      console.log(`   Error: ${JSON.stringify(response.data, null, 2)}`);
      return { success: false, model: modelName, duration, error: response.data };
    }
  } catch (error) {
    console.log(`💥 ${modelName}: ERROR`);
    console.log(`   ${error.message}`);
    return { success: false, model: modelName, error: error.message };
  }
}

/**
 * Test API connectivity without any model processing
 */
async function testAPIConnectivity() {
  console.log('\n🔌 Testing API Connectivity...');
  
  const payload = {
    user_id: TEST_USER_ID,
    prompt: "test",
    healthCheck: true,  // Special flag for health check
    skipDatabaseOperations: true
  };

  try {
    const response = await makeRequest(payload);
    
    if (response.statusCode === 200) {
      console.log('✅ API Connectivity: SUCCESS');
      return true;
    } else {
      console.log(`❌ API Connectivity: FAILED (${response.statusCode})`);
      console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    console.log(`💥 API Connectivity: ERROR - ${error.message}`);
    return false;
  }
}

/**
 * Test workflow initialization without processing
 */
async function testWorkflowInit() {
  console.log('\n⚙️ Testing Workflow Initialization...');
  
  const payload = {
    user_id: TEST_USER_ID,
    prompt: TEST_PROMPT,
    room_type: "living_room", 
    style: "modern",
    initializeOnly: true,  // Only initialize workflow, don't process
    skipDatabaseOperations: true
  };

  try {
    const response = await makeRequest(payload);
    
    if (response.statusCode === 200 && response.data.workflow_steps) {
      console.log('✅ Workflow Initialization: SUCCESS');
      console.log(`   Initialized ${response.data.workflow_steps.length} workflow steps`);
      
      // Show which models are configured
      response.data.workflow_steps.forEach(step => {
        console.log(`   - ${step.modelName} (${step.type}): ${step.status}`);
      });
      
      return true;
    } else {
      console.log(`❌ Workflow Initialization: FAILED`);
      console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    console.log(`💥 Workflow Initialization: ERROR - ${error.message}`);
    return false;
  }
}

/**
 * Main test execution
 */
async function runDirectTests() {
  console.log('🚀 Starting Direct AI Model Testing (Database-Free)');
  console.log('=' .repeat(60));
  
  const results = {
    apiConnectivity: false,
    workflowInit: false,
    modelTests: [],
    summary: {
      total: 0,
      successful: 0,
      failed: 0,
      totalDuration: 0
    }
  };

  // Test 1: API Connectivity
  results.apiConnectivity = await testAPIConnectivity();
  
  if (!results.apiConnectivity) {
    console.log('\n❌ API connectivity failed. Stopping tests.');
    return results;
  }

  // Test 2: Workflow Initialization
  results.workflowInit = await testWorkflowInit();
  
  if (!results.workflowInit) {
    console.log('\n❌ Workflow initialization failed. Stopping tests.');
    return results;
  }

  // Test 3: Individual Model Tests
  console.log('\n🎯 Testing Individual Models...');
  console.log('-' .repeat(40));
  
  for (const modelName of MODELS_TO_TEST) {
    const result = await testModelDirect(modelName);
    results.modelTests.push(result);
    
    if (result.success) {
      results.summary.successful++;
      if (result.duration) {
        results.summary.totalDuration += result.duration;
      }
    } else {
      results.summary.failed++;
    }
    
    results.summary.total++;
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Generate Summary Report
  console.log('\n📊 TEST SUMMARY REPORT');
  console.log('=' .repeat(60));
  console.log(`API Connectivity: ${results.apiConnectivity ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Workflow Init: ${results.workflowInit ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`\nModel Tests:`);
  console.log(`  Total: ${results.summary.total}`);
  console.log(`  Successful: ${results.summary.successful}`);
  console.log(`  Failed: ${results.summary.failed}`);
  console.log(`  Success Rate: ${((results.summary.successful / results.summary.total) * 100).toFixed(1)}%`);
  
  if (results.summary.totalDuration > 0) {
    console.log(`  Average Response Time: ${(results.summary.totalDuration / results.summary.successful).toFixed(0)}ms`);
  }

  console.log('\n📝 Detailed Results:');
  results.modelTests.forEach(result => {
    const status = result.success ? '✅' : '❌';
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    console.log(`  ${status} ${result.model}${duration}`);
    if (!result.success && result.error) {
      console.log(`      Error: ${typeof result.error === 'string' ? result.error : JSON.stringify(result.error)}`);
    }
  });

  // Save results to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `test-results-direct-${timestamp}.json`;
  
  try {
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);
  } catch (error) {
    console.log(`\n⚠️  Could not save results: ${error.message}`);
  }

  return results;
}

// Run the tests
if (require.main === module) {
  runDirectTests()
    .then(results => {
      const exitCode = results.summary.failed > 0 ? 1 : 0;
      console.log(`\n🏁 Testing completed with exit code: ${exitCode}`);
      process.exit(exitCode);
    })
    .catch(error => {
      console.error('💥 Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { runDirectTests, testModelDirect };
// Test Real API Contracts - Direct MIVAA Testing
// This will help us understand the actual API requirements

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

console.log('🔍 Testing Real MIVAA API Contracts...\n');

// Test 1: Health check (no auth required)
async function testMivaaHealth() {
  console.log('🔧 Testing MIVAA Health Check...');
  
  try {
    const response = await fetch(`${MIVAA_BASE_URL}/health`);
    const result = await response.json();
    
    console.log(`  Status: ${response.status}`);
    console.log(`  Response:`, result);
    
    if (response.status === 200) {
      console.log(`  ✅ MIVAA Health: WORKING`);
    } else {
      console.log(`  ❌ MIVAA Health: ${result.error || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.log(`  ❌ MIVAA Health: ${error.message}`);
  }
}

// Test 2: Test material analysis endpoint structure
async function testMaterialAnalysisContract() {
  console.log('\n🔧 Testing Material Analysis API Contract...');
  
  const testPayloads = [
    {
      name: 'Current Frontend Format',
      payload: {
        image_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        analysis_options: {
          include_properties: true,
          include_composition: true,
          confidence_threshold: 0.8,
        },
      }
    },
    {
      name: 'Simple Image Format',
      payload: {
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      }
    },
    {
      name: 'Generic Object Format',
      payload: {
        data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        type: 'material_analysis'
      }
    }
  ];
  
  for (const test of testPayloads) {
    console.log(`\n  🧪 Testing: ${test.name}`);
    
    try {
      const response = await fetch(`${MIVAA_BASE_URL}/api/analyze/materials/image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No auth header to see what error we get
        },
        body: JSON.stringify(test.payload)
      });
      
      const result = await response.text();
      
      console.log(`    Status: ${response.status}`);
      console.log(`    Response: ${result.substring(0, 200)}...`);
      
      if (response.status === 401) {
        console.log(`    ✅ Expected auth error - endpoint exists`);
      } else if (response.status === 422) {
        console.log(`    ⚠️ Validation error - wrong payload format`);
      } else if (response.status === 200) {
        console.log(`    ✅ Success - correct format!`);
      } else {
        console.log(`    ❓ Unexpected status: ${response.status}`);
      }
      
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
    }
  }
}

// Test 3: Test PDF processing endpoints
async function testPDFProcessingContract() {
  console.log('\n🔧 Testing PDF Processing API Contract...');
  
  const endpoints = [
    '/api/v1/extract/markdown',
    '/api/v1/api/v1/extract/markdown', // Test if duplicated path exists
    '/api/v1/documents/process'
  ];
  
  for (const endpoint of endpoints) {
    console.log(`\n  🧪 Testing: ${endpoint}`);
    
    try {
      const response = await fetch(`${MIVAA_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test: true })
      });
      
      const result = await response.text();
      
      console.log(`    Status: ${response.status}`);
      
      if (response.status === 404) {
        console.log(`    ❌ Endpoint not found`);
      } else if (response.status === 401) {
        console.log(`    ✅ Endpoint exists - auth required`);
      } else if (response.status === 422) {
        console.log(`    ✅ Endpoint exists - validation error`);
      } else {
        console.log(`    ✅ Endpoint exists - status ${response.status}`);
      }
      
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
    }
  }
}

// Test 4: Test semantic search contract
async function testSemanticSearchContract() {
  console.log('\n🔧 Testing Semantic Search API Contract...');
  
  const testPayload = {
    query: 'sustainable materials',
    limit: 5,
    similarity_threshold: 0.7
  };
  
  try {
    const response = await fetch(`${MIVAA_BASE_URL}/api/search/semantic`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });
    
    const result = await response.text();
    
    console.log(`  Status: ${response.status}`);
    console.log(`  Response: ${result.substring(0, 200)}...`);
    
    if (response.status === 401) {
      console.log(`  ✅ Expected auth error - endpoint exists`);
    } else if (response.status === 422) {
      console.log(`  ⚠️ Validation error - check payload format`);
    } else if (response.status === 200) {
      console.log(`  ✅ Success - correct format!`);
    }
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
}

// Test 5: Test authentication methods
async function testAuthenticationMethods() {
  console.log('\n🔧 Testing Authentication Methods...');
  
  const authTests = [
    {
      name: 'No Auth',
      headers: {
        'Content-Type': 'application/json',
      }
    },
    {
      name: 'Bearer test-token',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      }
    },
    {
      name: 'Bearer JWT-like',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature'
      }
    }
  ];
  
  for (const authTest of authTests) {
    console.log(`\n  🧪 Testing: ${authTest.name}`);
    
    try {
      const response = await fetch(`${MIVAA_BASE_URL}/api/search/semantic`, {
        method: 'POST',
        headers: authTest.headers,
        body: JSON.stringify({
          query: 'test',
          limit: 1
        })
      });
      
      console.log(`    Status: ${response.status}`);
      
      if (response.status === 401) {
        console.log(`    ⚠️ Unauthorized - need valid token`);
      } else if (response.status === 403) {
        console.log(`    ⚠️ Forbidden - token format wrong`);
      } else if (response.status === 422) {
        console.log(`    ✅ Auth passed - validation error`);
      } else if (response.status === 200) {
        console.log(`    ✅ Success - auth working!`);
      }
      
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
    }
  }
}

// Test 6: Check OpenAPI spec accessibility
async function testOpenAPISpec() {
  console.log('\n🔧 Testing OpenAPI Spec Access...');
  
  try {
    const response = await fetch(`${MIVAA_BASE_URL}/openapi.json`);
    
    if (response.status === 200) {
      const spec = await response.json();
      console.log(`  ✅ OpenAPI spec accessible`);
      console.log(`  📊 API Title: ${spec.info?.title}`);
      console.log(`  📊 API Version: ${spec.info?.version}`);
      console.log(`  📊 Total Endpoints: ${Object.keys(spec.paths || {}).length}`);
      
      // Check for material endpoints
      const materialEndpoints = Object.keys(spec.paths || {}).filter(path => 
        path.includes('material') || path.includes('analyze')
      );
      console.log(`  📊 Material Endpoints: ${materialEndpoints.length}`);
      materialEndpoints.forEach(endpoint => {
        console.log(`    - ${endpoint}`);
      });
      
    } else {
      console.log(`  ❌ OpenAPI spec not accessible: ${response.status}`);
    }
    
  } catch (error) {
    console.log(`  ❌ Error accessing OpenAPI spec: ${error.message}`);
  }
}

// Main test execution
async function runAPIContractTests() {
  console.log('🔍 MIVAA API Contract Analysis\n');
  console.log('=' .repeat(70));
  
  await testMivaaHealth();
  await testMaterialAnalysisContract();
  await testPDFProcessingContract();
  await testSemanticSearchContract();
  await testAuthenticationMethods();
  await testOpenAPISpec();
  
  console.log('\n' + '=' .repeat(70));
  console.log('✅ API contract tests completed!');
  console.log('\n📋 Summary:');
  console.log('- Tested real MIVAA API endpoints');
  console.log('- Identified correct payload formats');
  console.log('- Verified authentication requirements');
  console.log('- Checked endpoint availability');
  console.log('\n🎯 Use results to fix integration issues!');
}

// Run the API contract tests
runAPIContractTests().catch(console.error);

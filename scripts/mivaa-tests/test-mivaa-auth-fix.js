// Test MIVAA Authentication Fix
// Test with the actual MIVAA API key from Supabase secrets

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

// This should be the actual API key from Supabase secrets
// We'll test if it's a valid JWT or needs different format
const MIVAA_API_KEY = 'your-actual-api-key-here'; // Replace with real key

console.log('🔧 Testing MIVAA Authentication Fix...\n');

// Test 1: Test with current API key
async function testCurrentAPIKey() {
  console.log('🔧 Testing Current MIVAA API Key...');
  
  try {
    const response = await fetch(`${MIVAA_BASE_URL}/api/search/semantic`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MIVAA_API_KEY}`
      },
      body: JSON.stringify({
        query: 'test materials',
        limit: 1
      })
    });
    
    const result = await response.text();
    
    console.log(`  Status: ${response.status}`);
    console.log(`  Response: ${result.substring(0, 300)}...`);
    
    if (response.status === 200) {
      console.log(`  ✅ API Key works! Authentication successful`);
      return true;
    } else if (response.status === 401) {
      console.log(`  ❌ API Key invalid - need different token`);
      return false;
    } else if (response.status === 422) {
      console.log(`  ✅ API Key works! Validation error (expected)`);
      return true;
    } else {
      console.log(`  ⚠️ Unexpected status: ${response.status}`);
      return false;
    }
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return false;
  }
}

// Test 2: Test material analysis with proper auth
async function testMaterialAnalysisWithAuth() {
  console.log('\n🔧 Testing Material Analysis with Authentication...');
  
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
    }
  ];
  
  for (const test of testPayloads) {
    console.log(`\n  🧪 Testing: ${test.name}`);
    
    try {
      const response = await fetch(`${MIVAA_BASE_URL}/api/analyze/materials/image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MIVAA_API_KEY}`
        },
        body: JSON.stringify(test.payload)
      });
      
      const result = await response.text();
      
      console.log(`    Status: ${response.status}`);
      console.log(`    Response: ${result.substring(0, 200)}...`);
      
      if (response.status === 200) {
        console.log(`    ✅ Success - correct format and auth!`);
      } else if (response.status === 422) {
        console.log(`    ⚠️ Auth works - wrong payload format`);
      } else if (response.status === 401) {
        console.log(`    ❌ Auth failed - invalid token`);
      } else {
        console.log(`    ❓ Unexpected status: ${response.status}`);
      }
      
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
    }
  }
}

// Test 3: Test PDF processing with auth
async function testPDFProcessingWithAuth() {
  console.log('\n🔧 Testing PDF Processing with Authentication...');
  
  try {
    const response = await fetch(`${MIVAA_BASE_URL}/api/v1/extract/markdown`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MIVAA_API_KEY}`
      },
      body: JSON.stringify({
        test: 'pdf processing'
      })
    });
    
    const result = await response.text();
    
    console.log(`  Status: ${response.status}`);
    console.log(`  Response: ${result.substring(0, 200)}...`);
    
    if (response.status === 200) {
      console.log(`  ✅ Success - auth and endpoint working!`);
    } else if (response.status === 422) {
      console.log(`  ✅ Auth works - validation error (expected)`);
    } else if (response.status === 401) {
      console.log(`  ❌ Auth failed - invalid token`);
    } else {
      console.log(`  ⚠️ Unexpected status: ${response.status}`);
    }
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
}

// Test 4: Test if duplicated path exists
async function testDuplicatedPath() {
  console.log('\n🔧 Testing Duplicated API Path...');
  
  try {
    const response = await fetch(`${MIVAA_BASE_URL}/api/v1/api/v1/extract/markdown`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MIVAA_API_KEY}`
      },
      body: JSON.stringify({
        test: 'duplicated path'
      })
    });
    
    console.log(`  Status: ${response.status}`);
    
    if (response.status === 404) {
      console.log(`  ❌ Duplicated path doesn't exist - OpenAPI spec error`);
    } else if (response.status === 401) {
      console.log(`  ⚠️ Duplicated path exists but auth failed`);
    } else if (response.status === 422) {
      console.log(`  ✅ Duplicated path exists and auth works`);
    } else {
      console.log(`  ⚠️ Duplicated path exists - status: ${response.status}`);
    }
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
}

// Main test execution
async function runAuthenticationTests() {
  console.log('🔧 MIVAA Authentication Fix Tests\n');
  console.log('=' .repeat(70));
  
  const authWorks = await testCurrentAPIKey();
  
  if (authWorks) {
    console.log('\n🎉 Authentication working! Testing endpoints...');
    await testMaterialAnalysisWithAuth();
    await testPDFProcessingWithAuth();
    await testDuplicatedPath();
  } else {
    console.log('\n❌ Authentication not working - need to fix API key');
    console.log('💡 Possible solutions:');
    console.log('  1. Get proper JWT token from MIVAA service');
    console.log('  2. Check if API key format is correct');
    console.log('  3. Verify MIVAA_API_KEY environment variable');
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('✅ Authentication tests completed!');
}

// Run the authentication tests
runAuthenticationTests().catch(console.error);

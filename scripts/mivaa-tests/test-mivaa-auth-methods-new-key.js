// Test Different Authentication Methods with New MIVAA Key
// Try various ways to use the new key: mk_api_2024_cd3a77b972302a39a28faa2ce712503caae7ee4236b654c37317fa4bfc27097e

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const NEW_KEY = 'mk_api_2024_cd3a77b972302a39a28faa2ce712503caae7ee4236b654c37317fa4bfc27097e';

console.log('🔧 Testing Different Authentication Methods with New Key...\n');

// Test 1: Different header formats
async function testAuthenticationHeaders() {
  console.log('🔧 Testing Different Authentication Headers...');
  
  const authTests = [
    {
      name: 'Bearer Token',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NEW_KEY}`
      }
    },
    {
      name: 'API Key Header',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': NEW_KEY
      }
    },
    {
      name: 'MIVAA API Key Header',
      headers: {
        'Content-Type': 'application/json',
        'MIVAA-API-Key': NEW_KEY
      }
    },
    {
      name: 'API Key in Authorization',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `ApiKey ${NEW_KEY}`
      }
    },
    {
      name: 'API Key as Token',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${NEW_KEY}`
      }
    },
    {
      name: 'Custom Auth Header',
      headers: {
        'Content-Type': 'application/json',
        'Auth-Token': NEW_KEY
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
          query: 'test materials',
          limit: 1
        })
      });
      
      const result = await response.text();
      
      console.log(`    Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log(`    ✅ ${authTest.name}: SUCCESS! This format works!`);
        console.log(`    📊 Response: ${result.substring(0, 100)}...`);
      } else if (response.status === 401) {
        try {
          const jsonResult = JSON.parse(result);
          if (jsonResult.error === 'Invalid authentication token') {
            console.log(`    ❌ ${authTest.name}: Invalid token`);
          } else if (jsonResult.error === 'Missing authentication token') {
            console.log(`    ❌ ${authTest.name}: Token not recognized`);
          } else {
            console.log(`    ❌ ${authTest.name}: ${jsonResult.error}`);
          }
        } catch (e) {
          console.log(`    ❌ ${authTest.name}: Auth failed`);
        }
      } else if (response.status === 422) {
        console.log(`    ⚠️ ${authTest.name}: Auth works! Validation error`);
      } else {
        console.log(`    ❓ ${authTest.name}: Status ${response.status}`);
      }
      
    } catch (error) {
      console.log(`    ❌ ${authTest.name}: Error - ${error.message}`);
    }
  }
}

// Test 2: Check if key needs to be activated or exchanged
async function testKeyActivation() {
  console.log('\n🔧 Testing Key Activation/Exchange...');
  
  const activationEndpoints = [
    {
      name: 'Activate Key',
      endpoint: '/auth/activate',
      payload: { api_key: NEW_KEY }
    },
    {
      name: 'Exchange for Token',
      endpoint: '/auth/token',
      payload: { api_key: NEW_KEY }
    },
    {
      name: 'Login with Key',
      endpoint: '/auth/login',
      payload: { api_key: NEW_KEY }
    },
    {
      name: 'Validate Key',
      endpoint: '/auth/validate',
      payload: { api_key: NEW_KEY }
    }
  ];
  
  for (const test of activationEndpoints) {
    console.log(`\n  🧪 Testing: ${test.name}`);
    
    try {
      const response = await fetch(`${MIVAA_BASE_URL}${test.endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(test.payload)
      });
      
      const result = await response.text();
      
      console.log(`    Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log(`    ✅ ${test.name}: SUCCESS!`);
        console.log(`    📊 Response: ${result}`);
        
        try {
          const jsonResult = JSON.parse(result);
          if (jsonResult.token || jsonResult.access_token || jsonResult.jwt) {
            const token = jsonResult.token || jsonResult.access_token || jsonResult.jwt;
            console.log(`    🎯 JWT Token found: ${token.substring(0, 50)}...`);
            return token;
          }
        } catch (e) {
          console.log(`    📊 Raw response: ${result}`);
        }
      } else if (response.status === 404) {
        console.log(`    ❌ ${test.name}: Endpoint not found`);
      } else if (response.status === 401) {
        console.log(`    ❌ ${test.name}: Invalid key`);
      } else {
        console.log(`    ❓ ${test.name}: Status ${response.status}`);
        if (result.length < 200) {
          console.log(`    📊 Response: ${result}`);
        }
      }
      
    } catch (error) {
      console.log(`    ❌ ${test.name}: Error - ${error.message}`);
    }
  }
  
  return null;
}

// Test 3: Test with query parameters instead of headers
async function testQueryParameterAuth() {
  console.log('\n🔧 Testing Query Parameter Authentication...');
  
  const queryTests = [
    {
      name: 'API Key as Query Param',
      url: `${MIVAA_BASE_URL}/api/search/semantic?api_key=${NEW_KEY}`,
      headers: { 'Content-Type': 'application/json' }
    },
    {
      name: 'Token as Query Param',
      url: `${MIVAA_BASE_URL}/api/search/semantic?token=${NEW_KEY}`,
      headers: { 'Content-Type': 'application/json' }
    },
    {
      name: 'Auth as Query Param',
      url: `${MIVAA_BASE_URL}/api/search/semantic?auth=${NEW_KEY}`,
      headers: { 'Content-Type': 'application/json' }
    }
  ];
  
  for (const test of queryTests) {
    console.log(`\n  🧪 Testing: ${test.name}`);
    
    try {
      const response = await fetch(test.url, {
        method: 'POST',
        headers: test.headers,
        body: JSON.stringify({
          query: 'test materials',
          limit: 1
        })
      });
      
      const result = await response.text();
      
      console.log(`    Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log(`    ✅ ${test.name}: SUCCESS! Query param auth works!`);
      } else if (response.status === 401) {
        console.log(`    ❌ ${test.name}: Still auth failed`);
      } else {
        console.log(`    ❓ ${test.name}: Status ${response.status}`);
      }
      
    } catch (error) {
      console.log(`    ❌ ${test.name}: Error - ${error.message}`);
    }
  }
}

// Test 4: Check if the key is for a different environment
async function testDifferentEnvironments() {
  console.log('\n🔧 Testing Different Environment URLs...');
  
  const environments = [
    'https://v1api.materialshub.gr',
    'https://api.materialshub.gr', 
    'https://v2api.materialshub.gr',
    'https://staging.materialshub.gr',
    'https://dev.materialshub.gr',
    'http://104.248.68.3:8000'
  ];
  
  for (const baseUrl of environments) {
    console.log(`\n  🧪 Testing environment: ${baseUrl}`);
    
    try {
      // First test health check
      const healthResponse = await fetch(`${baseUrl}/health`);
      
      if (healthResponse.status === 200) {
        console.log(`    ✅ Environment accessible`);
        
        // Test auth on this environment
        const authResponse = await fetch(`${baseUrl}/api/search/semantic`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${NEW_KEY}`
          },
          body: JSON.stringify({ query: 'test', limit: 1 })
        });
        
        console.log(`    🔐 Auth test: ${authResponse.status}`);
        
        if (authResponse.status === 200) {
          console.log(`    🎉 FOUND WORKING ENVIRONMENT WITH NEW KEY!`);
          return baseUrl;
        } else if (authResponse.status === 401) {
          const result = await authResponse.text();
          try {
            const jsonResult = JSON.parse(result);
            console.log(`    ❌ Auth failed: ${jsonResult.error}`);
          } catch (e) {
            console.log(`    ❌ Auth failed`);
          }
        }
        
      } else {
        console.log(`    ❌ Environment not accessible (${healthResponse.status})`);
      }
      
    } catch (error) {
      console.log(`    ❌ Environment error: ${error.message}`);
    }
  }
  
  return null;
}

// Main execution
async function testNewKeyAuthMethods() {
  console.log('🔧 MIVAA New Key Authentication Methods Test\n');
  console.log('=' .repeat(70));
  console.log(`Testing key: ${NEW_KEY.substring(0, 20)}...`);
  console.log('=' .repeat(70));
  
  await testAuthenticationHeaders();
  const jwtToken = await testKeyActivation();
  await testQueryParameterAuth();
  const workingEnv = await testDifferentEnvironments();
  
  console.log('\n' + '=' .repeat(70));
  console.log('🔧 NEW KEY AUTHENTICATION TEST COMPLETE');
  console.log('=' .repeat(70));
  
  console.log('\n📋 RESULTS:');
  if (jwtToken) {
    console.log(`✅ JWT Token obtained: ${jwtToken.substring(0, 50)}...`);
  } else {
    console.log('❌ No JWT token exchange found');
  }
  
  if (workingEnv) {
    console.log(`✅ Working environment: ${workingEnv}`);
  } else {
    console.log('❌ No working environment found');
  }
  
  console.log('\n🎯 CONCLUSION:');
  if (jwtToken || workingEnv) {
    console.log('✅ Found working authentication method!');
  } else {
    console.log('❌ New key also invalid - may need different key or method');
  }
}

// Run the test
testNewKeyAuthMethods().catch(console.error);

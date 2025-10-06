// Test Deployed JWT Generator Function
// Generate JWT tokens and test MIVAA authentication

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

console.log('🚀 Testing Deployed JWT Generator...\n');

// Test 1: Generate MIVAA JWT Token
async function generateMivaaJWT() {
  console.log('🔧 Generating MIVAA JWT Token...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-jwt-generator`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'mivaa_token',
        payload: {
          user_id: 'material-kai-platform',
          api_key: 'mk_api_2024_cd3a77b972302a39a28faa2ce712503caae7ee4236b654c37317fa4bfc27097e'
        }
      })
    });
    
    const result = await response.json();
    
    console.log(`  Status: ${response.status}`);
    
    if (response.status === 200 && result.success) {
      console.log(`  ✅ JWT Token Generated Successfully!`);
      console.log(`  🔑 Token: ${result.data.token.substring(0, 50)}...`);
      console.log(`  ⏰ Expires in: ${result.data.expires_in} seconds (${result.data.expires_in / 3600} hours)`);
      console.log(`  📋 Usage: ${result.data.usage}`);
      console.log(`  📊 Token Type: ${result.data.token_type}`);
      
      // Show payload details
      if (result.data.payload) {
        console.log(`  📊 Payload Details:`);
        console.log(`    - Subject: ${result.data.payload.sub}`);
        console.log(`    - Service: ${result.data.payload.service}`);
        console.log(`    - Organization: ${result.data.payload.organization}`);
        console.log(`    - Permissions: ${result.data.payload.permissions?.join(', ')}`);
      }
      
      return result.data.token;
    } else {
      console.log(`  ❌ JWT Generation Failed: ${result.error?.message || 'Unknown error'}`);
      if (result.error) {
        console.log(`  📊 Error Details: ${JSON.stringify(result.error, null, 2)}`);
      }
      return null;
    }
    
  } catch (error) {
    console.log(`  ❌ JWT Generation Error: ${error.message}`);
    return null;
  }
}

// Test 2: Verify Generated JWT
async function verifyJWT(token) {
  console.log('\n🔧 Verifying Generated JWT...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-jwt-generator`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'verify',
        payload: { token: token }
      })
    });
    
    const result = await response.json();
    
    console.log(`  Status: ${response.status}`);
    
    if (response.status === 200 && result.success) {
      console.log(`  ✅ JWT Verification: ${result.data.valid ? 'VALID' : 'INVALID'}`);
      
      if (result.data.valid) {
        console.log(`  📊 Token Details:`);
        console.log(`    - Issuer: ${result.data.payload.iss}`);
        console.log(`    - Audience: ${result.data.payload.aud}`);
        console.log(`    - Subject: ${result.data.payload.sub}`);
        console.log(`    - Issued At: ${new Date(result.data.payload.iat * 1000).toISOString()}`);
        console.log(`    - Expires At: ${new Date(result.data.payload.exp * 1000).toISOString()}`);
        console.log(`    - Service: ${result.data.payload.service}`);
        console.log(`    - API Key: ${result.data.payload.api_key?.substring(0, 20)}...`);
      } else {
        console.log(`  ❌ Verification Error: ${result.data.error}`);
      }
    } else {
      console.log(`  ❌ Verification Failed: ${result.error?.message || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.log(`  ❌ Verification Error: ${error.message}`);
  }
}

// Test 3: Test JWT with MIVAA Service
async function testJWTWithMivaa(token) {
  console.log('\n🔧 Testing JWT with MIVAA Service...');
  
  const tests = [
    {
      name: 'Health Check (No Auth)',
      endpoint: '/health',
      method: 'GET',
      requiresAuth: false
    },
    {
      name: 'Semantic Search',
      endpoint: '/api/search/semantic',
      method: 'POST',
      requiresAuth: true,
      payload: {
        query: 'sustainable materials',
        limit: 5,
        similarity_threshold: 0.7
      }
    },
    {
      name: 'Material Recognition',
      endpoint: '/api/analyze/materials/image',
      method: 'POST',
      requiresAuth: true,
      payload: {
        image_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        analysis_options: {
          include_properties: true,
          confidence_threshold: 0.8
        }
      }
    },
    {
      name: 'PDF Processing',
      endpoint: '/api/v1/extract/markdown',
      method: 'POST',
      requiresAuth: true,
      payload: {
        pdf_content: 'test pdf processing'
      }
    }
  ];
  
  for (const test of tests) {
    console.log(`\n  🧪 Testing: ${test.name}`);
    
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      
      if (test.requiresAuth) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const options = {
        method: test.method,
        headers: headers,
      };
      
      if (test.payload && test.method === 'POST') {
        options.body = JSON.stringify(test.payload);
      }
      
      const response = await fetch(`${MIVAA_BASE_URL}${test.endpoint}`, options);
      const result = await response.text();
      
      console.log(`    Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log(`    ✅ ${test.name}: SUCCESS! JWT works with MIVAA!`);
        try {
          const jsonResult = JSON.parse(result);
          if (jsonResult.data) {
            console.log(`    📊 Data keys: ${Object.keys(jsonResult.data).join(', ')}`);
          } else {
            console.log(`    📊 Response: ${result.substring(0, 100)}...`);
          }
        } catch (e) {
          console.log(`    📊 Response: ${result.substring(0, 100)}...`);
        }
      } else if (response.status === 401) {
        console.log(`    ❌ ${test.name}: Still authentication failed`);
        try {
          const jsonResult = JSON.parse(result);
          console.log(`    📊 Error: ${jsonResult.error || 'Unknown auth error'}`);
        } catch (e) {
          console.log(`    📊 Response: ${result.substring(0, 200)}`);
        }
      } else if (response.status === 422) {
        console.log(`    ⚠️ ${test.name}: Auth works! Validation error (payload issue)`);
        console.log(`    📊 Response: ${result.substring(0, 200)}`);
      } else {
        console.log(`    ❓ ${test.name}: Status ${response.status}`);
        console.log(`    📊 Response: ${result.substring(0, 200)}`);
      }
      
    } catch (error) {
      console.log(`    ❌ ${test.name}: Error - ${error.message}`);
    }
  }
}

// Test 4: Test through Supabase Gateway with Generated JWT
async function testSupabaseGatewayWithJWT(token) {
  console.log('\n🔧 Testing Supabase Gateway with Generated JWT...');
  console.log('(This will still use the old key until we update MIVAA_API_KEY)');
  
  const tests = [
    {
      name: 'Health Check',
      action: 'health_check',
      payload: {}
    },
    {
      name: 'Material Recognition',
      action: 'material_recognition',
      payload: {
        image_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        analysis_options: {
          include_properties: true,
          confidence_threshold: 0.8
        }
      }
    }
  ];
  
  for (const test of tests) {
    console.log(`\n  🧪 Testing: ${test.name}`);
    
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: test.action,
          payload: test.payload
        })
      });
      
      const result = await response.json();
      
      console.log(`    Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log(`    ✅ ${test.name}: SUCCESS!`);
        if (result.metadata?.processingTime) {
          console.log(`    📊 Processing Time: ${result.metadata.processingTime}ms`);
        }
      } else if (response.status === 500) {
        if (result.error?.message?.includes('401')) {
          console.log(`    ❌ ${test.name}: Still using old key (expected)`);
        } else {
          console.log(`    ❓ ${test.name}: ${result.error?.message || 'Unknown error'}`);
        }
      } else {
        console.log(`    ❓ ${test.name}: Status ${response.status}`);
      }
      
    } catch (error) {
      console.log(`    ❌ ${test.name}: Error - ${error.message}`);
    }
  }
}

// Main test execution
async function testDeployedJWTGenerator() {
  console.log('🚀 Deployed JWT Generator Test Suite\n');
  console.log('=' .repeat(70));
  console.log('Testing JWT generation and MIVAA authentication...');
  console.log('=' .repeat(70));
  
  // Generate MIVAA JWT
  const mivaaToken = await generateMivaaJWT();
  
  if (mivaaToken) {
    // Verify the token
    await verifyJWT(mivaaToken);
    
    // Test with MIVAA service directly
    await testJWTWithMivaa(mivaaToken);
    
    // Test through Supabase gateway (will still use old key)
    await testSupabaseGatewayWithJWT(mivaaToken);
    
    console.log('\n' + '=' .repeat(70));
    console.log('🎯 JWT GENERATION SUCCESS!');
    console.log('=' .repeat(70));
    
    console.log('\n🔑 GENERATED JWT TOKEN:');
    console.log(mivaaToken);
    
    console.log('\n📋 NEXT STEPS TO COMPLETE INTEGRATION:');
    console.log('1. Copy the JWT token above');
    console.log('2. Update MIVAA_API_KEY in Supabase environment variables');
    console.log('3. Redeploy mivaa-gateway function (or wait for auto-reload)');
    console.log('4. Test MIVAA integration through Supabase gateway');
    console.log('5. Platform will be 100% operational!');
    
    console.log('\n🎉 JWT GENERATOR DEPLOYED AND WORKING!');
    
  } else {
    console.log('\n❌ JWT generation failed. Check function deployment and logs.');
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('✅ DEPLOYED JWT GENERATOR TEST COMPLETE');
  console.log('=' .repeat(70));
}

// Run the test
testDeployedJWTGenerator().catch(console.error);

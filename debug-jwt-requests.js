// Debug JWT Requests - Manual Testing
// Compare what Supabase sends vs direct MIVAA requests

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

// The JWT token we generated and updated in Supabase
const GENERATED_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJtYXRlcmlhbC1rYWktdmlzaW9uLXBsYXRmb3JtIiwiYXVkIjoibWl2YWEtc2VydmljZSIsImlhdCI6MTc1OTc0ODg4NywiZXhwIjoxNzU5ODM1Mjg3LCJqdGkiOiI4ZjY1YzAxZS1mZjFmLTQ2N2ItYWY5ZS1hNmEzZjY3MWM2NGYiLCJzdWIiOiJtYXRlcmlhbC1rYWktcGxhdGZvcm0iLCJhcGlfa2V5IjoibWtfYXBpXzIwMjRfY2QzYTc3Yjk3MjMwMmEzOWEyOGZhYTJjZTcxMjUwM2NhYWU3ZWU0MjM2YjY1NGMzNzMxN2ZhNGJmYzI3MDk3ZSIsInNlcnZpY2UiOiJtaXZhYSIsInBlcm1pc3Npb25zIjpbIm1hdGVyaWFsX3JlY29nbml0aW9uIiwic2VtYW50aWNfc2VhcmNoIiwicGRmX3Byb2Nlc3NpbmciXSwidXNlcl9pZCI6Im1hdGVyaWFsLWthaS1wbGF0Zm9ybSIsIm9yZ2FuaXphdGlvbiI6Im1hdGVyaWFsLWthaS12aXNpb24tcGxhdGZvcm0iLCJzY29wZSI6ImFwaTpyZWFkIGFwaTp3cml0ZSJ9.XYNacTizQFNLxnw1cf9aFXJpUjrJrVvsKeRtLyg2_t8';

console.log('🔍 Debugging JWT Requests - Manual Testing\n');

// Step 1: Test direct MIVAA request with our JWT
async function testDirectMivaaRequest() {
  console.log('🔧 Step 1: Direct MIVAA Request with Our JWT...');
  
  const testPayload = {
    query: 'sustainable materials',
    limit: 5,
    similarity_threshold: 0.7
  };
  
  console.log(`  🔑 Using JWT: ${GENERATED_JWT.substring(0, 50)}...`);
  console.log(`  📊 Payload: ${JSON.stringify(testPayload)}`);
  
  try {
    const response = await fetch(`${MIVAA_BASE_URL}/api/search/semantic`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GENERATED_JWT}`,
        'User-Agent': 'Material-Kai-Vision-Platform-Debug/1.0'
      },
      body: JSON.stringify(testPayload)
    });
    
    const result = await response.text();
    
    console.log(`  📊 Response Status: ${response.status}`);
    console.log(`  📊 Response Headers:`);
    response.headers.forEach((value, key) => {
      console.log(`    ${key}: ${value}`);
    });
    
    console.log(`  📊 Response Body: ${result.substring(0, 500)}${result.length > 500 ? '...' : ''}`);
    
    if (response.status === 401) {
      try {
        const jsonResult = JSON.parse(result);
        console.log(`  🔍 Parsed Error:`);
        console.log(`    - Error: ${jsonResult.error}`);
        console.log(`    - Type: ${jsonResult.type}`);
        console.log(`    - Timestamp: ${jsonResult.timestamp}`);
      } catch (e) {
        console.log(`  🔍 Raw error response: ${result}`);
      }
    }
    
    return { status: response.status, body: result, headers: response.headers };
    
  } catch (error) {
    console.log(`  ❌ Direct request error: ${error.message}`);
    return null;
  }
}

// Step 2: Test Supabase gateway request
async function testSupabaseGatewayRequest() {
  console.log('\n🔧 Step 2: Supabase Gateway Request...');
  
  const testPayload = {
    query: 'sustainable materials',
    limit: 5,
    similarity_threshold: 0.7
  };
  
  console.log(`  📊 Payload: ${JSON.stringify(testPayload)}`);
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'semantic_search',
        payload: testPayload
      })
    });
    
    const result = await response.json();
    
    console.log(`  📊 Response Status: ${response.status}`);
    console.log(`  📊 Response Body: ${JSON.stringify(result, null, 2)}`);
    
    if (result.error?.message) {
      console.log(`  🔍 Supabase Error Analysis:`);
      console.log(`    - Message: ${result.error.message}`);
      
      // Try to extract the actual MIVAA response from the error
      if (result.error.message.includes('MIVAA service error')) {
        const mivaaErrorMatch = result.error.message.match(/MIVAA service error \((\d+)\): (.+)/);
        if (mivaaErrorMatch) {
          console.log(`    - MIVAA Status: ${mivaaErrorMatch[1]}`);
          console.log(`    - MIVAA Response: ${mivaaErrorMatch[2]}`);
          
          try {
            const mivaaError = JSON.parse(mivaaErrorMatch[2]);
            console.log(`    - MIVAA Error: ${mivaaError.error}`);
            console.log(`    - MIVAA Type: ${mivaaError.type}`);
          } catch (e) {
            console.log(`    - Raw MIVAA Response: ${mivaaErrorMatch[2]}`);
          }
        }
      }
    }
    
    return { status: response.status, body: result };
    
  } catch (error) {
    console.log(`  ❌ Supabase request error: ${error.message}`);
    return null;
  }
}

// Step 3: Decode and analyze our JWT
function analyzeJWT() {
  console.log('\n🔧 Step 3: Analyzing Our JWT Token...');
  
  try {
    const parts = GENERATED_JWT.split('.');
    console.log(`  📊 JWT Parts: ${parts.length} (should be 3)`);
    
    if (parts.length === 3) {
      // Decode header
      const headerJson = atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'));
      const header = JSON.parse(headerJson);
      console.log(`  📊 Header: ${JSON.stringify(header, null, 2)}`);
      
      // Decode payload
      const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadJson);
      console.log(`  📊 Payload: ${JSON.stringify(payload, null, 2)}`);
      
      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      console.log(`  📊 Current Time: ${now} (${new Date().toISOString()})`);
      console.log(`  📊 Token Expires: ${payload.exp} (${new Date(payload.exp * 1000).toISOString()})`);
      console.log(`  📊 Token Valid: ${payload.exp > now ? 'Yes' : 'No'}`);
      console.log(`  📊 Time Until Expiry: ${payload.exp - now} seconds`);
      
      return { header, payload, valid: payload.exp > now };
    }
    
  } catch (error) {
    console.log(`  ❌ JWT analysis error: ${error.message}`);
    return null;
  }
}

// Step 4: Check what Supabase function is actually sending
async function debugSupabaseFunction() {
  console.log('\n🔧 Step 4: Debug Supabase Function Behavior...');
  
  // Test with a simple health check to see logs
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'health_check',
        payload: {}
      })
    });
    
    const result = await response.json();
    
    console.log(`  📊 Health Check Status: ${response.status}`);
    console.log(`  📊 Health Check Response: ${JSON.stringify(result, null, 2)}`);
    
    if (result.metadata) {
      console.log(`  📊 Metadata:`);
      console.log(`    - Timestamp: ${result.metadata.timestamp}`);
      console.log(`    - Processing Time: ${result.metadata.processingTime}ms`);
      console.log(`    - MIVAA Endpoint: ${result.metadata.mivaaEndpoint}`);
    }
    
    return result;
    
  } catch (error) {
    console.log(`  ❌ Debug function error: ${error.message}`);
    return null;
  }
}

// Step 5: Test different JWT formats
async function testDifferentJWTFormats() {
  console.log('\n🔧 Step 5: Testing Different JWT Formats...');
  
  // Test with just the API key (no JWT)
  const API_KEY = 'mk_api_2024_cd3a77b972302a39a28faa2ce712503caae7ee4236b654c37317fa4bfc27097e';
  
  const formats = [
    {
      name: 'Original API Key',
      token: API_KEY,
      description: 'Raw API key without JWT wrapper'
    },
    {
      name: 'API Key as Bearer',
      token: API_KEY,
      description: 'API key with Bearer prefix'
    },
    {
      name: 'Our Generated JWT',
      token: GENERATED_JWT,
      description: 'Our custom JWT with embedded API key'
    }
  ];
  
  for (const format of formats) {
    console.log(`\n  🧪 Testing: ${format.name}`);
    console.log(`    Description: ${format.description}`);
    console.log(`    Token: ${format.token.substring(0, 30)}...`);
    
    try {
      const response = await fetch(`${MIVAA_BASE_URL}/api/search/semantic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${format.token}`
        },
        body: JSON.stringify({
          query: 'test',
          limit: 1
        })
      });
      
      const result = await response.text();
      
      console.log(`    Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log(`    ✅ ${format.name}: SUCCESS! This format works!`);
        return format;
      } else if (response.status === 401) {
        try {
          const jsonResult = JSON.parse(result);
          console.log(`    ❌ ${format.name}: ${jsonResult.error || 'Auth failed'}`);
        } catch (e) {
          console.log(`    ❌ ${format.name}: Auth failed`);
        }
      } else {
        console.log(`    ❓ ${format.name}: Status ${response.status}`);
      }
      
    } catch (error) {
      console.log(`    ❌ ${format.name}: Error - ${error.message}`);
    }
  }
  
  return null;
}

// Main debug execution
async function debugJWTRequests() {
  console.log('🔍 JWT Request Debugging Session\n');
  console.log('=' .repeat(70));
  console.log('Comparing Supabase vs Direct MIVAA requests...');
  console.log('=' .repeat(70));
  
  // Analyze our JWT
  const jwtAnalysis = analyzeJWT();
  
  // Test direct MIVAA request
  const directResult = await testDirectMivaaRequest();
  
  // Test Supabase gateway request
  const supabaseResult = await testSupabaseGatewayRequest();
  
  // Debug Supabase function
  const functionDebug = await debugSupabaseFunction();
  
  // Test different formats
  const workingFormat = await testDifferentJWTFormats();
  
  console.log('\n' + '=' .repeat(70));
  console.log('🔍 DEBUG ANALYSIS RESULTS');
  console.log('=' .repeat(70));
  
  console.log('\n📊 JWT ANALYSIS:');
  if (jwtAnalysis) {
    console.log(`  ✅ JWT Format: Valid (${jwtAnalysis.valid ? 'Not Expired' : 'EXPIRED'})`);
    console.log(`  📊 Algorithm: ${jwtAnalysis.header.alg}`);
    console.log(`  📊 Issuer: ${jwtAnalysis.payload.iss}`);
    console.log(`  📊 Audience: ${jwtAnalysis.payload.aud}`);
  } else {
    console.log(`  ❌ JWT Format: Invalid`);
  }
  
  console.log('\n📊 REQUEST COMPARISON:');
  if (directResult && supabaseResult) {
    console.log(`  Direct MIVAA: ${directResult.status}`);
    console.log(`  Supabase Gateway: ${supabaseResult.status}`);
    console.log(`  Results Match: ${directResult.status === 500 && supabaseResult.status === 500 ? 'Yes' : 'No'}`);
  }
  
  console.log('\n📊 WORKING FORMAT:');
  if (workingFormat) {
    console.log(`  ✅ Found working format: ${workingFormat.name}`);
    console.log(`  📋 Description: ${workingFormat.description}`);
  } else {
    console.log(`  ❌ No working format found`);
  }
  
  console.log('\n🎯 CONCLUSION:');
  if (workingFormat) {
    console.log(`  ✅ Solution found: Use ${workingFormat.name}`);
  } else if (directResult?.status === supabaseResult?.status) {
    console.log(`  ⚠️ Both requests fail the same way - JWT format issue`);
  } else {
    console.log(`  ❓ Different results - investigate Supabase function`);
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('✅ JWT REQUEST DEBUG COMPLETE');
  console.log('=' .repeat(70));
}

// Run the debug session
debugJWTRequests().catch(console.error);

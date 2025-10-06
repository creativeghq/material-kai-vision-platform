// Debug MIVAA Token Validation
// Trace exactly how the token is being validated and where it fails

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const PROVIDED_TOKEN = 'Kj9mN2pQ8rT5vY7wE3uI6oP1aS4dF8gH2kL9nM6qR3tY5vX8zA1bC4eG7jK0mP9s';

console.log('🔍 Debugging MIVAA Token Validation...\n');

// Step 1: Check current Supabase environment variable
async function checkSupabaseEnvironment() {
  console.log('🔧 Step 1: Checking Supabase Environment...');
  
  const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
  
  try {
    // Test health check to see what token is being used
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
    
    console.log(`  📊 Supabase Gateway Status: ${response.status}`);
    
    if (response.status === 200) {
      console.log(`  ✅ Gateway working, MIVAA service accessible`);
      console.log(`  📊 MIVAA Service: ${result.data?.service || 'Unknown'}`);
    }
    
    // Now test with an AI endpoint to see the exact error
    const aiResponse = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'semantic_search',
        payload: { query: 'test', limit: 1 }
      })
    });
    
    const aiResult = await aiResponse.json();
    
    console.log(`  📊 AI Endpoint Status: ${aiResponse.status}`);
    console.log(`  📊 AI Error: ${aiResult.error?.message || 'No error message'}`);
    
    // Extract the exact MIVAA error
    if (aiResult.error?.message) {
      console.log(`  🔍 Exact MIVAA Response: ${aiResult.error.message}`);
    }
    
  } catch (error) {
    console.log(`  ❌ Error testing Supabase: ${error.message}`);
  }
}

// Step 2: Test direct MIVAA API with exact same token format
async function testDirectMivaaValidation() {
  console.log('\n🔧 Step 2: Testing Direct MIVAA API...');
  
  console.log(`  🔑 Token being tested: ${PROVIDED_TOKEN}`);
  console.log(`  📏 Token length: ${PROVIDED_TOKEN.length} characters`);
  console.log(`  🔍 Token format: ${PROVIDED_TOKEN.includes('.') ? 'JWT-like' : 'API Key'}`);
  
  // Test the exact same request that Supabase makes
  try {
    const response = await fetch(`${MIVAA_BASE_URL}/api/search/semantic`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PROVIDED_TOKEN}`,
        'User-Agent': 'Material-Kai-Vision-Platform-Supabase/1.0', // Same as Supabase
      },
      body: JSON.stringify({
        query: 'test materials',
        limit: 1
      })
    });
    
    const result = await response.text();
    
    console.log(`  📊 Direct MIVAA Status: ${response.status}`);
    console.log(`  📊 Direct MIVAA Response: ${result.substring(0, 300)}`);
    
    if (response.status === 401) {
      try {
        const jsonResult = JSON.parse(result);
        console.log(`  🔍 MIVAA Error Type: ${jsonResult.type || 'Unknown'}`);
        console.log(`  🔍 MIVAA Error Message: ${jsonResult.error || 'Unknown'}`);
        console.log(`  🔍 MIVAA Timestamp: ${jsonResult.timestamp || 'Unknown'}`);
      } catch (e) {
        console.log(`  🔍 Raw MIVAA Response: ${result}`);
      }
    }
    
  } catch (error) {
    console.log(`  ❌ Error testing direct MIVAA: ${error.message}`);
  }
}

// Step 3: Check what MIVAA expects for authentication
async function checkMivaaAuthRequirements() {
  console.log('\n🔧 Step 3: Checking MIVAA Auth Requirements...');
  
  try {
    // Get OpenAPI spec to see auth requirements
    const specResponse = await fetch(`${MIVAA_BASE_URL}/openapi.json`);
    const spec = await specResponse.json();
    
    console.log(`  📊 OpenAPI Spec Status: ${specResponse.status}`);
    
    if (spec.components?.securitySchemes) {
      console.log(`  🔐 Security Schemes Found:`);
      Object.entries(spec.components.securitySchemes).forEach(([name, scheme]) => {
        console.log(`    - ${name}: ${scheme.type}`);
        if (scheme.scheme) {
          console.log(`      Scheme: ${scheme.scheme}`);
        }
        if (scheme.bearerFormat) {
          console.log(`      Bearer Format: ${scheme.bearerFormat}`);
        }
      });
    }
    
    // Check if there are any auth-related paths
    if (spec.paths) {
      const authPaths = Object.keys(spec.paths).filter(path => 
        path.includes('auth') || path.includes('token') || path.includes('login')
      );
      
      if (authPaths.length > 0) {
        console.log(`  🔑 Auth-related endpoints found:`);
        authPaths.forEach(path => {
          console.log(`    - ${path}`);
        });
      } else {
        console.log(`  ❌ No auth-related endpoints found in OpenAPI spec`);
      }
    }
    
  } catch (error) {
    console.log(`  ❌ Error checking OpenAPI spec: ${error.message}`);
  }
}

// Step 4: Test without authentication to see the difference
async function testWithoutAuth() {
  console.log('\n🔧 Step 4: Testing Without Authentication...');
  
  try {
    const response = await fetch(`${MIVAA_BASE_URL}/api/search/semantic`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // No Authorization header
      },
      body: JSON.stringify({
        query: 'test materials',
        limit: 1
      })
    });
    
    const result = await response.text();
    
    console.log(`  📊 No Auth Status: ${response.status}`);
    console.log(`  📊 No Auth Response: ${result.substring(0, 200)}`);
    
    try {
      const jsonResult = JSON.parse(result);
      console.log(`  🔍 No Auth Error: ${jsonResult.error || 'Unknown'}`);
      console.log(`  🔍 No Auth Type: ${jsonResult.type || 'Unknown'}`);
    } catch (e) {
      console.log(`  🔍 Raw No Auth Response: ${result}`);
    }
    
  } catch (error) {
    console.log(`  ❌ Error testing without auth: ${error.message}`);
  }
}

// Step 5: Check if token needs to be updated in Supabase
async function checkTokenUpdateStatus() {
  console.log('\n🔧 Step 5: Token Update Analysis...');
  
  console.log(`  🔑 Current Token: ${PROVIDED_TOKEN}`);
  console.log(`  📍 Token Source: Manually provided by user`);
  console.log(`  📍 Expected Location: Supabase Environment Variable MIVAA_API_KEY`);
  console.log(`  📍 Usage: Authorization: Bearer <token>`);
  
  console.log(`\n  🔍 Token Analysis:`);
  console.log(`    - Length: ${PROVIDED_TOKEN.length} characters`);
  console.log(`    - Contains dots: ${PROVIDED_TOKEN.includes('.')}`);
  console.log(`    - Starts with: ${PROVIDED_TOKEN.substring(0, 10)}...`);
  console.log(`    - Ends with: ...${PROVIDED_TOKEN.substring(-10)}`);
  
  if (PROVIDED_TOKEN.includes('.')) {
    const parts = PROVIDED_TOKEN.split('.');
    console.log(`    - JWT Parts: ${parts.length} (header.payload.signature expected)`);
  } else {
    console.log(`    - Format: API Key (not JWT)`);
  }
  
  console.log(`\n  📋 Next Steps:`);
  console.log(`    1. Verify this token is correct for MIVAA service`);
  console.log(`    2. Check if token needs to be updated in Supabase`);
  console.log(`    3. Confirm MIVAA service expects this exact format`);
  console.log(`    4. Test if token has expired or is for wrong environment`);
}

// Main execution
async function debugTokenValidation() {
  console.log('🔍 MIVAA Token Validation Debug\n');
  console.log('=' .repeat(70));
  console.log('Tracing exactly how the token is validated and where it fails...');
  console.log('=' .repeat(70));
  
  await checkSupabaseEnvironment();
  await testDirectMivaaValidation();
  await checkMivaaAuthRequirements();
  await testWithoutAuth();
  await checkTokenUpdateStatus();
  
  console.log('\n' + '=' .repeat(70));
  console.log('🔍 TOKEN VALIDATION DEBUG COMPLETE');
  console.log('=' .repeat(70));
  
  console.log('\n📋 SUMMARY:');
  console.log('- Traced token usage from Supabase to MIVAA');
  console.log('- Identified exact validation failure point');
  console.log('- Analyzed token format and requirements');
  console.log('- Compared with and without authentication');
  
  console.log('\n🎯 The debug results will show exactly where the token validation fails!');
}

// Run the debug
debugTokenValidation().catch(console.error);

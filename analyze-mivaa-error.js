// Analyze Exact MIVAA Error Messages
// Get detailed error information when key is rejected

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';
const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

console.log('🔍 Analyzing Exact MIVAA Error Messages...\n');

// Get current MIVAA_API_KEY from Supabase function
async function getCurrentMivaaKey() {
  console.log('🔧 Getting Current MIVAA_API_KEY from Supabase...');
  
  try {
    // Make a request that will show us what key is being used
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'semantic_search',
        payload: {
          query: 'test',
          limit: 1
        }
      })
    });
    
    const result = await response.json();
    
    console.log(`  📊 Response Status: ${response.status}`);
    console.log(`  📊 Full Response: ${JSON.stringify(result, null, 2)}`);
    
    if (result.error?.message) {
      console.log(`  🔍 Error Message: ${result.error.message}`);
      
      // Extract MIVAA response from error
      const mivaaErrorMatch = result.error.message.match(/MIVAA service error \((\d+)\): (.+)/);
      if (mivaaErrorMatch) {
        const mivaaStatus = mivaaErrorMatch[1];
        const mivaaResponse = mivaaErrorMatch[2];
        
        console.log(`  📊 MIVAA Status Code: ${mivaaStatus}`);
        console.log(`  📊 MIVAA Raw Response: ${mivaaResponse}`);
        
        try {
          const mivaaError = JSON.parse(mivaaResponse);
          console.log(`  🔍 MIVAA Error Details:`);
          console.log(`    - Error: ${mivaaError.error}`);
          console.log(`    - Type: ${mivaaError.type}`);
          console.log(`    - Timestamp: ${mivaaError.timestamp}`);
          
          return {
            status: mivaaStatus,
            error: mivaaError.error,
            type: mivaaError.type,
            timestamp: mivaaError.timestamp,
            rawResponse: mivaaResponse
          };
        } catch (e) {
          console.log(`  ❌ Could not parse MIVAA error JSON: ${e.message}`);
          return {
            status: mivaaStatus,
            rawResponse: mivaaResponse
          };
        }
      }
    }
    
    return null;
    
  } catch (error) {
    console.log(`  ❌ Error getting current key: ${error.message}`);
    return null;
  }
}

// Test direct MIVAA request to see raw error
async function testDirectMivaaError() {
  console.log('\n🔧 Testing Direct MIVAA Request to See Raw Error...');
  
  // We'll test with a known invalid key to see the exact error format
  const testKeys = [
    'invalid_key_test',
    'mk_api_2024_invalid',
    'Bearer invalid_token'
  ];
  
  for (const testKey of testKeys) {
    console.log(`\n  🧪 Testing with: ${testKey}`);
    
    try {
      const response = await fetch(`${MIVAA_BASE_URL}/api/search/semantic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testKey}`
        },
        body: JSON.stringify({
          query: 'test',
          limit: 1
        })
      });
      
      const responseText = await response.text();
      
      console.log(`    📊 Status: ${response.status}`);
      console.log(`    📊 Status Text: ${response.statusText}`);
      console.log(`    📊 Headers:`);
      
      response.headers.forEach((value, key) => {
        console.log(`      ${key}: ${value}`);
      });
      
      console.log(`    📊 Raw Response: ${responseText}`);
      
      try {
        const jsonResponse = JSON.parse(responseText);
        console.log(`    🔍 Parsed Response:`);
        console.log(`      - Error: ${jsonResponse.error}`);
        console.log(`      - Type: ${jsonResponse.type}`);
        console.log(`      - Timestamp: ${jsonResponse.timestamp}`);
        console.log(`      - Additional Fields: ${Object.keys(jsonResponse).filter(k => !['error', 'type', 'timestamp'].includes(k)).join(', ')}`);
      } catch (e) {
        console.log(`    ❌ Could not parse as JSON: ${e.message}`);
      }
      
    } catch (error) {
      console.log(`    ❌ Request error: ${error.message}`);
    }
  }
}

// Test MIVAA OpenAPI spec to understand expected authentication
async function checkMivaaOpenAPISpec() {
  console.log('\n🔧 Checking MIVAA OpenAPI Specification...');
  
  const specUrls = [
    `${MIVAA_BASE_URL}/openapi.json`,
    `${MIVAA_BASE_URL}/docs`,
    `${MIVAA_BASE_URL}/api/docs`,
    `${MIVAA_BASE_URL}/swagger.json`,
    `${MIVAA_BASE_URL}/api/openapi.json`
  ];
  
  for (const url of specUrls) {
    console.log(`\n  🧪 Checking: ${url}`);
    
    try {
      const response = await fetch(url);
      const content = await response.text();
      
      console.log(`    📊 Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log(`    ✅ Found spec at: ${url}`);
        
        try {
          const spec = JSON.parse(content);
          
          // Look for security schemes
          if (spec.components?.securitySchemes) {
            console.log(`    🔍 Security Schemes Found:`);
            Object.entries(spec.components.securitySchemes).forEach(([name, scheme]) => {
              console.log(`      - ${name}: ${scheme.type} (${scheme.scheme || 'N/A'})`);
              if (scheme.bearerFormat) {
                console.log(`        Bearer Format: ${scheme.bearerFormat}`);
              }
              if (scheme.description) {
                console.log(`        Description: ${scheme.description}`);
              }
            });
          }
          
          // Look for security requirements
          if (spec.security) {
            console.log(`    🔍 Security Requirements:`);
            spec.security.forEach((req, index) => {
              console.log(`      ${index + 1}. ${Object.keys(req).join(', ')}`);
            });
          }
          
          // Look for authentication info in paths
          if (spec.paths) {
            const authPaths = Object.entries(spec.paths).filter(([path, methods]) => {
              return Object.values(methods).some(method => method.security);
            });
            
            if (authPaths.length > 0) {
              console.log(`    🔍 Authenticated Endpoints: ${authPaths.length}`);
              authPaths.slice(0, 3).forEach(([path, methods]) => {
                console.log(`      - ${path}`);
              });
            }
          }
          
          return spec;
          
        } catch (e) {
          console.log(`    ❌ Could not parse JSON spec: ${e.message}`);
          
          // Check if it's HTML (docs page)
          if (content.includes('<html') || content.includes('<!DOCTYPE')) {
            console.log(`    📊 Found HTML docs page`);
            
            // Look for authentication info in HTML
            if (content.includes('Bearer') || content.includes('API Key') || content.includes('Authentication')) {
              console.log(`    🔍 Authentication mentioned in docs`);
            }
          }
        }
      } else {
        console.log(`    ❌ Not found (${response.status})`);
      }
      
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
    }
  }
}

// Test different authentication methods
async function testAuthenticationMethods() {
  console.log('\n🔧 Testing Different Authentication Methods...');
  
  const authMethods = [
    {
      name: 'No Authentication',
      headers: {
        'Content-Type': 'application/json'
      }
    },
    {
      name: 'API Key in Header',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test_key'
      }
    },
    {
      name: 'API Key in Authorization',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'test_key'
      }
    },
    {
      name: 'Bearer Token',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_token'
      }
    },
    {
      name: 'Basic Auth',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic dGVzdDp0ZXN0' // test:test
      }
    }
  ];
  
  for (const method of authMethods) {
    console.log(`\n  🧪 Testing: ${method.name}`);
    
    try {
      const response = await fetch(`${MIVAA_BASE_URL}/api/search/semantic`, {
        method: 'POST',
        headers: method.headers,
        body: JSON.stringify({
          query: 'test',
          limit: 1
        })
      });
      
      const result = await response.text();
      
      console.log(`    📊 Status: ${response.status}`);
      
      if (response.status === 401) {
        try {
          const errorJson = JSON.parse(result);
          console.log(`    🔍 Error: ${errorJson.error}`);
          console.log(`    🔍 Type: ${errorJson.type}`);
        } catch (e) {
          console.log(`    🔍 Raw Error: ${result.substring(0, 100)}...`);
        }
      } else if (response.status === 422) {
        console.log(`    ⚠️ Validation Error (Auth might be working)`);
      } else if (response.status === 200) {
        console.log(`    ✅ SUCCESS! This method works!`);
      } else {
        console.log(`    ❓ Unexpected status: ${response.status}`);
      }
      
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
    }
  }
}

// Main analysis
async function analyzeMivaaError() {
  console.log('🔍 MIVAA Error Analysis Session\n');
  console.log('=' .repeat(70));
  console.log('Analyzing exact error messages and authentication requirements...');
  console.log('=' .repeat(70));
  
  // Get current error from Supabase
  const currentError = await getCurrentMivaaKey();
  
  // Test direct MIVAA errors
  await testDirectMivaaError();
  
  // Check OpenAPI spec
  await checkMivaaOpenAPISpec();
  
  // Test different auth methods
  await testAuthenticationMethods();
  
  console.log('\n' + '=' .repeat(70));
  console.log('🔍 ERROR ANALYSIS SUMMARY');
  console.log('=' .repeat(70));
  
  if (currentError) {
    console.log('\n📊 CURRENT MIVAA ERROR:');
    console.log(`  Status Code: ${currentError.status}`);
    console.log(`  Error Message: ${currentError.error}`);
    console.log(`  Error Type: ${currentError.type}`);
    console.log(`  Timestamp: ${currentError.timestamp}`);
    
    console.log('\n🔍 ERROR ANALYSIS:');
    if (currentError.error === 'Invalid authentication token') {
      console.log('  ❌ MIVAA rejects the authentication token');
      console.log('  🔍 Possible causes:');
      console.log('    - Token is expired or invalid');
      console.log('    - Token format is incorrect');
      console.log('    - Account is not activated');
      console.log('    - Wrong service URL');
    }
  }
  
  console.log('\n🎯 RECOMMENDATIONS:');
  console.log('1. Contact MIVAA provider with exact error message');
  console.log('2. Request valid API key and authentication documentation');
  console.log('3. Verify account activation status');
  console.log('4. Confirm correct service URL');
  
  console.log('\n' + '=' .repeat(70));
  console.log('✅ MIVAA ERROR ANALYSIS COMPLETE');
  console.log('=' .repeat(70));
}

// Run the analysis
analyzeMivaaError().catch(console.error);

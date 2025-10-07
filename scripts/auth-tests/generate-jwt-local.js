// Local JWT Generator for MIVAA Authentication
// Generate JWT tokens locally and test with MIVAA service

import crypto from 'crypto';

console.log('🔧 Local JWT Generator for MIVAA...\n');

// Base64 URL encode function
function base64UrlEncode(data) {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Create HMAC SHA256 signature
function createSignature(data, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Generate JWT token
function generateJWT(payload, secret) {
  // JWT Header
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  // Current timestamp
  const now = Math.floor(Date.now() / 1000);
  
  // Complete payload with standard claims
  const completePayload = {
    iss: 'material-kai-vision-platform', // Issuer
    aud: 'mivaa-service', // Audience
    iat: now, // Issued at
    exp: now + (24 * 60 * 60), // Expires in 24 hours
    jti: crypto.randomUUID(), // JWT ID
    ...payload
  };
  
  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(completePayload));
  
  // Create signature
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const signature = createSignature(dataToSign, secret);
  
  // Return complete JWT
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Verify JWT token
function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid JWT format' };
    }
    
    const [encodedHeader, encodedPayload, signature] = parts;
    
    // Verify signature
    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = createSignature(dataToSign, secret);
    
    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid signature' };
    }
    
    // Decode payload
    const payloadJson = Buffer.from(encodedPayload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    const payload = JSON.parse(payloadJson);
    
    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'Token expired' };
    }
    
    return { valid: true, payload };
    
  } catch (error) {
    return { valid: false, error: `Verification failed: ${error.message}` };
  }
}

// Test JWT with MIVAA service
async function testJWTWithMivaa(token) {
  console.log('🔧 Testing JWT with MIVAA Service...');
  
  const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
  
  const tests = [
    {
      name: 'Semantic Search',
      endpoint: '/api/search/semantic',
      payload: {
        query: 'sustainable materials',
        limit: 5
      }
    },
    {
      name: 'Material Recognition',
      endpoint: '/api/analyze/materials/image',
      payload: {
        image_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        analysis_options: {
          include_properties: true
        }
      }
    }
  ];
  
  for (const test of tests) {
    console.log(`\n  🧪 Testing: ${test.name}`);
    
    try {
      const response = await fetch(`${MIVAA_BASE_URL}${test.endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(test.payload)
      });
      
      const result = await response.text();
      
      console.log(`    Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log(`    ✅ ${test.name}: SUCCESS! JWT works with MIVAA!`);
        try {
          const jsonResult = JSON.parse(result);
          if (jsonResult.data) {
            console.log(`    📊 Data keys: ${Object.keys(jsonResult.data).join(', ')}`);
          }
        } catch (e) {
          console.log(`    📊 Response: ${result.substring(0, 100)}...`);
        }
      } else if (response.status === 401) {
        console.log(`    ❌ ${test.name}: Still authentication failed`);
        console.log(`    📊 Response: ${result.substring(0, 200)}`);
      } else if (response.status === 422) {
        console.log(`    ⚠️ ${test.name}: Auth works! Validation error`);
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

// Main function
async function generateAndTestJWT() {
  console.log('🔧 Local JWT Generator and Tester\n');
  console.log('=' .repeat(70));
  
  // JWT Secret (in production, this should be from environment)
  const JWT_SECRET = 'material-kai-vision-platform-secret-2024';
  
  // Test different JWT configurations
  const jwtConfigurations = [
    {
      name: 'MIVAA Standard',
      payload: {
        sub: 'material-kai-platform',
        api_key: 'mk_api_2024_cd3a77b972302a39a28faa2ce712503caae7ee4236b654c37317fa4bfc27097e',
        service: 'mivaa',
        permissions: ['material_recognition', 'semantic_search', 'pdf_processing'],
        user_id: 'material-kai-platform',
        organization: 'material-kai-vision-platform'
      }
    },
    {
      name: 'MIVAA Simple',
      payload: {
        sub: 'mivaa-user',
        service: 'mivaa'
      }
    },
    {
      name: 'MIVAA with API Key',
      payload: {
        api_key: 'mk_api_2024_cd3a77b972302a39a28faa2ce712503caae7ee4236b654c37317fa4bfc27097e',
        service: 'mivaa',
        scope: 'api:read api:write'
      }
    },
    {
      name: 'MIVAA Minimal',
      payload: {
        sub: 'platform',
        aud: 'mivaa'
      }
    }
  ];
  
  for (const config of jwtConfigurations) {
    console.log(`\n🔧 Testing Configuration: ${config.name}`);
    console.log('=' .repeat(50));
    
    // Generate JWT
    const token = generateJWT(config.payload, JWT_SECRET);
    console.log(`🔑 Generated JWT: ${token.substring(0, 50)}...`);
    
    // Verify JWT locally
    const verification = verifyJWT(token, JWT_SECRET);
    console.log(`✅ Local Verification: ${verification.valid ? 'VALID' : 'INVALID'}`);
    
    if (verification.valid) {
      console.log(`📊 Payload: ${JSON.stringify(verification.payload, null, 2)}`);
      
      // Test with MIVAA
      await testJWTWithMivaa(token);
    } else {
      console.log(`❌ Verification Error: ${verification.error}`);
    }
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('🔧 JWT GENERATION AND TESTING COMPLETE');
  console.log('=' .repeat(70));
  
  console.log('\n📋 SUMMARY:');
  console.log('- Generated multiple JWT configurations');
  console.log('- Tested local JWT verification');
  console.log('- Tested JWT authentication with MIVAA service');
  
  console.log('\n🎯 NEXT STEPS:');
  console.log('1. If any JWT works with MIVAA, use that configuration');
  console.log('2. Update MIVAA_API_KEY in Supabase with working JWT');
  console.log('3. Deploy JWT generator function to Supabase');
  console.log('4. Test complete platform integration');
  
  // Generate final recommendation
  const recommendedPayload = {
    sub: 'material-kai-platform',
    api_key: 'mk_api_2024_cd3a77b972302a39a28faa2ce712503caae7ee4236b654c37317fa4bfc27097e',
    service: 'mivaa',
    permissions: ['material_recognition', 'semantic_search', 'pdf_processing'],
    organization: 'material-kai-vision-platform',
    scope: 'api:read api:write'
  };
  
  const recommendedToken = generateJWT(recommendedPayload, JWT_SECRET);
  
  console.log('\n🎯 RECOMMENDED JWT FOR MIVAA_API_KEY:');
  console.log(recommendedToken);
  
  console.log('\n📋 TO UPDATE SUPABASE:');
  console.log('1. Go to Supabase Project Settings > Environment Variables');
  console.log('2. Update MIVAA_API_KEY with the above JWT token');
  console.log('3. Redeploy mivaa-gateway function');
  console.log('4. Test MIVAA integration');
}

// Run the generator
generateAndTestJWT().catch(console.error);

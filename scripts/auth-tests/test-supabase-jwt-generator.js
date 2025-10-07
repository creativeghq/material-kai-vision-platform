#!/usr/bin/env node

/**
 * Test Supabase JWT Generator Function
 * Generate a valid JWT token using the Supabase function
 */

import https from 'https';

// Configuration
const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI2MzE4NzQsImV4cCI6MjA0ODIwNzg3NH0.Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8'; // This is a placeholder

// HTTP Request Helper
function makeRequest(url, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsed
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: responseData
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function testJWTGenerator() {
  console.log('🔐 Testing Supabase JWT Generator Function');
  console.log('==========================================\n');

  try {
    // Call the JWT generator function
    const response = await makeRequest(
      `${SUPABASE_URL}/functions/v1/mivaa-jwt-generator`,
      'POST',
      {
        action: 'mivaa_token',
        payload: {}
      },
      {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    );

    console.log(`📊 Response Status: ${response.status}`);
    
    if (response.status === 200 && response.data) {
      console.log('✅ JWT Generator Function Response:');
      console.log(JSON.stringify(response.data, null, 2));
      
      if (response.data.token) {
        console.log('\n🎯 Generated JWT Token:');
        console.log(response.data.token);
        
        // Test the token with MIVAA
        console.log('\n🧪 Testing JWT with MIVAA Health Check...');
        const mivaaResponse = await makeRequest(
          'https://v1api.materialshub.gr/health',
          'GET',
          null,
          {
            'Authorization': `Bearer ${response.data.token}`
          }
        );
        
        console.log(`📊 MIVAA Health Check Status: ${mivaaResponse.status}`);
        if (mivaaResponse.data) {
          console.log('📋 MIVAA Response:');
          console.log(JSON.stringify(mivaaResponse.data, null, 2));
        }
      }
    } else {
      console.log('❌ JWT Generator Function Failed:');
      console.log(JSON.stringify(response.data, null, 2));
    }

  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

// Run the test
testJWTGenerator().catch(console.error);

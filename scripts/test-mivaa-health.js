#!/usr/bin/env node

/**
 * Test MIVAA Service Health
 * 
 * Check if MIVAA service is running and accessible
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function testMivaaHealth() {
  console.log('🔍 Testing MIVAA Service Health\n');
  console.log(`🌐 MIVAA Base URL: ${MIVAA_BASE_URL}\n`);

  // Test basic endpoints
  const healthEndpoints = [
    '/health',
    '/docs',
    '/openapi.json'
  ];

  console.log('🧪 Testing Basic Health Endpoints:\n');

  for (const endpoint of healthEndpoints) {
    try {
      console.log(`   Testing: ${endpoint}`);
      
      const response = await fetch(`${MIVAA_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
      });

      console.log(`     Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        console.log(`     ✅ Service is responding`);
        console.log(`     Content-Type: ${contentType}`);
      } else {
        console.log(`     ❌ Service error: ${response.status} ${response.statusText}`);
      }
      
    } catch (error) {
      console.log(`     ❌ Connection error: ${error.message}`);
    }
    
    console.log(''); // Add spacing
  }

  // Test via gateway health check
  console.log('🔄 Testing via Supabase Gateway:\n');
  
  const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ1MzE1NzQsImV4cCI6MjA1MDEwNzU3NH0.Ej_Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8';

  try {
    console.log(`🧪 Testing Gateway health_check...`);
    
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
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Success: ${result.success}`);
    
    if (result.success) {
      console.log(`   ✅ Gateway can reach MIVAA service`);
      if (result.data) {
        console.log(`   Service info: ${JSON.stringify(result.data)}`);
      }
    } else {
      console.log(`   ❌ Gateway cannot reach MIVAA: ${result.error || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.log(`   ❌ Gateway error: ${error.message}`);
  }

  console.log('\n📊 Summary:');
  console.log('='.repeat(50));
  console.log('If health endpoints are working but document endpoints fail,');
  console.log('it suggests the deployment succeeded but there may be:');
  console.log('1. Database connection issues');
  console.log('2. Missing environment variables');
  console.log('3. Supabase client configuration problems');
  console.log('4. Table access permission issues');
}

testMivaaHealth().catch(console.error);

#!/usr/bin/env node

/**
 * Test MIVAA Job List Endpoint
 * 
 * Check if we can list jobs and see what's available
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function testJobList() {
  console.log('🔍 Testing MIVAA Job List Endpoints\n');

  // Test different job list endpoints
  const endpoints = [
    '/api/admin/jobs',
    '/api/jobs',
    '/api/admin/jobs/statistics'
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`🧪 Testing: ${endpoint}`);
      
      const response = await fetch(`${MIVAA_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
      });

      console.log(`   Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ Success!`);
        console.log(`   Type: ${typeof data}`);
        console.log(`   Keys: ${Object.keys(data).join(', ')}`);
        
        if (data.data) {
          if (Array.isArray(data.data)) {
            console.log(`   Jobs count: ${data.data.length}`);
            if (data.data.length > 0) {
              console.log(`   Sample job keys: ${Object.keys(data.data[0]).join(', ')}`);
              console.log(`   Sample job ID: ${data.data[0].job_id || data.data[0].id || 'N/A'}`);
            }
          } else {
            console.log(`   Data type: ${typeof data.data}`);
            if (typeof data.data === 'object') {
              console.log(`   Data keys: ${Object.keys(data.data).join(', ')}`);
            }
          }
        }
        
      } else {
        console.log(`   ❌ Failed: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.log(`   Error: ${errorText.substring(0, 200)}${errorText.length > 200 ? '...' : ''}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    console.log(''); // Add spacing
  }

  // Test via gateway
  console.log('🔄 Testing via Supabase Gateway:\n');
  
  const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ1MzE1NzQsImV4cCI6MjA1MDEwNzU3NH0.Ej_Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8';

  try {
    console.log(`🧪 Testing Gateway list_jobs...`);
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'list_jobs',
        payload: {}
      })
    });

    const result = await response.json();
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Success: ${result.success}`);
    
    if (result.success && result.data) {
      console.log(`   ✅ Gateway Success!`);
      console.log(`   Jobs: ${Array.isArray(result.data) ? result.data.length : 'Not an array'}`);
      
      if (Array.isArray(result.data) && result.data.length > 0) {
        console.log(`   Sample job keys: ${Object.keys(result.data[0]).join(', ')}`);
        console.log(`   Recent jobs:`);
        result.data.slice(0, 3).forEach((job, i) => {
          console.log(`     ${i + 1}. ${job.job_id || job.id} - ${job.status} (${job.job_type || 'unknown type'})`);
        });
      }
    } else {
      console.log(`   ❌ Gateway Failed: ${result.error || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.log(`   ❌ Gateway Error: ${error.message}`);
  }

  console.log(`\n💡 Next Steps:`);
  console.log(`=`.repeat(50));
  console.log(`1. If no jobs exist: Need to create a test job first`);
  console.log(`2. If jobs exist but status fails: Fix the status endpoint`);
  console.log(`3. If gateway works but direct API fails: Use gateway for now`);
}

testJobList().catch(console.error);

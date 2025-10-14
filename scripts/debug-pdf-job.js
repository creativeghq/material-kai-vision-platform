#!/usr/bin/env node

/**
 * Debug PDF Processing Job Issues
 *
 * This script investigates the specific job ID: job-1760458338978-pzyjkju9m
 * to understand why:
 * 1. Progress stuck at 5%
 * 2. Knowledge base storage shows 0 chunks/images
 * 3. Duration inconsistencies
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ1MzE1NzQsImV4cCI6MjA1MDEwNzU3NH0.Ej_Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8';

const JOB_ID = 'job-1760458338978-pzyjkju9m';

async function debugPDFJob() {
  console.log('🔍 Debugging PDF Processing Job Issues\n');
  console.log(`📋 Job ID: ${JOB_ID}\n`);

  // Test 1: Check if MIVAA endpoints exist and work
  await testMivaaEndpoints();

  // Test 2: Check database for any related data
  await checkDatabaseForJobData();

  // Test 3: Test MIVAA document retrieval endpoints
  await testDocumentRetrievalEndpoints();

  // Test 4: Simulate the progress calculation issue
  await simulateProgressCalculation();
}

async function testMivaaEndpoints() {
  console.log('🧪 Testing MIVAA Endpoints...\n');

  const endpoints = [
    { name: 'Health Check', action: 'health_check' },
    { name: 'Get Job Status', action: 'get_job_status', payload: { job_id: 'test-job-id' } },
    { name: 'Get Document Chunks', action: 'get_document_chunks', payload: { document_id: 'test-doc-id' } },
    { name: 'Get Document Images', action: 'get_document_images', payload: { document_id: 'test-doc-id' } }
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`   Testing ${endpoint.name}...`);

      const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: endpoint.action,
          payload: endpoint.payload || {}
        })
      });

      const result = await response.json();

      if (response.ok) {
        console.log(`     ✅ ${endpoint.name}: Working (${response.status})`);
      } else {
        console.log(`     ❌ ${endpoint.name}: Failed (${response.status}) - ${result.error || 'Unknown error'}`);
      }

    } catch (error) {
      console.log(`     ❌ ${endpoint.name}: Error - ${error.message}`);
    }
  }

  console.log('');
}

async function checkDatabaseForJobData() {
  console.log('🗄️ Checking Database for Job-Related Data...\n');

  // Check recent processing results
  try {
    console.log('   Checking processing_results table...');
    const response = await fetch(`${SUPABASE_URL}/rest/v1/processing_results?select=*&order=created_at.desc&limit=5`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      }
    });

    const results = await response.json();
    console.log(`     Found ${results.length} recent processing results`);

    if (results.length > 0) {
      console.log(`     Latest result: ${results[0].id} (${results[0].status})`);
    }

  } catch (error) {
    console.log(`     ❌ Error checking processing_results: ${error.message}`);
  }

  // Check document chunks
  try {
    console.log('   Checking document_chunks table...');
    const response = await fetch(`${SUPABASE_URL}/rest/v1/document_chunks?select=count&created_at=gte.${new Date(Date.now() - 2*60*60*1000).toISOString()}`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'count=exact'
      }
    });

    const count = response.headers.get('Content-Range')?.split('/')[1] || '0';
    console.log(`     Recent chunks (last 2 hours): ${count}`);

  } catch (error) {
    console.log(`     ❌ Error checking document_chunks: ${error.message}`);
  }

  // Check document images
  try {
    console.log('   Checking document_images table...');
    const response = await fetch(`${SUPABASE_URL}/rest/v1/document_images?select=count&created_at=gte.${new Date(Date.now() - 2*60*60*1000).toISOString()}`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'count=exact'
      }
    });

    const count = response.headers.get('Content-Range')?.split('/')[1] || '0';
    console.log(`     Recent images (last 2 hours): ${count}`);

  } catch (error) {
    console.log(`     ❌ Error checking document_images: ${error.message}`);
  }

  console.log('');
}

async function testDocumentRetrievalEndpoints() {
  console.log('📄 Testing Document Retrieval Endpoints...\n');

  // Test with a fake document ID to see the error response
  const testDocId = 'test-document-id-12345';

  const endpoints = [
    { name: 'Get Document Content', action: 'get_document_content' },
    { name: 'Get Document Chunks', action: 'get_document_chunks' },
    { name: 'Get Document Images', action: 'get_document_images' },
    { name: 'Get Document Metadata', action: 'get_document_metadata' }
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`   Testing ${endpoint.name}...`);

      const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: endpoint.action,
          payload: { document_id: testDocId }
        })
      });

      const result = await response.json();

      console.log(`     Status: ${response.status}`);
      if (result.error) {
        console.log(`     Error: ${result.error}`);
      }
      if (result.data) {
        console.log(`     Data type: ${typeof result.data}, Length: ${Array.isArray(result.data) ? result.data.length : 'N/A'}`);
      }

    } catch (error) {
      console.log(`     ❌ Error: ${error.message}`);
    }
  }

  console.log('');
}

async function simulateProgressCalculation() {
  console.log('📊 Simulating Progress Calculation Issue...\n');

  // Simulate the progress calculation from the code
  const mivaaProgress = 5; // The 5% reported by MIVAA

  // Frontend calculation (line 1131 in consolidatedPDFWorkflowService.ts)
  const frontendProgress = 30 + Math.min(60, (mivaaProgress / 100) * 60);

  console.log(`   MIVAA reported progress: ${mivaaProgress}%`);
  console.log(`   Frontend calculated progress: ${frontendProgress}%`);
  console.log(`   Expected range: 30% to 90%`);

  // Show what different MIVAA progress values would result in
  console.log('\n   Progress mapping:');
  for (let mivaa = 0; mivaa <= 100; mivaa += 10) {
    const frontend = 30 + Math.min(60, (mivaa / 100) * 60);
    console.log(`     MIVAA ${mivaa}% → Frontend ${frontend}%`);
  }

  console.log('\n   🔍 Analysis:');
  console.log('     - If MIVAA reports 5%, frontend shows 33%');
  console.log('     - But modal might be showing raw MIVAA progress (5%)');
  console.log('     - This suggests a disconnect between backend calculation and modal display');

  console.log('');
}

// Run the debug script
debugPDFJob().catch(console.error);
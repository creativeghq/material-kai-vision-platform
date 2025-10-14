#!/usr/bin/env node

/**
 * Test MIVAA Endpoints Availability
 * 
 * This script tests which MIVAA endpoints are actually available
 * and working to understand the document retrieval issue
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ1MzE1NzQsImV4cCI6MjA1MDEwNzU3NH0.Ej_Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8';

async function testMivaaEndpoint(action, payload = {}) {
  try {
    console.log(`🧪 Testing ${action}...`);
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: action,
        payload: payload
      })
    });

    const result = await response.json();
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Success: ${result.success}`);
    
    if (result.success) {
      console.log(`   ✅ ${action} - Working`);
      if (result.data) {
        console.log(`   Data type: ${typeof result.data}`);
        if (Array.isArray(result.data)) {
          console.log(`   Array length: ${result.data.length}`);
        } else if (typeof result.data === 'object') {
          console.log(`   Object keys: ${Object.keys(result.data).join(', ')}`);
        }
      }
    } else {
      console.log(`   ❌ ${action} - Failed: ${result.error || 'Unknown error'}`);
    }
    
    return { success: result.success, data: result.data, error: result.error };
    
  } catch (error) {
    console.log(`   ❌ ${action} - Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testMivaaEndpoints() {
  console.log('🔍 Testing MIVAA Gateway Endpoints\n');

  // Test basic endpoints
  const endpoints = [
    { action: 'health_check', payload: {} },
    { action: 'list_jobs', payload: {} },
    { action: 'get_job_status', payload: { job_id: 'bulk_20251014_171629' } },
    { action: 'get_document_chunks', payload: { document_id: 'doc_20251014_171629' } },
    { action: 'get_document_images', payload: { document_id: 'doc_20251014_171629' } },
    { action: 'get_document_metadata', payload: { document_id: 'doc_20251014_171629' } },
    { action: 'list_documents', payload: {} },
    { action: 'search_documents', payload: { query: 'test' } },
  ];

  const results = {};
  
  for (const endpoint of endpoints) {
    const result = await testMivaaEndpoint(endpoint.action, endpoint.payload);
    results[endpoint.action] = result;
    console.log(''); // Add spacing
  }

  // Summary
  console.log('📊 Summary:');
  console.log('='.repeat(50));
  
  const working = Object.entries(results).filter(([_, result]) => result.success);
  const failing = Object.entries(results).filter(([_, result]) => !result.success);
  
  console.log(`✅ Working endpoints (${working.length}):`);
  working.forEach(([action, _]) => {
    console.log(`   - ${action}`);
  });
  
  console.log(`\n❌ Failing endpoints (${failing.length}):`);
  failing.forEach(([action, result]) => {
    console.log(`   - ${action}: ${result.error}`);
  });

  // Test alternative approaches
  console.log('\n🔄 Testing Alternative Approaches:');
  console.log('='.repeat(50));
  
  // Check if we can get document data from job results
  const jobResult = results['get_job_status'];
  if (jobResult.success && jobResult.data) {
    const job = jobResult.data;
    console.log('\n📋 Job Data Analysis:');
    console.log(`   Job Status: ${job.status}`);
    console.log(`   Document ID: ${job.details?.document_id || job.parameters?.document_id || 'N/A'}`);
    console.log(`   Chunks Created: ${job.details?.chunks_created || job.parameters?.chunks_created || 0}`);
    console.log(`   Images Extracted: ${job.details?.images_extracted || job.parameters?.images_extracted || 0}`);
    
    // Check if results contain actual data
    if (job.details?.results || job.parameters?.results) {
      const results = job.details?.results || job.parameters?.results;
      console.log(`   Results Array Length: ${results.length}`);
      if (results.length > 0) {
        console.log(`   First Result:`, results[0]);
      }
    }
  }

  // Recommendations
  console.log('\n💡 Recommendations:');
  console.log('='.repeat(50));
  
  if (failing.some(([action]) => action === 'get_document_chunks')) {
    console.log('❌ get_document_chunks is not working');
    console.log('   → Consider implementing chunks retrieval from job results');
    console.log('   → Or modify MIVAA service to include chunks in job completion response');
  }
  
  if (failing.some(([action]) => action === 'get_document_images')) {
    console.log('❌ get_document_images is not working');
    console.log('   → Consider implementing images retrieval from job results');
    console.log('   → Or modify MIVAA service to include images in job completion response');
  }
  
  if (working.some(([action]) => action === 'get_job_status')) {
    console.log('✅ get_job_status is working');
    console.log('   → Can use this to get processing metrics');
    console.log('   → Can create placeholder data based on metrics');
  }
}

testMivaaEndpoints().catch(console.error);

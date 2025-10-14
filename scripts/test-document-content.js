#!/usr/bin/env node

/**
 * Test MIVAA Document Content Endpoint
 * 
 * This script tests the get_document_content endpoint to see if it contains
 * the chunks and images data we need
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ1MzE1NzQsImV4cCI6MjA1MDEwNzU3NH0.Ej_Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8';

async function testDocumentContent() {
  console.log('🔍 Testing MIVAA Document Content Endpoint\n');

  const documentId = 'doc_20251014_171629';
  
  console.log(`📋 Testing Document ID: ${documentId}\n`);

  try {
    console.log('🧪 Testing get_document_content endpoint...');
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'get_document_content',
        payload: { document_id: documentId }
      })
    });

    const result = await response.json();
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Success: ${result.success}`);
    
    if (result.success && result.data) {
      console.log('\n📊 Document Content Data Structure:');
      console.log(`   Type: ${typeof result.data}`);
      console.log(`   Keys: ${Object.keys(result.data).join(', ')}`);
      
      // Check for chunks
      if (result.data.chunks) {
        console.log(`\n📝 Chunks Found: ${result.data.chunks.length}`);
        if (result.data.chunks.length > 0) {
          console.log('   Sample chunk:');
          const chunk = result.data.chunks[0];
          console.log(`     Content: ${chunk.content?.substring(0, 100)}...`);
          console.log(`     Metadata: ${JSON.stringify(chunk.metadata || {})}`);
        }
      }
      
      // Check for images
      if (result.data.images) {
        console.log(`\n🖼️ Images Found: ${result.data.images.length}`);
        if (result.data.images.length > 0) {
          console.log('   Sample image:');
          const image = result.data.images[0];
          console.log(`     URL: ${image.url || image.image_url || 'N/A'}`);
          console.log(`     Caption: ${image.caption || 'N/A'}`);
          console.log(`     Metadata: ${JSON.stringify(image.metadata || {})}`);
        }
      }
      
      // Check for text content
      if (result.data.text || result.data.content) {
        const text = result.data.text || result.data.content;
        console.log(`\n📄 Text Content: ${text.length} characters`);
        console.log(`   Sample: ${text.substring(0, 200)}...`);
      }
      
      // Check for metadata
      if (result.data.metadata) {
        console.log(`\n📋 Metadata:`, result.data.metadata);
      }
      
      // Full structure (limited)
      console.log('\n🔍 Full Structure (first level):');
      for (const [key, value] of Object.entries(result.data)) {
        if (Array.isArray(value)) {
          console.log(`   ${key}: Array[${value.length}]`);
        } else if (typeof value === 'object' && value !== null) {
          console.log(`   ${key}: Object{${Object.keys(value).join(', ')}}`);
        } else {
          console.log(`   ${key}: ${typeof value} (${String(value).substring(0, 50)}${String(value).length > 50 ? '...' : ''})`);
        }
      }
      
    } else {
      console.log('\n❌ Document Content Failed:');
      console.log(`   Error: ${result.error || 'Unknown error'}`);
      console.log(`   Message: ${result.message || 'No message'}`);
    }
    
  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
  }

  // Test with bulk processing endpoint to see if we can get data differently
  console.log('\n🔄 Testing Alternative: Bulk Processing Result...');
  
  try {
    // Check if we can get the processing result directly
    const jobResponse = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'get_job_status',
        payload: { job_id: 'bulk_20251014_171629' }
      })
    });

    const jobResult = await jobResponse.json();
    
    if (jobResult.success && jobResult.data) {
      const job = jobResult.data;
      console.log('\n📋 Job Result Analysis:');
      
      // Check if job result contains actual content
      if (job.result) {
        console.log(`   Job Result Type: ${typeof job.result}`);
        if (typeof job.result === 'object') {
          console.log(`   Job Result Keys: ${Object.keys(job.result).join(', ')}`);
        }
      }
      
      // Check details for content
      if (job.details && typeof job.details === 'object') {
        console.log(`   Details Keys: ${Object.keys(job.details).join(', ')}`);
        
        // Look for content in details
        if (job.details.content) {
          console.log(`   Content in Details: ${typeof job.details.content}`);
        }
        if (job.details.chunks) {
          console.log(`   Chunks in Details: ${job.details.chunks.length || 'N/A'}`);
        }
        if (job.details.images) {
          console.log(`   Images in Details: ${job.details.images.length || 'N/A'}`);
        }
      }
    }
    
  } catch (error) {
    console.log(`   ❌ Error getting job result: ${error.message}`);
  }
}

testDocumentContent().catch(console.error);

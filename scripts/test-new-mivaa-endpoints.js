#!/usr/bin/env node

/**
 * Test New MIVAA Endpoints
 * 
 * Test the new chunk and image endpoints I added to MIVAA
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function testNewEndpoints() {
  console.log('🔍 Testing New MIVAA Endpoints\n');

  const documentId = 'doc_20251014_171629';
  
  // Test the new endpoints I added
  const newEndpoints = [
    {
      name: 'Document Chunks (New)',
      url: `/api/documents/${documentId}/chunks`,
      method: 'GET'
    },
    {
      name: 'Document Images (New)',
      url: `/api/documents/${documentId}/images`,
      method: 'GET'
    }
  ];

  for (const endpoint of newEndpoints) {
    try {
      console.log(`🧪 Testing ${endpoint.name}: ${endpoint.url}`);
      
      const response = await fetch(`${MIVAA_BASE_URL}${endpoint.url}`, {
        method: endpoint.method,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
      });

      console.log(`   Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        try {
          const data = await response.json();
          console.log(`   ✅ Success!`);
          console.log(`   Type: ${typeof data}`);
          console.log(`   Success: ${data.success}`);
          console.log(`   Message: ${data.message}`);
          
          if (data.data) {
            console.log(`   Data: ${Array.isArray(data.data) ? `Array[${data.data.length}]` : typeof data.data}`);
            
            if (Array.isArray(data.data) && data.data.length > 0) {
              console.log(`   Sample item keys: ${Object.keys(data.data[0]).join(', ')}`);
              
              if (endpoint.name.includes('Chunks')) {
                console.log(`   Sample chunk content: ${data.data[0].content?.substring(0, 100)}...`);
              } else if (endpoint.name.includes('Images')) {
                console.log(`   Sample image URL: ${data.data[0].image_url || data.data[0].url || 'N/A'}`);
              }
            }
          }
          
        } catch (e) {
          console.log(`   ⚠️ JSON parse error: ${e.message}`);
        }
      } else {
        console.log(`   ❌ Failed: ${response.status} ${response.statusText}`);
        
        // Try to get error details
        try {
          const errorText = await response.text();
          if (errorText) {
            console.log(`   Error details: ${errorText.substring(0, 200)}${errorText.length > 200 ? '...' : ''}`);
          }
        } catch (e) {
          // Ignore error text parsing errors
        }
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

  const gatewayTests = [
    { action: 'get_document_chunks', payload: { document_id: documentId } },
    { action: 'get_document_images', payload: { document_id: documentId } }
  ];

  for (const test of gatewayTests) {
    try {
      console.log(`🧪 Testing Gateway ${test.action}...`);
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: test.action,
          payload: test.payload
        })
      });

      const result = await response.json();
      
      console.log(`   Status: ${response.status}`);
      console.log(`   Success: ${result.success}`);
      
      if (result.success && result.data) {
        console.log(`   ✅ Gateway Success!`);
        console.log(`   Data: ${Array.isArray(result.data) ? `Array[${result.data.length}]` : typeof result.data}`);
        
        if (Array.isArray(result.data) && result.data.length > 0) {
          console.log(`   Sample item keys: ${Object.keys(result.data[0]).join(', ')}`);
        }
      } else {
        console.log(`   ❌ Gateway Failed: ${result.error || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Gateway Error: ${error.message}`);
    }
    
    console.log(''); // Add spacing
  }
}

testNewEndpoints().catch(console.error);

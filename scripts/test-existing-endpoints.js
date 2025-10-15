#!/usr/bin/env node

/**
 * Test Existing MIVAA Endpoints
 * 
 * Test the endpoints that actually exist according to OpenAPI spec
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function testExistingEndpoints() {
  console.log('🔍 Testing Existing MIVAA Document Endpoints\n');

  const documentId = 'doc_20251014_171629';
  
  // Test the endpoints that actually exist according to OpenAPI
  const existingEndpoints = [
    {
      name: 'Document Content',
      url: `/api/documents/documents/${documentId}/content`,
      method: 'GET'
    },
    {
      name: 'Document Chunks',
      url: `/api/documents/documents/${documentId}/chunks`,
      method: 'GET'
    },
    {
      name: 'Document Images',
      url: `/api/documents/documents/${documentId}/images`,
      method: 'GET'
    }
  ];

  for (const endpoint of existingEndpoints) {
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
          
          if (endpoint.name === 'Document Content') {
            console.log(`   Keys: ${Object.keys(data).join(', ')}`);
            if (data.chunks) {
              console.log(`   Chunks: ${Array.isArray(data.chunks) ? data.chunks.length : 'Not an array'}`);
            }
            if (data.images) {
              console.log(`   Images: ${Array.isArray(data.images) ? data.images.length : 'Not an array'}`);
            }
          } else if (endpoint.name.includes('Chunks') || endpoint.name.includes('Images')) {
            if (Array.isArray(data)) {
              console.log(`   Array length: ${data.length}`);
              if (data.length > 0) {
                console.log(`   Sample item keys: ${Object.keys(data[0]).join(', ')}`);
              }
            } else {
              console.log(`   Data keys: ${Object.keys(data).join(', ')}`);
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

  // Test with include_chunks parameter for content endpoint
  console.log('🔄 Testing Document Content with include_chunks=true:\n');
  
  try {
    const url = `/api/documents/documents/${documentId}/content?include_chunks=true&include_raw=true`;
    console.log(`🧪 Testing: ${url}`);
    
    const response = await fetch(`${MIVAA_BASE_URL}${url}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Success with parameters!`);
      console.log(`   Type: ${typeof data}`);
      console.log(`   Keys: ${Object.keys(data).join(', ')}`);
      
      if (data.content) {
        console.log(`   Content keys: ${Object.keys(data.content).join(', ')}`);
        if (data.content.chunks) {
          console.log(`   Chunks: ${Array.isArray(data.content.chunks) ? data.content.chunks.length : 'Not an array'}`);
        }
        if (data.content.images) {
          console.log(`   Images: ${Array.isArray(data.content.images) ? data.content.images.length : 'Not an array'}`);
        }
      }
    } else {
      console.log(`   ❌ Failed with parameters`);
      const errorText = await response.text();
      console.log(`   Error: ${errorText.substring(0, 200)}${errorText.length > 200 ? '...' : ''}`);
    }
    
  } catch (error) {
    console.log(`   ❌ Error with parameters: ${error.message}`);
  }
}

testExistingEndpoints().catch(console.error);

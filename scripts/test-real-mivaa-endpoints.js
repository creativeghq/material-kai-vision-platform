#!/usr/bin/env node

/**
 * Test Real MIVAA Endpoints
 * 
 * Test the endpoints that actually exist in MIVAA to get real data
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function testRealEndpoints() {
  console.log('🔍 Testing Real MIVAA Endpoints for Data Retrieval\n');

  const documentId = 'doc_20251014_171629';
  const jobId = 'bulk_20251014_171629';
  
  // Test the endpoints that actually exist according to OpenAPI spec
  const realEndpoints = [
    {
      name: 'Job Status',
      url: `/api/jobs/${jobId}/status`,
      method: 'GET'
    },
    {
      name: 'Job Progress',
      url: `/api/jobs/${jobId}/progress`,
      method: 'GET'
    },
    {
      name: 'Document Content',
      url: `/api/documents/documents/${documentId}/content`,
      method: 'GET'
    },
    {
      name: 'Document Info',
      url: `/api/documents/documents/${documentId}`,
      method: 'GET'
    },
    {
      name: 'List Documents',
      url: `/api/documents/documents`,
      method: 'GET'
    }
  ];

  for (const endpoint of realEndpoints) {
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
          
          if (endpoint.name === 'Document Content') {
            console.log(`   📄 Document Content Analysis:`);
            console.log(`     Type: ${typeof data}`);
            console.log(`     Keys: ${Object.keys(data).join(', ')}`);
            
            // Look for chunks
            if (data.chunks) {
              console.log(`     📝 Chunks: ${Array.isArray(data.chunks) ? data.chunks.length : 'Not an array'}`);
              if (Array.isArray(data.chunks) && data.chunks.length > 0) {
                console.log(`     📝 Sample chunk:`, {
                  content: data.chunks[0].content?.substring(0, 100) + '...',
                  metadata: data.chunks[0].metadata
                });
              }
            }
            
            // Look for images
            if (data.images) {
              console.log(`     🖼️ Images: ${Array.isArray(data.images) ? data.images.length : 'Not an array'}`);
              if (Array.isArray(data.images) && data.images.length > 0) {
                console.log(`     🖼️ Sample image:`, {
                  url: data.images[0].url,
                  metadata: data.images[0].metadata
                });
              }
            }
            
            // Look for text content
            if (data.content || data.text) {
              const content = data.content || data.text;
              console.log(`     📄 Text content: ${content.length} characters`);
            }
            
          } else if (endpoint.name === 'Job Status' || endpoint.name === 'Job Progress') {
            console.log(`   📊 Job Data Analysis:`);
            console.log(`     Type: ${typeof data}`);
            if (data.data) {
              console.log(`     Status: ${data.data.status}`);
              console.log(`     Progress: ${data.data.progress_percentage}%`);
              console.log(`     Chunks: ${data.data.details?.chunks_created || data.data.parameters?.chunks_created || 'N/A'}`);
              console.log(`     Images: ${data.data.details?.images_extracted || data.data.parameters?.images_extracted || 'N/A'}`);
            }
            
          } else if (endpoint.name === 'List Documents') {
            console.log(`   📋 Documents List:`);
            if (Array.isArray(data)) {
              console.log(`     Found ${data.length} documents`);
              const ourDoc = data.find(doc => doc.id === documentId || doc.document_id === documentId);
              if (ourDoc) {
                console.log(`     ✅ Our document found:`, ourDoc);
              } else {
                console.log(`     ❌ Our document (${documentId}) not found in list`);
              }
            } else {
              console.log(`     Type: ${typeof data}`);
              console.log(`     Keys: ${Object.keys(data).join(', ')}`);
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

  // Summary and recommendations
  console.log('💡 Summary and Recommendations:');
  console.log('='.repeat(50));
  console.log('Based on the MIVAA OpenAPI spec analysis:');
  console.log('');
  console.log('❌ Missing Endpoints:');
  console.log('   - /api/documents/{document_id}/chunks (not implemented)');
  console.log('   - /api/documents/{document_id}/images (not implemented)');
  console.log('');
  console.log('✅ Available Endpoints:');
  console.log('   - /api/jobs/{job_id}/status (working - contains metrics)');
  console.log('   - /api/documents/documents/{document_id}/content (might contain actual data)');
  console.log('   - /api/documents/documents/{document_id} (document info)');
  console.log('');
  console.log('🔧 Required Actions:');
  console.log('   1. If /api/documents/documents/{document_id}/content contains chunks/images:');
  console.log('      → Update gateway to use this endpoint instead');
  console.log('   2. If it doesn\'t contain the data:');
  console.log('      → Need to implement chunk/image retrieval endpoints in MIVAA service');
  console.log('   3. Alternative: Modify MIVAA to return full data in job completion response');
}

testRealEndpoints().catch(console.error);

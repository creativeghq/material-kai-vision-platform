#!/usr/bin/env node

/**
 * Investigate MIVAA Service Directly
 * 
 * This script investigates the MIVAA service directly to understand
 * what endpoints are actually implemented and how to get real data
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function testMivaaDirectly() {
  console.log('🔍 Investigating MIVAA Service Directly\n');
  console.log(`🌐 MIVAA Base URL: ${MIVAA_BASE_URL}\n`);

  // Test basic endpoints
  const endpoints = [
    '/docs',
    '/redoc', 
    '/openapi.json',
    '/api/jobs',
    '/api/documents',
    '/api/documents/doc_20251014_171629',
    '/api/documents/doc_20251014_171629/chunks',
    '/api/documents/doc_20251014_171629/images',
    '/api/documents/doc_20251014_171629/metadata',
    '/api/jobs/bulk_20251014_171629/status',
  ];

  console.log('🧪 Testing MIVAA Endpoints Directly:\n');

  for (const endpoint of endpoints) {
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
        console.log(`     Content-Type: ${contentType}`);
        
        if (contentType && contentType.includes('application/json')) {
          try {
            const data = await response.json();
            if (endpoint === '/openapi.json') {
              console.log(`     ✅ OpenAPI spec available`);
              // Check for document endpoints in the spec
              if (data.paths) {
                const documentPaths = Object.keys(data.paths).filter(path => 
                  path.includes('/documents/') && (path.includes('/chunks') || path.includes('/images'))
                );
                if (documentPaths.length > 0) {
                  console.log(`     📋 Document endpoints in spec: ${documentPaths.join(', ')}`);
                } else {
                  console.log(`     ❌ No document chunk/image endpoints in OpenAPI spec`);
                }
              }
            } else if (Array.isArray(data)) {
              console.log(`     ✅ Array with ${data.length} items`);
            } else if (typeof data === 'object') {
              console.log(`     ✅ Object with keys: ${Object.keys(data).slice(0, 5).join(', ')}${Object.keys(data).length > 5 ? '...' : ''}`);
            }
          } catch (e) {
            console.log(`     ⚠️ JSON parse error: ${e.message}`);
          }
        } else {
          console.log(`     ✅ Non-JSON response (${contentType})`);
        }
      } else {
        console.log(`     ❌ Failed: ${response.status} ${response.statusText}`);
      }
      
    } catch (error) {
      console.log(`     ❌ Error: ${error.message}`);
    }
    
    console.log(''); // Add spacing
  }

  // Test if we can get the OpenAPI spec to understand available endpoints
  console.log('📋 Analyzing OpenAPI Specification:\n');
  
  try {
    const response = await fetch(`${MIVAA_BASE_URL}/openapi.json`);
    if (response.ok) {
      const spec = await response.json();
      
      console.log(`   OpenAPI Version: ${spec.openapi || spec.swagger || 'Unknown'}`);
      console.log(`   Title: ${spec.info?.title || 'Unknown'}`);
      console.log(`   Version: ${spec.info?.version || 'Unknown'}`);
      
      if (spec.paths) {
        console.log(`\n   Available Endpoints (${Object.keys(spec.paths).length}):`);
        
        // Group endpoints by category
        const documentEndpoints = [];
        const jobEndpoints = [];
        const otherEndpoints = [];
        
        for (const path of Object.keys(spec.paths)) {
          if (path.includes('/documents/')) {
            documentEndpoints.push(path);
          } else if (path.includes('/jobs/')) {
            jobEndpoints.push(path);
          } else {
            otherEndpoints.push(path);
          }
        }
        
        if (documentEndpoints.length > 0) {
          console.log(`\n   📄 Document Endpoints (${documentEndpoints.length}):`);
          documentEndpoints.forEach(path => {
            const methods = Object.keys(spec.paths[path]).join(', ').toUpperCase();
            console.log(`     ${methods} ${path}`);
          });
        }
        
        if (jobEndpoints.length > 0) {
          console.log(`\n   🔄 Job Endpoints (${jobEndpoints.length}):`);
          jobEndpoints.forEach(path => {
            const methods = Object.keys(spec.paths[path]).join(', ').toUpperCase();
            console.log(`     ${methods} ${path}`);
          });
        }
        
        if (otherEndpoints.length > 0) {
          console.log(`\n   🔧 Other Endpoints (${otherEndpoints.length}):`);
          otherEndpoints.slice(0, 10).forEach(path => {
            const methods = Object.keys(spec.paths[path]).join(', ').toUpperCase();
            console.log(`     ${methods} ${path}`);
          });
          if (otherEndpoints.length > 10) {
            console.log(`     ... and ${otherEndpoints.length - 10} more`);
          }
        }
        
        // Check specifically for chunk and image retrieval endpoints
        const chunkEndpoints = Object.keys(spec.paths).filter(path => path.includes('chunks'));
        const imageEndpoints = Object.keys(spec.paths).filter(path => path.includes('images'));
        
        console.log(`\n   🔍 Analysis:`);
        console.log(`     Chunk retrieval endpoints: ${chunkEndpoints.length > 0 ? chunkEndpoints.join(', ') : 'NONE FOUND'}`);
        console.log(`     Image retrieval endpoints: ${imageEndpoints.length > 0 ? imageEndpoints.join(', ') : 'NONE FOUND'}`);
        
        if (chunkEndpoints.length === 0 && imageEndpoints.length === 0) {
          console.log(`\n   ❌ CRITICAL: No chunk or image retrieval endpoints found in MIVAA service`);
          console.log(`   💡 This explains why get_document_chunks and get_document_images return 404`);
          console.log(`   🔧 Solution needed: Either implement these endpoints in MIVAA or find alternative data access method`);
        }
      }
    }
  } catch (error) {
    console.log(`   ❌ Failed to get OpenAPI spec: ${error.message}`);
  }
}

testMivaaDirectly().catch(console.error);

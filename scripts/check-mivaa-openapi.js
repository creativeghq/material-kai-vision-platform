#!/usr/bin/env node

/**
 * Check MIVAA OpenAPI Spec for New Endpoints
 * 
 * Verify that my new endpoints are included in the deployed service
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function checkOpenAPISpec() {
  console.log('🔍 Checking MIVAA OpenAPI Spec for New Endpoints\n');

  try {
    const response = await fetch(`${MIVAA_BASE_URL}/openapi.json`);
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${response.status}`);
    }

    const spec = await response.json();
    
    console.log(`📋 OpenAPI Info:`);
    console.log(`   Title: ${spec.info?.title}`);
    console.log(`   Version: ${spec.info?.version}`);
    console.log(`   Total Endpoints: ${Object.keys(spec.paths || {}).length}`);
    
    // Check for the specific endpoints I added
    const endpointsToCheck = [
      '/api/documents/{document_id}/chunks',
      '/api/documents/{document_id}/images'
    ];
    
    console.log(`\n🔍 Checking for New Endpoints:`);
    
    for (const endpoint of endpointsToCheck) {
      if (spec.paths && spec.paths[endpoint]) {
        console.log(`   ✅ ${endpoint} - FOUND`);
        const methods = Object.keys(spec.paths[endpoint]);
        console.log(`      Methods: ${methods.join(', ').toUpperCase()}`);
        
        // Check the GET method details
        if (spec.paths[endpoint].get) {
          const getMethod = spec.paths[endpoint].get;
          console.log(`      Summary: ${getMethod.summary || 'No summary'}`);
          console.log(`      Description: ${getMethod.description || 'No description'}`);
        }
      } else {
        console.log(`   ❌ ${endpoint} - NOT FOUND`);
      }
    }
    
    // Check for document-related endpoints
    console.log(`\n📄 All Document Endpoints:`);
    const documentEndpoints = Object.keys(spec.paths || {}).filter(path => 
      path.includes('/documents/') && (path.includes('chunks') || path.includes('images') || path.includes('content'))
    );
    
    if (documentEndpoints.length > 0) {
      documentEndpoints.forEach(endpoint => {
        const methods = Object.keys(spec.paths[endpoint]).join(', ').toUpperCase();
        console.log(`   ${methods} ${endpoint}`);
      });
    } else {
      console.log(`   ❌ No document content/chunks/images endpoints found`);
    }
    
    // Check if the document content endpoint was updated
    const contentEndpoint = '/api/documents/documents/{document_id}/content';
    if (spec.paths && spec.paths[contentEndpoint]) {
      console.log(`\n📄 Document Content Endpoint:`);
      console.log(`   ✅ ${contentEndpoint} - FOUND`);
      const getMethod = spec.paths[contentEndpoint].get;
      if (getMethod) {
        console.log(`   Parameters: ${getMethod.parameters?.length || 0}`);
        if (getMethod.parameters) {
          getMethod.parameters.forEach(param => {
            console.log(`     - ${param.name}: ${param.description || 'No description'}`);
          });
        }
      }
    }
    
  } catch (error) {
    console.log(`❌ Error checking OpenAPI spec: ${error.message}`);
  }
}

checkOpenAPISpec().catch(console.error);

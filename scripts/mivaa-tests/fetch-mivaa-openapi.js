#!/usr/bin/env node

/**
 * Fetch MIVAA OpenAPI Specification
 * 
 * This script fetches the OpenAPI spec from the MIVAA service to understand
 * the exact authentication requirements and available endpoints.
 */

import fs from 'fs';

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function fetchOpenAPISpec() {
  console.log('📋 Fetching MIVAA OpenAPI Specification...\n');
  
  try {
    const response = await fetch(`${MIVAA_BASE_URL}/openapi.json`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${response.status}`);
    }
    
    const spec = await response.json();
    
    // Save the full spec to a file
    fs.writeFileSync('mivaa-openapi-spec.json', JSON.stringify(spec, null, 2));
    console.log('✅ Full OpenAPI spec saved to mivaa-openapi-spec.json\n');
    
    // Analyze the spec
    console.log('📊 MIVAA Service Analysis:');
    console.log('=' .repeat(50));
    
    // Basic info
    console.log(`📋 Title: ${spec.info?.title || 'Unknown'}`);
    console.log(`📋 Version: ${spec.info?.version || 'Unknown'}`);
    console.log(`📋 Description: ${spec.info?.description || 'No description'}`);
    
    // Security schemes
    if (spec.components?.securitySchemes) {
      console.log('\n🔐 Security Schemes:');
      for (const [name, scheme] of Object.entries(spec.components.securitySchemes)) {
        console.log(`   ${name}:`);
        console.log(`     Type: ${scheme.type}`);
        console.log(`     Scheme: ${scheme.scheme || 'N/A'}`);
        console.log(`     Bearer Format: ${scheme.bearerFormat || 'N/A'}`);
        console.log(`     Description: ${scheme.description || 'No description'}`);
      }
    }
    
    // Analyze endpoints
    console.log('\n📡 Available Endpoints:');
    const endpoints = [];
    
    for (const [path, methods] of Object.entries(spec.paths || {})) {
      for (const [method, details] of Object.entries(methods)) {
        if (typeof details === 'object' && details.summary) {
          endpoints.push({
            method: method.toUpperCase(),
            path: path,
            summary: details.summary,
            security: details.security || [],
            tags: details.tags || []
          });
        }
      }
    }
    
    // Group by tags
    const endpointsByTag = {};
    endpoints.forEach(endpoint => {
      const tag = endpoint.tags[0] || 'Other';
      if (!endpointsByTag[tag]) {
        endpointsByTag[tag] = [];
      }
      endpointsByTag[tag].push(endpoint);
    });
    
    for (const [tag, tagEndpoints] of Object.entries(endpointsByTag)) {
      console.log(`\n   📂 ${tag}:`);
      tagEndpoints.forEach(endpoint => {
        const securityInfo = endpoint.security.length > 0 ? '🔒' : '🔓';
        console.log(`     ${securityInfo} ${endpoint.method} ${endpoint.path}`);
        console.log(`        ${endpoint.summary}`);
      });
    }
    
    // Look for material recognition endpoints specifically
    console.log('\n🎯 Material Recognition Endpoints:');
    const materialEndpoints = endpoints.filter(ep => 
      ep.path.includes('material') || 
      ep.summary.toLowerCase().includes('material') ||
      ep.tags.some(tag => tag.toLowerCase().includes('material'))
    );
    
    materialEndpoints.forEach(endpoint => {
      console.log(`   ${endpoint.method} ${endpoint.path}`);
      console.log(`     Summary: ${endpoint.summary}`);
      console.log(`     Security: ${endpoint.security.length > 0 ? 'Required' : 'None'}`);
    });
    
    // Check for JWT-specific information
    console.log('\n🔑 JWT Authentication Details:');
    if (spec.components?.securitySchemes?.BearerAuth) {
      const bearerAuth = spec.components.securitySchemes.BearerAuth;
      console.log(`   Type: ${bearerAuth.type}`);
      console.log(`   Scheme: ${bearerAuth.scheme}`);
      console.log(`   Bearer Format: ${bearerAuth.bearerFormat || 'Not specified'}`);
      
      if (bearerAuth.description) {
        console.log(`   Description: ${bearerAuth.description}`);
      }
    }
    
    // Look for any JWT-related schemas
    if (spec.components?.schemas) {
      const jwtSchemas = Object.keys(spec.components.schemas).filter(key => 
        key.toLowerCase().includes('jwt') || 
        key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('auth')
      );
      
      if (jwtSchemas.length > 0) {
        console.log('\n🔍 JWT/Auth Related Schemas:');
        jwtSchemas.forEach(schema => {
          console.log(`   ${schema}`);
        });
      }
    }
    
  } catch (error) {
    console.error(`❌ Error fetching OpenAPI spec: ${error.message}`);
  }
}

// Run the fetch
fetchOpenAPISpec().catch(console.error);

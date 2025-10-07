#!/usr/bin/env node

/**
 * Test MIVAA Material Recognition Without Authentication
 * 
 * Based on the OpenAPI spec, some material endpoints might not require auth.
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function testMaterialEndpointsNoAuth() {
  console.log('🧪 Testing MIVAA Material Endpoints Without Authentication...\n');
  
  // Test material recognition endpoints that showed "Security: None"
  const endpoints = [
    {
      name: 'Material Image Analysis',
      path: '/api/analyze/materials/image',
      method: 'POST',
      payload: {
        image_data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
        analysis_options: {
          include_properties: true,
          include_composition: true,
          confidence_threshold: 0.8
        }
      }
    },
    {
      name: 'Material Visual Search',
      path: '/api/search/materials/visual',
      method: 'POST',
      payload: {
        image_data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
        limit: 5,
        similarity_threshold: 0.7
      }
    },
    {
      name: 'Material Embeddings Generation',
      path: '/api/embeddings/materials/generate',
      method: 'POST',
      payload: {
        text: 'steel material with high tensile strength',
        model: 'text-embedding-ada-002'
      }
    },
    {
      name: 'Material Health Check',
      path: '/api/search/materials/health',
      method: 'GET',
      payload: null
    }
  ];
  
  for (const endpoint of endpoints) {
    console.log(`🔧 Testing: ${endpoint.name}`);
    console.log(`   Endpoint: ${endpoint.method} ${endpoint.path}`);
    
    try {
      const requestOptions = {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Material-Kai-Vision-Platform-Test/1.0'
        }
      };
      
      if (endpoint.payload && endpoint.method === 'POST') {
        requestOptions.body = JSON.stringify(endpoint.payload);
      }
      
      const response = await fetch(`${MIVAA_BASE_URL}${endpoint.path}`, requestOptions);
      
      console.log(`   Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ SUCCESS - No authentication required!`);
        console.log(`   📊 Response type: ${typeof data}`);
        
        if (data.success !== undefined) {
          console.log(`   📊 Success: ${data.success}`);
        }
        
        if (data.data) {
          console.log(`   📊 Has data: Yes`);
        }
        
        if (data.error) {
          console.log(`   📊 Error: ${data.error}`);
        }
        
      } else if (response.status === 401) {
        console.log(`   ❌ Authentication required`);
        const errorData = await response.json().catch(() => ({}));
        console.log(`   📊 Error: ${errorData.error || 'No error message'}`);
        
      } else if (response.status === 422) {
        console.log(`   ⚠️ Validation error (but endpoint accessible)`);
        const errorData = await response.json().catch(() => ({}));
        console.log(`   📊 Validation error: ${errorData.detail || 'No details'}`);
        
      } else {
        console.log(`   ⚠️ Unexpected status: ${response.status}`);
        const errorText = await response.text().catch(() => 'No response text');
        console.log(`   📊 Response: ${errorText.substring(0, 200)}...`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    console.log('');
  }
  
  // Test some endpoints that definitely require auth for comparison
  console.log('🔒 Testing Endpoints That Require Authentication:');
  
  const authRequiredEndpoints = [
    '/api/semantic-analysis',
    '/api/v1/documents/process',
    '/api/v1/images/analyze'
  ];
  
  for (const path of authRequiredEndpoints) {
    console.log(`   Testing: ${path}`);
    
    try {
      const response = await fetch(`${MIVAA_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ test: 'data' })
      });
      
      console.log(`     Status: ${response.status} - ${response.status === 401 ? 'Auth required ✓' : 'Unexpected'}`);
      
    } catch (error) {
      console.log(`     Error: ${error.message}`);
    }
  }
}

// Run the test
testMaterialEndpointsNoAuth().catch(console.error);

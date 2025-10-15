#!/usr/bin/env node

/**
 * Analyze MIVAA Job Response Structure
 * 
 * Check what data is available in the job response that we could use
 * instead of relying on broken document endpoints
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function analyzeJobResponse() {
  console.log('🔍 Analyzing MIVAA Job Response Structure\n');

  const jobId = 'bulk_20251014_171629';
  
  // Test job status endpoint (this one works)
  try {
    console.log(`🧪 Testing Job Status: /api/jobs/${jobId}/status`);
    
    const response = await fetch(`${MIVAA_BASE_URL}/api/jobs/${jobId}/status`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Success!`);
      console.log(`\n📊 Full Job Response Structure:`);
      console.log(JSON.stringify(data, null, 2));
      
      // Analyze the structure
      console.log(`\n🔍 Analysis:`);
      console.log(`   Type: ${typeof data}`);
      console.log(`   Top-level keys: ${Object.keys(data).join(', ')}`);
      
      if (data.status) {
        console.log(`   Status: ${data.status}`);
      }
      
      if (data.progress !== undefined) {
        console.log(`   Progress: ${data.progress}%`);
      }
      
      if (data.details) {
        console.log(`   Details keys: ${Object.keys(data.details).join(', ')}`);
        
        // Check if details contains actual content
        if (data.details.chunks_created) {
          console.log(`   📝 Chunks Created: ${data.details.chunks_created}`);
        }
        
        if (data.details.images_extracted) {
          console.log(`   🖼️ Images Extracted: ${data.details.images_extracted}`);
        }
        
        if (data.details.document_id) {
          console.log(`   📄 Document ID: ${data.details.document_id}`);
        }
        
        // Check if there's actual chunk or image data
        if (data.details.chunks) {
          console.log(`   📝 Actual chunks data: ${Array.isArray(data.details.chunks) ? data.details.chunks.length : 'Not an array'}`);
        }
        
        if (data.details.images) {
          console.log(`   🖼️ Actual images data: ${Array.isArray(data.details.images) ? data.details.images.length : 'Not an array'}`);
        }
        
        // Check for any other data fields
        const dataFields = Object.keys(data.details).filter(key => 
          key.includes('chunk') || key.includes('image') || key.includes('content') || key.includes('data')
        );
        
        if (dataFields.length > 0) {
          console.log(`   📊 Data-related fields: ${dataFields.join(', ')}`);
        }
      }
      
      if (data.parameters) {
        console.log(`   Parameters keys: ${Object.keys(data.parameters).join(', ')}`);
      }
      
      if (data.metadata) {
        console.log(`   Metadata keys: ${Object.keys(data.metadata).join(', ')}`);
      }
      
    } else {
      console.log(`   ❌ Failed: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.log(`   Error: ${errorText}`);
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Also test the progress endpoint
  console.log(`\n🧪 Testing Job Progress: /api/jobs/${jobId}/progress`);
  
  try {
    const response = await fetch(`${MIVAA_BASE_URL}/api/jobs/${jobId}/progress`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Progress endpoint works`);
      console.log(`   Keys: ${Object.keys(data).join(', ')}`);
      
      // Check if progress contains more detailed data
      if (data.steps) {
        console.log(`   Steps: ${Array.isArray(data.steps) ? data.steps.length : 'Not an array'}`);
      }
      
      if (data.results) {
        console.log(`   Results: ${typeof data.results}`);
        if (typeof data.results === 'object') {
          console.log(`   Results keys: ${Object.keys(data.results).join(', ')}`);
        }
      }
      
    } else {
      console.log(`   ❌ Progress endpoint failed: ${response.status}`);
    }
    
  } catch (error) {
    console.log(`   ❌ Progress endpoint error: ${error.message}`);
  }

  console.log(`\n💡 Recommendations:`);
  console.log(`=`.repeat(50));
  console.log(`1. If job response contains actual chunks/images data:`);
  console.log(`   → Use that data directly instead of separate endpoints`);
  console.log(`2. If job response only contains counts:`);
  console.log(`   → Need to fix the document endpoints or find alternative storage`);
  console.log(`3. If data is being lost:`);
  console.log(`   → Need to investigate MIVAA's internal storage mechanism`);
}

analyzeJobResponse().catch(console.error);

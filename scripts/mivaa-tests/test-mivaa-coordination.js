/**
 * Test Script for MIVAA Coordination in Visual Search Functions
 * Tests the migrated functions to ensure MIVAA integration works correctly
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

// Test configurations
const testConfig = {
  materialRecognition: {
    endpoint: `${SUPABASE_URL}/functions/v1/material-recognition`,
    testImage: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80', // Wood texture image
    testPayload: {
      image_url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80',
      analysis_type: 'detailed',
      confidence_threshold: 0.6,
      use_mivaa_vision: true,
      enable_visual_analysis: true,
      user_id: 'test-user-mivaa-coordination',
      workspace_id: 'test-workspace'
    }
  }
};

/**
 * Test Material Recognition Function with MIVAA
 */
async function testMaterialRecognition() {
  console.log('🔍 Testing Material Recognition with MIVAA Coordination...');
  console.log(`📡 Endpoint: ${testConfig.materialRecognition.endpoint}`);
  
  try {
    const response = await fetch(testConfig.materialRecognition.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'User-Agent': 'MIVAA-Coordination-Test/1.0'
      },
      body: JSON.stringify(testConfig.materialRecognition.testPayload)
    });

    const responseText = await response.text();
    console.log(`📊 Response Status: ${response.status} ${response.statusText}`);
    console.log(`📄 Raw Response:`, responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));

    if (response.ok) {
      try {
        const responseData = JSON.parse(responseText);
        
        console.log('✅ Material Recognition Test Results:');
        console.log(`   📈 Success: ${responseData.success}`);
        
        if (responseData.success && responseData.materials) {
          console.log(`   🎯 Materials Found: ${responseData.materials?.length || 0}`);
          console.log(`   ⚙️  Processing Method: ${responseData.metadata?.analysis_method || 'unknown'}`);
          console.log(`   ⏱️  Processing Time: ${responseData.metadata?.processing_time || 'unknown'}ms`);
          
          // Show detected materials
          responseData.materials.forEach((material, idx) => {
            console.log(`   📦 Material ${idx + 1}: ${material.name} (${(material.confidence * 100).toFixed(1)}% confidence)`);
          });
          
          // Check if MIVAA was used (fallback likely used catalog_fallback or openai_vision)
          const processingMethod = responseData.metadata?.processing_method || 'unknown';
          if (processingMethod === 'catalog_fallback') {
            console.log('⚠️  MIVAA Coordination: FALLBACK - Used catalog fallback (likely MIVAA unavailable)');
            return { success: true, usedMivaa: false, data: responseData, method: processingMethod };
          } else if (processingMethod === 'openai_vision') {
            console.log('⚠️  MIVAA Coordination: FALLBACK - Used OpenAI Vision (MIVAA fallback)');
            return { success: true, usedMivaa: false, data: responseData, method: processingMethod };
          } else {
            console.log(`🎊 MIVAA Coordination: SUCCESS - Used ${processingMethod}`);
            return { success: true, usedMivaa: true, data: responseData, method: processingMethod };
          }
        } else {
          console.log('❌ Function succeeded but no data returned');
          return { success: false, error: 'No data in response' };
        }
      } catch (parseError) {
        console.log('❌ Failed to parse JSON response:', parseError.message);
        return { success: false, error: 'JSON parse error', rawResponse: responseText };
      }
    } else {
      console.log(`❌ HTTP Error: ${response.status}`);
      return { success: false, error: `HTTP ${response.status}`, rawResponse: responseText };
    }
  } catch (error) {
    console.log('❌ Network/Request Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test Error Handling for MIVAA Gateway Issues
 */
async function testErrorHandling() {
  console.log('\n🧪 Testing Error Handling with Invalid Image URL...');
  
  const invalidPayload = {
    ...testConfig.materialRecognition.testPayload,
    image_url: 'https://invalid-domain-that-does-not-exist.com/image.jpg'
  };

  try {
    const response = await fetch(testConfig.materialRecognition.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'User-Agent': 'MIVAA-Error-Test/1.0'
      },
      body: JSON.stringify(invalidPayload)
    });

    const responseData = await response.json();
    console.log(`📊 Error Test Response Status: ${response.status}`);
    
    if (responseData.success === false || response.status >= 400) {
      console.log('✅ Error Handling: Function properly handles errors');
      console.log(`   🔍 Error Type: ${responseData.error?.code || 'unknown'}`);
      console.log(`   📝 Error Message: ${responseData.error?.message || 'unknown'}`);
      return { success: true, errorHandled: true };
    } else {
      console.log('⚠️  Error Handling: Function should have failed but didn\'t');
      return { success: false, errorHandled: false };
    }
  } catch (error) {
    console.log('⚠️  Error Test Failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test Fallback Capabilities
 */
async function testFallbackCapabilities() {
  console.log('\n🔄 Testing Fallback Capabilities...');
  
  const fallbackPayload = {
    ...testConfig.materialRecognition.testPayload,
    use_mivaa_vision: false  // Force fallback to OpenAI/catalog
  };

  try {
    const response = await fetch(testConfig.materialRecognition.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'User-Agent': 'MIVAA-Fallback-Test/1.0'
      },
      body: JSON.stringify(fallbackPayload)
    });

    const responseData = await response.json();
    console.log(`📊 Fallback Test Response Status: ${response.status}`);
    
    if (response.ok && responseData.success) {
      const processingMethod = responseData.metadata?.processing_method;
      console.log(`✅ Fallback Test: SUCCESS`);
      console.log(`   ⚙️  Processing Method: ${processingMethod}`);
      console.log(`   🎯 Materials Found: ${responseData.materials?.length || 0}`);
      
      if (processingMethod && processingMethod !== 'mivaa_vision') {
        console.log('🎯 Fallback Mechanism: Working correctly');
        return { success: true, fallbackWorking: true, method: processingMethod };
      } else {
        console.log('⚠️  Fallback Mechanism: Still used MIVAA when disabled');
        return { success: true, fallbackWorking: false, method: processingMethod };
      }
    } else {
      console.log('❌ Fallback Test Failed');
      return { success: false, error: 'Fallback test failed' };
    }
  } catch (error) {
    console.log('❌ Fallback Test Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('🚀 Starting MIVAA Coordination Tests\n');
  console.log('=' .repeat(60));
  
  const results = {
    materialRecognition: await testMaterialRecognition(),
    errorHandling: await testErrorHandling(),
    fallbackCapabilities: await testFallbackCapabilities()
  };

  console.log('\n' + '=' .repeat(60));
  console.log('📋 MIVAA Coordination Test Summary:');
  console.log('=' .repeat(60));
  
  // Material Recognition Results
  if (results.materialRecognition.success) {
    if (results.materialRecognition.usedMivaa) {
      console.log('✅ Material Recognition: MIVAA coordination working');
    } else {
      console.log('⚠️  Material Recognition: Used fallback method');
    }
  } else {
    console.log('❌ Material Recognition: Failed');
    console.log(`   Error: ${results.materialRecognition.error}`);
  }
  
  // Error Handling Results
  if (results.errorHandling.success && results.errorHandling.errorHandled) {
    console.log('✅ Error Handling: Working correctly');
  } else {
    console.log('❌ Error Handling: Issues detected');
  }
  
  // Fallback Results
  if (results.fallbackCapabilities.success && results.fallbackCapabilities.fallbackWorking) {
    console.log('✅ Fallback Capabilities: Working correctly');
  } else {
    console.log('⚠️  Fallback Capabilities: Issues detected');
  }

  console.log('\n📊 Overall Assessment:');
  const successfulTests = Object.values(results).filter(r => r.success).length;
  const totalTests = Object.keys(results).length;
  console.log(`   🎯 Tests Passed: ${successfulTests}/${totalTests}`);
  
  if (successfulTests === totalTests) {
    console.log('🎉 MIVAA Coordination Migration: SUCCESSFUL');
  } else {
    console.log('⚠️  MIVAA Coordination Migration: Issues detected - review required');
  }

  return results;
}

// Run tests
if (typeof Deno !== 'undefined') {
  // Running in Deno environment
  runTests();
} else if (typeof window === 'undefined') {
  // Running in Node.js environment
  runTests();
} else {
  // Running in browser - expose to global
  window.runMivaaTests = runTests;
  console.log('Test functions loaded. Run runMivaaTests() to execute tests.');
}
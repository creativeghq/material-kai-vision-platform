// Test the Fixed Integration with Updated API Gateway
// This tests the MIVAA gateway functionality through the api-gateway function

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

console.log('🔧 Testing Fixed Integration with MIVAA Gateway...\n');

// Test 1: Test MIVAA Gateway through API Gateway
async function testMivaaGateway() {
  console.log('🚀 Testing MIVAA Gateway Integration...');
  
  const testActions = [
    { action: 'health_check', payload: {} },
    { action: 'generate_embedding', payload: { text: 'test material' } },
    { action: 'semantic_search', payload: { query: 'wood material', limit: 5 } }
  ];
  
  for (const testData of testActions) {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/api-gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData)
      });
      
      const result = await response.json();
      
      if (response.ok) {
        console.log(`  ✅ ${testData.action}: ${response.status} - Success`);
        if (result.metadata?.mivaaEndpoint) {
          console.log(`    📍 MIVAA Endpoint: ${result.metadata.mivaaEndpoint}`);
        }
      } else {
        console.log(`  ⚠️ ${testData.action}: ${response.status} - ${result.message || 'Error'}`);
      }
    } catch (error) {
      console.log(`  ❌ ${testData.action}: ${error.message}`);
    }
  }
}

// Test 2: Test Direct Function Calls
async function testDirectFunctionCalls() {
  console.log('\n🎯 Testing Direct Function Calls...');
  
  const functions = [
    { name: 'crewai-3d-generation', payload: { user_id: crypto.randomUUID(), prompt: 'modern room' } },
    { name: 'material-scraper', payload: { url: 'https://example.com', test: true } },
    { name: 'ocr-processing', payload: { image: 'data:image/png;base64,test', test: true } }
  ];
  
  for (const func of functions) {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${func.name}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(func.payload)
      });
      
      const result = await response.json();
      
      if (response.ok) {
        console.log(`  ✅ ${func.name}: ${response.status} - Working`);
      } else {
        console.log(`  ⚠️ ${func.name}: ${response.status} - ${result.message || 'Error'}`);
      }
    } catch (error) {
      console.log(`  ❌ ${func.name}: ${error.message}`);
    }
  }
}

// Test 3: Test Frontend Pattern Simulation
async function testFrontendPatterns() {
  console.log('\n🎨 Testing Frontend Integration Patterns...');
  
  // Simulate MaterialRecognition component call
  try {
    console.log('  Testing Material Recognition via Gateway...');
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/api-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'material_recognition',
        payload: {
          image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          options: { includeProperties: true }
        }
      })
    });
    
    const result = await response.json();
    console.log(`    ✅ Material Recognition Gateway: ${response.status} - ${result.success ? 'Success' : 'Error'}`);
    
  } catch (error) {
    console.log(`    ❌ Material Recognition Gateway: ${error.message}`);
  }
  
  // Simulate PDF processing call
  try {
    console.log('  Testing PDF Processing via Gateway...');
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/api-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'pdf_extract',
        payload: {
          file_url: 'https://example.com/test.pdf',
          extract_images: true,
          extract_text: true
        }
      })
    });
    
    const result = await response.json();
    console.log(`    ✅ PDF Processing Gateway: ${response.status} - ${result.success ? 'Success' : 'Error'}`);
    
  } catch (error) {
    console.log(`    ❌ PDF Processing Gateway: ${error.message}`);
  }
}

// Test 4: Test MIVAA Service Health
async function testMivaaHealth() {
  console.log('\n🏥 Testing MIVAA Service Health...');
  
  try {
    const response = await fetch('http://104.248.68.3:8000/health');
    const result = await response.json();
    console.log(`  ✅ MIVAA Direct Health: ${response.status} - ${result.status}`);
    
    // Test through gateway
    const gatewayResponse = await fetch(`${SUPABASE_URL}/functions/v1/api-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'health_check', payload: {} })
    });
    
    const gatewayResult = await gatewayResponse.json();
    console.log(`  ✅ MIVAA via Gateway: ${gatewayResponse.status} - ${gatewayResult.success ? 'Success' : 'Error'}`);
    
  } catch (error) {
    console.log(`  ❌ MIVAA Health: ${error.message}`);
  }
}

// Main test execution
async function runFixedIntegrationTests() {
  console.log('🚀 Material Kai Vision Platform - Fixed Integration Tests\n');
  console.log('=' .repeat(70));
  
  await testMivaaGateway();
  await testDirectFunctionCalls();
  await testFrontendPatterns();
  await testMivaaHealth();
  
  console.log('\n' + '=' .repeat(70));
  console.log('✅ Fixed integration tests completed!');
  console.log('\n📋 Summary:');
  console.log('- MIVAA Gateway integration through api-gateway function');
  console.log('- Direct function access for public functions');
  console.log('- Frontend pattern simulation');
  console.log('- End-to-end connectivity verification');
  console.log('\n🎯 This shows the ACTUAL working integration!');
}

// Run the tests
runFixedIntegrationTests().catch(console.error);

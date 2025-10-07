// Test MIVAA Authentication through Supabase Gateway
// This will test the actual API key stored in Supabase secrets

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

console.log('🔧 Testing MIVAA Authentication through Supabase Gateway...\n');

// Test 1: Test health check through gateway
async function testGatewayHealth() {
  console.log('🔧 Testing MIVAA Gateway Health Check...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'health_check',
        payload: {}
      })
    });
    
    const result = await response.json();
    
    console.log(`  Status: ${response.status}`);
    console.log(`  Response:`, JSON.stringify(result, null, 2));
    
    if (response.status === 200) {
      console.log(`  ✅ Gateway health check working`);
      return true;
    } else {
      console.log(`  ❌ Gateway health check failed`);
      return false;
    }
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return false;
  }
}

// Test 2: Test material recognition through gateway
async function testGatewayMaterialRecognition() {
  console.log('\n🔧 Testing Material Recognition through Gateway...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'material_recognition',
        payload: {
          image_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          analysis_options: {
            include_properties: true,
            include_composition: true,
            confidence_threshold: 0.8,
          },
        },
      })
    });
    
    const result = await response.json();
    
    console.log(`  Status: ${response.status}`);
    console.log(`  Response:`, JSON.stringify(result, null, 2));
    
    if (response.status === 200) {
      console.log(`  ✅ Material recognition working!`);
      return true;
    } else if (response.status === 500 && result.error?.includes('401')) {
      console.log(`  ❌ MIVAA API key authentication failed`);
      console.log(`  💡 Need to update MIVAA_API_KEY with valid JWT token`);
      return false;
    } else if (response.status === 500 && result.error?.includes('422')) {
      console.log(`  ⚠️ Auth works but payload format wrong`);
      return true;
    } else {
      console.log(`  ❌ Unexpected error`);
      return false;
    }
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return false;
  }
}

// Test 3: Test semantic search through gateway
async function testGatewaySemanticSearch() {
  console.log('\n🔧 Testing Semantic Search through Gateway...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'semantic_search',
        payload: {
          query: 'sustainable materials',
          limit: 5,
          similarity_threshold: 0.7
        }
      })
    });
    
    const result = await response.json();
    
    console.log(`  Status: ${response.status}`);
    console.log(`  Response:`, JSON.stringify(result, null, 2));
    
    if (response.status === 200) {
      console.log(`  ✅ Semantic search working!`);
      return true;
    } else if (response.status === 500 && result.error?.includes('401')) {
      console.log(`  ❌ MIVAA API key authentication failed`);
      return false;
    } else if (response.status === 500 && result.error?.includes('422')) {
      console.log(`  ⚠️ Auth works but payload format wrong`);
      return true;
    } else {
      console.log(`  ❌ Unexpected error`);
      return false;
    }
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return false;
  }
}

// Test 4: Test PDF processing through gateway
async function testGatewayPDFProcessing() {
  console.log('\n🔧 Testing PDF Processing through Gateway...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'pdf_extract_markdown',
        payload: {
          test: 'pdf processing'
        }
      })
    });
    
    const result = await response.json();
    
    console.log(`  Status: ${response.status}`);
    console.log(`  Response:`, JSON.stringify(result, null, 2));
    
    if (response.status === 200) {
      console.log(`  ✅ PDF processing working!`);
      return true;
    } else if (response.status === 500 && result.error?.includes('401')) {
      console.log(`  ❌ MIVAA API key authentication failed`);
      return false;
    } else if (response.status === 500 && result.error?.includes('422')) {
      console.log(`  ⚠️ Auth works but payload format wrong`);
      return true;
    } else {
      console.log(`  ❌ Unexpected error`);
      return false;
    }
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return false;
  }
}

// Test 5: Test with different payload formats
async function testDifferentPayloadFormats() {
  console.log('\n🔧 Testing Different Payload Formats...');
  
  const payloadTests = [
    {
      name: 'Simple Image',
      payload: {
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
      }
    },
    {
      name: 'Generic Object',
      payload: {
        data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        type: 'material_analysis'
      }
    },
    {
      name: 'Empty Object',
      payload: {}
    }
  ];
  
  for (const test of payloadTests) {
    console.log(`\n  🧪 Testing: ${test.name}`);
    
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'material_recognition',
          payload: test.payload
        })
      });
      
      const result = await response.json();
      
      console.log(`    Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log(`    ✅ Success - correct format!`);
      } else if (response.status === 500 && result.error?.includes('422')) {
        console.log(`    ⚠️ Auth works - wrong payload format`);
      } else if (response.status === 500 && result.error?.includes('401')) {
        console.log(`    ❌ Auth failed`);
      } else {
        console.log(`    ❓ Unexpected: ${result.error || 'Unknown'}`);
      }
      
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
    }
  }
}

// Main test execution
async function runSupabaseGatewayTests() {
  console.log('🔧 Supabase MIVAA Gateway Authentication Tests\n');
  console.log('=' .repeat(70));
  
  const healthWorks = await testGatewayHealth();
  
  if (healthWorks) {
    console.log('\n🎉 Gateway working! Testing authenticated endpoints...');
    
    const materialWorks = await testGatewayMaterialRecognition();
    const searchWorks = await testGatewaySemanticSearch();
    const pdfWorks = await testGatewayPDFProcessing();
    
    if (!materialWorks && !searchWorks && !pdfWorks) {
      console.log('\n❌ All authenticated endpoints failing');
      console.log('💡 MIVAA_API_KEY needs to be updated with valid JWT token');
    } else {
      console.log('\n🎉 Some endpoints working! Testing payload formats...');
      await testDifferentPayloadFormats();
    }
  } else {
    console.log('\n❌ Gateway not working - check function deployment');
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('✅ Supabase gateway tests completed!');
  console.log('\n📋 Next Steps:');
  console.log('1. If auth fails: Update MIVAA_API_KEY with valid JWT');
  console.log('2. If payload fails: Fix request format to match MIVAA API');
  console.log('3. Test frontend integration after fixes');
}

// Run the Supabase gateway tests
runSupabaseGatewayTests().catch(console.error);

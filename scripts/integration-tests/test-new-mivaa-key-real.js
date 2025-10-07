// Test New MIVAA API Key
// Test the new key: mk_api_2024_cd3a77b972302a39a28faa2ce712503caae7ee4236b654c37317fa4bfc27097e

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const NEW_MIVAA_KEY = 'mk_api_2024_cd3a77b972302a39a28faa2ce712503caae7ee4236b654c37317fa4bfc27097e';
const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

console.log('🔑 Testing New MIVAA API Key...\n');
console.log(`Key: ${NEW_MIVAA_KEY.substring(0, 20)}...${NEW_MIVAA_KEY.substring(-20)}`);

// Test 1: Direct MIVAA API with new key
async function testDirectMivaaWithNewKey() {
  console.log('\n🔧 Testing Direct MIVAA API with New Key...');
  
  const tests = [
    {
      name: 'Health Check',
      endpoint: '/health',
      method: 'GET',
      requiresAuth: false
    },
    {
      name: 'Semantic Search',
      endpoint: '/api/search/semantic',
      method: 'POST',
      requiresAuth: true,
      payload: {
        query: 'sustainable materials',
        limit: 5,
        similarity_threshold: 0.7
      }
    },
    {
      name: 'Material Recognition',
      endpoint: '/api/analyze/materials/image',
      method: 'POST',
      requiresAuth: true,
      payload: {
        image_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        analysis_options: {
          include_properties: true,
          confidence_threshold: 0.8
        }
      }
    },
    {
      name: 'PDF Extract Markdown',
      endpoint: '/api/v1/extract/markdown',
      method: 'POST',
      requiresAuth: true,
      payload: {
        pdf_content: 'test pdf processing'
      }
    }
  ];
  
  for (const test of tests) {
    console.log(`\n  🧪 Testing: ${test.name}`);
    
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      
      if (test.requiresAuth) {
        headers['Authorization'] = `Bearer ${NEW_MIVAA_KEY}`;
      }
      
      const options = {
        method: test.method,
        headers: headers,
      };
      
      if (test.payload && test.method === 'POST') {
        options.body = JSON.stringify(test.payload);
      }
      
      const response = await fetch(`${MIVAA_BASE_URL}${test.endpoint}`, options);
      const result = await response.text();
      
      console.log(`    Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log(`    ✅ ${test.name}: SUCCESS! New key works!`);
        try {
          const jsonResult = JSON.parse(result);
          if (jsonResult.data) {
            console.log(`    📊 Data keys: ${Object.keys(jsonResult.data).join(', ')}`);
          } else {
            console.log(`    📊 Response: ${result.substring(0, 100)}...`);
          }
        } catch (e) {
          console.log(`    📊 Response: ${result.substring(0, 100)}...`);
        }
      } else if (response.status === 401) {
        console.log(`    ❌ ${test.name}: Still authentication failed`);
        console.log(`    📊 Response: ${result.substring(0, 200)}`);
      } else if (response.status === 422) {
        console.log(`    ⚠️ ${test.name}: Auth works! Validation error (payload issue)`);
        console.log(`    📊 Response: ${result.substring(0, 200)}`);
      } else {
        console.log(`    ❓ ${test.name}: Status ${response.status}`);
        console.log(`    📊 Response: ${result.substring(0, 200)}`);
      }
      
    } catch (error) {
      console.log(`    ❌ ${test.name}: Error - ${error.message}`);
    }
  }
}

// Test 2: Test through Supabase Gateway (will use old key until updated)
async function testSupabaseGatewayCurrentKey() {
  console.log('\n🔧 Testing Supabase Gateway (Current Key)...');
  
  const tests = [
    {
      name: 'Health Check',
      action: 'health_check',
      payload: {}
    },
    {
      name: 'Material Recognition',
      action: 'material_recognition',
      payload: {
        image_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        analysis_options: {
          include_properties: true,
          confidence_threshold: 0.8
        }
      }
    },
    {
      name: 'Semantic Search',
      action: 'semantic_search',
      payload: {
        query: 'sustainable materials',
        limit: 5
      }
    }
  ];
  
  for (const test of tests) {
    console.log(`\n  🧪 Testing: ${test.name}`);
    
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: test.action,
          payload: test.payload
        })
      });
      
      const result = await response.json();
      
      console.log(`    Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log(`    ✅ ${test.name}: SUCCESS! Gateway working!`);
        if (result.metadata?.processingTime) {
          console.log(`    📊 Processing Time: ${result.metadata.processingTime}ms`);
        }
      } else if (response.status === 500) {
        if (result.error?.message?.includes('401')) {
          console.log(`    ❌ ${test.name}: Still using old key (expected)`);
        } else {
          console.log(`    ❓ ${test.name}: ${result.error?.message || 'Unknown error'}`);
        }
      } else {
        console.log(`    ❓ ${test.name}: Status ${response.status}`);
      }
      
    } catch (error) {
      console.log(`    ❌ ${test.name}: Error - ${error.message}`);
    }
  }
}

// Test 3: Key format analysis
async function analyzeNewKeyFormat() {
  console.log('\n🔧 Analyzing New Key Format...');
  
  console.log(`  🔑 New Key: ${NEW_MIVAA_KEY}`);
  console.log(`  📏 Length: ${NEW_MIVAA_KEY.length} characters`);
  console.log(`  🔍 Format: ${NEW_MIVAA_KEY.includes('.') ? 'JWT-like' : 'API Key'}`);
  console.log(`  📍 Prefix: ${NEW_MIVAA_KEY.substring(0, 10)}`);
  console.log(`  📍 Pattern: ${NEW_MIVAA_KEY.startsWith('mk_api_') ? 'MIVAA API Key format' : 'Unknown format'}`);
  
  if (NEW_MIVAA_KEY.startsWith('mk_api_')) {
    console.log(`  ✅ Key follows MIVAA API key naming convention`);
    console.log(`  📅 Year: ${NEW_MIVAA_KEY.includes('2024') ? '2024' : 'Unknown'}`);
  }
  
  // Compare with old key
  const OLD_KEY = 'Kj9mN2pQ8rT5vY7wE3uI6oP1aS4dF8gH2kL9nM6qR3tY5vX8zA1bC4eG7jK0mP9s';
  console.log(`\n  📊 Comparison with old key:`);
  console.log(`    Old: ${OLD_KEY.length} chars, no prefix`);
  console.log(`    New: ${NEW_MIVAA_KEY.length} chars, mk_api_ prefix`);
  console.log(`    Format change: ${OLD_KEY.length !== NEW_MIVAA_KEY.length ? 'Yes' : 'No'}`);
}

// Main test execution
async function testNewMivaaKey() {
  console.log('🔑 New MIVAA API Key Test\n');
  console.log('=' .repeat(70));
  console.log(`Testing key: mk_api_2024_cd3a77b9...`);
  console.log('=' .repeat(70));
  
  await analyzeNewKeyFormat();
  await testDirectMivaaWithNewKey();
  await testSupabaseGatewayCurrentKey();
  
  console.log('\n' + '=' .repeat(70));
  console.log('🔑 NEW MIVAA API KEY TEST COMPLETE');
  console.log('=' .repeat(70));
  
  console.log('\n📋 RESULTS SUMMARY:');
  console.log('- Tested new key format and structure');
  console.log('- Verified direct MIVAA API authentication');
  console.log('- Checked Supabase gateway (still using old key)');
  
  console.log('\n🎯 If new key works:');
  console.log('1. Update MIVAA_API_KEY in Supabase environment');
  console.log('2. Redeploy mivaa-gateway function');
  console.log('3. Test all AI features');
  console.log('4. Platform will be 100% operational!');
}

// Run the test
testNewMivaaKey().catch(console.error);

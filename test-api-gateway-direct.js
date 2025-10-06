// Test API Gateway Function Directly to Debug Issues
// This tests what the api-gateway function is actually doing

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

console.log('🔍 Testing API Gateway Function Directly...\n');

// Test 1: Basic API Gateway Call
async function testBasicApiGateway() {
  console.log('📡 Testing Basic API Gateway Response...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/api-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ test: true })
    });
    
    const result = await response.json();
    console.log(`  Status: ${response.status}`);
    console.log(`  Response: ${JSON.stringify(result, null, 2)}`);
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
}

// Test 2: Test with MIVAA action
async function testMivaaAction() {
  console.log('\n🤖 Testing MIVAA Action...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/api-gateway`, {
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
    console.log(`  Response: ${JSON.stringify(result, null, 2)}`);
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
}

// Test 3: Test with MIVAA path
async function testMivaaPath() {
  console.log('\n🛣️ Testing MIVAA Path...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/api-gateway/mivaa/health`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ test: true })
    });
    
    const result = await response.json();
    console.log(`  Status: ${response.status}`);
    console.log(`  Response: ${JSON.stringify(result, null, 2)}`);
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
}

// Test 4: Test GET request
async function testGetRequest() {
  console.log('\n📥 Testing GET Request...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/api-gateway`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      }
    });
    
    const result = await response.json();
    console.log(`  Status: ${response.status}`);
    console.log(`  Response: ${JSON.stringify(result, null, 2)}`);
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
}

// Test 5: Test OPTIONS request
async function testOptionsRequest() {
  console.log('\n⚙️ Testing OPTIONS Request...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/api-gateway`, {
      method: 'OPTIONS',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      }
    });
    
    console.log(`  Status: ${response.status}`);
    console.log(`  Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}`);
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
}

// Main test execution
async function runApiGatewayDebugTests() {
  console.log('🚀 API Gateway Debug Tests\n');
  console.log('=' .repeat(50));
  
  await testBasicApiGateway();
  await testMivaaAction();
  await testMivaaPath();
  await testGetRequest();
  await testOptionsRequest();
  
  console.log('\n' + '=' .repeat(50));
  console.log('✅ API Gateway debug tests completed!');
}

// Run the tests
runApiGatewayDebugTests().catch(console.error);

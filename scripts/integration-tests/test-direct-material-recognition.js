// Test Direct Material Recognition Function
// Test the exact curl command you provided

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

console.log('🔧 Testing Direct Material Recognition Function...\n');

// Test 1: Exact curl command equivalent
async function testDirectMaterialRecognition() {
  console.log('🧪 Testing: Direct material-recognition function');
  console.log('📋 Equivalent to your curl command...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/material-recognition`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({"name": "Functions"})
    });
    
    const result = await response.text();
    
    console.log(`\n📊 Response Status: ${response.status}`);
    console.log(`📊 Response Headers:`);
    response.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });
    
    console.log(`\n📊 Response Body:`);
    console.log(result);
    
    // Try to parse as JSON
    try {
      const jsonResult = JSON.parse(result);
      console.log(`\n🔍 Parsed JSON Response:`);
      console.log(JSON.stringify(jsonResult, null, 2));
      
      if (jsonResult.success) {
        console.log(`\n✅ SUCCESS! Direct material-recognition function works!`);
        return true;
      } else if (jsonResult.error) {
        console.log(`\n❌ Function Error: ${jsonResult.error.message || jsonResult.error}`);
        return false;
      }
    } catch (e) {
      console.log(`\n📊 Raw response (not JSON): ${result}`);
    }
    
    if (response.status === 200) {
      console.log(`\n✅ Function responded successfully!`);
      return true;
    } else if (response.status === 404) {
      console.log(`\n❌ Function not found - material-recognition function doesn't exist`);
      return false;
    } else {
      console.log(`\n❓ Unexpected status: ${response.status}`);
      return false;
    }
    
  } catch (error) {
    console.log(`\n❌ Request Error: ${error.message}`);
    return false;
  }
}

// Test 2: Check if function exists
async function checkFunctionExists() {
  console.log('\n🔧 Checking if material-recognition function exists...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/material-recognition`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    
    console.log(`📊 GET Status: ${response.status}`);
    
    if (response.status === 404) {
      console.log(`❌ Function does not exist`);
      return false;
    } else if (response.status === 405) {
      console.log(`✅ Function exists (Method Not Allowed for GET)`);
      return true;
    } else {
      console.log(`✅ Function exists (Status: ${response.status})`);
      return true;
    }
    
  } catch (error) {
    console.log(`❌ Error checking function: ${error.message}`);
    return false;
  }
}

// Test 3: List available functions
async function listAvailableFunctions() {
  console.log('\n🔧 Checking available Supabase functions...');
  
  const knownFunctions = [
    'material-recognition',
    'mivaa-gateway', 
    'material-scraper',
    'scrape-session-manager',
    'mivaa-jwt-generator'
  ];
  
  for (const funcName of knownFunctions) {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${funcName}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      
      const status = response.status;
      let exists = false;
      
      if (status === 404) {
        console.log(`  ❌ ${funcName}: Not found`);
      } else if (status === 405) {
        console.log(`  ✅ ${funcName}: Exists (Method Not Allowed)`);
        exists = true;
      } else if (status === 200 || status === 500) {
        console.log(`  ✅ ${funcName}: Exists (Status: ${status})`);
        exists = true;
      } else {
        console.log(`  ❓ ${funcName}: Status ${status}`);
      }
      
    } catch (error) {
      console.log(`  ❌ ${funcName}: Error - ${error.message}`);
    }
  }
}

// Test 4: Test with proper material recognition payload
async function testWithProperPayload() {
  console.log('\n🔧 Testing with proper material recognition payload...');
  
  const properPayload = {
    image_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    analysis_options: {
      include_properties: true,
      confidence_threshold: 0.8
    }
  };
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/material-recognition`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(properPayload)
    });
    
    const result = await response.text();
    
    console.log(`📊 Status: ${response.status}`);
    console.log(`📊 Response: ${result.substring(0, 500)}${result.length > 500 ? '...' : ''}`);
    
    if (response.status === 200) {
      console.log(`✅ Function works with proper payload!`);
      return true;
    } else if (response.status === 404) {
      console.log(`❌ Function not found`);
      return false;
    } else {
      console.log(`❓ Status: ${response.status}`);
      return false;
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

// Main test execution
async function testDirectFunction() {
  console.log('🔧 Direct Material Recognition Function Test\n');
  console.log('=' .repeat(70));
  console.log('Testing the exact curl command you provided...');
  console.log('=' .repeat(70));
  
  // Test exact curl equivalent
  const curlWorked = await testDirectMaterialRecognition();
  
  // Check if function exists
  const functionExists = await checkFunctionExists();
  
  // List available functions
  await listAvailableFunctions();
  
  // Test with proper payload
  const properPayloadWorked = await testWithProperPayload();
  
  console.log('\n' + '=' .repeat(70));
  console.log('🔍 DIRECT FUNCTION TEST RESULTS');
  console.log('=' .repeat(70));
  
  console.log('\n📊 TEST RESULTS:');
  console.log(`  Curl Command Equivalent: ${curlWorked ? '✅ Works' : '❌ Failed'}`);
  console.log(`  Function Exists: ${functionExists ? '✅ Yes' : '❌ No'}`);
  console.log(`  Proper Payload Test: ${properPayloadWorked ? '✅ Works' : '❌ Failed'}`);
  
  console.log('\n🎯 ANALYSIS:');
  
  if (curlWorked) {
    console.log('✅ SUCCESS! Direct material-recognition function works!');
    console.log('🎉 This means we have a working AI function!');
    console.log('📋 The function accepts direct calls outside the gateway');
  } else if (functionExists) {
    console.log('⚠️ Function exists but may need different payload format');
    console.log('🔧 Try testing with proper material recognition data');
  } else {
    console.log('❌ material-recognition function does not exist');
    console.log('🔧 All AI calls must go through mivaa-gateway');
  }
  
  console.log('\n📋 RECOMMENDATIONS:');
  if (curlWorked || properPayloadWorked) {
    console.log('1. Use direct function calls instead of gateway');
    console.log('2. Update frontend to call material-recognition directly');
    console.log('3. Test other direct AI functions');
  } else if (functionExists) {
    console.log('1. Check function documentation for correct payload format');
    console.log('2. Test different payload structures');
    console.log('3. Check function logs for error details');
  } else {
    console.log('1. Continue using mivaa-gateway for AI functions');
    console.log('2. Focus on resolving MIVAA authentication');
    console.log('3. Consider creating direct AI functions if needed');
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('✅ DIRECT FUNCTION TEST COMPLETE');
  console.log('=' .repeat(70));
}

// Run the test
testDirectFunction().catch(console.error);

// Debug Scraper Functions to Find 500 Error Causes
// This will help identify specific issues with the scraper functions

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

console.log('🔍 Debugging Scraper Functions...\n');

// Test 1: Material Scraper with minimal payload
async function testMaterialScraperMinimal() {
  console.log('🔧 Testing material-scraper with minimal payload...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/material-scraper`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        test: true
      })
    });
    
    const result = await response.text(); // Get raw text first
    console.log(`  Status: ${response.status}`);
    console.log(`  Raw Response: ${result}`);
    
    try {
      const jsonResult = JSON.parse(result);
      console.log(`  Parsed Response:`, jsonResult);
    } catch (e) {
      console.log(`  Could not parse as JSON: ${e.message}`);
    }
    
  } catch (error) {
    console.log(`  ❌ Network Error: ${error.message}`);
  }
}

// Test 2: Scrape Session Manager with minimal payload
async function testSessionManagerMinimal() {
  console.log('\n🔧 Testing scrape-session-manager with minimal payload...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/scrape-session-manager`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'test-session-123',
        action: 'start'
      })
    });
    
    const result = await response.text();
    console.log(`  Status: ${response.status}`);
    console.log(`  Raw Response: ${result}`);
    
    try {
      const jsonResult = JSON.parse(result);
      console.log(`  Parsed Response:`, jsonResult);
    } catch (e) {
      console.log(`  Could not parse as JSON: ${e.message}`);
    }
    
  } catch (error) {
    console.log(`  ❌ Network Error: ${error.message}`);
  }
}

// Test 3: Scrape Single Page with minimal payload
async function testSinglePageMinimal() {
  console.log('\n🔧 Testing scrape-single-page with minimal payload...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/scrape-single-page`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pageUrl: 'https://example.com',
        sessionId: 'test-session-123',
        pageId: 'test-page-123'
      })
    });
    
    const result = await response.text();
    console.log(`  Status: ${response.status}`);
    console.log(`  Raw Response: ${result}`);
    
    try {
      const jsonResult = JSON.parse(result);
      console.log(`  Parsed Response:`, jsonResult);
    } catch (e) {
      console.log(`  Could not parse as JSON: ${e.message}`);
    }
    
  } catch (error) {
    console.log(`  ❌ Network Error: ${error.message}`);
  }
}

// Test 4: Test MIVAA Gateway with different authentication
async function testMivaaGatewayAuth() {
  console.log('\n🔧 Testing MIVAA Gateway authentication...');
  
  // Test health check (should work without auth)
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
    console.log(`  Health Check Status: ${response.status}`);
    console.log(`  Health Check Response:`, result);
    
  } catch (error) {
    console.log(`  ❌ Health Check Error: ${error.message}`);
  }
  
  // Test direct MIVAA health (no auth required)
  try {
    const response = await fetch('http://104.248.68.3:8000/health');
    const result = await response.json();
    console.log(`  Direct MIVAA Health: ${response.status}`);
    console.log(`  Direct MIVAA Response:`, result);
    
  } catch (error) {
    console.log(`  ❌ Direct MIVAA Error: ${error.message}`);
  }
}

// Test 5: Check if functions are actually deployed
async function testFunctionDeployment() {
  console.log('\n🔧 Testing Function Deployment Status...');
  
  const functions = [
    'material-scraper',
    'scrape-session-manager', 
    'scrape-single-page',
    'mivaa-gateway'
  ];
  
  for (const funcName of functions) {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${funcName}`, {
        method: 'OPTIONS',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        }
      });
      
      console.log(`  ${funcName}: ${response.status} - ${response.status === 200 ? 'Deployed' : 'Issue'}`);
      
    } catch (error) {
      console.log(`  ${funcName}: ❌ ${error.message}`);
    }
  }
}

// Test 6: Test database connectivity from functions
async function testDatabaseConnectivity() {
  console.log('\n🔧 Testing Database Connectivity...');
  
  const tables = ['scraped_materials_temp', 'scraping_sessions', 'scraping_pages'];
  
  for (const table of tables) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=count&limit=1`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        }
      });
      
      console.log(`  ${table}: ${response.status} - ${response.status === 200 ? 'Accessible' : 'Issue'}`);
      
    } catch (error) {
      console.log(`  ${table}: ❌ ${error.message}`);
    }
  }
}

// Main debug execution
async function runDebugTests() {
  console.log('🔍 Material Kai Vision Platform - Scraper Function Debug\n');
  console.log('=' .repeat(60));
  
  await testMaterialScraperMinimal();
  await testSessionManagerMinimal();
  await testSinglePageMinimal();
  await testMivaaGatewayAuth();
  await testFunctionDeployment();
  await testDatabaseConnectivity();
  
  console.log('\n' + '=' .repeat(60));
  console.log('✅ Debug tests completed!');
  console.log('\n📋 Next Steps:');
  console.log('- Check function logs in Supabase dashboard');
  console.log('- Verify environment variables are set');
  console.log('- Confirm functions were deployed successfully');
  console.log('- Test with proper authentication tokens');
}

// Run the debug tests
runDebugTests().catch(console.error);

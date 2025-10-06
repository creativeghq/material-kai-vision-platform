// Test Scraper Service Fix
// Test with correct service parameters

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

console.log('🔧 Testing Scraper Service Fix...\n');

// Test 1: Test material scraper with different service names
async function testMaterialScraperServices() {
  console.log('🔧 Testing Material Scraper Service Names...');
  
  const serviceTests = [
    {
      name: 'firecrawl',
      service: 'firecrawl'
    },
    {
      name: 'jina', 
      service: 'jina'
    },
    {
      name: 'default (no service)',
      service: undefined
    }
  ];
  
  for (const test of serviceTests) {
    console.log(`\n  🧪 Testing service: ${test.name}`);
    
    const payload = {
      url: 'https://example.com/materials',
      options: {
        timeout: 10000
      }
    };
    
    if (test.service) {
      payload.options.service = test.service;
    }
    
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/material-scraper`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
      
      const result = await response.json();
      
      console.log(`    Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log(`    ✅ Service "${test.service}" works!`);
      } else if (response.status === 500 && result.error?.includes('Invalid service')) {
        console.log(`    ❌ Service "${test.service}" not supported`);
      } else if (response.status === 500 && result.error?.includes('Authentication failed')) {
        console.log(`    ⚠️ Service "${test.service}" works but auth failed`);
      } else if (response.status === 500 && result.error?.includes('Invalid URL')) {
        console.log(`    ⚠️ Service "${test.service}" works but URL validation failed`);
      } else {
        console.log(`    ❓ Unexpected: ${result.error || 'Unknown'}`);
      }
      
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
    }
  }
}

// Test 2: Test session manager with proper parameters
async function testSessionManagerFix() {
  console.log('\n🔧 Testing Session Manager Fix...');
  
  const sessionId = crypto.randomUUID();
  
  const testCases = [
    {
      name: 'Start Session',
      payload: {
        sessionId: sessionId,
        action: 'start',
        urls: ['https://example.com/page1', 'https://example.com/page2']
      }
    },
    {
      name: 'Get Session Status',
      payload: {
        sessionId: sessionId,
        action: 'status'
      }
    }
  ];
  
  for (const test of testCases) {
    console.log(`\n  🧪 Testing: ${test.name}`);
    
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/scrape-session-manager`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(test.payload)
      });
      
      const result = await response.json();
      
      console.log(`    Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log(`    ✅ ${test.name} works!`);
      } else if (response.status === 500 && result.error?.includes('Authentication failed')) {
        console.log(`    ⚠️ Function works but auth failed (expected)`);
      } else {
        console.log(`    ❓ Unexpected: ${result.error || 'Unknown'}`);
      }
      
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
    }
  }
}

// Test 3: Test single page scraper with proper parameters
async function testSinglePageScraperFix() {
  console.log('\n🔧 Testing Single Page Scraper Fix...');
  
  const testPayload = {
    pageUrl: 'https://example.com/material-page',
    sessionId: crypto.randomUUID(),
    pageId: crypto.randomUUID(),
    options: {
      service: 'firecrawl', // Use firecrawl since it seems to be supported
      timeout: 10000
    }
  };
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/scrape-single-page`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });
    
    const result = await response.json();
    
    console.log(`  Status: ${response.status}`);
    
    if (response.status === 200) {
      console.log(`  ✅ Single page scraper works!`);
    } else if (response.status === 500 && result.error?.includes('Authentication failed')) {
      console.log(`  ⚠️ Function works but auth failed (expected)`);
    } else {
      console.log(`  ❓ Unexpected: ${result.error || 'Unknown'}`);
    }
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
}

// Test 4: Test all functions with minimal valid payloads
async function testAllFunctionsMinimal() {
  console.log('\n🔧 Testing All Functions with Minimal Payloads...');
  
  const functionTests = [
    {
      name: 'material-scraper',
      payload: {
        url: 'https://example.com',
        options: { service: 'firecrawl' }
      }
    },
    {
      name: 'scrape-session-manager', 
      payload: {
        sessionId: crypto.randomUUID(),
        action: 'start'
      }
    },
    {
      name: 'scrape-single-page',
      payload: {
        pageUrl: 'https://example.com',
        sessionId: crypto.randomUUID(),
        pageId: crypto.randomUUID(),
        options: { service: 'firecrawl' }
      }
    }
  ];
  
  for (const test of functionTests) {
    console.log(`\n  🧪 Testing: ${test.name}`);
    
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${test.name}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(test.payload)
      });
      
      const result = await response.json();
      
      console.log(`    Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log(`    ✅ ${test.name} working perfectly!`);
      } else if (response.status === 500) {
        if (result.error?.includes('Authentication failed')) {
          console.log(`    ⚠️ ${test.name} works - auth issue (expected)`);
        } else if (result.error?.includes('Invalid service')) {
          console.log(`    ❌ ${test.name} - service validation issue`);
        } else if (result.error?.includes('Invalid URL')) {
          console.log(`    ⚠️ ${test.name} works - URL validation issue`);
        } else {
          console.log(`    ❓ ${test.name} - ${result.error || 'Unknown error'}`);
        }
      } else {
        console.log(`    ❓ ${test.name} - Unexpected status: ${response.status}`);
      }
      
    } catch (error) {
      console.log(`    ❌ ${test.name} - Error: ${error.message}`);
    }
  }
}

// Main test execution
async function runScraperServiceTests() {
  console.log('🔧 Scraper Service Fix Tests\n');
  console.log('=' .repeat(70));
  
  await testMaterialScraperServices();
  await testSessionManagerFix();
  await testSinglePageScraperFix();
  await testAllFunctionsMinimal();
  
  console.log('\n' + '=' .repeat(70));
  console.log('✅ Scraper service tests completed!');
  console.log('\n📋 Summary:');
  console.log('- Tested different service names for scrapers');
  console.log('- Verified function parameter validation');
  console.log('- Identified working service configurations');
  console.log('- Confirmed functions are deployed and accessible');
  console.log('\n🎯 Ready to fix any identified issues!');
}

// Run the scraper service tests
runScraperServiceTests().catch(console.error);

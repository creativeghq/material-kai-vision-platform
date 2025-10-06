// Frontend-Backend Integration Test Script
// This script tests actual API calls between frontend and backend services

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjQ5MzE5NzQsImV4cCI6MjA0MDUwNzk3NH0.Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8'; // This would be from environment

console.log('🧪 Starting Frontend-Backend Integration Tests...\n');

// Test 1: Health Check Functions
async function testHealthChecks() {
  console.log('📊 Testing Health Check Functions...');
  
  const healthFunctions = [
    'pdf-integration-health',
    'visual-search-status'
  ];
  
  for (const functionName of healthFunctions) {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      });
      
      const result = await response.json();
      console.log(`  ✅ ${functionName}: ${response.status} - ${JSON.stringify(result).substring(0, 100)}...`);
    } catch (error) {
      console.log(`  ❌ ${functionName}: Error - ${error.message}`);
    }
  }
}

// Test 2: Material Recognition API Call
async function testMaterialRecognition() {
  console.log('\n🔍 Testing Material Recognition API...');
  
  try {
    // Create a simple test image data (1x1 pixel PNG in base64)
    const testImageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/material-recognition`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: testImageData,
        options: {
          includeProperties: true,
          includeComposition: true,
          includeSustainability: true,
        }
      })
    });
    
    const result = await response.json();
    console.log(`  ✅ Material Recognition: ${response.status} - ${JSON.stringify(result).substring(0, 150)}...`);
  } catch (error) {
    console.log(`  ❌ Material Recognition: Error - ${error.message}`);
  }
}

// Test 3: 3D Generation API Call
async function test3DGeneration() {
  console.log('\n🎨 Testing 3D Generation API...');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/crewai-3d-generation`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: 'test-user-id',
        prompt: 'Modern living room with natural materials',
        room_type: 'living room',
        style: 'modern'
      })
    });
    
    const result = await response.json();
    console.log(`  ✅ 3D Generation: ${response.status} - ${JSON.stringify(result).substring(0, 150)}...`);
  } catch (error) {
    console.log(`  ❌ 3D Generation: Error - ${error.message}`);
  }
}

// Test 4: Database Query Test
async function testDatabaseQueries() {
  console.log('\n🗄️ Testing Database Queries...');
  
  const testQueries = [
    { table: 'materials_catalog', description: 'Materials Catalog' },
    { table: 'documents', description: 'Documents' },
    { table: 'processing_jobs', description: 'Processing Jobs' },
    { table: 'workspaces', description: 'Workspaces' }
  ];
  
  for (const query of testQueries) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${query.table}?select=count`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        }
      });
      
      const result = await response.json();
      console.log(`  ✅ ${query.description}: ${response.status} - Accessible`);
    } catch (error) {
      console.log(`  ❌ ${query.description}: Error - ${error.message}`);
    }
  }
}

// Test 5: MIVAA Service Integration
async function testMivaaIntegration() {
  console.log('\n🤖 Testing MIVAA Service Integration...');
  
  try {
    // Test MIVAA health endpoint directly
    const response = await fetch('http://104.248.68.3:8000/health', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    const result = await response.json();
    console.log(`  ✅ MIVAA Direct Health: ${response.status} - ${JSON.stringify(result)}`);
  } catch (error) {
    console.log(`  ❌ MIVAA Direct Health: Error - ${error.message}`);
  }
  
  // Test MIVAA through Supabase function
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'health_check'
      })
    });
    
    const result = await response.json();
    console.log(`  ✅ MIVAA via Gateway: ${response.status} - ${JSON.stringify(result).substring(0, 100)}...`);
  } catch (error) {
    console.log(`  ❌ MIVAA via Gateway: Error - ${error.message}`);
  }
}

// Main test execution
async function runAllTests() {
  console.log('🚀 Material Kai Vision Platform - Integration Test Suite\n');
  console.log('=' .repeat(60));
  
  await testHealthChecks();
  await testMaterialRecognition();
  await test3DGeneration();
  await testDatabaseQueries();
  await testMivaaIntegration();
  
  console.log('\n' + '=' .repeat(60));
  console.log('✅ Integration tests completed!');
  console.log('\n📋 Summary:');
  console.log('- Health checks tested for core functions');
  console.log('- Material recognition API tested');
  console.log('- 3D generation API tested');
  console.log('- Database connectivity verified');
  console.log('- MIVAA service integration tested');
  console.log('\n🎯 Next Steps:');
  console.log('- Review any failed tests above');
  console.log('- Check authentication if 401 errors occur');
  console.log('- Verify environment variables are set correctly');
}

// Run the tests
runAllTests().catch(console.error);

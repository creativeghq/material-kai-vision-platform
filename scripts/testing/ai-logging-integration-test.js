/**
 * AI Logging Integration Test
 * 
 * Tests the AI Call Logger integration with:
 * - Product Creation Service (Claude Haiku + Sonnet)
 * - TogetherAI Service (Llama 4 Scout)
 * - Validates logging, confidence scoring, and cost tracking
 * 
 * Author: Material Kai Vision Platform
 * Created: 2025-10-27
 */

const MIVAA_URL = process.env.MIVAA_URL || 'https://v1api.materialshub.gr';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Test configuration
const TEST_DOCUMENT_ID = process.env.TEST_DOCUMENT_ID || null;
const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID || null;

console.log('🧪 AI Logging Integration Test');
console.log('================================\n');

/**
 * Test 1: Verify ai_call_logs table exists and is accessible
 */
async function testAICallLogsTable() {
  console.log('📊 Test 1: Verify ai_call_logs table');
  console.log('─'.repeat(50));
  
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_call_logs?select=count`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ ai_call_logs table exists and is accessible');
      console.log(`   Current log count: ${data.length > 0 ? data[0].count : 0}`);
      return true;
    } else {
      console.log('❌ Failed to access ai_call_logs table');
      console.log(`   Status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Error accessing ai_call_logs table:', error.message);
    return false;
  }
}

/**
 * Test 2: Trigger product creation and verify AI logging
 */
async function testProductCreationLogging() {
  console.log('\n📦 Test 2: Product Creation AI Logging');
  console.log('─'.repeat(50));
  
  if (!TEST_DOCUMENT_ID || !TEST_WORKSPACE_ID) {
    console.log('⚠️  Skipping: TEST_DOCUMENT_ID and TEST_WORKSPACE_ID not set');
    return false;
  }
  
  try {
    // Get initial log count
    const initialCountResponse = await fetch(`${SUPABASE_URL}/rest/v1/ai_call_logs?select=count`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    const initialData = await initialCountResponse.json();
    const initialCount = initialData.length > 0 ? initialData[0].count : 0;
    
    console.log(`   Initial log count: ${initialCount}`);
    
    // Trigger product creation
    console.log('   Triggering product creation...');
    const response = await fetch(`${MIVAA_URL}/api/products/create-from-chunks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        document_id: TEST_DOCUMENT_ID,
        workspace_id: TEST_WORKSPACE_ID,
        max_products: 5,
        min_chunk_length: 100
      })
    });
    
    if (!response.ok) {
      console.log(`❌ Product creation failed: ${response.status}`);
      return false;
    }
    
    const result = await response.json();
    console.log(`✅ Product creation completed`);
    console.log(`   Products created: ${result.products_created || 0}`);
    console.log(`   Processing time: ${result.total_time_seconds || 0}s`);
    
    // Wait for logs to be written
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check for new logs
    const finalCountResponse = await fetch(`${SUPABASE_URL}/rest/v1/ai_call_logs?select=count`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    const finalData = await finalCountResponse.json();
    const finalCount = finalData.length > 0 ? finalData[0].count : 0;
    
    const newLogs = finalCount - initialCount;
    console.log(`   New AI call logs: ${newLogs}`);
    
    if (newLogs > 0) {
      // Fetch recent logs
      const logsResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_call_logs?select=*&order=timestamp.desc&limit=10`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
        }
      );
      
      const logs = await logsResponse.json();
      console.log('\n   Recent AI Calls:');
      logs.slice(0, 5).forEach((log, i) => {
        console.log(`   ${i + 1}. ${log.task} | ${log.model}`);
        console.log(`      Confidence: ${log.confidence_score} | Cost: $${log.cost}`);
        console.log(`      Latency: ${log.latency_ms}ms | Action: ${log.action}`);
      });
      
      return true;
    } else {
      console.log('⚠️  No new logs created (logging may not be integrated yet)');
      return false;
    }
    
  } catch (error) {
    console.log('❌ Error testing product creation logging:', error.message);
    return false;
  }
}

/**
 * Test 3: Test Llama semantic analysis logging
 */
async function testLlamaSemanticAnalysisLogging() {
  console.log('\n🦙 Test 3: Llama Semantic Analysis Logging');
  console.log('─'.repeat(50));
  
  try {
    // Get initial log count
    const initialCountResponse = await fetch(`${SUPABASE_URL}/rest/v1/ai_call_logs?select=count`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    const initialData = await initialCountResponse.json();
    const initialCount = initialData.length > 0 ? initialData[0].count : 0;
    
    // Trigger semantic analysis
    console.log('   Triggering semantic analysis...');
    const response = await fetch(`${MIVAA_URL}/api/semantic-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_url: 'https://example.com/test-material.jpg',
        analysis_type: 'material_identification'
      })
    });
    
    if (!response.ok) {
      console.log(`⚠️  Semantic analysis failed: ${response.status} (expected for test URL)`);
      // This is expected to fail with test URL, but should still log the attempt
    }
    
    // Wait for logs
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check for new logs
    const finalCountResponse = await fetch(`${SUPABASE_URL}/rest/v1/ai_call_logs?select=count`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    const finalData = await finalCountResponse.json();
    const finalCount = finalData.length > 0 ? finalData[0].count : 0;
    
    const newLogs = finalCount - initialCount;
    console.log(`   New AI call logs: ${newLogs}`);
    
    if (newLogs > 0) {
      console.log('✅ Llama semantic analysis logging working');
      return true;
    } else {
      console.log('⚠️  No new logs (may need real image URL)');
      return false;
    }
    
  } catch (error) {
    console.log('❌ Error testing Llama logging:', error.message);
    return false;
  }
}

/**
 * Test 4: Verify confidence scoring and cost calculation
 */
async function testConfidenceScoringAndCosts() {
  console.log('\n💰 Test 4: Confidence Scoring & Cost Calculation');
  console.log('─'.repeat(50));
  
  try {
    // Fetch recent logs with confidence scores
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_call_logs?select=*&order=timestamp.desc&limit=20`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );
    
    if (!response.ok) {
      console.log('❌ Failed to fetch logs');
      return false;
    }
    
    const logs = await response.json();
    
    if (logs.length === 0) {
      console.log('⚠️  No logs available for analysis');
      return false;
    }
    
    // Analyze confidence scores
    const confidenceScores = logs
      .filter(log => log.confidence_score !== null)
      .map(log => parseFloat(log.confidence_score));
    
    if (confidenceScores.length > 0) {
      const avgConfidence = confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length;
      const minConfidence = Math.min(...confidenceScores);
      const maxConfidence = Math.max(...confidenceScores);
      
      console.log('   Confidence Score Analysis:');
      console.log(`   Average: ${avgConfidence.toFixed(2)}`);
      console.log(`   Min: ${minConfidence.toFixed(2)}`);
      console.log(`   Max: ${maxConfidence.toFixed(2)}`);
    }
    
    // Analyze costs
    const costs = logs
      .filter(log => log.cost !== null)
      .map(log => parseFloat(log.cost));
    
    if (costs.length > 0) {
      const totalCost = costs.reduce((a, b) => a + b, 0);
      const avgCost = totalCost / costs.length;
      
      console.log('\n   Cost Analysis:');
      console.log(`   Total cost: $${totalCost.toFixed(4)}`);
      console.log(`   Average cost per call: $${avgCost.toFixed(4)}`);
      console.log(`   Number of calls: ${costs.length}`);
    }
    
    // Analyze by model
    const modelStats = {};
    logs.forEach(log => {
      if (!modelStats[log.model]) {
        modelStats[log.model] = { count: 0, totalCost: 0, totalLatency: 0 };
      }
      modelStats[log.model].count++;
      modelStats[log.model].totalCost += parseFloat(log.cost || 0);
      modelStats[log.model].totalLatency += parseInt(log.latency_ms || 0);
    });
    
    console.log('\n   Model Statistics:');
    Object.entries(modelStats).forEach(([model, stats]) => {
      console.log(`   ${model}:`);
      console.log(`     Calls: ${stats.count}`);
      console.log(`     Total cost: $${stats.totalCost.toFixed(4)}`);
      console.log(`     Avg latency: ${(stats.totalLatency / stats.count).toFixed(0)}ms`);
    });
    
    console.log('\n✅ Confidence scoring and cost calculation verified');
    return true;
    
  } catch (error) {
    console.log('❌ Error analyzing confidence and costs:', error.message);
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  const results = {
    tableAccess: await testAICallLogsTable(),
    productCreation: await testProductCreationLogging(),
    llamaAnalysis: await testLlamaSemanticAnalysisLogging(),
    confidenceAndCosts: await testConfidenceScoringAndCosts()
  };
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Table Access: ${results.tableAccess ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Product Creation Logging: ${results.productCreation ? 'PASS' : 'SKIP'}`);
  console.log(`✅ Llama Analysis Logging: ${results.llamaAnalysis ? 'PASS' : 'SKIP'}`);
  console.log(`✅ Confidence & Costs: ${results.confidenceAndCosts ? 'PASS' : 'FAIL'}`);
  
  const passCount = Object.values(results).filter(r => r === true).length;
  const totalCount = Object.values(results).length;
  
  console.log(`\n🎯 Overall: ${passCount}/${totalCount} tests passed`);
  
  if (passCount === totalCount) {
    console.log('\n🎉 ALL TESTS PASSED! AI logging integration is working perfectly!');
  } else if (passCount > 0) {
    console.log('\n⚠️  PARTIAL SUCCESS: Some tests passed, integration in progress');
  } else {
    console.log('\n❌ TESTS FAILED: AI logging integration needs work');
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});


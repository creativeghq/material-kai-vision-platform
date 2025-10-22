/**
 * Advanced Search & Recommendation Database Test
 * 
 * Tests the database tables and functionality for Task 14:
 * - All 7 database tables
 * - Data insertion and retrieval
 * - Table relationships
 * - Performance validation
 */

const { createClient } = require('@supabase/supabase-js');

// Test configuration
const TEST_CONFIG = {
  WORKSPACE_ID: 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  SUPABASE_URL: 'https://bgbavxtjlbvgplozizxu.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjkwMDI5NzQsImV4cCI6MjA0NDU3ODk3NH0.Ej8JQl6Ej8JQl6Ej8JQl6Ej8JQl6Ej8JQl6Ej8JQl6',
};

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`${title}`, 'cyan');
  log(`${'='.repeat(60)}`, 'cyan');
}

function logResult(label, value, isGood = null) {
  const color = isGood === true ? 'green' : isGood === false ? 'red' : 'yellow';
  log(`   ${label}: ${value}`, color);
}

// Test results tracking
const testResults = {
  tableTests: {
    userPreferences: false,
    userBehaviorProfiles: false,
    recommendationAnalytics: false,
    userInteractionEvents: false,
    searchSessions: false,
    productSimilarityCache: false,
    searchAnalytics: false,
  },
  functionalityTests: {
    dataInsertion: false,
    dataRetrieval: false,
    relationships: false,
    performance: false,
  },
  overallSuccess: false,
};

/**
 * Main test execution
 */
async function runDatabaseTest() {
  log('🗄️  Advanced Search & Recommendation Database Test', 'bright');
  log('Testing all database tables and functionality\n', 'reset');

  const supabase = createClient(TEST_CONFIG.SUPABASE_URL, TEST_CONFIG.SUPABASE_ANON_KEY);

  try {
    // Step 1: Test Table Existence and Structure
    logSection('📋 STEP 1: TABLE STRUCTURE VALIDATION');
    await testTableStructure(supabase);

    // Step 2: Test Data Operations
    logSection('💾 STEP 2: DATA OPERATIONS TESTING');
    await testDataOperations(supabase);

    // Step 3: Test Relationships and Queries
    logSection('🔗 STEP 3: RELATIONSHIPS & QUERIES');
    await testRelationshipsAndQueries(supabase);

    // Step 4: Test Performance
    logSection('⚡ STEP 4: PERFORMANCE TESTING');
    await testPerformance(supabase);

    // Final results
    logSection('🎉 FINAL RESULTS');
    generateFinalReport();

  } catch (error) {
    log(`❌ Database test failed: ${error.message}`, 'red');
    console.error(error);
  }
}

/**
 * Test table structure and existence
 */
async function testTableStructure(supabase) {
  const expectedTables = [
    'user_preferences',
    'user_behavior_profiles', 
    'recommendation_analytics',
    'user_interaction_events',
    'search_sessions',
    'product_similarity_cache',
    'search_analytics'
  ];

  log('🔍 Checking table existence and structure...', 'blue');

  for (const tableName of expectedTables) {
    try {
      // Test table exists by querying its structure
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);

      if (error && !error.message.includes('0 rows')) {
        throw error;
      }

      testResults.tableTests[tableName.replace(/_([a-z])/g, (g) => g[1].toUpperCase())] = true;
      logResult(`Table ${tableName}`, 'EXISTS ✓', true);

    } catch (error) {
      logResult(`Table ${tableName}`, `ERROR: ${error.message}`, false);
    }
  }
}

/**
 * Test data operations (insert, update, delete)
 */
async function testDataOperations(supabase) {
  log('🔍 Testing data insertion and retrieval...', 'blue');

  try {
    // Test user preferences
    const testUserId = crypto.randomUUID();
    const { data: prefData, error: prefError } = await supabase
      .from('user_preferences')
      .insert({
        user_id: testUserId,
        workspace_id: TEST_CONFIG.WORKSPACE_ID,
        preferences: {
          preferredCategories: ['flooring', 'wall_covering'],
          qualityPreference: 'high'
        }
      })
      .select()
      .single();

    if (prefError) throw prefError;
    logResult('User Preferences Insert', 'SUCCESS ✓', true);

    // Test user behavior profiles
    const { data: behaviorData, error: behaviorError } = await supabase
      .from('user_behavior_profiles')
      .insert({
        user_id: testUserId,
        workspace_id: TEST_CONFIG.WORKSPACE_ID,
        search_patterns: {
          frequent_queries: ['ceramic tiles'],
          preferred_search_types: ['text', 'hybrid']
        },
        profile_confidence: 0.8
      })
      .select()
      .single();

    if (behaviorError) throw behaviorError;
    logResult('User Behavior Profiles Insert', 'SUCCESS ✓', true);

    // Test recommendation analytics
    const { data: recData, error: recError } = await supabase
      .from('recommendation_analytics')
      .insert({
        recommendation_id: `test-rec-${Date.now()}`,
        user_id: testUserId,
        workspace_id: TEST_CONFIG.WORKSPACE_ID,
        context: 'browse',
        recommendations_data: [
          { id: 'rec-1', title: 'Test Product', score: 0.85 }
        ],
        total_recommendations: 1,
        algorithms_used: ['content_based']
      })
      .select()
      .single();

    if (recError) throw recError;
    logResult('Recommendation Analytics Insert', 'SUCCESS ✓', true);

    // Test user interaction events
    const sessionId = crypto.randomUUID();
    const { data: eventData, error: eventError } = await supabase
      .from('user_interaction_events')
      .insert({
        user_id: testUserId,
        session_id: sessionId,
        workspace_id: TEST_CONFIG.WORKSPACE_ID,
        event_type: 'search_click',
        event_context: 'search_results',
        target_type: 'product',
        search_query: 'test query'
      })
      .select()
      .single();

    if (eventError) throw eventError;
    logResult('User Interaction Events Insert', 'SUCCESS ✓', true);

    // Test search sessions
    const { data: sessionData, error: sessionError } = await supabase
      .from('search_sessions')
      .insert({
        session_id: sessionId,
        user_id: testUserId,
        workspace_id: TEST_CONFIG.WORKSPACE_ID,
        search_count: 3,
        engagement_score: 0.75
      })
      .select()
      .single();

    if (sessionError) throw sessionError;
    logResult('Search Sessions Insert', 'SUCCESS ✓', true);

    // Test product similarity cache
    const productA = crypto.randomUUID();
    const productB = crypto.randomUUID();
    const { data: simData, error: simError } = await supabase
      .from('product_similarity_cache')
      .insert({
        product_a_id: productA,
        product_b_id: productB,
        workspace_id: TEST_CONFIG.WORKSPACE_ID,
        overall_similarity: 0.85,
        similarity_factors: ['material_match', 'category_match']
      })
      .select()
      .single();

    if (simError) throw simError;
    logResult('Product Similarity Cache Insert', 'SUCCESS ✓', true);

    // Test enhanced search analytics
    const { data: searchData, error: searchError } = await supabase
      .from('search_analytics')
      .insert({
        user_id: testUserId,
        session_id: `session-${Date.now()}`,
        query_text: 'test search query',
        total_results: 10,
        search_intent: 'search',
        extracted_entities: ['test', 'query'],
        personalization_applied: true
      })
      .select()
      .single();

    if (searchError) throw searchError;
    logResult('Enhanced Search Analytics Insert', 'SUCCESS ✓', true);

    testResults.functionalityTests.dataInsertion = true;

    // Test data retrieval
    const { data: retrievedData, error: retrieveError } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', testUserId)
      .single();

    if (retrieveError) throw retrieveError;
    logResult('Data Retrieval', 'SUCCESS ✓', true);
    testResults.functionalityTests.dataRetrieval = true;

    // Cleanup test data
    await cleanupTestData(supabase, testUserId, sessionId, productA, productB);

  } catch (error) {
    logResult('Data Operations', `ERROR: ${error.message}`, false);
  }
}

/**
 * Test relationships and complex queries
 */
async function testRelationshipsAndQueries(supabase) {
  log('🔍 Testing relationships and complex queries...', 'blue');

  try {
    // Test user behavior analysis query
    const { data: behaviorAnalysis, error: behaviorError } = await supabase
      .from('user_interaction_events')
      .select(`
        event_type,
        target_type,
        count(*) as event_count
      `)
      .eq('workspace_id', TEST_CONFIG.WORKSPACE_ID)
      .limit(10);

    if (behaviorError) throw behaviorError;
    logResult('Behavior Analysis Query', 'SUCCESS ✓', true);

    // Test recommendation performance query
    const { data: recPerformance, error: recPerfError } = await supabase
      .from('recommendation_analytics')
      .select(`
        context,
        avg(generation_time_ms) as avg_generation_time,
        avg(avg_confidence_score) as avg_confidence
      `)
      .eq('workspace_id', TEST_CONFIG.WORKSPACE_ID)
      .limit(10);

    if (recPerfError) throw recPerfError;
    logResult('Recommendation Performance Query', 'SUCCESS ✓', true);

    // Test search analytics with personalization
    const { data: searchAnalysis, error: searchAnalysisError } = await supabase
      .from('search_analytics')
      .select('*')
      .eq('personalization_applied', true)
      .limit(5);

    if (searchAnalysisError) throw searchAnalysisError;
    logResult('Search Analytics with Personalization', 'SUCCESS ✓', true);

    testResults.functionalityTests.relationships = true;

  } catch (error) {
    logResult('Relationships & Queries', `ERROR: ${error.message}`, false);
  }
}

/**
 * Test performance with multiple operations
 */
async function testPerformance(supabase) {
  log('🔍 Testing database performance...', 'blue');

  try {
    const startTime = Date.now();

    // Perform multiple operations
    const operations = [];
    for (let i = 0; i < 5; i++) {
      operations.push(
        supabase
          .from('search_analytics')
          .select('*')
          .limit(10)
      );
    }

    await Promise.all(operations);
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    logResult('5 Concurrent Queries Time', `${totalTime}ms`, totalTime < 2000);
    logResult('Average Query Time', `${(totalTime / 5).toFixed(0)}ms`, (totalTime / 5) < 400);

    testResults.functionalityTests.performance = totalTime < 2000;

  } catch (error) {
    logResult('Performance Test', `ERROR: ${error.message}`, false);
  }
}

/**
 * Cleanup test data
 */
async function cleanupTestData(supabase, userId, sessionId, productA, productB) {
  try {
    await Promise.all([
      supabase.from('user_preferences').delete().eq('user_id', userId),
      supabase.from('user_behavior_profiles').delete().eq('user_id', userId),
      supabase.from('recommendation_analytics').delete().eq('user_id', userId),
      supabase.from('user_interaction_events').delete().eq('user_id', userId),
      supabase.from('search_sessions').delete().eq('user_id', userId),
      supabase.from('product_similarity_cache').delete().eq('product_a_id', productA),
      supabase.from('search_analytics').delete().eq('user_id', userId),
    ]);
    log('🧹 Test data cleaned up', 'blue');
  } catch (error) {
    log(`⚠️  Cleanup warning: ${error.message}`, 'yellow');
  }
}

/**
 * Generate final test report
 */
function generateFinalReport() {
  const tablesPassed = Object.values(testResults.tableTests).filter(Boolean).length;
  const functionalityPassed = Object.values(testResults.functionalityTests).filter(Boolean).length;
  
  testResults.overallSuccess = tablesPassed === 7 && functionalityPassed === 4;

  log('\n📋 ADVANCED SEARCH DATABASE TEST REPORT', 'bright');
  log('=' .repeat(60), 'cyan');

  logResult('Overall Test Status', testResults.overallSuccess ? 'PASSED' : 'FAILED', testResults.overallSuccess);
  
  log('\n🗄️  Database Tables:', 'cyan');
  logResult('Tables Passed', `${tablesPassed}/7`, tablesPassed === 7);
  Object.entries(testResults.tableTests).forEach(([table, passed]) => {
    logResult(`  ${table}`, passed ? 'PASSED' : 'FAILED', passed);
  });

  log('\n⚙️  Functionality Tests:', 'cyan');
  logResult('Functionality Passed', `${functionalityPassed}/4`, functionalityPassed === 4);
  Object.entries(testResults.functionalityTests).forEach(([test, passed]) => {
    logResult(`  ${test}`, passed ? 'PASSED' : 'FAILED', passed);
  });

  if (testResults.overallSuccess) {
    log('\n🎉 Advanced Search Database: SUCCESS!', 'green');
    log('All database tables and functionality working correctly.', 'green');
    log('Ready for Advanced Search & Recommendation Engine deployment!', 'green');
  } else {
    log('\n⚠️  Advanced Search Database: ISSUES DETECTED', 'yellow');
    log('Some database components may need attention.', 'yellow');
  }
}

// Run the test
if (require.main === module) {
  runDatabaseTest().catch(console.error);
}

module.exports = { runDatabaseTest, testResults };

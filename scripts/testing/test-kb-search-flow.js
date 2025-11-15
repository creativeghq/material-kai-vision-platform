/**
 * Test Knowledge Base Search Flow
 * 
 * Validates complete search flow:
 * 1. Frontend request format
 * 2. MIVAA API response format
 * 3. Data validation
 * 4. All required fields present
 */

const MIVAA_API = 'https://v1api.materialshub.gr';
const WORKSPACE_ID = 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e';

async function testKBSearch() {
  console.log('🧪 Testing Knowledge Base Search Flow\n');
  console.log('=' .repeat(80));

  const searchTypes = ['semantic', 'full_text', 'hybrid'];
  const testQuery = 'wood materials';

  for (const searchType of searchTypes) {
    console.log(`\n📊 Testing ${searchType.toUpperCase()} search...`);
    console.log('-'.repeat(80));

    try {
      const startTime = Date.now();

      const response = await fetch(`${MIVAA_API}/api/kb/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspace_id: WORKSPACE_ID,
          query: testQuery,
          search_type: searchType,
          limit: 5,
        }),
      });

      const endTime = Date.now();
      const requestTime = endTime - startTime;

      console.log(`⏱️  Request Time: ${requestTime}ms`);
      console.log(`📡 Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`❌ Error Response:`, JSON.stringify(errorData, null, 2));
        continue;
      }

      const data = await response.json();

      // Validate response structure
      console.log(`\n✅ Response Structure:`);
      console.log(`   - results: ${Array.isArray(data.results) ? 'Array' : typeof data.results}`);
      console.log(`   - search_time_ms: ${typeof data.search_time_ms} (${data.search_time_ms}ms)`);
      console.log(`   - total_results: ${typeof data.total_results} (${data.total_results})`);

      if (!Array.isArray(data.results)) {
        console.error(`❌ VALIDATION FAILED: results is not an array!`);
        continue;
      }

      console.log(`\n📄 Results: ${data.results.length} documents found`);

      // Validate each result has required fields
      const requiredFields = [
        'id', 'workspace_id', 'title', 'content', 'status', 
        'visibility', 'embedding_status', 'created_at', 'updated_at', 'view_count'
      ];

      const optionalFields = ['summary', 'category_id', 'embedding_generated_at', 'created_by', 'similarity'];

      if (data.results.length > 0) {
        console.log(`\n🔍 Validating first result...`);
        const firstResult = data.results[0];

        // Check required fields
        const missingFields = requiredFields.filter(field => !(field in firstResult));
        if (missingFields.length > 0) {
          console.error(`❌ MISSING REQUIRED FIELDS: ${missingFields.join(', ')}`);
        } else {
          console.log(`✅ All required fields present`);
        }

        // Show field values
        console.log(`\n📋 First Result Fields:`);
        console.log(`   - id: ${firstResult.id}`);
        console.log(`   - title: ${firstResult.title}`);
        console.log(`   - status: ${firstResult.status}`);
        console.log(`   - embedding_status: ${firstResult.embedding_status}`);
        console.log(`   - view_count: ${firstResult.view_count}`);
        console.log(`   - created_at: ${firstResult.created_at}`);
        if (firstResult.similarity !== undefined) {
          console.log(`   - similarity: ${firstResult.similarity}`);
        }
        if (firstResult.summary) {
          console.log(`   - summary: ${firstResult.summary.substring(0, 50)}...`);
        }

        // Show all available fields
        console.log(`\n🔑 All Fields in Response:`);
        console.log(`   ${Object.keys(firstResult).join(', ')}`);
      }

      console.log(`\n✅ ${searchType.toUpperCase()} search completed successfully`);

    } catch (error) {
      console.error(`❌ ${searchType.toUpperCase()} search failed:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('🏁 Test Complete\n');
}

// Run the test
testKBSearch().catch(console.error);


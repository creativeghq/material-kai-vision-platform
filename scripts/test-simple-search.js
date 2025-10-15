#!/usr/bin/env node

/**
 * TEST SIMPLE SEARCH
 * Test a simple search and check logs
 */

import https from 'https';

const BASE_URL = 'https://v1api.materialshub.gr';

function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data, headers: res.headers });
                }
            });
        });
        
        req.on('error', reject);
        
        if (options.body) {
            req.write(options.body);
        }
        
        req.end();
    });
}

async function testSimpleSearch() {
    console.log('🔍 TEST SIMPLE SEARCH');
    console.log('==================================================');
    
    try {
        const documentId = '8a56997b-bcdb-4ad5-a240-08bf27e01a93';
        
        console.log('\n1. Testing simple search...');
        
        const searchPayload = {
            query: "dummy",
            document_ids: [documentId],
            max_results: 5,
            similarity_threshold: 0.0
        };
        
        console.log(`   Payload: ${JSON.stringify(searchPayload)}`);
        
        const searchResponse = await makeRequest(`${BASE_URL}/api/search/semantic`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(searchPayload)
        });
        
        console.log(`   Status: ${searchResponse.status}`);
        console.log(`   Response: ${JSON.stringify(searchResponse.data, null, 2)}`);
        
        if (searchResponse.status === 200) {
            const results = searchResponse.data.results || [];
            console.log(`   Results found: ${results.length}`);
            
            if (results.length > 0) {
                console.log('\n✅ SEARCH IS WORKING!');
                results.forEach((result, idx) => {
                    console.log(`   Result ${idx + 1}:`);
                    console.log(`     - Score: ${result.score?.toFixed(4) || 'N/A'}`);
                    console.log(`     - Content: "${result.content?.substring(0, 50) || 'N/A'}..."`);
                    console.log(`     - Document ID: ${result.document_id || 'N/A'}`);
                });
            } else {
                console.log('\n⚠️ No results found');
                console.log('   This indicates the search is working but not finding matches');
            }
        } else {
            console.log(`\n❌ Search failed with status: ${searchResponse.status}`);
        }
        
    } catch (error) {
        console.log(`❌ Test error: ${error.message}`);
    }
}

testSimpleSearch().catch(console.error);

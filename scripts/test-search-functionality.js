#!/usr/bin/env node

/**
 * TEST SEARCH FUNCTIONALITY
 * Tests all possible search endpoints
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
        req.end();
    });
}

async function testSearchFunctionality() {
    console.log('🔍 TESTING SEARCH FUNCTIONALITY');
    console.log('==================================================');
    
    // Test different search endpoints
    const searchEndpoints = [
        '/api/search',
        '/api/documents/search',
        '/api/knowledge-base/search',
        '/api/search/documents',
        '/api/search/chunks',
        '/api/search/images',
        '/api/rag/search'
    ];
    
    const searchQueries = ['material', 'dummy', 'page'];
    
    for (const query of searchQueries) {
        console.log(`\n🔍 Testing search query: "${query}"`);
        
        for (const endpoint of searchEndpoints) {
            try {
                const url = `${BASE_URL}${endpoint}?q=${encodeURIComponent(query)}`;
                const response = await makeRequest(url);
                
                console.log(`   ${endpoint}: ${response.status}`);
                
                if (response.status === 200) {
                    if (response.data && response.data.data) {
                        console.log(`   ✅ Found ${response.data.data.length} results`);
                        if (response.data.data.length > 0) {
                            const firstResult = response.data.data[0];
                            console.log(`   📄 Sample: ${JSON.stringify(firstResult).substring(0, 100)}...`);
                        }
                    } else {
                        console.log(`   ✅ Response: ${JSON.stringify(response.data).substring(0, 100)}...`);
                    }
                } else if (response.status === 404) {
                    console.log(`   ❌ Not found`);
                } else if (response.status === 500) {
                    console.log(`   ❌ Server error`);
                } else {
                    console.log(`   ⚠️ Status: ${response.status}`);
                }
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }
        }
    }
    
    console.log('\n🎉 SEARCH FUNCTIONALITY TEST COMPLETE!');
}

testSearchFunctionality().catch(console.error);

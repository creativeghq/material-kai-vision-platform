#!/usr/bin/env node

/**
 * SEARCH VARIATIONS: VALENOVA
 * Test different search variations to demonstrate search capabilities
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

async function searchVariations() {
    console.log('🔍 SEARCH VARIATIONS: VALENOVA');
    console.log('==================================================');
    
    const searchQueries = [
        "VALENOVA",
        "SG NY", 
        "ceramic tile",
        "material properties",
        "installation"
    ];
    
    try {
        for (let i = 0; i < searchQueries.length; i++) {
            const query = searchQueries[i];
            console.log(`\n${i + 1}. Searching for "${query}"...`);
            
            const searchPayload = {
                query: query,
                max_results: 3,
                similarity_threshold: 0.1
            };
            
            const searchResponse = await makeRequest(`${BASE_URL}/api/search/semantic`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(searchPayload)
            });
            
            if (searchResponse.status === 200) {
                const results = searchResponse.data.results || [];
                console.log(`   ✅ Found ${results.length} results`);
                
                if (results.length > 0) {
                    const bestResult = results[0];
                    console.log(`   🎯 Best match: ${bestResult.score?.toFixed(4)} (${(bestResult.score * 100).toFixed(1)}%)`);
                    console.log(`   📝 Content: "${bestResult.content?.substring(0, 80)}..."`);
                    if (bestResult.metadata?.original_filename) {
                        console.log(`   📁 File: ${bestResult.metadata.original_filename}`);
                    }
                } else {
                    console.log(`   ⚠️ No results above threshold`);
                }
            } else {
                console.log(`   ❌ Search failed: ${searchResponse.status}`);
            }
        }
        
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

searchVariations().catch(console.error);

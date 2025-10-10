#!/usr/bin/env node

/**
 * Quick test script for key endpoints we fixed
 */

// Using built-in fetch (Node.js 18+)

const BASE_URL = 'http://104.248.68.3:8000';

const KEY_ENDPOINTS = [
    {
        path: '/api/images/analyze',
        method: 'POST',
        payload: { image_url: 'https://example.com/test.jpg', analysis_types: ['description'] }
    },
    {
        path: '/api/images/analyze/batch',
        method: 'POST',
        payload: { image_ids: ['4432363c-9f58-4128-ad3e-5ea49d7952d8', 'dc5a46d7-7fbb-4028-bfc0-1e97bdabd568'], analysis_types: ['description', 'ocr'] }
    },
    {
        path: '/api/images/search',
        method: 'POST',
        payload: { query_description: 'carbon fiber material', limit: 5, similarity_threshold: 0.7 }
    },
    {
        path: '/api/images/health',
        method: 'GET'
    },
    {
        path: '/api/documents/health',
        method: 'GET'
    },
    {
        path: '/health',
        method: 'GET'
    }
];

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testEndpoint(endpoint) {
    try {
        const url = `${BASE_URL}${endpoint.path}`;
        const options = {
            method: endpoint.method,
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 10000
        };

        if (endpoint.payload) {
            options.body = JSON.stringify(endpoint.payload);
        }

        console.log(`🧪 Testing: ${endpoint.method} ${endpoint.path}`);
        const startTime = Date.now();
        const response = await fetch(url, options);
        const duration = Date.now() - startTime;

        if (response.ok) {
            console.log(`  ✅ ${endpoint.method} ${endpoint.path} (${duration}ms)`);
            return true;
        } else {
            console.log(`  ❌ ${endpoint.method} ${endpoint.path} (${duration}ms) - Status: ${response.status}`);
            return false;
        }
    } catch (error) {
        console.log(`  ❌ ${endpoint.method} ${endpoint.path} - Error: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log('🚀 TESTING KEY ENDPOINTS');
    console.log('========================');
    console.log(`🎯 MIVAA Service: ${BASE_URL}`);
    console.log('========================\n');

    let passed = 0;
    let total = KEY_ENDPOINTS.length;

    for (const endpoint of KEY_ENDPOINTS) {
        const success = await testEndpoint(endpoint);
        if (success) passed++;
        
        // Wait between requests to avoid overwhelming server
        await sleep(2000);
    }

    console.log('\n📊 RESULTS');
    console.log('==========');
    console.log(`✅ Passed: ${passed}/${total} (${((passed/total)*100).toFixed(1)}%)`);
    
    if (passed === total) {
        console.log('🎉 ALL KEY ENDPOINTS WORKING PERFECTLY! 🎉');
    } else {
        console.log(`❌ ${total - passed} endpoints still need attention`);
    }
}

main().catch(console.error);

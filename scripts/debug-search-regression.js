#!/usr/bin/env node

/**
 * DEBUG SEARCH REGRESSION
 * Check why search stopped returning harmony results
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

async function debugSearchRegression() {
    console.log('🔍 DEBUGGING SEARCH REGRESSION');
    console.log('==================================================');
    
    try {
        console.log('\n📊 STEP 1: TEST BASIC SEARCH');
        console.log('--------------------------------------------------');
        
        const basicSearch = await makeRequest(`${BASE_URL}/api/search/semantic`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: "test",
                max_results: 10,
                similarity_threshold: 0.0
            })
        });
        
        console.log(`📊 Basic search status: ${basicSearch.status}`);
        
        if (basicSearch.status === 200) {
            const results = basicSearch.data.results || [];
            console.log(`📄 Total results: ${results.length}`);
            
            if (results.length > 0) {
                console.log('\n📋 CURRENT SEARCH RESULTS:');
                results.forEach((result, idx) => {
                    console.log(`   ${idx + 1}. Score: ${result.score?.toFixed(4)}`);
                    console.log(`      File: ${result.metadata?.original_filename || 'N/A'}`);
                    console.log(`      Content: "${result.content?.substring(0, 100)}..."`);
                });
                
                // Check for harmony content
                const harmonyResults = results.filter(r => 
                    r.metadata?.original_filename?.includes('harmony') ||
                    r.content?.toLowerCase().includes('harmony')
                );
                
                console.log(`\n📚 Harmony results: ${harmonyResults.length}`);
                
                if (harmonyResults.length === 0) {
                    console.log('❌ REGRESSION: Harmony content no longer in search results');
                }
            } else {
                console.log('❌ CRITICAL: No search results at all');
            }
        } else {
            console.log(`❌ Search API failed: ${basicSearch.status}`);
            console.log(`   Response: ${JSON.stringify(basicSearch.data, null, 2)}`);
        }
        
        console.log('\n📊 STEP 2: CHECK DOCUMENT VECTORS TABLE');
        console.log('--------------------------------------------------');
        
        // Try to get documents that should have vectors
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/documents?limit=20`);
        
        if (docsResponse.status === 200) {
            const docs = docsResponse.data.documents || docsResponse.data || [];
            console.log(`📄 Documents in API: ${docs.length}`);
            
            docs.forEach((doc, idx) => {
                console.log(`   ${idx + 1}. ${doc.filename} (${doc.processing_status || 'unknown'})`);
            });
        }
        
        console.log('\n📊 STEP 3: TEST DIFFERENT SEARCH QUERIES');
        console.log('--------------------------------------------------');
        
        const testQueries = [
            "VALENOVA",
            "harmony",
            "Stacy Garcia",
            "ceramic",
            "dummy",
            "test"
        ];
        
        for (const query of testQueries) {
            const searchResponse = await makeRequest(`${BASE_URL}/api/search/semantic`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query,
                    max_results: 3,
                    similarity_threshold: 0.0
                })
            });
            
            if (searchResponse.status === 200) {
                const results = searchResponse.data.results || [];
                console.log(`🔍 "${query}": ${results.length} results`);
                
                if (results.length > 0) {
                    const bestScore = Math.max(...results.map(r => r.score || 0));
                    console.log(`   Best score: ${(bestScore * 100).toFixed(1)}%`);
                }
            } else {
                console.log(`❌ "${query}": Failed (${searchResponse.status})`);
            }
        }
        
        console.log('\n📊 STEP 4: CHECK SERVICE HEALTH');
        console.log('--------------------------------------------------');
        
        const healthResponse = await makeRequest(`${BASE_URL}/api/rag/health`);
        
        if (healthResponse.status === 200) {
            console.log('✅ RAG service healthy');
            console.log(`   Response: ${JSON.stringify(healthResponse.data, null, 2)}`);
        } else {
            console.log(`❌ RAG service unhealthy: ${healthResponse.status}`);
        }
        
        console.log('\n📊 STEP 5: CHECK JOBS STATUS');
        console.log('--------------------------------------------------');
        
        const jobsResponse = await makeRequest(`${BASE_URL}/api/jobs?limit=10`);
        
        if (jobsResponse.status === 200) {
            const jobsData = jobsResponse.data;
            console.log(`📊 Total jobs: ${jobsData.total_count || 0}`);
            console.log(`📊 Active jobs: ${jobsData.status_counts?.active || 0}`);
            console.log(`📊 Completed jobs: ${jobsData.status_counts?.completed || 0}`);
            console.log(`📊 Failed jobs: ${jobsData.status_counts?.failed || 0}`);
            
            const jobs = jobsData.jobs || [];
            if (jobs.length > 0) {
                console.log('\n📋 RECENT JOBS:');
                jobs.slice(0, 5).forEach((job, idx) => {
                    console.log(`   ${idx + 1}. ${job.id} - ${job.status} (${job.type || 'unknown'})`);
                });
            }
        }
        
    } catch (error) {
        console.log(`❌ Debug Error: ${error.message}`);
    }
    
    console.log('\n==================================================');
    console.log('🎉 SEARCH REGRESSION DEBUG COMPLETED');
    console.log('==================================================');
}

debugSearchRegression().catch(console.error);

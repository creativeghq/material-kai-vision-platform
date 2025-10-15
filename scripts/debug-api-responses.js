#!/usr/bin/env node

/**
 * DEBUG API RESPONSES
 * Shows raw API responses to understand what's happening
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
                    resolve({ status: res.statusCode, data: parsed, headers: res.headers, raw: data });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data, headers: res.headers, raw: data });
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

async function debugApiResponses() {
    console.log('🔍 DEBUG API RESPONSES');
    console.log('==================================================');
    
    // Test jobs endpoint
    console.log('\n📋 JOBS ENDPOINT:');
    try {
        const jobsResponse = await makeRequest(`${BASE_URL}/api/jobs`);
        console.log(`Status: ${jobsResponse.status}`);
        console.log(`Raw response: ${jobsResponse.raw.substring(0, 500)}...`);
        
        if (jobsResponse.data && typeof jobsResponse.data === 'object') {
            console.log(`Parsed data keys: ${Object.keys(jobsResponse.data)}`);
            
            if (jobsResponse.data.data) {
                console.log(`Jobs array length: ${jobsResponse.data.data.length}`);
                
                if (jobsResponse.data.data.length > 0) {
                    const job = jobsResponse.data.data[0];
                    console.log(`First job: ${JSON.stringify(job, null, 2)}`);
                }
            }
        }
    } catch (error) {
        console.log(`❌ Jobs endpoint error: ${error.message}`);
    }
    
    // Test documents endpoint
    console.log('\n📄 DOCUMENTS ENDPOINT:');
    try {
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/documents`);
        console.log(`Status: ${docsResponse.status}`);
        console.log(`Raw response: ${docsResponse.raw.substring(0, 500)}...`);
        
        if (docsResponse.data && typeof docsResponse.data === 'object') {
            console.log(`Parsed data keys: ${Object.keys(docsResponse.data)}`);
            
            if (docsResponse.data.data) {
                console.log(`Documents array length: ${docsResponse.data.data.length}`);
                
                if (docsResponse.data.data.length > 0) {
                    const doc = docsResponse.data.data[0];
                    console.log(`First document: ${JSON.stringify(doc, null, 2)}`);
                }
            }
        }
    } catch (error) {
        console.log(`❌ Documents endpoint error: ${error.message}`);
    }
    
    // Test health endpoint
    console.log('\n🏥 HEALTH ENDPOINT:');
    try {
        const healthResponse = await makeRequest(`${BASE_URL}/health`);
        console.log(`Status: ${healthResponse.status}`);
        console.log(`Raw response: ${healthResponse.raw}`);
    } catch (error) {
        console.log(`❌ Health endpoint error: ${error.message}`);
    }
}

debugApiResponses().catch(console.error);

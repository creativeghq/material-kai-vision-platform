#!/usr/bin/env node

/**
 * DISCOVER MIVAA ENDPOINTS
 * Find available API endpoints for processing PDFs
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

async function discoverEndpoints() {
    console.log('🔍 DISCOVERING MIVAA API ENDPOINTS');
    console.log('==================================================');
    
    try {
        console.log('\n📋 STEP 1: CHECK OPENAPI DOCUMENTATION');
        console.log('--------------------------------------------------');
        
        const docsResponse = await makeRequest(`${BASE_URL}/docs`);
        console.log(`📊 /docs endpoint: ${docsResponse.status}`);
        
        const openapiResponse = await makeRequest(`${BASE_URL}/openapi.json`);
        console.log(`📊 /openapi.json endpoint: ${openapiResponse.status}`);
        
        if (openapiResponse.status === 200) {
            const openapi = openapiResponse.data;
            console.log('\n✅ AVAILABLE API ENDPOINTS:');
            
            const paths = Object.keys(openapi.paths || {});
            paths.forEach(path => {
                const methods = Object.keys(openapi.paths[path]);
                console.log(`   ${path} [${methods.join(', ').toUpperCase()}]`);
            });
            
            // Look for document/PDF processing endpoints
            const processingEndpoints = paths.filter(path => 
                path.includes('document') || 
                path.includes('pdf') || 
                path.includes('process') ||
                path.includes('upload')
            );
            
            if (processingEndpoints.length > 0) {
                console.log('\n🎯 PDF/DOCUMENT PROCESSING ENDPOINTS:');
                processingEndpoints.forEach(endpoint => {
                    const methods = Object.keys(openapi.paths[endpoint]);
                    console.log(`   ${endpoint} [${methods.join(', ').toUpperCase()}]`);
                    
                    // Show endpoint details
                    methods.forEach(method => {
                        const operation = openapi.paths[endpoint][method];
                        if (operation.summary) {
                            console.log(`      ${method.toUpperCase()}: ${operation.summary}`);
                        }
                    });
                });
            }
        }
        
        console.log('\n📋 STEP 2: TEST COMMON ENDPOINTS');
        console.log('--------------------------------------------------');
        
        const testEndpoints = [
            '/api/documents',
            '/api/documents/upload',
            '/api/documents/process',
            '/api/upload',
            '/api/process',
            '/api/pdf/process',
            '/api/rag/process',
            '/api/jobs',
            '/api/admin/documents',
            '/api/admin/process'
        ];
        
        for (const endpoint of testEndpoints) {
            try {
                const response = await makeRequest(`${BASE_URL}${endpoint}`);
                console.log(`   ${endpoint}: ${response.status} ${response.status === 200 ? '✅' : response.status === 404 ? '❌' : '⚠️'}`);
                
                if (response.status === 200 && response.data) {
                    if (Array.isArray(response.data)) {
                        console.log(`      📊 Returns array with ${response.data.length} items`);
                    } else if (typeof response.data === 'object') {
                        const keys = Object.keys(response.data);
                        console.log(`      📊 Returns object with keys: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}`);
                    }
                }
            } catch (error) {
                console.log(`   ${endpoint}: ERROR - ${error.message}`);
            }
        }
        
        console.log('\n📋 STEP 3: CHECK ADMIN ENDPOINTS');
        console.log('--------------------------------------------------');
        
        const adminEndpoints = [
            '/api/admin/documents',
            '/api/admin/jobs',
            '/api/admin/process',
            '/api/admin/upload'
        ];
        
        for (const endpoint of adminEndpoints) {
            try {
                const response = await makeRequest(`${BASE_URL}${endpoint}`);
                console.log(`   ${endpoint}: ${response.status} ${response.status === 200 ? '✅' : response.status === 404 ? '❌' : '⚠️'}`);
            } catch (error) {
                console.log(`   ${endpoint}: ERROR`);
            }
        }
        
        console.log('\n📋 STEP 4: CHECK CURRENT JOBS');
        console.log('--------------------------------------------------');
        
        const jobsResponse = await makeRequest(`${BASE_URL}/api/jobs`);
        console.log(`📊 /api/jobs: ${jobsResponse.status}`);
        
        if (jobsResponse.status === 200) {
            const jobs = jobsResponse.data;
            if (Array.isArray(jobs)) {
                console.log(`   📊 Found ${jobs.length} jobs`);
                if (jobs.length > 0) {
                    console.log('\n   📋 Recent jobs:');
                    jobs.slice(0, 5).forEach((job, idx) => {
                        console.log(`      ${idx + 1}. ${job.id} - ${job.status} (${job.filename || 'N/A'})`);
                    });
                }
            } else {
                console.log(`   📊 Jobs response: ${JSON.stringify(jobs, null, 2)}`);
            }
        }
        
        console.log('\n📋 STEP 5: WORKFLOW RECOMMENDATIONS');
        console.log('--------------------------------------------------');
        
        console.log('BASED ON ENDPOINT DISCOVERY:');
        console.log('');
        console.log('🎯 TO PROCESS HARMONY PDF:');
        console.log('   1. Check if upload endpoint exists');
        console.log('   2. Use frontend upload interface');
        console.log('   3. Monitor via /api/jobs endpoint');
        console.log('   4. Verify results in database');
        console.log('');
        console.log('🔧 ALTERNATIVE APPROACHES:');
        console.log('   1. Use frontend PDF upload interface');
        console.log('   2. Direct database insertion with processing trigger');
        console.log('   3. Manual processing via admin interface');
        console.log('   4. Check if files need to be moved from storage to processing queue');
        
    } catch (error) {
        console.log(`❌ Discovery Error: ${error.message}`);
    }
    
    console.log('\n==================================================');
    console.log('🎉 ENDPOINT DISCOVERY COMPLETED');
    console.log('==================================================');
}

discoverEndpoints().catch(console.error);

#!/usr/bin/env node

/**
 * Check what admin endpoints are available in MIVAA
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function checkAdminEndpoints() {
    console.log('🔍 Checking MIVAA Admin Endpoints');
    console.log('==================================================');
    
    try {
        // Get OpenAPI spec
        console.log('📋 Fetching OpenAPI spec...');
        const response = await fetch(`${MIVAA_BASE_URL}/openapi.json`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch OpenAPI spec: ${response.status}`);
        }
        
        const spec = await response.json();
        console.log(`   Title: ${spec.info.title}`);
        console.log(`   Version: ${spec.info.version}`);
        
        // Find admin endpoints
        console.log('\n📄 Admin Endpoints:');
        const adminEndpoints = [];
        
        for (const [path, methods] of Object.entries(spec.paths)) {
            if (path.includes('admin')) {
                for (const [method, details] of Object.entries(methods)) {
                    adminEndpoints.push({
                        method: method.toUpperCase(),
                        path: path,
                        summary: details.summary || 'No summary',
                        operationId: details.operationId || 'No operation ID'
                    });
                }
            }
        }
        
        if (adminEndpoints.length === 0) {
            console.log('   ❌ No admin endpoints found');
        } else {
            adminEndpoints.forEach(endpoint => {
                console.log(`   ${endpoint.method} ${endpoint.path}`);
                console.log(`      Summary: ${endpoint.summary}`);
                console.log(`      Operation ID: ${endpoint.operationId}`);
                console.log('');
            });
        }
        
        // Find bulk processing endpoints
        console.log('\n📄 Bulk Processing Endpoints:');
        const bulkEndpoints = [];
        
        for (const [path, methods] of Object.entries(spec.paths)) {
            if (path.includes('bulk') || path.includes('process')) {
                for (const [method, details] of Object.entries(methods)) {
                    bulkEndpoints.push({
                        method: method.toUpperCase(),
                        path: path,
                        summary: details.summary || 'No summary',
                        operationId: details.operationId || 'No operation ID'
                    });
                }
            }
        }
        
        if (bulkEndpoints.length === 0) {
            console.log('   ❌ No bulk processing endpoints found');
        } else {
            bulkEndpoints.forEach(endpoint => {
                console.log(`   ${endpoint.method} ${endpoint.path}`);
                console.log(`      Summary: ${endpoint.summary}`);
                console.log(`      Operation ID: ${endpoint.operationId}`);
                console.log('');
            });
        }
        
        // Find job endpoints
        console.log('\n📄 Job Management Endpoints:');
        const jobEndpoints = [];
        
        for (const [path, methods] of Object.entries(spec.paths)) {
            if (path.includes('job')) {
                for (const [method, details] of Object.entries(methods)) {
                    jobEndpoints.push({
                        method: method.toUpperCase(),
                        path: path,
                        summary: details.summary || 'No summary',
                        operationId: details.operationId || 'No operation ID'
                    });
                }
            }
        }
        
        if (jobEndpoints.length === 0) {
            console.log('   ❌ No job endpoints found');
        } else {
            jobEndpoints.forEach(endpoint => {
                console.log(`   ${endpoint.method} ${endpoint.path}`);
                console.log(`      Summary: ${endpoint.summary}`);
                console.log(`      Operation ID: ${endpoint.operationId}`);
                console.log('');
            });
        }
        
        // Test a few key endpoints
        console.log('\n🧪 Testing Key Endpoints:');
        
        // Test health
        try {
            const healthResponse = await fetch(`${MIVAA_BASE_URL}/health`);
            console.log(`   GET /health: ${healthResponse.status} ${healthResponse.statusText}`);
        } catch (e) {
            console.log(`   GET /health: ❌ ${e.message}`);
        }
        
        // Test jobs list
        try {
            const jobsResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs`);
            console.log(`   GET /api/jobs: ${jobsResponse.status} ${jobsResponse.statusText}`);
        } catch (e) {
            console.log(`   GET /api/jobs: ❌ ${e.message}`);
        }
        
        // Test admin endpoints if they exist
        if (adminEndpoints.length > 0) {
            for (const endpoint of adminEndpoints.slice(0, 3)) { // Test first 3
                try {
                    const testResponse = await fetch(`${MIVAA_BASE_URL}${endpoint.path}`);
                    console.log(`   ${endpoint.method} ${endpoint.path}: ${testResponse.status} ${testResponse.statusText}`);
                } catch (e) {
                    console.log(`   ${endpoint.method} ${endpoint.path}: ❌ ${e.message}`);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Failed to check admin endpoints:', error.message);
    }
}

// Run the check
checkAdminEndpoints().catch(console.error);

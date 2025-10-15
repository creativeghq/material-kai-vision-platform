import fetch from 'node-fetch';

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function testDatabaseConnection() {
    console.log('🔍 Testing MIVAA Database Connection');
    console.log('==================================================');
    
    try {
        // Test if MIVAA has any database-related endpoints
        console.log('\n📊 Testing database-related endpoints...');
        
        // Test health endpoint for database info
        console.log('   🔍 Testing health endpoint...');
        const healthResponse = await fetch(`${MIVAA_BASE_URL}/health`);
        
        if (healthResponse.ok) {
            const healthData = await healthResponse.json();
            console.log('   ✅ Health endpoint working');
            console.log('   📊 Health data:', JSON.stringify(healthData, null, 2));
        } else {
            console.log(`   ❌ Health endpoint failed: ${healthResponse.status}`);
        }
        
        // Test system health endpoint
        console.log('\n   🔍 Testing system health endpoint...');
        const systemHealthResponse = await fetch(`${MIVAA_BASE_URL}/api/system/health`);
        
        if (systemHealthResponse.ok) {
            const systemHealthData = await systemHealthResponse.json();
            console.log('   ✅ System health endpoint working');
            console.log('   📊 System health data:', JSON.stringify(systemHealthData, null, 2));
        } else {
            console.log(`   ❌ System health endpoint failed: ${systemHealthResponse.status}`);
        }
        
        // Test package status endpoint
        console.log('\n   🔍 Testing package status endpoint...');
        const packageResponse = await fetch(`${MIVAA_BASE_URL}/api/system/packages`);
        
        if (packageResponse.ok) {
            const packageData = await packageResponse.json();
            console.log('   ✅ Package status endpoint working');
            console.log('   📊 Package data:', JSON.stringify(packageData, null, 2));
        } else {
            console.log(`   ❌ Package status endpoint failed: ${packageResponse.status}`);
        }
        
        // Test if there are any database-specific endpoints
        console.log('\n   🔍 Testing database-specific endpoints...');
        
        // Try to access OpenAPI docs to see available endpoints
        const openApiResponse = await fetch(`${MIVAA_BASE_URL}/openapi.json`);
        
        if (openApiResponse.ok) {
            const openApiData = await openApiResponse.json();
            console.log('   ✅ OpenAPI docs available');
            
            // Look for database-related endpoints
            const paths = Object.keys(openApiData.paths || {});
            const dbEndpoints = paths.filter(path => 
                path.includes('database') || 
                path.includes('supabase') || 
                path.includes('storage') ||
                path.includes('connection')
            );
            
            if (dbEndpoints.length > 0) {
                console.log('   📊 Database-related endpoints found:');
                dbEndpoints.forEach(endpoint => {
                    console.log(`      - ${endpoint}`);
                });
            } else {
                console.log('   ⚠️  No obvious database-related endpoints found');
            }
            
            // Look for document-related endpoints
            const docEndpoints = paths.filter(path => 
                path.includes('document') || 
                path.includes('pdf') ||
                path.includes('save')
            );
            
            if (docEndpoints.length > 0) {
                console.log('   📊 Document-related endpoints found:');
                docEndpoints.forEach(endpoint => {
                    console.log(`      - ${endpoint}`);
                });
            }
        } else {
            console.log(`   ❌ OpenAPI docs failed: ${openApiResponse.status}`);
        }
        
        console.log('\n🎯 Database Connection Test Summary');
        console.log('==================================================');
        console.log('💡 Next Steps:');
        console.log('1. Check MIVAA service logs for database connection errors');
        console.log('2. Verify Supabase environment variables are set correctly');
        console.log('3. Test database operations directly in MIVAA');
        console.log('4. Check if database save operations are actually being called');
        
    } catch (error) {
        console.error('❌ Database connection test error:', error.message);
    }
}

// Run the test
testDatabaseConnection();

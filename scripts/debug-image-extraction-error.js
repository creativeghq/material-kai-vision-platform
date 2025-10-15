#!/usr/bin/env node

/**
 * DEBUG IMAGE EXTRACTION ERROR
 * Get detailed error information from the image extraction endpoint
 */

const BASE_URL = 'https://v1api.materialshub.gr';

async function makeRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            body: options.body ? JSON.stringify(options.body) : undefined
        });

        const data = await response.text();
        let parsedData;
        try {
            parsedData = JSON.parse(data);
        } catch (e) {
            parsedData = data;
        }

        return {
            status: response.status,
            data: parsedData,
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries())
        };
    } catch (error) {
        return {
            status: 0,
            data: { error: error.message },
            ok: false
        };
    }
}

async function debugImageExtractionError() {
    console.log('🔍 DEBUGGING IMAGE EXTRACTION ERROR');
    console.log('===================================');
    
    // Test 1: Check if any documents exist
    console.log('\n1. 📄 Checking available documents...');
    try {
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/documents`);
        if (docsResponse.ok && docsResponse.data.documents) {
            console.log(`   ✅ Found ${docsResponse.data.documents.length} documents`);

            if (docsResponse.data.documents.length > 0) {
                const firstDoc = docsResponse.data.documents[0];
                console.log(`   📋 First document: ${firstDoc.document_id || firstDoc.id} - ${firstDoc.filename || firstDoc.document_name || 'No filename'}`);
                
                // Test 2: Try to get images for a real document
                console.log('\n2. 🖼️ Testing image extraction with real document...');
                const realDocId = firstDoc.document_id || firstDoc.id;
                const imagesResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${realDocId}/images`);
                
                console.log(`   📊 Status: ${imagesResponse.status}`);
                console.log(`   📝 Response:`, JSON.stringify(imagesResponse.data, null, 2));
                
                if (!imagesResponse.ok) {
                    console.log(`   ❌ Error details:`, imagesResponse.data);
                }
                
                return { realDocId, imagesResponse };
            } else {
                console.log('   ⚠️ No documents found to test with');
            }
        } else {
            console.log(`   ❌ Failed to get documents: ${docsResponse.status}`);
            console.log(`   📝 Response:`, docsResponse.data);
        }
    } catch (error) {
        console.log(`   ❌ Error getting documents: ${error.message}`);
    }

    // Test 3: Check database schema
    console.log('\n3. 🗄️ Checking if document_images table has data...');
    try {
        // We can't directly query the database, but we can check the API structure
        console.log('   📋 Testing with a known non-existent document ID...');
        const testResponse = await makeRequest(`${BASE_URL}/api/documents/documents/test-non-existent/images`);
        
        console.log(`   📊 Status: ${testResponse.status}`);
        console.log(`   📝 Response:`, JSON.stringify(testResponse.data, null, 2));
        
        if (testResponse.status === 500) {
            console.log('   🚨 500 error indicates server-side issue, not just missing data');
            
            // Check if it's a schema/import issue
            if (testResponse.data && testResponse.data.detail) {
                console.log(`   🔍 Error detail: ${testResponse.data.detail}`);
                
                if (testResponse.data.detail.includes('ImageInfo') || 
                    testResponse.data.detail.includes('import') ||
                    testResponse.data.detail.includes('module')) {
                    console.log('   💡 Likely a schema import or module issue');
                }
            }
        }
    } catch (error) {
        console.log(`   ❌ Error testing schema: ${error.message}`);
    }

    // Test 4: Check service health
    console.log('\n4. 🏥 Checking service health...');
    try {
        const healthResponse = await makeRequest(`${BASE_URL}/health`);
        console.log(`   📊 Health status: ${healthResponse.status}`);
        console.log(`   📝 Health data:`, JSON.stringify(healthResponse.data, null, 2));
    } catch (error) {
        console.log(`   ❌ Health check error: ${error.message}`);
    }

    // Test 5: Check if it's an authentication issue
    console.log('\n5. 🔐 Testing authentication requirements...');
    try {
        const authTestResponse = await makeRequest(`${BASE_URL}/api/documents/documents/test/images`, {
            headers: {
                'Authorization': 'Bearer test-token'
            }
        });
        
        console.log(`   📊 With auth header status: ${authTestResponse.status}`);
        if (authTestResponse.status !== 500) {
            console.log('   💡 Authentication might be required');
        }
    } catch (error) {
        console.log(`   ❌ Auth test error: ${error.message}`);
    }

    console.log('\n📋 DIAGNOSIS SUMMARY');
    console.log('===================');
    console.log('Based on the tests above:');
    console.log('1. If 500 error persists with real documents → Server-side code issue');
    console.log('2. If error mentions ImageInfo/import → Schema import problem');
    console.log('3. If error mentions authentication → Missing JWT token');
    console.log('4. If error mentions database → Supabase connection issue');
    
    return null;
}

// Run the debug
debugImageExtractionError().catch(console.error);

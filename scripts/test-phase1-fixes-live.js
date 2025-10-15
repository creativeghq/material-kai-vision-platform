#!/usr/bin/env node

/**
 * LIVE TEST OF PHASE 1 FIXES
 * Test the actual live server to verify fixes are deployed
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

async function testLiveFixes() {
    console.log('🧪 TESTING PHASE 1 FIXES ON LIVE SERVER');
    console.log('========================================');
    console.log(`🌐 Testing against: ${BASE_URL}`);
    
    let allTestsPassed = true;
    
    // Test 1: Get real documents
    console.log('\n1. 📄 Getting real documents from live server...');
    try {
        const docsResponse = await makeRequest(`${BASE_URL}/api/documents/documents`);
        
        if (!docsResponse.ok) {
            console.log(`   ❌ Documents API failed: ${docsResponse.status}`);
            console.log(`   📝 Error:`, docsResponse.data);
            allTestsPassed = false;
            return;
        }
        
        if (!docsResponse.data.documents || docsResponse.data.documents.length === 0) {
            console.log('   ⚠️ No documents found on live server');
            return;
        }
        
        console.log(`   ✅ Found ${docsResponse.data.documents.length} documents`);
        
        // Get first document with proper ID
        const firstDoc = docsResponse.data.documents[0];
        const docId = firstDoc.document_id || firstDoc.id;
        const docName = firstDoc.document_name || firstDoc.filename || 'Unknown';
        
        console.log(`   📋 Testing with document: ${docId}`);
        console.log(`   📄 Document name: ${docName}`);
        
        if (!docId || docId === 'undefined') {
            console.log('   ❌ Document ID is undefined - API response structure issue');
            allTestsPassed = false;
            return;
        }
        
        // Test 2: Test image extraction with real document
        console.log('\n2. 🖼️ Testing image extraction with real document...');
        const imagesResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${docId}/images`);
        
        console.log(`   📊 Status: ${imagesResponse.status}`);
        console.log(`   📝 Response type: ${typeof imagesResponse.data}`);
        
        if (imagesResponse.status === 500) {
            console.log('   ❌ CRITICAL: Still getting 500 error!');
            console.log('   📝 Error details:', JSON.stringify(imagesResponse.data, null, 2));
            allTestsPassed = false;
            
            // Check if it's the UUID error
            if (imagesResponse.data && imagesResponse.data.detail && 
                imagesResponse.data.detail.includes('invalid input syntax for type uuid')) {
                console.log('   🚨 UUID validation error - fix not deployed or not working');
            }
        } else if (imagesResponse.ok) {
            console.log('   ✅ Image extraction API working correctly');
            console.log(`   📊 Images found: ${imagesResponse.data.data ? imagesResponse.data.data.length : 0}`);
            
            if (imagesResponse.data.data && imagesResponse.data.data.length > 0) {
                console.log('   🎉 Document has images!');
                const firstImage = imagesResponse.data.data[0];
                console.log(`   🖼️ First image: ${firstImage.filename || firstImage.image_id || 'Unknown'}`);
            } else {
                console.log('   📝 No images in this document (expected for some docs)');
            }
        } else {
            console.log(`   ❌ Unexpected status: ${imagesResponse.status}`);
            console.log('   📝 Response:', JSON.stringify(imagesResponse.data, null, 2));
            allTestsPassed = false;
        }
        
        // Test 3: Test with multiple documents to be thorough
        console.log('\n3. 🔄 Testing with multiple documents...');
        const testDocs = docsResponse.data.documents.slice(0, 3); // Test first 3 docs
        
        for (let i = 0; i < testDocs.length; i++) {
            const doc = testDocs[i];
            const testDocId = doc.document_id || doc.id;
            const testDocName = doc.document_name || doc.filename || 'Unknown';
            
            console.log(`   📄 Testing doc ${i + 1}: ${testDocName}`);
            
            const testResponse = await makeRequest(`${BASE_URL}/api/documents/documents/${testDocId}/images`);
            
            if (testResponse.status === 500) {
                console.log(`   ❌ Doc ${i + 1}: Still getting 500 error`);
                allTestsPassed = false;
            } else if (testResponse.ok) {
                console.log(`   ✅ Doc ${i + 1}: Working (${testResponse.data.data ? testResponse.data.data.length : 0} images)`);
            } else {
                console.log(`   ⚠️ Doc ${i + 1}: Status ${testResponse.status}`);
            }
        }
        
    } catch (error) {
        console.log(`   ❌ Test failed with error: ${error.message}`);
        allTestsPassed = false;
    }
    
    // Test 4: Check if changes are deployed
    console.log('\n4. 🚀 Checking deployment status...');
    try {
        const healthResponse = await makeRequest(`${BASE_URL}/health`);
        if (healthResponse.ok) {
            console.log('   ✅ Server is healthy and responding');
            if (healthResponse.data.timestamp) {
                console.log(`   ⏰ Server timestamp: ${healthResponse.data.timestamp}`);
            }
        } else {
            console.log(`   ⚠️ Health check returned: ${healthResponse.status}`);
        }
    } catch (error) {
        console.log(`   ⚠️ Health check failed: ${error.message}`);
    }
    
    // Final result
    console.log('\n📊 LIVE TEST RESULTS');
    console.log('====================');
    
    if (allTestsPassed) {
        console.log('🎉 ALL TESTS PASSED - Phase 1 fixes are working on live server!');
        console.log('✅ Image extraction API is properly fixed and deployed');
    } else {
        console.log('❌ SOME TESTS FAILED - Phase 1 fixes may not be deployed or working');
        console.log('🔧 Action needed: Check deployment status or investigate remaining issues');
    }
    
    return allTestsPassed;
}

// Run the live test
testLiveFixes().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('❌ Live test failed:', error);
    process.exit(1);
});

import fetch from 'node-fetch';

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const SUPABASE_GATEWAY_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/mivaa-gateway';

async function testCompletePipeline() {
    console.log('🔍 Testing Complete PDF Processing Pipeline (Ignoring Job Monitoring)');
    console.log('==================================================');
    
    const testPdf = 'https://www.adobe.com/support/products/enterprise/knowledgecenter/media/c4611_sample_explain.pdf';
    
    try {
        // Step 1: Submit PDF for processing
        console.log('\n📤 Step 1: Submitting PDF for processing...');
        console.log(`   PDF: ${testPdf}`);
        
        const submitResponse = await fetch(`${MIVAA_BASE_URL}/api/bulk/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                urls: [testPdf]
            })
        });
        
        if (!submitResponse.ok) {
            console.log(`   ❌ Submit failed: ${submitResponse.status} ${submitResponse.statusText}`);
            return;
        }
        
        const submitData = await submitResponse.json();
        const jobId = submitData.data.job_id;
        console.log(`   ✅ Job submitted: ${jobId}`);
        
        // Step 2: Wait for processing to complete (ignore monitoring errors)
        console.log('\n⏳ Step 2: Waiting for processing to complete...');
        console.log('   (Ignoring job monitoring errors due to serialization issue)');
        
        // Wait a reasonable amount of time for processing
        const waitTime = 120; // 2 minutes
        console.log(`   ⏰ Waiting ${waitTime} seconds for processing...`);
        
        for (let i = 0; i < waitTime; i += 10) {
            process.stdout.write(`   ⏳ ${waitTime - i}s remaining...\r`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
        console.log('\n   ✅ Wait period completed');
        
        // Step 3: Check database for saved data
        console.log('\n📊 Step 3: Checking database for saved data...');
        
        // Check documents table
        console.log('   🔍 Checking documents table...');
        try {
            const documentsResponse = await fetch(`${SUPABASE_GATEWAY_URL}/documents`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (documentsResponse.ok) {
                const documentsData = await documentsResponse.json();
                console.log(`   ✅ Documents found: ${documentsData.length || 0}`);
                
                if (documentsData.length > 0) {
                    const latestDoc = documentsData[documentsData.length - 1];
                    console.log(`   📄 Latest document: ${latestDoc.id} - ${latestDoc.filename || 'N/A'}`);
                    
                    // Step 4: Test document retrieval
                    console.log('\n📖 Step 4: Testing document retrieval...');
                    
                    const docId = latestDoc.id;
                    console.log(`   🔍 Testing document content for: ${docId}`);
                    
                    const contentResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${docId}/content`);
                    console.log(`   Status: ${contentResponse.status} ${contentResponse.statusText}`);
                    
                    if (contentResponse.ok) {
                        const contentData = await contentResponse.json();
                        console.log('   ✅ Document content retrieved successfully!');
                        console.log(`   📊 Content length: ${contentData.content?.length || 0} characters`);
                        console.log(`   📊 Metadata: ${JSON.stringify(contentData.metadata || {})}`);
                    } else {
                        const errorText = await contentResponse.text();
                        console.log(`   ❌ Document content failed: ${errorText}`);
                    }
                    
                    // Test chunks retrieval
                    console.log(`   🔍 Testing document chunks for: ${docId}`);
                    const chunksResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${docId}/chunks`);
                    console.log(`   Status: ${chunksResponse.status} ${chunksResponse.statusText}`);
                    
                    if (chunksResponse.ok) {
                        const chunksData = await chunksResponse.json();
                        console.log(`   ✅ Document chunks: ${chunksData.length || 0} found`);
                    } else {
                        const errorText = await chunksResponse.text();
                        console.log(`   ❌ Document chunks failed: ${errorText}`);
                    }
                    
                    // Test images retrieval
                    console.log(`   🔍 Testing document images for: ${docId}`);
                    const imagesResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${docId}/images`);
                    console.log(`   Status: ${imagesResponse.status} ${imagesResponse.statusText}`);
                    
                    if (imagesResponse.ok) {
                        const imagesData = await imagesResponse.json();
                        console.log(`   ✅ Document images: ${imagesData.length || 0} found`);
                    } else {
                        const errorText = await imagesResponse.text();
                        console.log(`   ❌ Document images failed: ${errorText}`);
                    }
                }
            } else {
                const errorText = await documentsResponse.text();
                console.log(`   ❌ Documents check failed: ${errorText}`);
            }
        } catch (error) {
            console.log(`   ❌ Database check error: ${error.message}`);
        }
        
        // Step 5: Summary
        console.log('\n🎯 Step 5: Pipeline Test Summary');
        console.log('==================================================');
        console.log('✅ Job submission: Working');
        console.log('⚠️  Job monitoring: Disabled (serialization issue)');
        console.log('🔍 Database storage: Testing completed');
        console.log('📖 Document retrieval: Testing completed');
        console.log('\n💡 Next Steps:');
        console.log('1. If data was saved: Pipeline is working end-to-end');
        console.log('2. If no data: Database save operations need debugging');
        console.log('3. Job monitoring serialization issue needs separate fix');
        
    } catch (error) {
        console.error('❌ Pipeline test error:', error.message);
    }
}

// Run the test
testCompletePipeline();

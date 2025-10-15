#!/usr/bin/env node

/**
 * Test if the job actually completed by checking MIVAA's internal storage
 * This bypasses the job monitoring serialization issue
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

async function testJobCompletion() {
  console.log('🔍 Testing Job Completion via MIVAA Internal Storage');
  console.log('==================================================\n');

  // Test the job we just submitted
  const jobId = 'bulk_20251015_031257';
  
  console.log(`📋 Testing job: ${jobId}`);
  
  // Try to get job statistics (this might work even if individual job status fails)
  try {
    console.log('   🔍 Testing job statistics endpoint...');
    const statsResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/statistics`);
    
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      console.log('   ✅ Job statistics:', JSON.stringify(stats, null, 2));
    } else {
      console.log(`   ❌ Job statistics failed: ${statsResponse.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Job statistics error: ${error.message}`);
  }

  // Try to get active progress (might show if job is still running)
  try {
    console.log('   🔍 Testing active progress endpoint...');
    const progressResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/active/progress`);
    
    if (progressResponse.ok) {
      const progress = await progressResponse.json();
      console.log('   ✅ Active progress:', JSON.stringify(progress, null, 2));
    } else {
      console.log(`   ❌ Active progress failed: ${progressResponse.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Active progress error: ${error.message}`);
  }

  // Try to check if any documents were created in MIVAA's internal storage
  try {
    console.log('   🔍 Testing document list endpoint...');
    const docsResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents`);
    
    if (docsResponse.ok) {
      const docs = await docsResponse.json();
      console.log('   ✅ Documents in MIVAA storage:', JSON.stringify(docs, null, 2));
      
      if (docs.documents && docs.documents.length > 0) {
        console.log(`   📄 Found ${docs.documents.length} documents in MIVAA storage`);
        
        // Try to get details of the first document
        const firstDoc = docs.documents[0];
        console.log(`   🔍 Testing document details for: ${firstDoc.id}`);
        
        const docResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${firstDoc.id}/content`);
        if (docResponse.ok) {
          const docContent = await docResponse.json();
          console.log('   ✅ Document content retrieved successfully');
          console.log(`   📊 Chunks: ${docContent.chunks?.length || 0}, Images: ${docContent.images?.length || 0}`);
        } else {
          console.log(`   ❌ Document content failed: ${docResponse.status}`);
        }
      } else {
        console.log('   📄 No documents found in MIVAA storage');
      }
    } else {
      console.log(`   ❌ Document list failed: ${docsResponse.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Document list error: ${error.message}`);
  }

  console.log('\n🎯 Job Completion Test Summary');
  console.log('==================================================');
  console.log('💡 This test checks if MIVAA actually processed the PDF');
  console.log('💡 If documents exist in MIVAA storage but not in database,');
  console.log('💡 then the issue is with database save operations');
}

testJobCompletion().catch(console.error);

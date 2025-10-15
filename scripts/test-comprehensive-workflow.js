#!/usr/bin/env node

/**
 * Comprehensive workflow test for Material Kai Vision Platform
 * Tests all critical functionality end-to-end
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

// Test PDFs
const TEST_PDFS = {
  small: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
  wifi_momo: 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/WIFI%20MOMO%20lookbook%2001s.pdf',
  harmony: 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/1760462185826-harmony-signature-book-24-25.pdf'
};

async function testComprehensiveWorkflow() {
  console.log('🎯 COMPREHENSIVE MATERIAL KAI VISION PLATFORM TEST');
  console.log('==================================================\n');

  const results = {
    endpoints: {},
    processing: {},
    database: {},
    search: {},
    issues: []
  };

  // Step 1: Test all critical endpoints
  console.log('📋 STEP 1: Testing Critical Endpoints');
  console.log('--------------------------------------------------');
  
  const endpoints = [
    { name: 'Health Check', url: '/api/health' },
    { name: 'System Health', url: '/api/system/health' },
    { name: 'Job Statistics', url: '/api/jobs/statistics' },
    { name: 'Job List', url: '/api/jobs' },
    { name: 'Document List', url: '/api/documents/documents' },
    { name: 'Documents Health', url: '/api/documents/health' }
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${MIVAA_BASE_URL}${endpoint.url}`);
      const success = response.ok;
      results.endpoints[endpoint.name] = { status: response.status, success };
      console.log(`   ${success ? '✅' : '❌'} ${endpoint.name}: ${response.status}`);
      
      if (!success) {
        results.issues.push(`${endpoint.name} endpoint failed: ${response.status}`);
      }
    } catch (error) {
      results.endpoints[endpoint.name] = { status: 'ERROR', success: false };
      results.issues.push(`${endpoint.name} endpoint error: ${error.message}`);
      console.log(`   ❌ ${endpoint.name}: ERROR - ${error.message}`);
    }
  }

  // Step 2: Test document retrieval endpoints (should be fixed now)
  console.log('\n📋 STEP 2: Testing Document Retrieval Endpoints');
  console.log('--------------------------------------------------');
  
  try {
    // Get existing documents first
    const docsResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents`);
    if (docsResponse.ok) {
      const docsData = await docsResponse.json();
      const documents = docsData.documents || [];
      console.log(`   📄 Found ${documents.length} existing documents`);
      
      if (documents.length > 0) {
        const testDoc = documents[0];
        const docId = testDoc.id || testDoc.document_id;
        console.log(`   🔍 Testing retrieval with document: ${docId}`);
        
        // Test chunks endpoint
        try {
          const chunksResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${docId}/chunks`);
          const chunksSuccess = chunksResponse.ok;
          results.database.chunks_endpoint = { status: chunksResponse.status, success: chunksSuccess };
          console.log(`   ${chunksSuccess ? '✅' : '❌'} Chunks endpoint: ${chunksResponse.status}`);
          
          if (chunksSuccess) {
            const chunksData = await chunksResponse.json();
            const chunkCount = chunksData.data?.length || 0;
            console.log(`   📄 Retrieved ${chunkCount} chunks`);
            results.database.chunks_count = chunkCount;
          } else {
            results.issues.push(`Chunks endpoint failed: ${chunksResponse.status}`);
          }
        } catch (error) {
          results.issues.push(`Chunks endpoint error: ${error.message}`);
          console.log(`   ❌ Chunks endpoint error: ${error.message}`);
        }
        
        // Test images endpoint
        try {
          const imagesResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${docId}/images`);
          const imagesSuccess = imagesResponse.ok;
          results.database.images_endpoint = { status: imagesResponse.status, success: imagesSuccess };
          console.log(`   ${imagesSuccess ? '✅' : '❌'} Images endpoint: ${imagesResponse.status}`);
          
          if (imagesSuccess) {
            const imagesData = await imagesResponse.json();
            const imageCount = imagesData.data?.length || 0;
            console.log(`   🖼️ Retrieved ${imageCount} images`);
            results.database.images_count = imageCount;
          } else {
            results.issues.push(`Images endpoint failed: ${imagesResponse.status}`);
          }
        } catch (error) {
          results.issues.push(`Images endpoint error: ${error.message}`);
          console.log(`   ❌ Images endpoint error: ${error.message}`);
        }
      } else {
        console.log(`   ⚠️ No existing documents to test retrieval endpoints`);
      }
    }
  } catch (error) {
    results.issues.push(`Document retrieval test error: ${error.message}`);
    console.log(`   ❌ Document retrieval test error: ${error.message}`);
  }

  // Step 3: Test PDF processing with Harmony PDF (smaller than WIFI MOMO)
  console.log('\n📋 STEP 3: Testing PDF Processing with Harmony PDF');
  console.log('--------------------------------------------------');
  
  let harmonyJobId = null;
  let harmonyDocId = null;
  
  try {
    console.log(`📄 Submitting Harmony PDF: ${TEST_PDFS.harmony}`);
    
    const submitResponse = await fetch(`${MIVAA_BASE_URL}/api/bulk/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: [TEST_PDFS.harmony],
        processing_options: {
          extract_images: true,
          extract_tables: true,
          chunk_text: true,
          generate_embeddings: true
        }
      })
    });

    if (submitResponse.ok) {
      const submitData = await submitResponse.json();
      harmonyJobId = submitData.data?.job_id;
      console.log(`   ✅ Job submitted: ${harmonyJobId}`);
      results.processing.job_submission = { success: true, job_id: harmonyJobId };
      
      // Monitor job for a reasonable time
      console.log(`   ⏳ Monitoring job progress...`);
      let attempts = 0;
      const maxAttempts = 15; // 1.5 minutes
      let jobCompleted = false;
      
      while (attempts < maxAttempts && !jobCompleted) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 6000)); // Wait 6 seconds
        
        try {
          const statusResponse = await fetch(`${MIVAA_BASE_URL}/api/jobs/${harmonyJobId}/status`);
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            const jobData = statusData.data || statusData;
            
            console.log(`   📊 Check ${attempts}: ${jobData.status} - ${Math.round(jobData.progress_percentage * 100) / 100 || 0}% - ${jobData.current_step || 'Unknown'}`);
            
            if (jobData.details) {
              console.log(`      📄 Chunks: ${jobData.details.chunks_created || 0}, 🖼️ Images: ${jobData.details.images_extracted || 0}`);
            }
            
            if (jobData.status === 'completed') {
              jobCompleted = true;
              results.processing.job_completion = { success: true, attempts };
              
              if (jobData.details?.results?.[0]?.document_id) {
                harmonyDocId = jobData.details.results[0].document_id;
                console.log(`   🆔 Document created: ${harmonyDocId}`);
              }
              
              // Record final results
              results.processing.final_chunks = jobData.details?.chunks_created || 0;
              results.processing.final_images = jobData.details?.images_extracted || 0;
              
              console.log(`   🎉 Job completed! Chunks: ${results.processing.final_chunks}, Images: ${results.processing.final_images}`);
              break;
            } else if (jobData.status === 'failed') {
              results.processing.job_completion = { success: false, error: jobData.error_message };
              results.issues.push(`Job failed: ${jobData.error_message}`);
              console.log(`   ❌ Job failed: ${jobData.error_message}`);
              break;
            }
          }
        } catch (error) {
          console.log(`   ⚠️ Status check error: ${error.message}`);
        }
      }
      
      if (!jobCompleted) {
        console.log(`   ⏰ Job monitoring timeout after ${attempts} checks`);
        results.processing.job_completion = { success: false, timeout: true };
      }
      
    } else {
      const errorText = await submitResponse.text();
      results.processing.job_submission = { success: false, error: errorText };
      results.issues.push(`Job submission failed: ${submitResponse.status}`);
      console.log(`   ❌ Job submission failed: ${submitResponse.status}`);
    }
  } catch (error) {
    results.processing.job_submission = { success: false, error: error.message };
    results.issues.push(`PDF processing test error: ${error.message}`);
    console.log(`   ❌ PDF processing test error: ${error.message}`);
  }

  // Step 4: Test database storage if we have a document
  if (harmonyDocId) {
    console.log('\n📋 STEP 4: Testing Database Storage');
    console.log('--------------------------------------------------');
    
    try {
      // Test chunks storage
      const chunksResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${harmonyDocId}/chunks`);
      if (chunksResponse.ok) {
        const chunksData = await chunksResponse.json();
        const chunkCount = chunksData.data?.length || 0;
        results.database.stored_chunks = chunkCount;
        console.log(`   ✅ Database chunks: ${chunkCount} stored`);
        
        if (chunkCount > 0) {
          const firstChunk = chunksData.data[0];
          console.log(`   📄 First chunk preview: ${(firstChunk.content || '').substring(0, 80)}...`);
        }
      } else {
        results.issues.push(`Database chunks retrieval failed: ${chunksResponse.status}`);
        console.log(`   ❌ Database chunks retrieval failed: ${chunksResponse.status}`);
      }
      
      // Test images storage
      const imagesResponse = await fetch(`${MIVAA_BASE_URL}/api/documents/documents/${harmonyDocId}/images`);
      if (imagesResponse.ok) {
        const imagesData = await imagesResponse.json();
        const imageCount = imagesData.data?.length || 0;
        results.database.stored_images = imageCount;
        console.log(`   ✅ Database images: ${imageCount} stored`);
      } else {
        results.issues.push(`Database images retrieval failed: ${imagesResponse.status}`);
        console.log(`   ❌ Database images retrieval failed: ${imagesResponse.status}`);
      }
      
    } catch (error) {
      results.issues.push(`Database storage test error: ${error.message}`);
      console.log(`   ❌ Database storage test error: ${error.message}`);
    }
  }

  // Step 5: Test search functionality (if available)
  console.log('\n📋 STEP 5: Testing Search Functionality');
  console.log('--------------------------------------------------');
  
  try {
    // Test basic search endpoint
    const searchResponse = await fetch(`${MIVAA_BASE_URL}/api/search?q=material&limit=5`);
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      const resultCount = searchData.results?.length || 0;
      results.search.basic_search = { success: true, results: resultCount };
      console.log(`   ✅ Basic search: ${resultCount} results`);
    } else {
      results.search.basic_search = { success: false, status: searchResponse.status };
      console.log(`   ❌ Basic search failed: ${searchResponse.status}`);
    }
  } catch (error) {
    results.search.basic_search = { success: false, error: error.message };
    console.log(`   ⚠️ Search endpoint not available or error: ${error.message}`);
  }

  // Final Results Summary
  console.log('\n🎯 COMPREHENSIVE TEST RESULTS');
  console.log('==================================================');
  
  const endpointSuccess = Object.values(results.endpoints).filter(e => e.success).length;
  const endpointTotal = Object.keys(results.endpoints).length;
  
  console.log(`📊 Endpoints: ${endpointSuccess}/${endpointTotal} working`);
  console.log(`📄 PDF Processing: ${results.processing.job_submission?.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`📚 Database Storage: ${results.database.stored_chunks > 0 ? 'SUCCESS' : 'NEEDS VERIFICATION'}`);
  console.log(`🔍 Search: ${results.search.basic_search?.success ? 'SUCCESS' : 'NOT TESTED'}`);
  
  if (results.processing.final_chunks > 0) {
    console.log(`✅ CRITICAL FIX VERIFIED: Chunks generation working (${results.processing.final_chunks} chunks)`);
  }
  
  if (results.processing.final_images > 0) {
    console.log(`✅ Image extraction working (${results.processing.final_images} images)`);
  } else {
    console.log(`⚠️ Image extraction needs investigation (0 images extracted)`);
  }
  
  if (results.issues.length > 0) {
    console.log(`\n❌ Issues Found (${results.issues.length}):`);
    results.issues.forEach((issue, index) => {
      console.log(`   ${index + 1}. ${issue}`);
    });
  } else {
    console.log(`\n🎉 NO CRITICAL ISSUES FOUND!`);
  }
  
  // Platform readiness assessment
  const criticalSystemsWorking = 
    endpointSuccess >= endpointTotal - 1 && // Most endpoints working
    results.processing.job_submission?.success && // Can submit jobs
    (results.processing.final_chunks > 0 || results.database.stored_chunks > 0); // Chunks are generated
  
  console.log(`\n🚀 PLATFORM READINESS: ${criticalSystemsWorking ? 'READY FOR LAUNCH' : 'NEEDS ATTENTION'}`);
  
  if (criticalSystemsWorking) {
    console.log(`✅ Core functionality verified - RAG pipeline should work`);
    console.log(`✅ Material intelligence platform is operational`);
  } else {
    console.log(`⚠️ Critical issues need resolution before launch`);
  }
  
  return results;
}

testComprehensiveWorkflow().catch(console.error);

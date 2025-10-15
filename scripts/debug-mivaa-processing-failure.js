#!/usr/bin/env node

/**
 * Debug MIVAA Processing Failure
 * 
 * Test the actual PDF processing pipeline to identify where it fails
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ1MzE1NzQsImV4cCI6MjA1MDEwNzU3NH0.Ej_Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8';

async function callMivaaGateway(action, payload) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: action,
      payload: payload
    })
  });

  return await response.json();
}

async function testSimpleProcessing() {
  console.log('🔍 Testing Simple PDF Processing');
  console.log('='.repeat(50));

  try {
    // Test with a simple, small PDF
    const testUrl = 'https://www.adobe.com/support/products/enterprise/knowledgecenter/media/c4611_sample_explain.pdf';
    
    console.log(`📄 Testing with: ${testUrl}`);
    
    // Submit processing job
    console.log(`\n📤 Step 1: Submitting PDF for processing...`);
    const bulkResponse = await callMivaaGateway('bulk_process', {
      urls: [testUrl],
      batch_size: 1,
      processing_options: {
        extract_text: true,
        extract_images: true,
        extract_tables: false  // Disable tables to simplify
      }
    });
    
    console.log(`   Response: ${bulkResponse.success ? '✅' : '❌'}`);
    
    if (!bulkResponse.success || !bulkResponse.data?.job_id) {
      console.log(`   ❌ Failed to submit: ${bulkResponse.error || 'No job ID'}`);
      return;
    }
    
    const jobId = bulkResponse.data.job_id;
    console.log(`   ✅ Job submitted: ${jobId}`);
    
    // Monitor the job with detailed logging
    console.log(`\n📊 Step 2: Monitoring job progress...`);
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes max
    
    while (attempts < maxAttempts) {
      attempts++;
      
      try {
        const statusResponse = await callMivaaGateway('get_job_status', { job_id: jobId });
        
        if (statusResponse.success && statusResponse.data) {
          const job = statusResponse.data;
          
          console.log(`\n   📊 Check ${attempts}: ${job.status} (${job.progress_percentage || 'N/A'}%)`);
          
          if (job.details) {
            console.log(`   📋 Details:`);
            Object.keys(job.details).forEach(key => {
              const value = job.details[key];
              if (typeof value === 'object') {
                console.log(`      ${key}: ${JSON.stringify(value).substring(0, 100)}...`);
              } else {
                console.log(`      ${key}: ${value}`);
              }
            });
          }
          
          if (job.status === 'completed') {
            console.log(`\n🎉 Job completed!`);
            
            // Analyze the results
            console.log(`\n🔍 Step 3: Analyzing results...`);
            console.log(`   Chunks Created: ${job.details?.chunks_created || 0}`);
            console.log(`   Images Extracted: ${job.details?.images_extracted || 0}`);
            console.log(`   Processed Count: ${job.details?.processed_count || 0}`);
            console.log(`   Failed Count: ${job.details?.failed_count || 0}`);
            
            if (job.details?.results && Array.isArray(job.details.results)) {
              console.log(`\n📋 Processing Results:`);
              job.details.results.forEach((result, index) => {
                console.log(`   ${index + 1}. URL: ${result.url}`);
                console.log(`      Status: ${result.status}`);
                console.log(`      Document ID: ${result.document_id || 'N/A'}`);
                console.log(`      Chunks: ${result.chunks || 0}`);
                console.log(`      Images: ${result.images || 0}`);
                if (result.error) {
                  console.log(`      Error: ${result.error}`);
                }
              });
            }
            
            // Try to get document content if document_id exists
            const documentId = job.details?.results?.[0]?.document_id;
            if (documentId) {
              console.log(`\n🔍 Step 4: Testing document retrieval...`);
              console.log(`   Document ID: ${documentId}`);
              
              try {
                const contentResponse = await callMivaaGateway('get_document_content', { 
                  document_id: documentId,
                  include_chunks: true,
                  include_images: true
                });
                
                console.log(`   Content Response: ${contentResponse.success ? '✅' : '❌'}`);
                
                if (contentResponse.success && contentResponse.data) {
                  console.log(`   Content Keys: ${Object.keys(contentResponse.data).join(', ')}`);
                  
                  if (contentResponse.data.content) {
                    const content = contentResponse.data.content;
                    console.log(`   📝 Chunks: ${content.chunks?.length || 0}`);
                    console.log(`   🖼️ Images: ${content.images?.length || 0}`);
                    console.log(`   📄 Markdown: ${content.markdown_content?.length || 0} chars`);
                  }
                } else {
                  console.log(`   ❌ Content Error: ${contentResponse.error || 'Unknown'}`);
                }
                
              } catch (error) {
                console.log(`   ❌ Content Retrieval Error: ${error.message}`);
              }
            } else {
              console.log(`\n❌ No document_id found in results - this is the problem!`);
            }
            
            break;
            
          } else if (job.status === 'failed' || job.status === 'error') {
            console.log(`\n❌ Job failed!`);
            if (job.error_message) {
              console.log(`   Error: ${job.error_message}`);
            }
            break;
          }
          
        } else {
          console.log(`   ❌ Status check failed: ${statusResponse.error || 'Unknown error'}`);
        }
        
        // Wait before next check
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
        }
        
      } catch (error) {
        console.log(`   ❌ Error checking status: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    if (attempts >= maxAttempts) {
      console.log(`\n⏰ Timeout after ${attempts} attempts`);
    }
    
  } catch (error) {
    console.log(`❌ Test failed: ${error.message}`);
  }
  
  console.log(`\n💡 Analysis:`);
  console.log(`=`.repeat(50));
  console.log(`If chunks_created = 0 and images_extracted = 0:`);
  console.log(`1. PDF processing works (job completes)`);
  console.log(`2. Chunking logic fails (LlamaIndex or fallback)`);
  console.log(`3. Database storage fails (no chunks to store)`);
  console.log(`4. Document retrieval fails (no document created)`);
  console.log(`\nThe issue is in the chunking/storage pipeline, not PDF extraction.`);
}

testSimpleProcessing().catch(console.error);

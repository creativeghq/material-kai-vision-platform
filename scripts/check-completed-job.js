#!/usr/bin/env node

/**
 * Check if job completed and try to retrieve data
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ1MzE1NzQsImV4cCI6MjA1MDEwNzU3NH0.Ej_Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8';

const jobId = 'bulk_20251014_182233';

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

async function checkJobAndData() {
  console.log('🔍 Checking Job Status and Data Retrieval');
  console.log('='.repeat(50));

  try {
    // 1. Check job status
    console.log(`📊 Checking job status: ${jobId}`);
    const statusResponse = await callMivaaGateway('get_job_status', { job_id: jobId });
    
    if (statusResponse.success && statusResponse.data) {
      const job = statusResponse.data;
      console.log(`✅ Job Status: ${job.status}`);
      console.log(`📈 Progress: ${job.progress_percentage || job.progress || 'N/A'}%`);
      
      if (job.details) {
        console.log(`📋 Job Details:`);
        Object.keys(job.details).forEach(key => {
          console.log(`   ${key}: ${job.details[key]}`);
        });
      }
      
      // 2. If job has document_id, try to retrieve content
      const documentId = job.details?.document_id || job.parameters?.document_id;
      if (documentId) {
        console.log(`\n🔍 Found document ID: ${documentId}`);
        console.log(`📄 Attempting to retrieve document content...`);
        
        try {
          const contentResponse = await callMivaaGateway('get_document_content', { 
            document_id: documentId,
            include_chunks: true,
            include_images: true
          });
          
          console.log(`📄 Document content response: ${contentResponse.success ? '✅' : '❌'}`);
          
          if (contentResponse.success && contentResponse.data) {
            console.log(`✅ Document content retrieved!`);
            console.log(`📊 Response structure: ${Object.keys(contentResponse.data).join(', ')}`);
            
            if (contentResponse.data.content) {
              const content = contentResponse.data.content;
              console.log(`📝 Content structure:`);
              console.log(`   Chunks: ${content.chunks?.length || 0}`);
              console.log(`   Images: ${content.images?.length || 0}`);
              console.log(`   Tables: ${content.tables?.length || 0}`);
              console.log(`   Markdown length: ${content.markdown_content?.length || 0} chars`);
              
              if (content.chunks && content.chunks.length > 0) {
                console.log(`\n📝 Sample chunk:`);
                console.log(`   Content: ${content.chunks[0].content?.substring(0, 100)}...`);
                console.log(`   Page: ${content.chunks[0].page_number}`);
              }
              
              if (content.images && content.images.length > 0) {
                console.log(`\n🖼️ Sample image:`);
                console.log(`   URL: ${content.images[0].url}`);
                console.log(`   Page: ${content.images[0].page_number}`);
              }
            }
          } else {
            console.log(`❌ Failed to get document content: ${contentResponse.error || 'Unknown error'}`);
          }
          
        } catch (error) {
          console.log(`❌ Error retrieving document content: ${error.message}`);
        }
        
        // 3. Try to get chunks directly
        console.log(`\n🔍 Attempting to get chunks directly...`);
        try {
          const chunksResponse = await callMivaaGateway('get_document_chunks', { 
            document_id: documentId
          });
          
          console.log(`📝 Chunks response: ${chunksResponse.success ? '✅' : '❌'}`);
          if (chunksResponse.success && chunksResponse.data) {
            console.log(`📝 Chunks found: ${Array.isArray(chunksResponse.data) ? chunksResponse.data.length : 'Not an array'}`);
          } else {
            console.log(`❌ Chunks error: ${chunksResponse.error || 'Unknown error'}`);
          }
        } catch (error) {
          console.log(`❌ Error getting chunks: ${error.message}`);
        }
        
        // 4. Try to get images directly
        console.log(`\n🔍 Attempting to get images directly...`);
        try {
          const imagesResponse = await callMivaaGateway('get_document_images', { 
            document_id: documentId
          });
          
          console.log(`🖼️ Images response: ${imagesResponse.success ? '✅' : '❌'}`);
          if (imagesResponse.success && imagesResponse.data) {
            console.log(`🖼️ Images found: ${Array.isArray(imagesResponse.data) ? imagesResponse.data.length : 'Not an array'}`);
          } else {
            console.log(`❌ Images error: ${imagesResponse.error || 'Unknown error'}`);
          }
        } catch (error) {
          console.log(`❌ Error getting images: ${error.message}`);
        }
        
      } else {
        console.log(`❌ No document_id found in job details`);
      }
      
    } else {
      console.log(`❌ Failed to get job status: ${statusResponse.error || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
  
  console.log(`\n💡 Summary:`);
  console.log(`=`.repeat(50));
  console.log(`This test shows whether:`);
  console.log(`1. ✅ MIVAA processes PDFs (job completes)`);
  console.log(`2. ❌ MIVAA stores data (document content retrievable)`);
  console.log(`3. ❌ Our system stores data (database has chunks/images)`);
  console.log(`\nThe issue is likely in step 2 or 3 - data retrieval or storage.`);
}

checkJobAndData().catch(console.error);

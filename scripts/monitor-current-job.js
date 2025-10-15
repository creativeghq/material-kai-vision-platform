#!/usr/bin/env node

/**
 * Monitor Current Job
 * 
 * Monitor the job that was just created: bulk_20251014_182233
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

async function monitorJob() {
  console.log('🔍 Monitoring Current Job: ' + jobId);
  console.log('='.repeat(50));

  let attempts = 0;
  const maxAttempts = 20;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    try {
      console.log(`\n📊 Check ${attempts}/${maxAttempts} - ${new Date().toLocaleTimeString()}`);
      
      // Get job status
      const statusResponse = await callMivaaGateway('get_job_status', { job_id: jobId });
      
      console.log(`   Gateway Response: ${statusResponse.success ? '✅' : '❌'}`);
      
      if (statusResponse.success && statusResponse.data) {
        const job = statusResponse.data;
        console.log(`   Status: ${job.status}`);
        console.log(`   Progress: ${job.progress_percentage || job.progress || 'N/A'}%`);
        
        if (job.details) {
          console.log(`   Details:`);
          if (job.details.chunks_created) {
            console.log(`     📝 Chunks Created: ${job.details.chunks_created}`);
          }
          if (job.details.images_extracted) {
            console.log(`     🖼️ Images Extracted: ${job.details.images_extracted}`);
          }
          if (job.details.document_id) {
            console.log(`     📄 Document ID: ${job.details.document_id}`);
          }
          if (job.details.text_length) {
            console.log(`     📊 Text Length: ${job.details.text_length}`);
          }
        }
        
        if (job.parameters) {
          console.log(`   Parameters:`);
          if (job.parameters.chunks_created) {
            console.log(`     📝 Chunks Created: ${job.parameters.chunks_created}`);
          }
          if (job.parameters.images_extracted) {
            console.log(`     🖼️ Images Extracted: ${job.parameters.images_extracted}`);
          }
          if (job.parameters.document_id) {
            console.log(`     📄 Document ID: ${job.parameters.document_id}`);
          }
        }
        
        // Check if job is complete
        if (job.status === 'completed') {
          console.log(`\n🎉 Job completed successfully!`);
          
          // Try to get the document content
          const documentId = job.details?.document_id || job.parameters?.document_id;
          if (documentId) {
            console.log(`\n🔍 Attempting to retrieve document content: ${documentId}`);
            
            try {
              const contentResponse = await callMivaaGateway('get_document_content', { 
                document_id: documentId,
                include_chunks: true,
                include_images: true
              });
              
              if (contentResponse.success) {
                console.log(`   ✅ Document content retrieved successfully!`);
                console.log(`   Content keys: ${Object.keys(contentResponse.data || {}).join(', ')}`);
              } else {
                console.log(`   ❌ Failed to get document content: ${contentResponse.error}`);
              }
            } catch (error) {
              console.log(`   ❌ Error getting document content: ${error.message}`);
            }
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
        console.log(`   ❌ Failed to get job status: ${statusResponse.error || 'Unknown error'}`);
      }
      
      // Wait before next check
      if (attempts < maxAttempts) {
        console.log(`   ⏳ Waiting 10 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log(`\n📋 Monitoring completed after ${attempts} attempts`);
}

monitorJob().catch(console.error);

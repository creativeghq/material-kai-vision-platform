#!/usr/bin/env node

/**
 * Continue Monitoring Current Job
 * 
 * Continue monitoring the job: bulk_20251014_182233
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

async function checkJobStatus() {
  console.log('🔍 Checking Current Job Status: ' + jobId);
  console.log('='.repeat(50));

  try {
    console.log(`📊 Status Check - ${new Date().toLocaleTimeString()}`);
    
    // Get job status
    const statusResponse = await callMivaaGateway('get_job_status', { job_id: jobId });
    
    console.log(`Gateway Response: ${statusResponse.success ? '✅' : '❌'}`);
    
    if (statusResponse.success && statusResponse.data) {
      const job = statusResponse.data;
      console.log(`Status: ${job.status}`);
      console.log(`Progress: ${job.progress_percentage || job.progress || 'N/A'}%`);
      
      if (job.details) {
        console.log(`Details:`);
        Object.keys(job.details).forEach(key => {
          console.log(`  ${key}: ${job.details[key]}`);
        });
      }
      
      if (job.parameters) {
        console.log(`Parameters:`);
        Object.keys(job.parameters).forEach(key => {
          console.log(`  ${key}: ${job.parameters[key]}`);
        });
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
              console.log(`✅ Document content retrieved successfully!`);
              console.log(`Content keys: ${Object.keys(contentResponse.data || {}).join(', ')}`);
              
              if (contentResponse.data.content) {
                const content = contentResponse.data.content;
                console.log(`Content structure:`);
                console.log(`  Chunks: ${content.chunks?.length || 0}`);
                console.log(`  Images: ${content.images?.length || 0}`);
                console.log(`  Markdown length: ${content.markdown_content?.length || 0}`);
              }
            } else {
              console.log(`❌ Failed to get document content: ${contentResponse.error}`);
            }
          } catch (error) {
            console.log(`❌ Error getting document content: ${error.message}`);
          }
        }
        
        return true; // Job complete
      } else if (job.status === 'failed' || job.status === 'error') {
        console.log(`\n❌ Job failed!`);
        if (job.error_message) {
          console.log(`Error: ${job.error_message}`);
        }
        return true; // Job complete (failed)
      } else {
        console.log(`\n⏳ Job still running...`);
        return false; // Job still running
      }
      
    } else {
      console.log(`❌ Failed to get job status: ${statusResponse.error || 'Unknown error'}`);
      return false;
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

// Run the check
checkJobStatus().then(isComplete => {
  if (isComplete) {
    console.log('\n✅ Job monitoring complete');
  } else {
    console.log('\n⏳ Job still in progress - run this script again to check status');
  }
}).catch(console.error);

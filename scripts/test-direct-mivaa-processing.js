#!/usr/bin/env node

/**
 * Direct MIVAA PDF Processing Test Script
 *
 * This script tests PDF processing by calling MIVAA API directly
 * to bypass Supabase Gateway issues and test the core functionality.
 */

// WIFI MOMO PDF URL
const PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/WIFI%20MOMO%20lookbook%2001s.pdf';
const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

/**
 * Get JWT token for MIVAA API
 */
async function getMivaaToken() {
  try {
    const response = await fetch('https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/mivaa-jwt-generator', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'mivaa_token',
        payload: {}
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data.token;
  } catch (error) {
    console.error(`${colors.red}❌ Failed to get MIVAA token: ${error.message}${colors.reset}`);
    throw error;
  }
}

/**
 * Submit PDF for processing directly to MIVAA
 */
async function submitDirectProcessing(token) {
  try {
    console.log(`${colors.blue}📤 Submitting PDF directly to MIVAA...${colors.reset}`);
    
    const response = await fetch(`${MIVAA_BASE_URL}/api/bulk/process`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        urls: [PDF_URL],
        batch_size: 1,
        options: {
          extract_images: true,
          enable_multimodal: true,
          ocr_languages: ['en']
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log(`${colors.green}✅ Job submitted successfully!${colors.reset}`);
    console.log(`${colors.cyan}📋 Job ID: ${result.data.job_id}${colors.reset}`);
    console.log(`${colors.cyan}📄 Documents: ${result.data.total_documents}${colors.reset}`);
    console.log(`${colors.cyan}⏰ Estimated completion: ${result.data.estimated_completion_time}${colors.reset}`);
    
    return result.data.job_id;
  } catch (error) {
    console.error(`${colors.red}❌ Failed to submit job: ${error.message}${colors.reset}`);
    throw error;
  }
}

/**
 * Monitor job progress
 */
async function monitorJob(token, jobId) {
  console.log(`${colors.blue}🔍 Monitoring job ${jobId}...${colors.reset}`);
  
  const maxChecks = 40; // 10 minutes max
  const checkInterval = 15000; // 15 seconds
  
  for (let check = 1; check <= maxChecks; check++) {
    try {
      // Get job status
      const response = await fetch(`${MIVAA_BASE_URL}/api/jobs/${jobId}/status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.log(`${colors.yellow}⚠️ Check ${check} failed: HTTP ${response.status}${colors.reset}`);
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        continue;
      }

      const response_data = await response.json();
      const job = response_data.data || response_data; // Handle nested response structure
      const elapsed = ((Date.now() - new Date(job.created_at).getTime()) / 1000).toFixed(1);

      console.log(`${colors.cyan}⏰ [${elapsed}s] Check ${check}/${maxChecks} | Status: ${job.status}${colors.reset}`);

      if (job.progress_percentage !== undefined) {
        console.log(`${colors.cyan}   📈 Progress: ${job.progress_percentage}% | Step: ${job.current_step || 'N/A'}${colors.reset}`);
      }

      // Extract progress details from nested structure
      const details = job.details || {};
      const pagesProcessed = details.pages_processed || 0;
      const totalPages = details.total_pages || 'N/A';
      const chunksCreated = details.chunks_created || 0;
      const imagesExtracted = details.images_extracted || 0;

      console.log(`${colors.cyan}   📄 Pages: ${pagesProcessed}/${totalPages} | 📝 Chunks: ${chunksCreated} | 🖼️ Images: ${imagesExtracted}${colors.reset}`);

      if (job.status === 'completed') {
        console.log(`${colors.green}🎉 Job completed successfully!${colors.reset}`);
        return job;
      } else if (job.status === 'failed' || job.status === 'error') {
        console.log(`${colors.red}❌ Job failed: ${job.error_message || 'Unknown error'}${colors.reset}`);
        return job;
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      
    } catch (error) {
      console.log(`${colors.yellow}⚠️ Monitor check ${check} failed: ${error.message}${colors.reset}`);
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }
  
  console.log(`${colors.yellow}⚠️ Monitoring timeout after ${maxChecks} checks${colors.reset}`);
  return null;
}

/**
 * Main test function
 */
async function runDirectMivaaTest() {
  console.log(`${colors.bright}🎯 DIRECT MIVAA PDF PROCESSING TEST${colors.reset}`);
  console.log('================================================================================');
  console.log(`📄 PDF: WIFI MOMO lookbook 01s.pdf`);
  console.log(`🌐 MIVAA Service: Direct API call`);
  console.log(`🕐 Started: ${new Date().toLocaleString()}`);
  console.log('================================================================================');

  try {
    // Step 1: Get token
    console.log(`${colors.blue}🔑 STEP 1: GETTING MIVAA TOKEN${colors.reset}`);
    console.log('--------------------------------------------------');
    const token = await getMivaaToken();
    console.log(`${colors.green}✅ Token obtained successfully${colors.reset}`);
    
    // Step 2: Submit job
    console.log(`\n${colors.blue}📤 STEP 2: SUBMITTING PDF FOR PROCESSING${colors.reset}`);
    console.log('--------------------------------------------------');
    const jobId = await submitDirectProcessing(token);
    
    // Step 3: Monitor progress
    console.log(`\n${colors.blue}📊 STEP 3: MONITORING JOB PROGRESS${colors.reset}`);
    console.log('--------------------------------------------------');
    const finalJob = await monitorJob(token, jobId);
    
    if (finalJob && (finalJob.status === 'completed' || finalJob.data?.status === 'completed')) {
      console.log(`\n${colors.green}🎉 SUCCESS: PDF processing completed!${colors.reset}`);
      console.log('================================================================================');
      
      // Show final results
      const details = finalJob.details || {};
      console.log(`📊 Final Results:`);
      console.log(`   📄 Pages Processed: ${details.processed_count || 0}`);
      console.log(`   📝 Chunks Created: ${details.chunks_created || 0}`);
      console.log(`   🖼️ Images Extracted: ${details.images_extracted || 0}`);
      console.log(`   ⏱️ Processing Time: ${((new Date(finalJob.completed_at) - new Date(finalJob.created_at)) / 1000).toFixed(1)}s`);
    } else {
      console.log(`\n${colors.red}❌ PROCESSING FAILED OR TIMED OUT${colors.reset}`);
    }
    
  } catch (error) {
    console.error(`\n${colors.red}❌ TEST FAILED: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run the test
runDirectMivaaTest();

#!/usr/bin/env node

/**
 * Debug WIFI MOMO Processing Issue
 * 
 * This script investigates why jobs are getting stuck in queue
 */

const PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/WIFI%20MOMO%20lookbook%2001s.pdf';
const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

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

async function callMivaaGateway(action, payload) {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action, payload })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`${colors.red}❌ MIVAA Gateway request failed for action '${action}': ${error.message}${colors.reset}`);
    throw error;
  }
}

async function debugWifiMomoIssue() {
  console.log(`${colors.bright}${colors.blue}🔍 DEBUGGING WIFI MOMO PROCESSING ISSUE${colors.reset}`);
  console.log('='.repeat(80));
  
  // Test 1: Check PDF accessibility
  console.log(`\n${colors.yellow}📄 TEST 1: CHECKING PDF ACCESSIBILITY${colors.reset}`);
  console.log('-'.repeat(50));
  
  try {
    console.log(`${colors.cyan}🔗 PDF URL: ${PDF_URL}${colors.reset}`);
    
    const headResponse = await fetch(PDF_URL, { method: 'HEAD' });
    console.log(`${colors.cyan}📊 Response Status: ${headResponse.status}${colors.reset}`);
    
    if (headResponse.status === 200) {
      const contentLength = headResponse.headers.get('content-length');
      const contentType = headResponse.headers.get('content-type');
      
      console.log(`${colors.green}✅ PDF is accessible${colors.reset}`);
      console.log(`${colors.cyan}📊 Content-Type: ${contentType}${colors.reset}`);
      console.log(`${colors.cyan}📊 Content-Length: ${contentLength}${colors.reset}`);
      
      if (contentLength) {
        const sizeMB = parseInt(contentLength) / (1024 * 1024);
        console.log(`${colors.cyan}📏 File size: ${sizeMB.toFixed(2)}MB${colors.reset}`);
      }
    } else {
      console.log(`${colors.red}❌ PDF is not accessible! Status: ${headResponse.status}${colors.reset}`);
      return;
    }
  } catch (error) {
    console.log(`${colors.red}❌ Error checking PDF: ${error.message}${colors.reset}`);
    return;
  }
  
  // Test 2: Check MIVAA service health
  console.log(`\n${colors.yellow}🏥 TEST 2: CHECKING MIVAA SERVICE HEALTH${colors.reset}`);
  console.log('-'.repeat(50));
  
  try {
    const healthResponse = await callMivaaGateway('health_check', {});
    console.log(`${colors.green}✅ MIVAA service health check:${colors.reset}`);
    console.log(JSON.stringify(healthResponse, null, 2));
  } catch (error) {
    console.log(`${colors.red}❌ MIVAA health check failed: ${error.message}${colors.reset}`);
  }
  
  // Test 3: Check current jobs in queue
  console.log(`\n${colors.yellow}📋 TEST 3: CHECKING CURRENT JOBS QUEUE${colors.reset}`);
  console.log('-'.repeat(50));
  
  try {
    const jobsResponse = await callMivaaGateway('list_jobs', {});
    
    if (jobsResponse.success && jobsResponse.data && jobsResponse.data.jobs) {
      const jobs = jobsResponse.data.jobs;
      console.log(`${colors.green}✅ Found ${jobs.length} jobs in queue${colors.reset}`);
      
      // Show running jobs
      const runningJobs = jobs.filter(job => job.status === 'running');
      console.log(`${colors.cyan}🔄 Running jobs: ${runningJobs.length}${colors.reset}`);
      
      runningJobs.forEach((job, index) => {
        const createdAt = job.created_at ? new Date(job.created_at).toLocaleString() : 'N/A';
        const startedAt = job.started_at ? new Date(job.started_at).toLocaleString() : 'Not started';
        const queueTime = job.created_at ? ((Date.now() - new Date(job.created_at).getTime()) / 1000).toFixed(1) : 'N/A';
        
        console.log(`${colors.white}  ${index + 1}. Job ID: ${job.job_id}${colors.reset}`);
        console.log(`${colors.white}     Status: ${job.status} | Progress: ${job.progress_percentage}%${colors.reset}`);
        console.log(`${colors.white}     Created: ${createdAt} | Started: ${startedAt}${colors.reset}`);
        console.log(`${colors.white}     Queue time: ${queueTime}s${colors.reset}`);
      });
      
      // Show completed jobs
      const completedJobs = jobs.filter(job => job.status === 'completed');
      console.log(`${colors.green}✅ Completed jobs: ${completedJobs.length}${colors.reset}`);
      
      // Show failed jobs
      const failedJobs = jobs.filter(job => job.status === 'failed');
      console.log(`${colors.red}❌ Failed jobs: ${failedJobs.length}${colors.reset}`);
      
      if (failedJobs.length > 0) {
        console.log(`${colors.red}Failed job details:${colors.reset}`);
        failedJobs.slice(0, 3).forEach((job, index) => {
          console.log(`${colors.white}  ${index + 1}. Job ID: ${job.job_id}${colors.reset}`);
          console.log(`${colors.white}     Error: ${job.error_message || 'No error message'}${colors.reset}`);
        });
      }
    } else {
      console.log(`${colors.yellow}⚠️ No jobs found or failed to get jobs list${colors.reset}`);
    }
  } catch (error) {
    console.log(`${colors.red}❌ Failed to get jobs list: ${error.message}${colors.reset}`);
  }
  
  // Test 4: Try a simple processing test
  console.log(`\n${colors.yellow}🧪 TEST 4: SUBMITTING TEST JOB${colors.reset}`);
  console.log('-'.repeat(50));
  
  try {
    const testResponse = await callMivaaGateway('bulk_process', {
      urls: [PDF_URL],
      batch_size: 1,
      processing_options: {
        extract_text: true,
        extract_images: true,
        extract_tables: true
      }
    });
    
    if (testResponse.success && testResponse.data && testResponse.data.data && testResponse.data.data.job_id) {
      const jobId = testResponse.data.data.job_id;
      console.log(`${colors.green}✅ Test job submitted successfully!${colors.reset}`);
      console.log(`${colors.cyan}📋 Job ID: ${jobId}${colors.reset}`);
      
      // Monitor for a short time to see if it starts
      console.log(`${colors.cyan}🔍 Monitoring for 30 seconds to see if job starts...${colors.reset}`);
      
      for (let i = 0; i < 6; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        try {
          const jobsResponse = await callMivaaGateway('list_jobs', {});
          if (jobsResponse.success && jobsResponse.data && jobsResponse.data.jobs) {
            const job = jobsResponse.data.jobs.find(j => j.job_id === jobId);
            if (job) {
              const hasStarted = job.started_at !== null;
              console.log(`${colors.cyan}   Check ${i + 1}: Status=${job.status}, Started=${hasStarted ? 'Yes' : 'No'}, Progress=${job.progress_percentage}%${colors.reset}`);
              
              if (hasStarted) {
                console.log(`${colors.green}✅ Job has started processing!${colors.reset}`);
                break;
              }
            }
          }
        } catch (monitorError) {
          console.log(`${colors.yellow}⚠️ Monitor check ${i + 1} failed: ${monitorError.message}${colors.reset}`);
        }
      }
    } else {
      console.log(`${colors.red}❌ Failed to submit test job${colors.reset}`);
      console.log(JSON.stringify(testResponse, null, 2));
    }
  } catch (error) {
    console.log(`${colors.red}❌ Test job submission failed: ${error.message}${colors.reset}`);
  }
  
  console.log(`\n${colors.bright}${colors.blue}🔍 DEBUGGING COMPLETE${colors.reset}`);
}

// Run the debug script
debugWifiMomoIssue().catch(console.error);

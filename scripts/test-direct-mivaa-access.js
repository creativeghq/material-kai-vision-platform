#!/usr/bin/env node

/**
 * Test Direct MIVAA Access
 * 
 * This script tests accessing MIVAA service directly to bypass gateway issues
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
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

let mivaaToken = null;

/**
 * Get MIVAA JWT token via Supabase function
 */
async function getMivaaToken() {
  console.log(`${colors.cyan}🔐 Getting MIVAA JWT token...${colors.reset}`);
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mivaa-jwt-generator`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'mivaa_token',
        payload: {}
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to get MIVAA token: HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success && data.data && data.data.token) {
      mivaaToken = data.data.token;
      console.log(`${colors.green}✅ MIVAA token obtained successfully${colors.reset}`);
      return mivaaToken;
    } else {
      throw new Error(`Token generation failed: ${data.error?.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.error(`${colors.red}❌ Failed to get MIVAA token: ${error.message}${colors.reset}`);
    throw error;
  }
}

/**
 * Make direct request to MIVAA service
 */
async function makeDirectMivaaRequest(endpoint, options = {}) {
  if (!mivaaToken) {
    await getMivaaToken();
  }

  const url = `${MIVAA_BASE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mivaaToken}`,
        ...options.headers
      },
      ...options
    });

    console.log(`${colors.cyan}📡 Direct MIVAA request: ${options.method || 'GET'} ${url}${colors.reset}`);
    console.log(`${colors.cyan}📊 Response status: ${response.status}${colors.reset}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`${colors.red}❌ Direct MIVAA request failed to ${endpoint}: ${error.message}${colors.reset}`);
    throw error;
  }
}

async function testDirectMivaaAccess() {
  console.log(`${colors.bright}${colors.blue}🔍 TESTING DIRECT MIVAA ACCESS${colors.reset}`);
  console.log('='.repeat(80));
  
  // Test 1: Health check
  console.log(`\n${colors.yellow}🏥 TEST 1: DIRECT HEALTH CHECK${colors.reset}`);
  console.log('-'.repeat(50));
  
  try {
    const healthResponse = await makeDirectMivaaRequest('/health');
    console.log(`${colors.green}✅ Direct health check successful:${colors.reset}`);
    console.log(JSON.stringify(healthResponse, null, 2));
  } catch (error) {
    console.log(`${colors.red}❌ Direct health check failed: ${error.message}${colors.reset}`);
  }
  
  // Test 2: List jobs directly
  console.log(`\n${colors.yellow}📋 TEST 2: DIRECT JOBS LIST${colors.reset}`);
  console.log('-'.repeat(50));
  
  try {
    const jobsResponse = await makeDirectMivaaRequest('/api/jobs');
    console.log(`${colors.green}✅ Direct jobs list successful:${colors.reset}`);
    console.log(JSON.stringify(jobsResponse, null, 2));
    
    if (jobsResponse.jobs && jobsResponse.jobs.length > 0) {
      console.log(`${colors.cyan}📊 Found ${jobsResponse.jobs.length} jobs${colors.reset}`);
      
      // Show recent jobs
      const recentJobs = jobsResponse.jobs.slice(0, 5);
      recentJobs.forEach((job, index) => {
        console.log(`${colors.white}  ${index + 1}. Job ID: ${job.job_id} | Status: ${job.status} | Progress: ${job.progress_percentage || 0}%${colors.reset}`);
      });
    }
  } catch (error) {
    console.log(`${colors.red}❌ Direct jobs list failed: ${error.message}${colors.reset}`);
  }
  
  // Test 3: Try to get a specific job (use a recent job ID if available)
  console.log(`\n${colors.yellow}🔍 TEST 3: DIRECT JOB STATUS CHECK${colors.reset}`);
  console.log('-'.repeat(50));
  
  // Let's try with a recent job ID
  const testJobId = 'bulk_20251012_141029'; // From our recent test
  
  try {
    const jobResponse = await makeDirectMivaaRequest(`/api/jobs/${testJobId}`);
    console.log(`${colors.green}✅ Direct job status successful:${colors.reset}`);
    console.log(JSON.stringify(jobResponse, null, 2));
  } catch (error) {
    console.log(`${colors.red}❌ Direct job status failed: ${error.message}${colors.reset}`);
  }
  
  // Test 4: Submit a new job directly
  console.log(`\n${colors.yellow}🧪 TEST 4: DIRECT JOB SUBMISSION${colors.reset}`);
  console.log('-'.repeat(50));
  
  const PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/WIFI%20MOMO%20lookbook%2001s.pdf';
  
  try {
    const submitResponse = await makeDirectMivaaRequest('/api/bulk/process', {
      method: 'POST',
      body: JSON.stringify({
        urls: [PDF_URL],
        batch_size: 1,
        options: {
          extract_text: true,
          extract_images: true,
          extract_tables: true
        }
      })
    });
    
    console.log(`${colors.green}✅ Direct job submission successful:${colors.reset}`);
    console.log(JSON.stringify(submitResponse, null, 2));
    
    if (submitResponse.success && submitResponse.data && submitResponse.data.job_id) {
      const newJobId = submitResponse.data.job_id;
      console.log(`${colors.cyan}📋 New Job ID: ${newJobId}${colors.reset}`);
      
      // Try to monitor this job for a short time
      console.log(`${colors.cyan}🔍 Monitoring new job for 60 seconds...${colors.reset}`);
      
      for (let i = 0; i < 4; i++) {
        await new Promise(resolve => setTimeout(resolve, 15000));
        
        try {
          const statusResponse = await makeDirectMivaaRequest(`/api/jobs/${newJobId}`);
          console.log(`${colors.cyan}   Check ${i + 1}: Status=${statusResponse.status}, Progress=${statusResponse.progress_percentage || 0}%${colors.reset}`);
          
          if (statusResponse.status === 'completed') {
            console.log(`${colors.green}🎉 Job completed!${colors.reset}`);
            console.log(JSON.stringify(statusResponse, null, 2));
            break;
          } else if (statusResponse.status === 'failed') {
            console.log(`${colors.red}❌ Job failed: ${statusResponse.error_message || 'Unknown error'}${colors.reset}`);
            break;
          }
        } catch (monitorError) {
          console.log(`${colors.yellow}⚠️ Monitor check ${i + 1} failed: ${monitorError.message}${colors.reset}`);
        }
      }
    }
  } catch (error) {
    console.log(`${colors.red}❌ Direct job submission failed: ${error.message}${colors.reset}`);
  }
  
  console.log(`\n${colors.bright}${colors.blue}🔍 DIRECT MIVAA ACCESS TEST COMPLETE${colors.reset}`);
}

// Run the test
testDirectMivaaAccess().catch(console.error);

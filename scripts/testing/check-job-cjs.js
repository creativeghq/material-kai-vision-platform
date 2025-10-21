/**
 * Check job status (CommonJS version)
 */

const fetch = require('node-fetch');

const jobId = process.argv[2];

if (!jobId) {
  console.error('Usage: node check-job-cjs.js <job_id>');
  process.exit(1);
}

async function checkJobStatus() {
  try {
    console.log(`🔍 Checking job status for: ${jobId}\n`);
    
    const response = await fetch(`https://v1api.materialshub.gr/api/rag/documents/job/${jobId}`, {
      headers: {
        'Authorization': 'Bearer test',
      },
    });
    
    console.log(`Response status: ${response.status} ${response.statusText}\n`);
    
    const data = await response.json();
    console.log('Job Status:');
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkJobStatus();


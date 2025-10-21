/**
 * Check job status
 */

import fetch from 'node-fetch';

const jobId = process.argv[2];

if (!jobId) {
  console.error('Usage: node check-job-status.js <job_id>');
  process.exit(1);
}

async function checkJobStatus() {
  try {
    const response = await fetch(`https://v1api.materialshub.gr/api/rag/documents/job/${jobId}`, {
      headers: {
        'Authorization': 'Bearer test',
      },
    });
    
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkJobStatus();


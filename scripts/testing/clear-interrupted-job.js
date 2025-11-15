/**
 * Clear Interrupted Job
 * Deletes the interrupted job to allow fresh processing
 */

import fetch from 'node-fetch';

const MIVAA_API = 'https://v1api.materialshub.gr';
const JOB_ID = 'df28ea2f-71b3-4b62-a0c7-1359e22d0e28';

async function clearJob() {
  console.log(`🗑️  Deleting interrupted job: ${JOB_ID}`);
  
  try {
    const response = await fetch(`${MIVAA_API}/api/rag/documents/job/${JOB_ID}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      console.log('✅ Job deleted successfully');
      const data = await response.json();
      console.log(JSON.stringify(data, null, 2));
    } else {
      const error = await response.text();
      console.log(`❌ Failed to delete job: ${response.status}`);
      console.log(error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

clearJob();


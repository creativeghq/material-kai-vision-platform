/**
 * Poll job status until completion
 */

import fetch from 'node-fetch';

const jobId = process.argv[2] || '813cf724-edce-4134-95c0-0c523b5d0331';

async function pollJob() {
  console.log(`🔄 Polling job ${jobId}...\n`);
  
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(`https://v1api.materialshub.gr/api/rag/documents/job/${jobId}`, {
        headers: {
          'Authorization': 'Bearer test',
        },
      });
      
      const data = await response.json();
      console.log(`[${i + 1}/120] Status: ${data.status}, Progress: ${data.progress}%`);
      
      if (data.status === 'completed') {
        console.log('\n✅ Job completed successfully!');
        console.log(JSON.stringify(data.result, null, 2));
        return;
      } else if (data.status === 'failed') {
        console.error('\n❌ Job failed!');
        console.error('Error:', data.error);
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }
  
  console.error('\n⏱️  Timeout: Job did not complete in 10 minutes');
}

pollJob();


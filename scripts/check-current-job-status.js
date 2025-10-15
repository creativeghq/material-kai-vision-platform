#!/usr/bin/env node

/**
 * Check current job status quickly
 */

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';
const JOB_ID = 'bulk_20251015_041844';

async function checkCurrentJobStatus() {
  console.log('🔍 Checking Current Job Status');
  console.log('==================================================\n');

  try {
    console.log(`🆔 Job ID: ${JOB_ID}`);
    
    const response = await fetch(`${MIVAA_BASE_URL}/api/jobs/${JOB_ID}/status`);
    
    console.log(`📊 Response: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('\n📄 FULL RESPONSE:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      const errorText = await response.text();
      console.log(`❌ Error: ${errorText}`);
    }
    
  } catch (error) {
    console.error(`❌ Request failed: ${error.message}`);
  }
}

checkCurrentJobStatus().catch(console.error);

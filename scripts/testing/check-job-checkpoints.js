import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzA3MjU4NzAsImV4cCI6MjA0NjMwMTg3MH0.ts3od_2FqFN7VZFAoMEKdslNnKLdxy-Nt_Aq_wJEMhI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkJobCheckpoints(jobId) {
  console.log('\n' + '='.repeat(80));
  console.log(`CHECKPOINT HISTORY FOR JOB: ${jobId}`);
  console.log('='.repeat(80) + '\n');

  // Get all checkpoints for this job
  const { data: checkpoints, error: checkpointError } = await supabase
    .from('job_checkpoints')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at');

  if (checkpointError) {
    console.error('❌ Error fetching checkpoints:', checkpointError);
  } else if (checkpoints && checkpoints.length > 0) {
    checkpoints.forEach((checkpoint, i) => {
      console.log(`${i + 1}. Stage: ${checkpoint.stage}`);
      console.log(`   Created: ${checkpoint.created_at}`);
      console.log(`   Data:`, checkpoint.data || {});
      console.log(`   Metadata:`, checkpoint.metadata || {});
      console.log();
    });
  } else {
    console.log('⚠️ No checkpoints found!');
  }

  // Get current job status
  const { data: jobs, error: jobError } = await supabase
    .from('background_jobs')
    .select('*')
    .eq('id', jobId);

  if (jobError) {
    console.error('❌ Error fetching job:', jobError);
  } else if (jobs && jobs.length > 0) {
    const job = jobs[0];
    console.log('\n' + '='.repeat(80));
    console.log('CURRENT JOB STATUS');
    console.log('='.repeat(80));
    console.log(`Status: ${job.status}`);
    console.log(`Progress: ${job.progress}%`);
    console.log(`Last Checkpoint:`, job.last_checkpoint || {});
    console.log(`Metadata:`, job.metadata || {});
    console.log('='.repeat(80) + '\n');
  } else {
    console.log('⚠️ Job not found!');
  }
}

const jobId = process.argv[2] || 'b2bb54a5-c442-4c5e-bfaa-c115acdc25c5';
checkJobCheckpoints(jobId).catch(console.error);


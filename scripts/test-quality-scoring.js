#!/usr/bin/env node

/**
 * Quality Scoring Test Script
 * 
 * Tests PDF processing with quality scoring monitoring
 * - Submits WIFI MOMO PDF for processing
 * - Monitors job progress
 * - Queries quality metrics from database
 * - Shows coherence scores and quality distribution
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

// Using WIFI MOMO PDF for testing quality scoring
const PDF_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/49f683ad-ebf2-4296-a410-0d8c011ce0be/1760462185826-harmony-signature-book-24-25.pdf';

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
    console.error(`${colors.red}❌ MIVAA Gateway error: ${error.message}${colors.reset}`);
    throw error;
  }
}

async function fetchFromSupabase(table, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`${colors.red}❌ Supabase query error: ${error.message}${colors.reset}`);
    return [];
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function submitJob() {
  console.log(`${colors.yellow}📤 SUBMITTING WIFI MOMO PDF FOR PROCESSING${colors.reset}`);
  console.log('-'.repeat(70));

  const response = await callMivaaGateway('bulk_process', {
    urls: [PDF_URL],
    batch_size: 1,
    processing_options: {
      extract_text: true,
      extract_images: true,
      extract_tables: true
    }
  });

  if (response.success) {
    const jobId = response.data?.job_id || response.data?.data?.job_id;
    if (jobId) {
      console.log(`${colors.green}✅ Job submitted!${colors.reset}`);
      console.log(`${colors.cyan}Job ID: ${jobId}${colors.reset}`);
      return jobId;
    }
  }
  throw new Error(`Invalid response: ${JSON.stringify(response)}`);
}

async function monitorJobProgress(jobId) {
  console.log(`\n${colors.yellow}⏳ MONITORING JOB PROGRESS${colors.reset}`);
  console.log('-'.repeat(70));

  let completed = false;
  let lastProgress = 0;

  while (!completed) {
    try {
      const response = await callMivaaGateway('get_job_status', { job_id: jobId });
      
      if (response.success && response.data?.data) {
        const job = response.data.data;
        const progress = job.progress || 0;

        if (progress !== lastProgress) {
          console.log(`${colors.cyan}Progress: ${progress}% | Status: ${job.status}${colors.reset}`);
          lastProgress = progress;
        }

        if (job.status === 'completed' || job.status === 'success') {
          completed = true;
          console.log(`${colors.green}✅ Job completed!${colors.reset}`);
          return job;
        }

        if (job.status === 'failed' || job.status === 'error') {
          throw new Error(`Job failed: ${job.error || 'Unknown error'}`);
        }
      }

      await sleep(2000);
    } catch (error) {
      console.error(`${colors.red}Error monitoring job: ${error.message}${colors.reset}`);
      await sleep(2000);
    }
  }
}

async function queryQualityMetrics(documentId) {
  console.log(`\n${colors.yellow}📊 QUERYING QUALITY METRICS${colors.reset}`);
  console.log('-'.repeat(70));

  try {
    const chunks = await fetchFromSupabase('document_chunks', `document_id=eq.${documentId}`);
    
    if (chunks.length === 0) {
      console.log(`${colors.yellow}⚠️  No chunks found yet${colors.reset}`);
      return;
    }

    console.log(`${colors.cyan}Total Chunks: ${chunks.length}${colors.reset}`);

    const coherenceScores = chunks
      .map(c => c.coherence_score)
      .filter(s => s !== null && s !== undefined);

    if (coherenceScores.length === 0) {
      console.log(`${colors.yellow}⚠️  No coherence scores yet (processing may still be running)${colors.reset}`);
      return;
    }

    const sortedScores = [...coherenceScores].sort((a, b) => a - b);
    const avgScore = sortedScores.reduce((a, b) => a + b, 0) / sortedScores.length;

    console.log(`\n${colors.cyan}Coherence Scores:${colors.reset}`);
    console.log(`  Average: ${(avgScore * 100).toFixed(1)}%`);
    console.log(`  Range: ${(sortedScores[0] * 100).toFixed(1)}% - ${(sortedScores[sortedScores.length - 1] * 100).toFixed(1)}%`);
    console.log(`  Median: ${(sortedScores[Math.floor(sortedScores.length / 2)] * 100).toFixed(1)}%`);

    const excellent = coherenceScores.filter(s => s >= 0.9).length;
    const veryGood = coherenceScores.filter(s => s >= 0.8 && s < 0.9).length;
    const good = coherenceScores.filter(s => s >= 0.7 && s < 0.8).length;
    const fair = coherenceScores.filter(s => s >= 0.6 && s < 0.7).length;
    const acceptable = coherenceScores.filter(s => s >= 0.5 && s < 0.6).length;
    const poor = coherenceScores.filter(s => s < 0.5).length;

    console.log(`\n${colors.cyan}Quality Distribution:${colors.reset}`);
    console.log(`  ${colors.green}Excellent (0.9-1.0): ${excellent} (${((excellent / coherenceScores.length) * 100).toFixed(1)}%)${colors.reset}`);
    console.log(`  ${colors.green}Very Good (0.8-0.9): ${veryGood} (${((veryGood / coherenceScores.length) * 100).toFixed(1)}%)${colors.reset}`);
    console.log(`  ${colors.blue}Good (0.7-0.8): ${good} (${((good / coherenceScores.length) * 100).toFixed(1)}%)${colors.reset}`);
    console.log(`  ${colors.yellow}Fair (0.6-0.7): ${fair} (${((fair / coherenceScores.length) * 100).toFixed(1)}%)${colors.reset}`);
    console.log(`  ${colors.yellow}Acceptable (0.5-0.6): ${acceptable} (${((acceptable / coherenceScores.length) * 100).toFixed(1)}%)${colors.reset}`);
    console.log(`  ${colors.red}Poor (<0.5): ${poor} (${((poor / coherenceScores.length) * 100).toFixed(1)}%)${colors.reset}`);

    const sizes = chunks.map(c => c.content.length);
    console.log(`\n${colors.cyan}Chunk Size Metrics:${colors.reset}`);
    console.log(`  Average: ${Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)} chars`);
    console.log(`  Range: ${Math.min(...sizes)} - ${Math.max(...sizes)} chars`);

    const images = await fetchFromSupabase('document_images', `document_id=eq.${documentId}`);
    console.log(`\n${colors.cyan}Image Metrics:${colors.reset}`);
    console.log(`  Total Images: ${images.length}`);

    if (images.length > 0) {
      const confidences = images.map(i => i.confidence || 0);
      const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
      console.log(`  Average Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
    }

  } catch (error) {
    console.error(`${colors.red}Error querying metrics: ${error.message}${colors.reset}`);
  }
}

async function main() {
  try {
    console.log(`${colors.bright}${colors.magenta}╔════════════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.magenta}║         QUALITY SCORING TEST - WIFI MOMO PDF PROCESSING              ║${colors.reset}`);
    console.log(`${colors.bright}${colors.magenta}╚════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

    const jobId = await submitJob();
    const job = await monitorJobProgress(jobId);

    if (job && job.document_id) {
      await queryQualityMetrics(job.document_id);
    }

    console.log(`\n${colors.bright}${colors.green}✅ TEST COMPLETE${colors.reset}`);
    console.log(`${colors.cyan}Job ID: ${jobId}${colors.reset}`);

  } catch (error) {
    console.error(`${colors.red}${colors.bright}❌ TEST FAILED: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

main();


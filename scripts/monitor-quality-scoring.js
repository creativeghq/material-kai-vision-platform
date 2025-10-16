#!/usr/bin/env node

/**
 * Monitor Quality Scoring
 * 
 * Monitors a specific job and queries quality metrics
 * Usage: node scripts/monitor-quality-scoring.js <job_id>
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const jobId = process.argv[2];

if (!jobId) {
  console.error(`${colors.red}❌ Job ID required${colors.reset}`);
  console.error(`Usage: node scripts/monitor-quality-scoring.js <job_id>`);
  process.exit(1);
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
    console.error(`${colors.red}❌ Query error: ${error.message}${colors.reset}`);
    return [];
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function queryQualityMetrics() {
  console.log(`${colors.yellow}📊 QUERYING QUALITY METRICS FOR JOB: ${jobId}${colors.reset}`);
  console.log('-'.repeat(70));

  try {
    // Get documents for this job
    const documents = await fetchFromSupabase('documents', `order=created_at.desc&limit=5`);
    
    if (documents.length === 0) {
      console.log(`${colors.yellow}⚠️  No documents found${colors.reset}`);
      return;
    }

    for (const doc of documents) {
      console.log(`\n${colors.cyan}Document: ${doc.title || doc.filename}${colors.reset}`);
      console.log(`ID: ${doc.id}`);

      const chunks = await fetchFromSupabase('document_chunks', `document_id=eq.${doc.id}`);
      
      if (chunks.length === 0) {
        console.log(`${colors.yellow}  No chunks found${colors.reset}`);
        continue;
      }

      console.log(`${colors.cyan}  Total Chunks: ${chunks.length}${colors.reset}`);

      const coherenceScores = chunks
        .map(c => c.coherence_score)
        .filter(s => s !== null && s !== undefined);

      if (coherenceScores.length === 0) {
        console.log(`${colors.yellow}  ⚠️  No coherence scores yet${colors.reset}`);
        continue;
      }

      const sortedScores = [...coherenceScores].sort((a, b) => a - b);
      const avgScore = sortedScores.reduce((a, b) => a + b, 0) / sortedScores.length;

      console.log(`${colors.green}  ✅ Coherence Scores Found!${colors.reset}`);
      console.log(`    Average: ${(avgScore * 100).toFixed(1)}%`);
      console.log(`    Range: ${(sortedScores[0] * 100).toFixed(1)}% - ${(sortedScores[sortedScores.length - 1] * 100).toFixed(1)}%`);
      console.log(`    Median: ${(sortedScores[Math.floor(sortedScores.length / 2)] * 100).toFixed(1)}%`);

      const excellent = coherenceScores.filter(s => s >= 0.9).length;
      const veryGood = coherenceScores.filter(s => s >= 0.8 && s < 0.9).length;
      const good = coherenceScores.filter(s => s >= 0.7 && s < 0.8).length;
      const fair = coherenceScores.filter(s => s >= 0.6 && s < 0.7).length;
      const acceptable = coherenceScores.filter(s => s >= 0.5 && s < 0.6).length;
      const poor = coherenceScores.filter(s => s < 0.5).length;

      console.log(`\n${colors.cyan}  Quality Distribution:${colors.reset}`);
      console.log(`    ${colors.green}Excellent (0.9-1.0): ${excellent} (${((excellent / coherenceScores.length) * 100).toFixed(1)}%)${colors.reset}`);
      console.log(`    ${colors.green}Very Good (0.8-0.9): ${veryGood} (${((veryGood / coherenceScores.length) * 100).toFixed(1)}%)${colors.reset}`);
      console.log(`    ${colors.blue}Good (0.7-0.8): ${good} (${((good / coherenceScores.length) * 100).toFixed(1)}%)${colors.reset}`);
      console.log(`    ${colors.yellow}Fair (0.6-0.7): ${fair} (${((fair / coherenceScores.length) * 100).toFixed(1)}%)${colors.reset}`);
      console.log(`    ${colors.yellow}Acceptable (0.5-0.6): ${acceptable} (${((acceptable / coherenceScores.length) * 100).toFixed(1)}%)${colors.reset}`);
      console.log(`    ${colors.red}Poor (<0.5): ${poor} (${((poor / coherenceScores.length) * 100).toFixed(1)}%)${colors.reset}`);

      const sizes = chunks.map(c => c.content.length);
      console.log(`\n${colors.cyan}  Chunk Size Metrics:${colors.reset}`);
      console.log(`    Average: ${Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)} chars`);
      console.log(`    Range: ${Math.min(...sizes)} - ${Math.max(...sizes)} chars`);

      const images = await fetchFromSupabase('document_images', `document_id=eq.${doc.id}`);
      console.log(`\n${colors.cyan}  Image Metrics:${colors.reset}`);
      console.log(`    Total Images: ${images.length}`);

      if (images.length > 0) {
        const confidences = images.map(i => i.confidence || 0);
        const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
        console.log(`    Average Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
      }
    }

  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  }
}

async function main() {
  console.log(`${colors.bright}${colors.magenta}╔════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}║              QUALITY SCORING MONITOR                                  ║${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}╚════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  await queryQualityMetrics();

  console.log(`\n${colors.bright}${colors.green}✅ MONITORING COMPLETE${colors.reset}`);
}

main();


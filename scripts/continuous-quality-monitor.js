#!/usr/bin/env node

/**
 * Continuous Quality Scoring Monitor
 * 
 * Continuously monitors quality metrics and shows updates
 * Usage: node scripts/continuous-quality-monitor.js
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
      return [];
    }
    return await response.json();
  } catch (error) {
    return [];
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function displayMetrics(doc) {
  const chunks = await fetchFromSupabase('document_chunks', `document_id=eq.${doc.id}`);
  
  if (chunks.length === 0) return null;

  const coherenceScores = chunks
    .map(c => c.coherence_score)
    .filter(s => s !== null && s !== undefined);

  if (coherenceScores.length === 0) return null;

  const sortedScores = [...coherenceScores].sort((a, b) => a - b);
  const avgScore = sortedScores.reduce((a, b) => a + b, 0) / sortedScores.length;

  const excellent = coherenceScores.filter(s => s >= 0.9).length;
  const veryGood = coherenceScores.filter(s => s >= 0.8 && s < 0.9).length;
  const good = coherenceScores.filter(s => s >= 0.7 && s < 0.8).length;
  const fair = coherenceScores.filter(s => s >= 0.6 && s < 0.7).length;
  const acceptable = coherenceScores.filter(s => s >= 0.5 && s < 0.6).length;
  const poor = coherenceScores.filter(s => s < 0.5).length;

  const sizes = chunks.map(c => c.content.length);
  const images = await fetchFromSupabase('document_images', `document_id=eq.${doc.id}`);

  return {
    title: doc.title || doc.filename,
    chunks: chunks.length,
    avgScore: (avgScore * 100).toFixed(1),
    minScore: (sortedScores[0] * 100).toFixed(1),
    maxScore: (sortedScores[sortedScores.length - 1] * 100).toFixed(1),
    excellent,
    veryGood,
    good,
    fair,
    acceptable,
    poor,
    avgSize: Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
    images: images.length,
  };
}

async function main() {
  console.log(`${colors.bright}${colors.magenta}╔════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}║         CONTINUOUS QUALITY SCORING MONITOR                           ║${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}║         Press Ctrl+C to stop                                          ║${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}╚════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  let lastCheck = 0;
  let foundScores = false;

  while (true) {
    try {
      const documents = await fetchFromSupabase('documents', `order=created_at.desc&limit=10`);
      
      if (documents.length === 0) {
        console.log(`${colors.yellow}⏳ Waiting for documents...${colors.reset}`);
        await sleep(5000);
        continue;
      }

      console.clear();
      console.log(`${colors.bright}${colors.magenta}╔════════════════════════════════════════════════════════════════════╗${colors.reset}`);
      console.log(`${colors.bright}${colors.magenta}║         CONTINUOUS QUALITY SCORING MONITOR                           ║${colors.reset}`);
      console.log(`${colors.bright}${colors.magenta}║         Press Ctrl+C to stop                                          ║${colors.reset}`);
      console.log(`${colors.bright}${colors.magenta}╚════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

      console.log(`${colors.cyan}Last Updated: ${new Date().toLocaleTimeString()}${colors.reset}\n`);

      let hasScores = false;

      for (const doc of documents) {
        const metrics = await displayMetrics(doc);
        
        if (metrics) {
          hasScores = true;
          console.log(`${colors.green}✅ ${metrics.title}${colors.reset}`);
          console.log(`   Chunks: ${metrics.chunks} | Avg Score: ${metrics.avgScore}% | Images: ${metrics.images}`);
          console.log(`   Quality: ${colors.green}Excellent: ${metrics.excellent}${colors.reset} | ${colors.green}Very Good: ${metrics.veryGood}${colors.reset} | ${colors.blue}Good: ${metrics.good}${colors.reset} | ${colors.yellow}Fair: ${metrics.fair}${colors.reset} | ${colors.red}Poor: ${metrics.poor}${colors.reset}`);
          console.log(`   Avg Size: ${metrics.avgSize} chars\n`);
        } else {
          console.log(`${colors.yellow}⏳ ${doc.title || doc.filename}${colors.reset}`);
          console.log(`   Processing... (no scores yet)\n`);
        }
      }

      if (hasScores && !foundScores) {
        foundScores = true;
        console.log(`${colors.bright}${colors.green}🎉 QUALITY SCORES DETECTED!${colors.reset}\n`);
      }

      await sleep(10000);

    } catch (error) {
      console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
      await sleep(5000);
    }
  }
}

main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});


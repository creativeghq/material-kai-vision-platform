#!/usr/bin/env node

/**
 * Check Quality Status
 * Shows if quality scoring is being applied
 */

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
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

async function main() {
  console.log(`${colors.bright}${colors.cyan}🔍 QUALITY SCORING STATUS${colors.reset}\n`);

  // Get most recent document
  const documents = await fetchFromSupabase('documents', `order=created_at.desc&limit=1`);
  
  if (documents.length === 0) {
    console.log(`${colors.red}No documents found${colors.reset}`);
    return;
  }

  const doc = documents[0];
  console.log(`${colors.cyan}Document: ${doc.title || doc.filename}${colors.reset}`);
  console.log(`ID: ${doc.id}`);
  console.log(`Created: ${doc.created_at}\n`);

  // Get ALL chunks for this document
  const url = `${SUPABASE_URL}/rest/v1/document_chunks?document_id=eq.${doc.id}`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, { headers });
  const chunks = await response.json();

  console.log(`${colors.cyan}Total Chunks: ${chunks.length}${colors.reset}\n`);

  if (chunks.length === 0) {
    console.log(`${colors.yellow}No chunks found${colors.reset}`);
    return;
  }

  // Check quality scoring status
  const withScores = chunks.filter(c => c.coherence_score !== null && c.coherence_score !== undefined).length;
  const withoutScores = chunks.length - withScores;

  console.log(`${colors.cyan}Quality Scoring Status:${colors.reset}`);
  console.log(`  With Scores: ${withScores}/${chunks.length}`);
  console.log(`  Without Scores: ${withoutScores}/${chunks.length}`);
  console.log(`  Percentage: ${((withScores / chunks.length) * 100).toFixed(1)}%\n`);

  if (withScores > 0) {
    console.log(`${colors.green}✅ Quality scoring IS being applied!${colors.reset}\n`);

    const scores = chunks
      .filter(c => c.coherence_score !== null)
      .map(c => c.coherence_score)
      .sort((a, b) => a - b);

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    console.log(`${colors.cyan}Score Statistics:${colors.reset}`);
    console.log(`  Average: ${(avg * 100).toFixed(1)}%`);
    console.log(`  Min: ${(scores[0] * 100).toFixed(1)}%`);
    console.log(`  Max: ${(scores[scores.length - 1] * 100).toFixed(1)}%`);
    console.log(`  Median: ${(scores[Math.floor(scores.length / 2)] * 100).toFixed(1)}%\n`);

    // Show distribution
    const excellent = scores.filter(s => s >= 0.9).length;
    const veryGood = scores.filter(s => s >= 0.8 && s < 0.9).length;
    const good = scores.filter(s => s >= 0.7 && s < 0.8).length;
    const fair = scores.filter(s => s >= 0.6 && s < 0.7).length;
    const acceptable = scores.filter(s => s >= 0.5 && s < 0.6).length;
    const poor = scores.filter(s => s < 0.5).length;

    console.log(`${colors.cyan}Quality Distribution:${colors.reset}`);
    console.log(`  ${colors.green}Excellent (0.9-1.0): ${excellent}${colors.reset}`);
    console.log(`  ${colors.green}Very Good (0.8-0.9): ${veryGood}${colors.reset}`);
    console.log(`  ${colors.blue}Good (0.7-0.8): ${good}${colors.reset}`);
    console.log(`  ${colors.yellow}Fair (0.6-0.7): ${fair}${colors.reset}`);
    console.log(`  ${colors.yellow}Acceptable (0.5-0.6): ${acceptable}${colors.reset}`);
    console.log(`  ${colors.red}Poor (<0.5): ${poor}${colors.reset}\n`);

    // Show sample chunks with scores
    console.log(`${colors.cyan}Sample Chunks with Scores:${colors.reset}`);
    for (let i = 0; i < Math.min(3, chunks.filter(c => c.coherence_score !== null).length); i++) {
      const chunk = chunks.filter(c => c.coherence_score !== null)[i];
      console.log(`  Chunk ${i + 1}: ${(chunk.coherence_score * 100).toFixed(1)}% - ${chunk.quality_assessment || 'N/A'}`);
    }
  } else {
    console.log(`${colors.yellow}⏳ Quality scoring NOT yet applied${colors.reset}`);
    console.log(`${colors.yellow}Chunks are being processed...${colors.reset}\n`);

    // Show sample chunks
    console.log(`${colors.cyan}Sample Chunks (first 3):${colors.reset}`);
    for (let i = 0; i < Math.min(3, chunks.length); i++) {
      const chunk = chunks[i];
      console.log(`  Chunk ${i + 1}: ${chunk.content.substring(0, 50)}...`);
    }
  }
}

main();


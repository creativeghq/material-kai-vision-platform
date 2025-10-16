#!/usr/bin/env node

/**
 * Check for New Documents
 * Shows the most recently created documents
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
  console.log(`${colors.bright}${colors.cyan}📄 RECENT DOCUMENTS${colors.reset}\n`);

  const documents = await fetchFromSupabase('documents', `order=created_at.desc&limit=15`);

  for (const doc of documents) {
    const created = new Date(doc.created_at);
    const now = new Date();
    const diffMinutes = Math.floor((now - created) / 60000);
    
    let timeStr = '';
    if (diffMinutes < 1) {
      timeStr = 'Just now';
    } else if (diffMinutes < 60) {
      timeStr = `${diffMinutes}m ago`;
    } else {
      const hours = Math.floor(diffMinutes / 60);
      timeStr = `${hours}h ago`;
    }

    const chunks = await fetchFromSupabase('document_chunks', `document_id=eq.${doc.id}&select=count`);
    const chunkCount = chunks.length;

    const coherenceScores = chunks
      .map(c => c.coherence_score)
      .filter(s => s !== null && s !== undefined);

    const hasScores = coherenceScores.length > 0;

    console.log(`${colors.cyan}${doc.title || doc.filename}${colors.reset}`);
    console.log(`  Created: ${timeStr}`);
    console.log(`  Chunks: ${chunkCount}`);
    console.log(`  Quality Scores: ${hasScores ? `${colors.green}✅ YES (${coherenceScores.length} scored)${colors.reset}` : `${colors.yellow}⏳ Not yet${colors.reset}`}`);
    
    if (hasScores) {
      const scores = coherenceScores.sort((a, b) => a - b);
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      console.log(`  Average Score: ${(avg * 100).toFixed(1)}%`);
    }
    
    console.log();
  }
}

main();


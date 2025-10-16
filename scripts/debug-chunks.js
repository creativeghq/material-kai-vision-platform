#!/usr/bin/env node

/**
 * Debug Chunks
 * Shows detailed chunk information
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
      console.error(`HTTP ${response.status}`);
      return [];
    }
    return await response.json();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return [];
  }
}

async function main() {
  console.log(`${colors.bright}${colors.cyan}🔍 CHUNK DEBUG INFO${colors.reset}\n`);

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

  // Get ALL chunks for this document (no limit)
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

  // Show first 5 chunks
  console.log(`${colors.cyan}First 5 Chunks:${colors.reset}`);
  for (let i = 0; i < Math.min(5, chunks.length); i++) {
    const chunk = chunks[i];
    console.log(`\n${colors.green}Chunk ${i + 1}:${colors.reset}`);
    console.log(`  ID: ${chunk.id}`);
    console.log(`  Content Length: ${chunk.content?.length || 0} chars`);
    console.log(`  Coherence Score: ${chunk.coherence_score !== null ? chunk.coherence_score : 'Not set'}`);
    console.log(`  Quality Assessment: ${chunk.quality_assessment || 'Not set'}`);
    console.log(`  Content Preview: ${(chunk.content || '').substring(0, 100)}...`);
  }

  // Statistics
  console.log(`\n${colors.cyan}Statistics:${colors.reset}`);
  const sizes = chunks.map(c => c.content?.length || 0);
  const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  console.log(`  Average Size: ${Math.round(avgSize)} chars`);
  console.log(`  Min Size: ${Math.min(...sizes)} chars`);
  console.log(`  Max Size: ${Math.max(...sizes)} chars`);

  const withScores = chunks.filter(c => c.coherence_score !== null).length;
  console.log(`  Chunks with Scores: ${withScores}/${chunks.length}`);
}

main();


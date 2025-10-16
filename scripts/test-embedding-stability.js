#!/usr/bin/env node

/**
 * Embedding Stability Test Script
 * 
 * Tests embedding stability metrics for PDF chunks
 * - Analyzes embedding consistency
 * - Detects anomalies
 * - Measures variance and stability
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
  white: '\x1b[37m'
};

async function getLatestDocument() {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/documents?order=created_at.desc&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        }
      }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const docs = await response.json();
    return docs[0];
  } catch (error) {
    console.error(`${colors.red}❌ Failed to fetch latest document: ${error.message}${colors.reset}`);
    throw error;
  }
}

async function analyzeEmbeddingStability(documentId) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/analyze-embedding-stability`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ document_id: documentId })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`${colors.red}❌ Analysis failed: ${error.message}${colors.reset}`);
    throw error;
  }
}

async function getStabilityMetrics(documentId) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/embedding_stability_metrics?document_id=eq.${documentId}&select=*`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        }
      }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error(`${colors.red}❌ Failed to fetch metrics: ${error.message}${colors.reset}`);
    return [];
  }
}

async function main() {
  console.log(`${colors.cyan}${colors.bright}╔════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}║         EMBEDDING STABILITY TEST - PHASE 2                          ║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}╚════════════════════════════════════════════════════════════════════╝${colors.reset}`);

  try {
    // Get latest document
    console.log(`\n${colors.yellow}📄 FETCHING LATEST DOCUMENT${colors.reset}`);
    console.log('----------------------------------------------------------------------');
    const doc = await getLatestDocument();
    
    if (!doc) {
      console.log(`${colors.red}❌ No documents found${colors.reset}`);
      return;
    }

    console.log(`${colors.green}✅ Document found: ${doc.document_name}${colors.reset}`);
    console.log(`   ID: ${doc.id}`);
    console.log(`   Created: ${new Date(doc.created_at).toLocaleString()}`);

    // Analyze embedding stability
    console.log(`\n${colors.yellow}🔍 ANALYZING EMBEDDING STABILITY${colors.reset}`);
    console.log('----------------------------------------------------------------------');
    const analysisResult = await analyzeEmbeddingStability(doc.id);
    
    console.log(`${colors.green}✅ Analysis completed!${colors.reset}`);
    console.log(`   Total chunks: ${analysisResult.total_chunks}`);
    console.log(`   Analyzed: ${analysisResult.analyzed_chunks}`);
    console.log(`   Average stability: ${(analysisResult.average_stability * 100).toFixed(1)}%`);
    console.log(`   Anomalies detected: ${analysisResult.anomalies_detected}`);

    // Fetch and display metrics
    console.log(`\n${colors.yellow}📊 STABILITY METRICS${colors.reset}`);
    console.log('----------------------------------------------------------------------');
    const metrics = await getStabilityMetrics(doc.id);

    if (metrics.length > 0) {
      const stabilityScores = metrics.map(m => m.stability_score);
      const varianceScores = metrics.map(m => m.variance_score);
      const consistencyScores = metrics.map(m => m.consistency_score);

      const avgStability = stabilityScores.reduce((a, b) => a + b, 0) / stabilityScores.length;
      const avgVariance = varianceScores.reduce((a, b) => a + b, 0) / varianceScores.length;
      const avgConsistency = consistencyScores.reduce((a, b) => a + b, 0) / consistencyScores.length;

      console.log(`${colors.cyan}Stability Scores:${colors.reset}`);
      console.log(`  Average: ${(avgStability * 100).toFixed(1)}%`);
      console.log(`  Min: ${(Math.min(...stabilityScores) * 100).toFixed(1)}%`);
      console.log(`  Max: ${(Math.max(...stabilityScores) * 100).toFixed(1)}%`);

      console.log(`\n${colors.cyan}Variance Scores:${colors.reset}`);
      console.log(`  Average: ${(avgVariance * 100).toFixed(1)}%`);
      console.log(`  Min: ${(Math.min(...varianceScores) * 100).toFixed(1)}%`);
      console.log(`  Max: ${(Math.max(...varianceScores) * 100).toFixed(1)}%`);

      console.log(`\n${colors.cyan}Consistency Scores:${colors.reset}`);
      console.log(`  Average: ${(avgConsistency * 100).toFixed(1)}%`);
      console.log(`  Min: ${(Math.min(...consistencyScores) * 100).toFixed(1)}%`);
      console.log(`  Max: ${(Math.max(...consistencyScores) * 100).toFixed(1)}%`);

      // Show sample metrics
      console.log(`\n${colors.cyan}Sample Chunks (first 5):${colors.reset}`);
      metrics.slice(0, 5).forEach((m, idx) => {
        const status = m.anomaly_detected ? `${colors.red}⚠️ ANOMALY${colors.reset}` : `${colors.green}✓${colors.reset}`;
        console.log(`  ${idx + 1}. Stability: ${(m.stability_score * 100).toFixed(1)}% | Consistency: ${(m.consistency_score * 100).toFixed(1)}% | ${status}`);
      });

      // Summary
      const anomalyCount = metrics.filter(m => m.anomaly_detected).length;
      console.log(`\n${colors.cyan}Summary:${colors.reset}`);
      console.log(`  Total metrics: ${metrics.length}`);
      console.log(`  Anomalies: ${anomalyCount} (${((anomalyCount / metrics.length) * 100).toFixed(1)}%)`);
      console.log(`  Overall health: ${avgStability > 0.8 ? `${colors.green}EXCELLENT${colors.reset}` : avgStability > 0.6 ? `${colors.yellow}GOOD${colors.reset}` : `${colors.red}NEEDS IMPROVEMENT${colors.reset}`}`);
    } else {
      console.log(`${colors.yellow}⏳ No metrics yet - analysis may still be processing${colors.reset}`);
    }

    console.log(`\n${colors.green}${colors.bright}✅ Phase 2 Test Complete!${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}${colors.bright}❌ Test failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

main();


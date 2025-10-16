#!/usr/bin/env node

/**
 * Phase 2 Metrics Monitor
 * 
 * Comprehensive monitoring for Phase 2 (Embedding Stability)
 * - Quality scoring metrics
 * - Embedding stability metrics
 * - Consistency and variance tracking
 * - Anomaly detection
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
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/documents?order=created_at.desc&limit=1`,
    {
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      }
    }
  );
  const docs = await response.json();
  return docs[0];
}

async function getQualityMetrics(documentId) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/document_chunks?document_id=eq.${documentId}&select=coherence_score,quality_assessment&limit=1000`,
    {
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      }
    }
  );
  return await response.json();
}

async function getStabilityMetrics(documentId) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/embedding_stability_metrics?document_id=eq.${documentId}&select=*&limit=1000`,
    {
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      }
    }
  );
  return await response.json();
}

function formatMetric(value, isPercentage = true) {
  if (isPercentage) {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toFixed(2);
}

function getHealthStatus(score) {
  if (score >= 0.85) return `${colors.green}EXCELLENT${colors.reset}`;
  if (score >= 0.75) return `${colors.green}VERY GOOD${colors.reset}`;
  if (score >= 0.65) return `${colors.yellow}GOOD${colors.reset}`;
  if (score >= 0.50) return `${colors.yellow}ACCEPTABLE${colors.reset}`;
  return `${colors.red}NEEDS IMPROVEMENT${colors.reset}`;
}

async function main() {
  console.log(`${colors.cyan}${colors.bright}╔════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}║         PHASE 2 METRICS MONITOR - COMPREHENSIVE ANALYSIS             ║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}╚════════════════════════════════════════════════════════════════════╝${colors.reset}`);

  try {
    const doc = await getLatestDocument();
    if (!doc) {
      console.log(`${colors.red}❌ No documents found${colors.reset}`);
      return;
    }

    console.log(`\n${colors.cyan}📄 Document: ${doc.document_name || 'Unknown'}${colors.reset}`);
    console.log(`   ID: ${doc.id}`);
    console.log(`   Created: ${new Date(doc.created_at).toLocaleString()}`);

    // Quality Metrics
    console.log(`\n${colors.yellow}═══════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.yellow}PHASE 1: QUALITY SCORING METRICS${colors.reset}`);
    console.log(`${colors.yellow}═══════════════════════════════════════════════════════════════════${colors.reset}`);

    const qualityChunks = await getQualityMetrics(doc.id);
    if (qualityChunks.length > 0) {
      const scores = qualityChunks.map(c => c.coherence_score).filter(s => s !== null);
      const avgQuality = scores.reduce((a, b) => a + b, 0) / scores.length;
      const withScores = scores.length;
      const withoutScores = qualityChunks.length - scores.length;

      console.log(`${colors.cyan}Quality Scoring Status:${colors.reset}`);
      console.log(`  Chunks with scores: ${withScores}/${qualityChunks.length}`);
      console.log(`  Coverage: ${formatMetric(withScores / qualityChunks.length)}`);
      console.log(`  Average score: ${formatMetric(avgQuality)}`);
      console.log(`  Min: ${formatMetric(Math.min(...scores))}`);
      console.log(`  Max: ${formatMetric(Math.max(...scores))}`);
      console.log(`  Status: ${getHealthStatus(avgQuality)}`);
    }

    // Stability Metrics
    console.log(`\n${colors.yellow}═══════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.yellow}PHASE 2: EMBEDDING STABILITY METRICS${colors.reset}`);
    console.log(`${colors.yellow}═══════════════════════════════════════════════════════════════════${colors.reset}`);

    const stabilityMetrics = await getStabilityMetrics(doc.id);
    if (stabilityMetrics.length > 0) {
      const stabilityScores = stabilityMetrics.map(m => m.stability_score);
      const consistencyScores = stabilityMetrics.map(m => m.consistency_score);
      const varianceScores = stabilityMetrics.map(m => m.variance_score);
      const anomalies = stabilityMetrics.filter(m => m.anomaly_detected).length;

      const avgStability = stabilityScores.reduce((a, b) => a + b, 0) / stabilityScores.length;
      const avgConsistency = consistencyScores.reduce((a, b) => a + b, 0) / consistencyScores.length;
      const avgVariance = varianceScores.reduce((a, b) => a + b, 0) / varianceScores.length;

      console.log(`${colors.cyan}Stability Scores:${colors.reset}`);
      console.log(`  Average: ${formatMetric(avgStability)}`);
      console.log(`  Min: ${formatMetric(Math.min(...stabilityScores))}`);
      console.log(`  Max: ${formatMetric(Math.max(...stabilityScores))}`);
      console.log(`  Status: ${getHealthStatus(avgStability)}`);

      console.log(`\n${colors.cyan}Consistency Scores:${colors.reset}`);
      console.log(`  Average: ${formatMetric(avgConsistency)}`);
      console.log(`  Min: ${formatMetric(Math.min(...consistencyScores))}`);
      console.log(`  Max: ${formatMetric(Math.max(...consistencyScores))}`);
      console.log(`  Status: ${getHealthStatus(avgConsistency)}`);

      console.log(`\n${colors.cyan}Variance Analysis:${colors.reset}`);
      console.log(`  Average variance: ${formatMetric(avgVariance)}`);
      console.log(`  Min: ${formatMetric(Math.min(...varianceScores))}`);
      console.log(`  Max: ${formatMetric(Math.max(...varianceScores))}`);

      console.log(`\n${colors.cyan}Anomaly Detection:${colors.reset}`);
      console.log(`  Anomalies detected: ${anomalies}/${stabilityMetrics.length}`);
      console.log(`  Anomaly rate: ${formatMetric(anomalies / stabilityMetrics.length)}`);
      console.log(`  Status: ${anomalies === 0 ? `${colors.green}CLEAN${colors.reset}` : `${colors.yellow}REVIEW NEEDED${colors.reset}`}`);
    }

    // Combined Analysis
    console.log(`\n${colors.yellow}═══════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.yellow}COMBINED ANALYSIS${colors.reset}`);
    console.log(`${colors.yellow}═══════════════════════════════════════════════════════════════════${colors.reset}`);

    if (qualityChunks.length > 0 && stabilityMetrics.length > 0) {
      const qualityScores = qualityChunks.map(c => c.coherence_score).filter(s => s !== null);
      const avgQuality = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
      const avgStability = stabilityMetrics.reduce((a, b) => a + b.stability_score, 0) / stabilityMetrics.length;
      const avgConsistency = stabilityMetrics.reduce((a, b) => a + b.consistency_score, 0) / stabilityMetrics.length;

      const overallScore = (avgQuality * 0.4 + avgStability * 0.35 + avgConsistency * 0.25);

      console.log(`${colors.cyan}Overall Platform Health:${colors.reset}`);
      console.log(`  Quality Score: ${formatMetric(avgQuality)} (40% weight)`);
      console.log(`  Stability Score: ${formatMetric(avgStability)} (35% weight)`);
      console.log(`  Consistency Score: ${formatMetric(avgConsistency)} (25% weight)`);
      console.log(`  ${colors.bright}Overall Score: ${formatMetric(overallScore)}${colors.reset}`);
      console.log(`  ${colors.bright}Status: ${getHealthStatus(overallScore)}${colors.reset}`);

      // Recommendations
      console.log(`\n${colors.cyan}Recommendations:${colors.reset}`);
      if (avgQuality < 0.7) console.log(`  • Improve chunk quality scoring algorithm`);
      if (avgStability < 0.7) console.log(`  • Enhance embedding stability mechanisms`);
      if (avgConsistency < 0.7) console.log(`  • Increase embedding consistency checks`);
      if (overallScore >= 0.8) console.log(`  • Platform is performing well - proceed to Phase 3`);
    }

    console.log(`\n${colors.green}${colors.bright}✅ Analysis Complete!${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

main();


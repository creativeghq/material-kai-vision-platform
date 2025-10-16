/**
 * Phase 3: Comprehensive Monitoring Dashboard
 * 
 * Monitors all Phase 3 metrics:
 * - Chunk relationships
 * - Retrieval quality
 * - Response quality
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function monitorPhase3() {
  try {
    console.log('🎯 Phase 3: Comprehensive Monitoring Dashboard\n');
    console.log('=' .repeat(60));

    // 1. Chunk Relationships
    console.log('\n📊 1. CHUNK RELATIONSHIP GRAPH');
    console.log('-'.repeat(60));

    const { data: relationships, error: relError } = await supabase
      .from('knowledge_relationships')
      .select('relationship_type, confidence_score')
      .eq('source_type', 'chunk');

    if (!relError && relationships) {
      const byType = {};
      let totalConfidence = 0;

      for (const rel of relationships) {
        byType[rel.relationship_type] = (byType[rel.relationship_type] || 0) + 1;
        totalConfidence += rel.confidence_score || 0;
      }

      console.log(`Total Relationships: ${relationships.length}`);
      console.log('\nBy Type:');
      for (const [type, count] of Object.entries(byType)) {
        const percentage = ((count / relationships.length) * 100).toFixed(1);
        console.log(`  • ${type}: ${count} (${percentage}%)`);
      }

      const avgConfidence = relationships.length > 0 ? totalConfidence / relationships.length : 0;
      console.log(`\nAverage Confidence: ${(avgConfidence * 100).toFixed(1)}%`);

      // Quality assessment
      if (avgConfidence > 0.85) {
        console.log('✅ Relationship Quality: EXCELLENT');
      } else if (avgConfidence > 0.75) {
        console.log('✅ Relationship Quality: GOOD');
      } else {
        console.log('⚠️  Relationship Quality: NEEDS IMPROVEMENT');
      }
    }

    // 2. Retrieval Quality
    console.log('\n📊 2. RETRIEVAL QUALITY METRICS');
    console.log('-'.repeat(60));

    const { data: retrievalMetrics, error: retError } = await supabase
      .from('retrieval_quality_metrics')
      .select('precision, recall, mrr, latency_ms')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!retError && retrievalMetrics && retrievalMetrics.length > 0) {
      const avgPrecision = retrievalMetrics.reduce((sum, m) => sum + m.precision, 0) / retrievalMetrics.length;
      const avgRecall = retrievalMetrics.reduce((sum, m) => sum + m.recall, 0) / retrievalMetrics.length;
      const avgMrr = retrievalMetrics.reduce((sum, m) => sum + m.mrr, 0) / retrievalMetrics.length;
      const avgLatency = retrievalMetrics.reduce((sum, m) => sum + m.latency_ms, 0) / retrievalMetrics.length;

      console.log(`Total Queries Evaluated: ${retrievalMetrics.length}`);
      console.log(`\nAverage Metrics:`);
      console.log(`  • Precision: ${(avgPrecision * 100).toFixed(1)}%`);
      console.log(`  • Recall: ${(avgRecall * 100).toFixed(1)}%`);
      console.log(`  • MRR: ${avgMrr.toFixed(3)}`);
      console.log(`  • Latency: ${avgLatency.toFixed(0)}ms`);

      // Quality assessment
      const retrievalScore = (avgPrecision + avgRecall) / 2;
      if (retrievalScore > 0.85) {
        console.log('✅ Retrieval Quality: EXCELLENT');
      } else if (retrievalScore > 0.75) {
        console.log('✅ Retrieval Quality: GOOD');
      } else {
        console.log('⚠️  Retrieval Quality: NEEDS IMPROVEMENT');
      }
    } else {
      console.log('⏳ No retrieval metrics available yet');
    }

    // 3. Response Quality
    console.log('\n📊 3. RESPONSE QUALITY METRICS');
    console.log('-'.repeat(60));

    const { data: responseMetrics, error: respError } = await supabase
      .from('response_quality_metrics')
      .select('coherence_score, hallucination_score, source_attribution_score, factual_consistency_score, overall_quality_score')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!respError && responseMetrics && responseMetrics.length > 0) {
      const avgCoherence = responseMetrics.reduce((sum, m) => sum + m.coherence_score, 0) / responseMetrics.length;
      const avgHallucination = responseMetrics.reduce((sum, m) => sum + m.hallucination_score, 0) / responseMetrics.length;
      const avgAttribution = responseMetrics.reduce((sum, m) => sum + m.source_attribution_score, 0) / responseMetrics.length;
      const avgConsistency = responseMetrics.reduce((sum, m) => sum + m.factual_consistency_score, 0) / responseMetrics.length;
      const avgOverall = responseMetrics.reduce((sum, m) => sum + m.overall_quality_score, 0) / responseMetrics.length;

      console.log(`Total Responses Evaluated: ${responseMetrics.length}`);
      console.log(`\nAverage Metrics:`);
      console.log(`  • Coherence: ${(avgCoherence * 100).toFixed(1)}%`);
      console.log(`  • Hallucination: ${(avgHallucination * 100).toFixed(1)}%`);
      console.log(`  • Attribution: ${(avgAttribution * 100).toFixed(1)}%`);
      console.log(`  • Consistency: ${(avgConsistency * 100).toFixed(1)}%`);
      console.log(`  • Overall Score: ${(avgOverall * 100).toFixed(1)}%`);

      // Quality assessment
      if (avgOverall > 0.85) {
        console.log('✅ Response Quality: EXCELLENT');
      } else if (avgOverall > 0.75) {
        console.log('✅ Response Quality: GOOD');
      } else {
        console.log('⚠️  Response Quality: NEEDS IMPROVEMENT');
      }
    } else {
      console.log('⏳ No response metrics available yet');
    }

    // 4. Overall Platform Health
    console.log('\n📊 4. OVERALL PLATFORM HEALTH');
    console.log('-'.repeat(60));

    let healthScore = 0;
    let componentCount = 0;

    if (relationships && relationships.length > 0) {
      const relHealth = (totalConfidence / relationships.length);
      healthScore += relHealth;
      componentCount++;
      console.log(`  • Relationships: ${(relHealth * 100).toFixed(1)}%`);
    }

    if (retrievalMetrics && retrievalMetrics.length > 0) {
      const avgPrecision = retrievalMetrics.reduce((sum, m) => sum + m.precision, 0) / retrievalMetrics.length;
      const avgRecall = retrievalMetrics.reduce((sum, m) => sum + m.recall, 0) / retrievalMetrics.length;
      const retHealth = (avgPrecision + avgRecall) / 2;
      healthScore += retHealth;
      componentCount++;
      console.log(`  • Retrieval: ${(retHealth * 100).toFixed(1)}%`);
    }

    if (responseMetrics && responseMetrics.length > 0) {
      const avgOverall = responseMetrics.reduce((sum, m) => sum + m.overall_quality_score, 0) / responseMetrics.length;
      healthScore += avgOverall;
      componentCount++;
      console.log(`  • Response: ${(avgOverall * 100).toFixed(1)}%`);
    }

    if (componentCount > 0) {
      const overallHealth = healthScore / componentCount;
      console.log(`\n🎯 Overall Platform Health: ${(overallHealth * 100).toFixed(1)}%`);

      if (overallHealth > 0.85) {
        console.log('✅ Status: EXCELLENT - All systems performing well');
      } else if (overallHealth > 0.75) {
        console.log('✅ Status: GOOD - Minor improvements needed');
      } else if (overallHealth > 0.65) {
        console.log('⚠️  Status: FAIR - Improvements recommended');
      } else {
        console.log('❌ Status: POOR - Significant improvements needed');
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Phase 3 Monitoring Complete!\n');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

monitorPhase3();


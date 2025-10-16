/**
 * Phase 3: Test Retrieval Quality Metrics
 * 
 * Tests retrieval quality evaluation and metrics collection
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Simulate retrieval quality evaluation
async function evaluateRetrieval(query, retrievedChunkIds, relevantChunkIds) {
  const relevantRetrieved = retrievedChunkIds.filter(id => relevantChunkIds.includes(id));
  
  const precision = retrievedChunkIds.length > 0 ? relevantRetrieved.length / retrievedChunkIds.length : 0;
  const recall = relevantChunkIds.length > 0 ? relevantRetrieved.length / relevantChunkIds.length : 0;
  
  // Calculate MRR (Mean Reciprocal Rank)
  let mrr = 0;
  for (let i = 0; i < retrievedChunkIds.length; i++) {
    if (relevantChunkIds.includes(retrievedChunkIds[i])) {
      mrr = 1 / (i + 1);
      break;
    }
  }

  return {
    query,
    retrieved_chunks: retrievedChunkIds.length,
    relevant_chunks: relevantRetrieved.length,
    precision,
    recall,
    mrr,
    latency_ms: Math.floor(Math.random() * 500) + 50, // Simulated latency
  };
}

async function testRetrievalQuality() {
  try {
    console.log('🔍 Phase 3: Testing Retrieval Quality Metrics\n');

    // Get sample chunks
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id')
      .limit(100);

    if (chunksError || !chunks || chunks.length < 10) {
      console.error('❌ Not enough chunks for testing');
      return;
    }

    console.log(`📊 Found ${chunks.length} chunks for testing\n`);

    // Simulate multiple retrieval scenarios
    const scenarios = [
      {
        query: 'material properties',
        retrieved: chunks.slice(0, 10).map(c => c.id),
        relevant: chunks.slice(0, 8).map(c => c.id), // 8 out of 10 are relevant
      },
      {
        query: 'color specifications',
        retrieved: chunks.slice(5, 15).map(c => c.id),
        relevant: chunks.slice(5, 12).map(c => c.id), // 7 out of 10 are relevant
      },
      {
        query: 'texture and finish',
        retrieved: chunks.slice(10, 20).map(c => c.id),
        relevant: chunks.slice(10, 18).map(c => c.id), // 8 out of 10 are relevant
      },
    ];

    console.log('📈 Evaluating retrieval quality for scenarios:\n');

    let totalPrecision = 0;
    let totalRecall = 0;
    let totalMrr = 0;

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      const metrics = await evaluateRetrieval(
        scenario.query,
        scenario.retrieved,
        scenario.relevant
      );

      console.log(`${i + 1}. Query: "${metrics.query}"`);
      console.log(`   Retrieved: ${metrics.retrieved_chunks} chunks`);
      console.log(`   Relevant: ${metrics.relevant_chunks} chunks`);
      console.log(`   Precision: ${(metrics.precision * 100).toFixed(1)}%`);
      console.log(`   Recall: ${(metrics.recall * 100).toFixed(1)}%`);
      console.log(`   MRR: ${metrics.mrr.toFixed(3)}`);
      console.log(`   Latency: ${metrics.latency_ms}ms\n`);

      // Store metrics
      const { error: insertError } = await supabase
        .from('retrieval_quality_metrics')
        .insert({
          query: metrics.query,
          retrieved_chunks: metrics.retrieved_chunks,
          relevant_chunks: metrics.relevant_chunks,
          precision: metrics.precision,
          recall: metrics.recall,
          mrr: metrics.mrr,
          latency_ms: metrics.latency_ms,
        });

      if (insertError) {
        console.error(`   ❌ Error storing metrics: ${insertError.message}`);
      } else {
        console.log(`   ✅ Metrics stored\n`);
      }

      totalPrecision += metrics.precision;
      totalRecall += metrics.recall;
      totalMrr += metrics.mrr;
    }

    // Calculate averages
    const avgPrecision = totalPrecision / scenarios.length;
    const avgRecall = totalRecall / scenarios.length;
    const avgMrr = totalMrr / scenarios.length;

    console.log('📊 Average Metrics Across All Scenarios:');
    console.log(`   Average Precision: ${(avgPrecision * 100).toFixed(1)}%`);
    console.log(`   Average Recall: ${(avgRecall * 100).toFixed(1)}%`);
    console.log(`   Average MRR: ${avgMrr.toFixed(3)}\n`);

    // Get stored metrics
    console.log('📋 Retrieving stored metrics from database...');
    const { data: storedMetrics, error: fetchError } = await supabase
      .from('retrieval_quality_metrics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!fetchError && storedMetrics) {
      console.log(`✅ Retrieved ${storedMetrics.length} metric records\n`);

      if (storedMetrics.length > 0) {
        const latest = storedMetrics[0];
        console.log('📊 Latest Retrieval Metrics:');
        console.log(`   Query: ${latest.query}`);
        console.log(`   Precision: ${(latest.precision * 100).toFixed(1)}%`);
        console.log(`   Recall: ${(latest.recall * 100).toFixed(1)}%`);
        console.log(`   MRR: ${latest.mrr.toFixed(3)}`);
      }
    }

    console.log('\n✅ Phase 3 Retrieval Quality Test Complete!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testRetrievalQuality();


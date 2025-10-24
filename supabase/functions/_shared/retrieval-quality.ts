/**
 * Retrieval Quality Measurement Utility for Edge Functions
 *
 * Measures and stores retrieval quality metrics:
 * - Precision (relevant chunks / retrieved chunks)
 * - Recall (relevant chunks retrieved / total relevant)
 * - Mean Reciprocal Rank (MRR)
 * - Latency
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

export interface RetrievalResult {
  chunk_id: string;
  content: string;
  relevance_score: number;
  rank: number;
}

export interface RetrievalMetrics {
  query: string;
  retrieved_chunks: number;
  relevant_chunks: number;
  precision: number;
  recall: number;
  mrr: number;
  latency_ms: number;
  timestamp: string;
}

/**
 * Evaluate retrieval quality for a search query
 */
export async function evaluateRetrievalQuality(
  query: string,
  retrievedChunks: RetrievalResult[],
  relevantChunkIds: string[],
  supabaseClient: ReturnType<typeof createClient>,
): Promise<RetrievalMetrics> {
  const startTime = Date.now();

  try {
    // Calculate precision: relevant chunks / retrieved chunks
    const relevantRetrieved = retrievedChunks.filter(c => relevantChunkIds.includes(c.chunk_id));
    const precision = retrievedChunks.length > 0 ? relevantRetrieved.length / retrievedChunks.length : 0;

    // Calculate recall: relevant chunks retrieved / total relevant chunks
    const recall = relevantChunkIds.length > 0 ? relevantRetrieved.length / relevantChunkIds.length : 0;

    // Calculate MRR (Mean Reciprocal Rank)
    let mrr = 0;
    for (const chunk of retrievedChunks) {
      if (relevantChunkIds.includes(chunk.chunk_id)) {
        mrr = 1 / chunk.rank;
        break; // MRR is the rank of the first relevant result
      }
    }

    const latency = Date.now() - startTime;

    const metrics: RetrievalMetrics = {
      query,
      retrieved_chunks: retrievedChunks.length,
      relevant_chunks: relevantRetrieved.length,
      precision,
      recall,
      mrr,
      latency_ms: latency,
      timestamp: new Date().toISOString(),
    };

    // Store metrics in database
    await storeRetrievalMetrics(metrics, supabaseClient);

    console.log(`📊 Retrieval Quality - Precision: ${(precision * 100).toFixed(1)}%, Recall: ${(recall * 100).toFixed(1)}%, MRR: ${mrr.toFixed(3)}`);

    return metrics;
  } catch (error) {
    console.error('Error evaluating retrieval quality:', error);
    throw error;
  }
}

/**
 * Store retrieval metrics in database
 */
async function storeRetrievalMetrics(
  metrics: RetrievalMetrics,
  supabaseClient: ReturnType<typeof createClient>,
): Promise<void> {
  try {
    const { error } = await supabaseClient
      .from('retrieval_quality_metrics')
      .insert({
        query: metrics.query,
        retrieved_chunks: metrics.retrieved_chunks,
        relevant_chunks: metrics.relevant_chunks,
        precision: metrics.precision,
        recall: metrics.recall,
        mrr: metrics.mrr,
        latency_ms: metrics.latency_ms,
        created_at: metrics.timestamp,
      });

    if (error) {
      console.error('Error storing retrieval metrics:', error);
      // Don't throw - metrics storage failure shouldn't break search
    }
  } catch (error) {
    console.error('Error storing retrieval metrics:', error);
    // Don't throw - metrics storage failure shouldn't break search
  }
}

/**
 * Identify relevant chunks for a query
 * This is a simplified version - in production, you might use semantic similarity
 */
export function identifyRelevantChunks(
  query: string,
  allChunks: Array<{ id: string; content: string }>,
): string[] {
  const queryTerms = query.toLowerCase().split(/\s+/);

  return allChunks
    .filter(chunk => {
      const chunkContent = chunk.content.toLowerCase();
      // A chunk is relevant if it contains at least 2 query terms
      const matchingTerms = queryTerms.filter(term => chunkContent.includes(term));
      return matchingTerms.length >= 2;
    })
    .map(chunk => chunk.id);
}

/**
 * Format retrieval metrics for logging
 */
export function formatRetrievalMetrics(metrics: RetrievalMetrics): string {
  return `
Retrieval Quality Metrics:
  Query: ${metrics.query}
  Retrieved: ${metrics.retrieved_chunks} chunks
  Relevant: ${metrics.relevant_chunks} chunks
  Precision: ${(metrics.precision * 100).toFixed(1)}%
  Recall: ${(metrics.recall * 100).toFixed(1)}%
  MRR: ${metrics.mrr.toFixed(3)}
  Latency: ${metrics.latency_ms}ms
  `;
}


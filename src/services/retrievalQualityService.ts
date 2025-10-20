/**
 * Retrieval Quality Service
 *
 * Validates and measures retrieval quality:
 * - Precision (correct chunks retrieved)
 * - Recall (all relevant chunks retrieved)
 * - Mean Reciprocal Rank (MRR)
 * - Retrieval latency
 */

import { supabase } from '@/integrations/supabase/client';

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

export interface RetrievalResult {
  chunk_id: string;
  content: string;
  relevance_score: number;
  rank: number;
}

export class RetrievalQualityService {
  /**
   * Evaluate retrieval quality for a query
   */
  static async evaluateRetrieval(
    query: string,
    retrievedChunks: RetrievalResult[],
    relevantChunkIds: string[],
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

      // Store metrics
      await this.storeRetrievalMetrics(metrics);

      console.log(`📊 Retrieval Quality - Precision: ${(precision * 100).toFixed(1)}%, Recall: ${(recall * 100).toFixed(1)}%, MRR: ${mrr.toFixed(3)}`);

      return metrics;
    } catch (error) {
      console.error('Error evaluating retrieval:', error);
      throw error;
    }
  }

  /**
   * Store retrieval metrics in database
   */
  private static async storeRetrievalMetrics(metrics: RetrievalMetrics): Promise<void> {
    try {
      const { error } = await supabase
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

      if (error) throw error;
    } catch (error) {
      console.error('Error storing retrieval metrics:', error);
    }
  }

  /**
   * Calculate average retrieval metrics
   */
  static async getAverageMetrics(timeWindowHours: number = 24): Promise<{
    avg_precision: number;
    avg_recall: number;
    avg_mrr: number;
    avg_latency_ms: number;
    total_queries: number;
  }> {
    try {
      const cutoffTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('retrieval_quality_metrics')
        .select('precision, recall, mrr, latency_ms')
        .gte('created_at', cutoffTime);

      if (error) throw error;

      if (!data || data.length === 0) {
        return {
          avg_precision: 0,
          avg_recall: 0,
          avg_mrr: 0,
          avg_latency_ms: 0,
          total_queries: 0,
        };
      }

      const avgPrecision = data.reduce((sum: number, m: any) => sum + m.precision, 0) / data.length;
      const avgRecall = data.reduce((sum: number, m: any) => sum + m.recall, 0) / data.length;
      const avgMrr = data.reduce((sum: number, m: any) => sum + m.mrr, 0) / data.length;
      const avgLatency = data.reduce((sum: number, m: any) => sum + m.latency_ms, 0) / data.length;

      return {
        avg_precision: avgPrecision,
        avg_recall: avgRecall,
        avg_mrr: avgMrr,
        avg_latency_ms: avgLatency,
        total_queries: data.length,
      };
    } catch (error) {
      console.error('Error getting average metrics:', error);
      throw error;
    }
  }

  /**
   * Identify low-quality retrievals
   */
  static async identifyLowQualityRetrievals(threshold: number = 0.5): Promise<RetrievalMetrics[]> {
    try {
      const { data, error } = await supabase
        .from('retrieval_quality_metrics')
        .select('*')
        .or(`precision.lt.${threshold},recall.lt.${threshold}`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error identifying low-quality retrievals:', error);
      return [];
    }
  }

  /**
   * Get retrieval quality trend
   */
  static async getQualityTrend(days: number = 7): Promise<{
    date: string;
    avg_precision: number;
    avg_recall: number;
    avg_mrr: number;
  }[]> {
    try {
      const cutoffTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('retrieval_quality_metrics')
        .select('created_at, precision, recall, mrr')
        .gte('created_at', cutoffTime)
        .order('created_at');

      if (error) throw error;

      if (!data || data.length === 0) return [];

      // Group by date
      const grouped: Record<string, any[]> = {};

      for (const metric of data) {
        const date = new Date(metric.created_at).toISOString().split('T')[0];
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(metric);
      }

      // Calculate averages per date
      const trend = Object.entries(grouped).map(([date, metrics]) => ({
        date,
        avg_precision: metrics.reduce((sum, m) => sum + m.precision, 0) / metrics.length,
        avg_recall: metrics.reduce((sum, m) => sum + m.recall, 0) / metrics.length,
        avg_mrr: metrics.reduce((sum, m) => sum + m.mrr, 0) / metrics.length,
      }));

      return trend;
    } catch (error) {
      console.error('Error getting quality trend:', error);
      return [];
    }
  }
}


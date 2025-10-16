/**
 * Quality-Based Ranking Service
 * 
 * Ranks search results using quality metrics to improve result ordering
 * Combines relevance score with quality metrics for better ranking
 */

import { SearchResult } from '@/components/Search/SearchResultCard';

export interface RankingWeights {
  relevance: number;      // Weight for relevance score (default: 0.4)
  quality: number;        // Weight for quality metrics (default: 0.3)
  semantic: number;       // Weight for semantic score (default: 0.2)
  recency: number;        // Weight for recency (default: 0.1)
}

const DEFAULT_WEIGHTS: RankingWeights = {
  relevance: 0.4,
  quality: 0.3,
  semantic: 0.2,
  recency: 0.1,
};

/**
 * Calculate quality score from retrieval metrics
 */
function calculateQualityScore(result: SearchResult): number {
  if (!result.qualityMetrics) {
    return 0.5; // Default neutral score if no metrics
  }

  const { precision = 0, recall = 0, mrr = 0 } = result.qualityMetrics;

  // Weighted average of quality metrics
  // Precision: 50% weight (most important)
  // Recall: 30% weight
  // MRR: 20% weight (normalized to 0-1 range)
  const normalizedMRR = Math.min(mrr / 1.0, 1.0); // MRR typically 0-1

  return (precision * 0.5) + (recall * 0.3) + (normalizedMRR * 0.2);
}

/**
 * Calculate recency score (newer = higher score)
 */
function calculateRecencyScore(createdAt: string): number {
  const now = new Date().getTime();
  const created = new Date(createdAt).getTime();
  const ageInDays = (now - created) / (1000 * 60 * 60 * 24);

  // Decay function: newer documents score higher
  // After 30 days, score is 0.5
  // After 90 days, score is 0.1
  return Math.max(0.1, 1 - (ageInDays / 90));
}

/**
 * Calculate combined ranking score
 */
function calculateRankingScore(
  result: SearchResult,
  weights: RankingWeights = DEFAULT_WEIGHTS
): number {
  const relevanceScore = result.relevanceScore || 0;
  const semanticScore = result.semanticScore || 0;
  const qualityScore = calculateQualityScore(result);
  const recencyScore = calculateRecencyScore(result.createdAt);

  // Normalize weights to sum to 1
  const totalWeight = weights.relevance + weights.quality + weights.semantic + weights.recency;
  const normalizedWeights = {
    relevance: weights.relevance / totalWeight,
    quality: weights.quality / totalWeight,
    semantic: weights.semantic / totalWeight,
    recency: weights.recency / totalWeight,
  };

  // Calculate weighted score
  const combinedScore =
    (relevanceScore * normalizedWeights.relevance) +
    (qualityScore * normalizedWeights.quality) +
    (semanticScore * normalizedWeights.semantic) +
    (recencyScore * normalizedWeights.recency);

  return combinedScore;
}

/**
 * Rank search results using quality metrics
 */
export function rankResultsByQuality(
  results: SearchResult[],
  weights?: RankingWeights
): SearchResult[] {
  // Calculate ranking score for each result
  const scoredResults = results.map(result => ({
    result,
    rankingScore: calculateRankingScore(result, weights),
  }));

  // Sort by ranking score (descending)
  scoredResults.sort((a, b) => b.rankingScore - a.rankingScore);

  // Return sorted results
  return scoredResults.map(({ result }) => result);
}

/**
 * Apply quality-based ranking with fallback to relevance
 */
export function applyQualityBasedRanking(
  results: SearchResult[],
  useQualityRanking: boolean = true,
  weights?: RankingWeights
): SearchResult[] {
  if (!useQualityRanking) {
    // Fallback to relevance-based ranking
    return [...results].sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  // Check if any results have quality metrics
  const hasQualityMetrics = results.some(r => r.qualityMetrics);

  if (!hasQualityMetrics) {
    // No quality metrics available, use relevance-based ranking
    return [...results].sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  // Apply quality-based ranking
  return rankResultsByQuality(results, weights);
}

/**
 * Get ranking explanation for a result
 */
export function getRankingExplanation(
  result: SearchResult,
  weights: RankingWeights = DEFAULT_WEIGHTS
): string {
  const relevanceScore = result.relevanceScore || 0;
  const semanticScore = result.semanticScore || 0;
  const qualityScore = calculateQualityScore(result);
  const recencyScore = calculateRecencyScore(result.createdAt);
  const rankingScore = calculateRankingScore(result, weights);

  return `
Ranking Score: ${(rankingScore * 100).toFixed(1)}%

Components:
- Relevance: ${(relevanceScore * 100).toFixed(1)}% (weight: ${(weights.relevance * 100).toFixed(0)}%)
- Quality: ${(qualityScore * 100).toFixed(1)}% (weight: ${(weights.quality * 100).toFixed(0)}%)
- Semantic: ${(semanticScore * 100).toFixed(1)}% (weight: ${(weights.semantic * 100).toFixed(0)}%)
- Recency: ${(recencyScore * 100).toFixed(1)}% (weight: ${(weights.recency * 100).toFixed(0)}%)

Quality Metrics:
- Precision: ${(result.qualityMetrics?.precision ? result.qualityMetrics.precision * 100 : 0).toFixed(1)}%
- Recall: ${(result.qualityMetrics?.recall ? result.qualityMetrics.recall * 100 : 0).toFixed(1)}%
- MRR: ${(result.qualityMetrics?.mrr || 0).toFixed(3)}
  `.trim();
}

export default {
  rankResultsByQuality,
  applyQualityBasedRanking,
  getRankingExplanation,
  calculateQualityScore,
  calculateRecencyScore,
  calculateRankingScore,
};


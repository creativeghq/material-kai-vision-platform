/**
 * Response Quality Measurement Utility for Edge Functions
 *
 * Measures and stores response quality metrics:
 * - Coherence (25% weight)
 * - Hallucination detection (35% weight)
 * - Source attribution (20% weight)
 * - Factual consistency (20% weight)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

export interface ResponseQualityMetrics {
  response_id: string;
  query: string;
  response_text: string;
  coherence_score: number;
  hallucination_score: number;
  source_attribution_score: number;
  factual_consistency_score: number;
  overall_quality_score: number;
  quality_assessment: string;
  issues_detected: string[];
  timestamp: string;
}

/**
 * Evaluate response quality
 */
export async function evaluateResponseQuality(
  responseId: string,
  query: string,
  responseText: string,
  sourceChunks: string[],
  supabaseClient: ReturnType<typeof createClient>,
): Promise<ResponseQualityMetrics> {
  try {
    console.log(`🔍 Evaluating response quality for ${responseId}...`);

    // Calculate individual quality metrics
    const coherenceScore = calculateCoherence(responseText);
    const hallucinationScore = detectHallucinations(responseText, sourceChunks);
    const attributionScore = validateSourceAttribution(responseText, sourceChunks);
    const consistencyScore = checkFactualConsistency(responseText, sourceChunks);

    // Calculate overall quality score (weighted average)
    const overallScore = (
      coherenceScore * 0.25 +
      (1 - hallucinationScore) * 0.35 +
      attributionScore * 0.20 +
      consistencyScore * 0.20
    );

    // Determine quality assessment
    let assessment = 'Excellent';
    if (overallScore < 0.9) assessment = 'Very Good';
    if (overallScore < 0.8) assessment = 'Good';
    if (overallScore < 0.7) assessment = 'Fair';
    if (overallScore < 0.6) assessment = 'Poor';

    // Detect issues
    const issues: string[] = [];
    if (coherenceScore < 0.7) issues.push('Low coherence detected');
    if (hallucinationScore > 0.3) issues.push('Potential hallucinations detected');
    if (attributionScore < 0.7) issues.push('Poor source attribution');
    if (consistencyScore < 0.7) issues.push('Factual inconsistencies detected');

    const metrics: ResponseQualityMetrics = {
      response_id: responseId,
      query,
      response_text: responseText,
      coherence_score: coherenceScore,
      hallucination_score: hallucinationScore,
      source_attribution_score: attributionScore,
      factual_consistency_score: consistencyScore,
      overall_quality_score: overallScore,
      quality_assessment: assessment,
      issues_detected: issues,
      timestamp: new Date().toISOString(),
    };

    // Store metrics in database
    await storeResponseMetrics(metrics, supabaseClient);

    console.log(`✅ Response Quality: ${assessment} (${(overallScore * 100).toFixed(1)}%)`);

    return metrics;
  } catch (error) {
    console.error('Error evaluating response quality:', error);
    throw error;
  }
}

/**
 * Calculate response coherence
 */
function calculateCoherence(text: string): number {
  if (!text) return 0;

  // Check for sentence structure
  const sentences = text.match(/[.!?]+/g) || [];
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const avgWordsPerSentence = words.length / Math.max(1, sentences.length);

  // Optimal: 15-20 words per sentence
  let coherenceScore = 0.5;

  if (avgWordsPerSentence >= 10 && avgWordsPerSentence <= 25) {
    coherenceScore += 0.3;
  }

  // Check for paragraph structure
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  if (paragraphs.length > 1) {
    coherenceScore += 0.2;
  }

  // Check for logical flow (presence of transition words)
  const transitionWords = ['therefore', 'however', 'moreover', 'furthermore', 'consequently', 'thus'];
  const hasTransitions = transitionWords.some(word => text.toLowerCase().includes(word));
  if (hasTransitions) {
    coherenceScore += 0.1;
  }

  return Math.min(coherenceScore, 1);
}

/**
 * Detect hallucinations in response
 */
function detectHallucinations(responseText: string, sourceChunks: string[]): number {
  if (!responseText || sourceChunks.length === 0) return 0.5;

  // Extract key entities from response
  const responseWords = new Set(responseText.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  // Extract key entities from sources
  const sourceWords = new Set<string>();
  for (const chunk of sourceChunks) {
    chunk.toLowerCase().split(/\s+/).forEach(w => {
      if (w.length > 3) sourceWords.add(w);
    });
  }

  // Calculate coverage: how many response words are in sources
  let coverage = 0;
  for (const word of responseWords) {
    if (sourceWords.has(word)) coverage++;
  }

  const coverageRatio = responseWords.size > 0 ? coverage / responseWords.size : 0;

  // Hallucination score: 1 - coverage (higher = more hallucinations)
  return 1 - coverageRatio;
}

/**
 * Validate source attribution
 */
function validateSourceAttribution(responseText: string, sourceChunks: string[]): number {
  if (!responseText || sourceChunks.length === 0) return 0;

  // Check for citation patterns
  const citationPatterns = [
    /\[.*?\]/g,  // [citation]
    /\(.*?source.*?\)/gi,  // (source: ...)
    /according to/gi,  // according to
    /as mentioned/gi,  // as mentioned
  ];

  let citationCount = 0;
  for (const pattern of citationPatterns) {
    const matches = responseText.match(pattern) || [];
    citationCount += matches.length;
  }

  // Score based on citation presence
  let attributionScore = 0;
  if (citationCount > 0) {
    attributionScore = Math.min(citationCount / sourceChunks.length, 1);
  }

  return attributionScore;
}

/**
 * Check factual consistency
 */
function checkFactualConsistency(responseText: string, sourceChunks: string[]): number {
  if (!responseText || sourceChunks.length === 0) return 0.5;

  // Extract sentences from response
  const responseSentences = responseText.split(/[.!?]+/).filter(s => s.trim().length > 0);

  // Check how many response sentences have supporting content in sources
  let consistentSentences = 0;

  for (const sentence of responseSentences) {
    const sentenceWords = sentence.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    for (const chunk of sourceChunks) {
      const chunkWords = chunk.toLowerCase().split(/\s+/);

      // Check if at least 50% of sentence words appear in chunk
      const matchingWords = sentenceWords.filter(w => chunkWords.includes(w));
      if (matchingWords.length / sentenceWords.length >= 0.5) {
        consistentSentences++;
        break;
      }
    }
  }

  return responseSentences.length > 0 ? consistentSentences / responseSentences.length : 0.5;
}

/**
 * Store response metrics in database
 */
async function storeResponseMetrics(
  metrics: ResponseQualityMetrics,
  supabaseClient: ReturnType<typeof createClient>,
): Promise<void> {
  try {
    const { error } = await supabaseClient
      .from('response_quality_metrics')
      .insert({
        response_id: metrics.response_id,
        query: metrics.query,
        response_text: metrics.response_text,
        coherence_score: metrics.coherence_score,
        hallucination_score: metrics.hallucination_score,
        source_attribution_score: metrics.source_attribution_score,
        factual_consistency_score: metrics.factual_consistency_score,
        overall_quality_score: metrics.overall_quality_score,
        quality_assessment: metrics.quality_assessment,
        issues_detected: metrics.issues_detected,
        created_at: metrics.timestamp,
      });

    if (error) {
      console.error('Error storing response metrics:', error);
      // Don't throw - metrics storage failure shouldn't break response
    }
  } catch (error) {
    console.error('Error storing response metrics:', error);
    // Don't throw - metrics storage failure shouldn't break response
  }
}

/**
 * Format response metrics for logging
 */
export function formatResponseMetrics(metrics: ResponseQualityMetrics): string {
  return `
Response Quality Metrics:
  Query: ${metrics.query}
  Assessment: ${metrics.quality_assessment}
  Overall Score: ${(metrics.overall_quality_score * 100).toFixed(1)}%
  Coherence: ${(metrics.coherence_score * 100).toFixed(1)}%
  Hallucination: ${(metrics.hallucination_score * 100).toFixed(1)}%
  Attribution: ${(metrics.source_attribution_score * 100).toFixed(1)}%
  Consistency: ${(metrics.factual_consistency_score * 100).toFixed(1)}%
  Issues: ${metrics.issues_detected.length > 0 ? metrics.issues_detected.join(', ') : 'None'}
  `;
}


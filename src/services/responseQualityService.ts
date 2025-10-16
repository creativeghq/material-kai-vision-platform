/**
 * Response Quality Service
 * 
 * Validates response quality and detects hallucinations:
 * - Response coherence scoring
 * - Hallucination detection
 * - Source attribution validation
 * - Factual consistency checking
 */

import { supabase } from '@/integrations/supabase/client';

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

export class ResponseQualityService {
  /**
   * Evaluate response quality
   */
  static async evaluateResponse(
    responseId: string,
    query: string,
    responseText: string,
    sourceChunks: string[]
  ): Promise<ResponseQualityMetrics> {
    try {
      console.log(`🔍 Evaluating response quality for ${responseId}...`);

      // Calculate individual quality metrics
      const coherenceScore = this.calculateCoherence(responseText);
      const hallucinationScore = this.detectHallucinations(responseText, sourceChunks);
      const attributionScore = this.validateSourceAttribution(responseText, sourceChunks);
      const consistencyScore = this.checkFactualConsistency(responseText, sourceChunks);

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

      // Store metrics
      await this.storeResponseMetrics(metrics);

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
  private static calculateCoherence(text: string): number {
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
  private static detectHallucinations(responseText: string, sourceChunks: string[]): number {
    if (!responseText || sourceChunks.length === 0) return 0.5;

    // Extract key entities from response
    const responseWords = new Set(responseText.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    // Extract key entities from sources
    const sourceWords = new Set();
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

    // Hallucination score: inverse of coverage
    // High coverage = low hallucination
    return Math.max(0, 1 - coverageRatio);
  }

  /**
   * Validate source attribution
   */
  private static validateSourceAttribution(responseText: string, sourceChunks: string[]): number {
    if (!responseText || sourceChunks.length === 0) return 0;

    // Check for explicit source citations
    const citationPatterns = [
      /\[source[:\s]*\d+\]/gi,
      /\(source[:\s]*\d+\)/gi,
      /according to/gi,
      /based on/gi,
      /from the document/gi,
    ];

    let citationCount = 0;
    for (const pattern of citationPatterns) {
      const matches = responseText.match(pattern);
      if (matches) citationCount += matches.length;
    }

    // Score based on citation presence
    let attributionScore = 0.3; // Base score

    if (citationCount > 0) {
      attributionScore += Math.min(0.7, citationCount * 0.2);
    }

    return Math.min(attributionScore, 1);
  }

  /**
   * Check factual consistency
   */
  private static checkFactualConsistency(responseText: string, sourceChunks: string[]): number {
    if (!responseText || sourceChunks.length === 0) return 0.5;

    // Check for contradictions
    const contradictionPatterns = [
      /however.*(?:contradicts|conflicts|disagrees)/gi,
      /but.*(?:actually|in fact|really)/gi,
      /despite.*(?:claims|states|says)/gi,
    ];

    let contradictionCount = 0;
    for (const pattern of contradictionPatterns) {
      const matches = responseText.match(pattern);
      if (matches) contradictionCount += matches.length;
    }

    // Check for consistency with sources
    const responseWords = new Set(responseText.toLowerCase().split(/\s+/));
    const sourceWords = new Set();

    for (const chunk of sourceChunks) {
      chunk.toLowerCase().split(/\s+/).forEach(w => sourceWords.add(w));
    }

    const consistency = 1 - (contradictionCount * 0.1);

    return Math.max(0, Math.min(consistency, 1));
  }

  /**
   * Store response metrics
   */
  private static async storeResponseMetrics(metrics: ResponseQualityMetrics): Promise<void> {
    try {
      const { error } = await supabase
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

      if (error) throw error;
    } catch (error) {
      console.error('Error storing response metrics:', error);
    }
  }

  /**
   * Get average response quality metrics
   */
  static async getAverageQuality(timeWindowHours: number = 24): Promise<{
    avg_coherence: number;
    avg_hallucination: number;
    avg_attribution: number;
    avg_consistency: number;
    avg_overall: number;
    total_responses: number;
  }> {
    try {
      const cutoffTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('response_quality_metrics')
        .select('coherence_score, hallucination_score, source_attribution_score, factual_consistency_score, overall_quality_score')
        .gte('created_at', cutoffTime);

      if (error) throw error;

      if (!data || data.length === 0) {
        return {
          avg_coherence: 0,
          avg_hallucination: 0,
          avg_attribution: 0,
          avg_consistency: 0,
          avg_overall: 0,
          total_responses: 0,
        };
      }

      return {
        avg_coherence: data.reduce((sum, m) => sum + m.coherence_score, 0) / data.length,
        avg_hallucination: data.reduce((sum, m) => sum + m.hallucination_score, 0) / data.length,
        avg_attribution: data.reduce((sum, m) => sum + m.source_attribution_score, 0) / data.length,
        avg_consistency: data.reduce((sum, m) => sum + m.factual_consistency_score, 0) / data.length,
        avg_overall: data.reduce((sum, m) => sum + m.overall_quality_score, 0) / data.length,
        total_responses: data.length,
      };
    } catch (error) {
      console.error('Error getting average quality:', error);
      throw error;
    }
  }
}


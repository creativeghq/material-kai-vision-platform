/**
 * Chunk Quality Service
 * 
 * Calculates and stores quality metrics for chunks and images
 * Integrates with the PDF workflow to assess processing quality
 */

import { supabase } from '../integrations/supabase/client';

interface ChunkCoherenceMetrics {
  semantic_completeness: number;
  boundary_quality: number;
  context_preservation: number;
  metadata_richness: number;
  structural_integrity: number;
  overall_coherence: number;
}

interface ChunkQualityData {
  chunk_id: string;
  coherence_score: number;
  coherence_metrics: ChunkCoherenceMetrics;
  quality_assessment: string;
  quality_recommendations: string[];
}

export class ChunkQualityService {
  /**
   * Calculate semantic completeness score
   */
  private calculateSemanticCompleteness(content: string): number {
    if (!content || content.length === 0) return 0;

    // Check for complete sentences
    const sentences = content.match(/[.!?]+/g) || [];
    const sentenceRatio = sentences.length / Math.max(1, content.split(/\s+/).length / 10);

    // Check for paragraph structure
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
    const hasStructure = paragraphs.length > 0 ? 1 : 0;

    // Check for proper boundaries
    const startsWithCapital = /^[A-Z]/.test(content.trim()) ? 1 : 0;
    const endsWithPunctuation = /[.!?]$/.test(content.trim()) ? 1 : 0;

    return (
      Math.min(sentenceRatio, 1) * 0.4 +
      hasStructure * 0.3 +
      startsWithCapital * 0.15 +
      endsWithPunctuation * 0.15
    );
  }

  /**
   * Calculate boundary quality score
   */
  private calculateBoundaryQuality(content: string): number {
    const endsSentence = /[.!?]\s*$/.test(content.trim()) ? 0.5 : 0;
    const endsParagraph = /\n\s*$/.test(content) ? 0.3 : 0;
    const endsSection = /^#+\s+/.test(content.trim().split('\n').pop() || '') ? 0.2 : 0;
    const midWordBreak = /\w$/.test(content.trim()) ? -0.1 : 0;

    return Math.max(0, Math.min(1, endsSentence + endsParagraph + endsSection + midWordBreak));
  }

  /**
   * Calculate context preservation score
   */
  private calculateContextPreservation(content: string): number {
    let score = 0.5;

    // Check for context references
    if (/\b(this|these|that|those|aforementioned)\b/i.test(content)) {
      score += 0.2;
    }

    if (/\b(following|below|above|next|previous)\b/i.test(content)) {
      score += 0.2;
    }

    // Check for topic consistency
    const words = content.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const wordDiversity = uniqueWords.size / words.length;

    if (wordDiversity > 0.5 && wordDiversity < 0.9) {
      score += 0.1;
    }

    return Math.min(score, 1);
  }

  /**
   * Calculate metadata richness score
   */
  private calculateMetadataRichness(metadata: Record<string, any>): number {
    if (!metadata || Object.keys(metadata).length === 0) return 0;

    const requiredFields = ['document_name', 'page_number', 'chunk_index', 'source_document'];
    const presentFields = requiredFields.filter(field => metadata[field] !== undefined).length;
    const baseScore = presentFields / requiredFields.length;

    const extraFields = Object.keys(metadata).length - requiredFields.length;
    const bonus = Math.min(extraFields * 0.05, 0.2);

    return Math.min(baseScore + bonus, 1);
  }

  /**
   * Calculate structural integrity score
   */
  private calculateStructuralIntegrity(content: string): number {
    let score = 0;

    if (/^#+\s+/.test(content)) score += 0.2;
    if (/^[\s]*[-*+]\s+/.test(content)) score += 0.2;
    if (/```/.test(content)) score += 0.2;
    if (/\|.*\|/.test(content)) score += 0.2;
    if (/^\s{2,}/.test(content)) score += 0.1;

    return Math.min(score, 1);
  }

  /**
   * Score a chunk
   */
  scoreChunk(
    chunkId: string,
    content: string,
    metadata: Record<string, any>
  ): ChunkQualityData {
    const semanticCompleteness = this.calculateSemanticCompleteness(content);
    const boundaryQuality = this.calculateBoundaryQuality(content);
    const contextPreservation = this.calculateContextPreservation(content);
    const metadataRichness = this.calculateMetadataRichness(metadata);
    const structuralIntegrity = this.calculateStructuralIntegrity(content);

    const overallCoherence = (
      semanticCompleteness * 0.25 +
      boundaryQuality * 0.25 +
      contextPreservation * 0.2 +
      metadataRichness * 0.15 +
      structuralIntegrity * 0.15
    );

    const coherenceScore = Math.round(overallCoherence * 100) / 100;
    const qualityAssessment = this.getQualityAssessment(coherenceScore);
    const recommendations = this.getRecommendations({
      semantic_completeness: semanticCompleteness,
      boundary_quality: boundaryQuality,
      context_preservation: contextPreservation,
      metadata_richness: metadataRichness,
      structural_integrity: structuralIntegrity,
      overall_coherence: overallCoherence,
    });

    return {
      chunk_id: chunkId,
      coherence_score: coherenceScore,
      coherence_metrics: {
        semantic_completeness: Math.round(semanticCompleteness * 100) / 100,
        boundary_quality: Math.round(boundaryQuality * 100) / 100,
        context_preservation: Math.round(contextPreservation * 100) / 100,
        metadata_richness: Math.round(metadataRichness * 100) / 100,
        structural_integrity: Math.round(structuralIntegrity * 100) / 100,
        overall_coherence: coherenceScore,
      },
      quality_assessment: qualityAssessment,
      quality_recommendations: recommendations,
    };
  }

  /**
   * Get quality assessment
   */
  private getQualityAssessment(score: number): string {
    if (score >= 0.9) return 'Excellent';
    if (score >= 0.8) return 'Very Good';
    if (score >= 0.7) return 'Good';
    if (score >= 0.6) return 'Fair';
    if (score >= 0.5) return 'Acceptable';
    return 'Poor';
  }

  /**
   * Get recommendations
   */
  private getRecommendations(metrics: ChunkCoherenceMetrics): string[] {
    const recommendations: string[] = [];

    if (metrics.semantic_completeness < 0.7) {
      recommendations.push('Adjust chunk boundaries to preserve complete thoughts');
    }
    if (metrics.boundary_quality < 0.7) {
      recommendations.push('Align boundaries with sentence or paragraph breaks');
    }
    if (metrics.context_preservation < 0.7) {
      recommendations.push('Add context references or improve chunk overlap');
    }
    if (metrics.metadata_richness < 0.7) {
      recommendations.push('Ensure all required metadata fields are populated');
    }
    if (metrics.structural_integrity < 0.7) {
      recommendations.push('Preserve document structure (headings, lists, tables)');
    }

    return recommendations;
  }

  /**
   * Update chunk quality metrics in database
   */
  async updateChunkQuality(
    chunkId: string,
    qualityData: ChunkQualityData
  ): Promise<void> {
    const { error } = await supabase
      .from('document_chunks')
      .update({
        coherence_score: qualityData.coherence_score,
        coherence_metrics: qualityData.coherence_metrics,
        quality_assessment: qualityData.quality_assessment,
        quality_recommendations: qualityData.quality_recommendations,
      })
      .eq('id', chunkId);

    if (error) {
      console.error('Failed to update chunk quality:', error);
      throw error;
    }
  }

  /**
   * Calculate document-level quality metrics
   */
  async calculateDocumentQuality(documentId: string): Promise<void> {
    // Fetch all chunks for the document
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('coherence_score')
      .eq('document_id', documentId);

    if (chunksError || !chunks) {
      console.error('Failed to fetch chunks:', chunksError);
      return;
    }

    // Calculate aggregated metrics
    const coherenceScores = chunks
      .map(c => c.coherence_score)
      .filter(s => s !== null) as number[];

    const averageCoherence = coherenceScores.length > 0
      ? Math.round((coherenceScores.reduce((a, b) => a + b, 0) / coherenceScores.length) * 100) / 100
      : 0;

    const highCoherence = coherenceScores.filter(s => s >= 0.8).length;
    const lowCoherence = coherenceScores.filter(s => s < 0.6).length;

    // Store document quality metrics
    const { error: updateError } = await supabase
      .from('document_quality_metrics')
      .upsert({
        document_id: documentId,
        average_coherence_score: averageCoherence,
        chunks_with_high_coherence: highCoherence,
        chunks_with_low_coherence: lowCoherence,
        overall_quality_score: averageCoherence,
        quality_assessment: this.getQualityAssessment(averageCoherence),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'document_id' });

    if (updateError) {
      console.error('Failed to update document quality metrics:', updateError);
    }
  }
}

export const chunkQualityService = new ChunkQualityService();


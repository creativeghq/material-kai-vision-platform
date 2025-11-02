/**
 * Unified Text Preprocessing Service
 *
 * This service provides consistent text preprocessing across all services
 * in the Material Kai Vision Platform to ensure embedding consistency.
 */

import {
  textPreprocessor,
  DEFAULT_EMBEDDING_CONFIG,
} from '../config/embeddingConfig';

export interface TextChunk {
  id: string;
  text: string;
  metadata: {
    originalLength: number;
    preprocessedLength: number;
    chunkIndex: number;
    totalChunks: number;
    source: string;
    startPosition?: number;
    endPosition?: number;
  };
}

export interface ChunkingOptions {
  maxChunkSize: number;
  overlapSize: number;
  preserveStructure: boolean;
  splitOnSentences: boolean;
  splitOnParagraphs: boolean;
  minChunkSize: number;
}

export interface TextPreprocessingResult {
  originalText: string;
  preprocessedText: string;
  chunks: TextChunk[];
  metadata: {
    originalLength: number;
    preprocessedLength: number;
    totalChunks: number;
    processingTime: number;
    chunkingOptions: ChunkingOptions;
  };
}

/**
 * Unified Text Preprocessing Service
 */
export class UnifiedTextPreprocessor {
  private defaultChunkingOptions: ChunkingOptions = {
    maxChunkSize: 1000,
    overlapSize: 100,
    preserveStructure: true,
    splitOnSentences: true,
    splitOnParagraphs: true,
    minChunkSize: 50,
  };

  /**
   * Preprocess text with unified configuration
   */
  async preprocessText(
    text: string,
    options?: Partial<ChunkingOptions>,
  ): Promise<TextPreprocessingResult> {
    const startTime = performance.now();
    const chunkingOptions = { ...this.defaultChunkingOptions, ...options };

    // Validate input
    const validation = textPreprocessor.validate(text);
    if (!validation.valid) {
      throw new Error(`Text validation failed: ${validation.error}`);
    }

    // Apply unified preprocessing
    const preprocessedText = textPreprocessor.preprocess(text);

    // Create chunks
    const chunks = this.createChunks(preprocessedText, chunkingOptions);

    const processingTime = performance.now() - startTime;

    return {
      originalText: text,
      preprocessedText,
      chunks,
      metadata: {
        originalLength: text.length,
        preprocessedLength: preprocessedText.length,
        totalChunks: chunks.length,
        processingTime,
        chunkingOptions,
      },
    };
  }

  /**
   * Create text chunks with overlap
   */
  private createChunks(text: string, options: ChunkingOptions): TextChunk[] {
    const chunks: TextChunk[] = [];

    if (text.length <= options.maxChunkSize) {
      // Text is small enough to be a single chunk
      chunks.push({
        id: this.generateChunkId(0),
        text,
        metadata: {
          originalLength: text.length,
          preprocessedLength: text.length,
          chunkIndex: 0,
          totalChunks: 1,
          source: 'single_chunk',
          startPosition: 0,
          endPosition: text.length,
        },
      });
      return chunks;
    }

    // Split text into chunks with overlap
    let currentPosition = 0;
    let chunkIndex = 0;

    while (currentPosition < text.length) {
      const endPosition = Math.min(
        currentPosition + options.maxChunkSize,
        text.length,
      );

      let chunkText = text.substring(currentPosition, endPosition);

      // Try to break at sentence boundaries if preserveStructure is enabled
      if (
        options.preserveStructure &&
        options.splitOnSentences &&
        endPosition < text.length
      ) {
        const sentenceBreak = this.findSentenceBreak(chunkText);
        if (sentenceBreak > options.minChunkSize) {
          chunkText = chunkText.substring(0, sentenceBreak);
        }
      }

      // Try to break at paragraph boundaries
      if (
        options.preserveStructure &&
        options.splitOnParagraphs &&
        endPosition < text.length
      ) {
        const paragraphBreak = this.findParagraphBreak(chunkText);
        if (paragraphBreak > options.minChunkSize) {
          chunkText = chunkText.substring(0, paragraphBreak);
        }
      }

      chunks.push({
        id: this.generateChunkId(chunkIndex),
        text: chunkText.trim(),
        metadata: {
          originalLength: chunkText.length,
          preprocessedLength: chunkText.trim().length,
          chunkIndex,
          totalChunks: 0, // Will be updated after all chunks are created
          source: 'chunked',
          startPosition: currentPosition,
          endPosition: currentPosition + chunkText.length,
        },
      });

      // Move to next chunk with overlap
      const actualChunkLength = chunkText.length;
      currentPosition += Math.max(
        actualChunkLength - options.overlapSize,
        options.minChunkSize,
      );
      chunkIndex++;
    }

    // Update total chunks count
    chunks.forEach((chunk) => {
      chunk.metadata.totalChunks = chunks.length;
    });

    return chunks;
  }

  /**
   * Find the best sentence break point
   */
  private findSentenceBreak(text: string): number {
    const sentenceEnders = /[.!?]+\s+/g;
    let lastMatch = 0;
    let match;

    while ((match = sentenceEnders.exec(text)) !== null) {
      lastMatch = match.index + match[0].length;
    }

    return lastMatch > 0 ? lastMatch : text.length;
  }

  /**
   * Find the best paragraph break point
   */
  private findParagraphBreak(text: string): number {
    const paragraphBreak = text.lastIndexOf('\n\n');
    return paragraphBreak > 0 ? paragraphBreak + 2 : text.length;
  }

  /**
   * Generate unique chunk ID
   */
  private generateChunkId(index: number): string {
    return `chunk_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Preprocess text for MIVAA service (Python compatibility)
   */
  async preprocessForMivaa(text: string): Promise<string> {
    // Apply the same preprocessing as other services
    const validation = textPreprocessor.validate(text);
    if (!validation.valid) {
      throw new Error(`Text validation failed: ${validation.error}`);
    }

    return textPreprocessor.preprocess(text);
  }

  /**
   * Preprocess text for RAG queries
   */
  async preprocessForRAG(query: string): Promise<string> {
    // For queries, we might want slightly different preprocessing
    const validation = textPreprocessor.validate(query);
    if (!validation.valid) {
      throw new Error(`Query validation failed: ${validation.error}`);
    }

    // Apply preprocessing but preserve query structure
    let preprocessed = textPreprocessor.normalize(query);

    // For queries, don't truncate as aggressively
    if (
      preprocessed.length > DEFAULT_EMBEDDING_CONFIG.textPreprocessing.maxLength
    ) {
      preprocessed = textPreprocessor.truncate(preprocessed, 2000); // Allow longer queries
    }

    return preprocessed;
  }

  /**
   * Preprocess document content for embedding
   */
  async preprocessForEmbedding(text: string): Promise<string> {
    return textPreprocessor.preprocess(text);
  }

  /**
   * Batch preprocess multiple texts
   */
  async batchPreprocess(
    texts: string[],
    options?: Partial<ChunkingOptions>,
  ): Promise<TextPreprocessingResult[]> {
    const results: TextPreprocessingResult[] = [];

    for (const text of texts) {
      try {
        const result = await this.preprocessText(text, options);
        results.push(result);
      } catch (error) {
        console.error('Failed to preprocess text:', error);
        // Add empty result for failed preprocessing
        results.push({
          originalText: text,
          preprocessedText: '',
          chunks: [],
          metadata: {
            originalLength: text.length,
            preprocessedLength: 0,
            totalChunks: 0,
            processingTime: 0,
            chunkingOptions: { ...this.defaultChunkingOptions, ...options },
          },
        });
      }
    }

    return results;
  }

  /**
   * Get preprocessing statistics
   */
  getPreprocessingStats(result: TextPreprocessingResult): {
    compressionRatio: number;
    averageChunkSize: number;
    overlapEfficiency: number;
  } {
    const compressionRatio =
      result.metadata.preprocessedLength / result.metadata.originalLength;
    const averageChunkSize =
      result.chunks.length > 0
        ? result.chunks.reduce(
            (sum, chunk) => sum + chunk.metadata.preprocessedLength,
            0,
          ) / result.chunks.length
        : 0;

    // Calculate overlap efficiency (how much text is duplicated due to overlap)
    const totalChunkLength = result.chunks.reduce(
      (sum, chunk) => sum + chunk.metadata.preprocessedLength,
      0,
    );
    const overlapEfficiency =
      result.metadata.preprocessedLength / totalChunkLength;

    return {
      compressionRatio,
      averageChunkSize,
      overlapEfficiency,
    };
  }
}

// Export singleton instance
export const unifiedTextPreprocessor = new UnifiedTextPreprocessor();

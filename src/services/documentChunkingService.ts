import { performance } from 'perf_hooks';

/**
 * Chunking strategy configuration
 */
export interface ChunkingStrategy {
  type: 'fixed-size' | 'semantic' | 'hybrid';
  maxChunkSize: number;
  overlapSize: number;
  preserveStructure: boolean;
  sentenceBoundary?: boolean;
  paragraphBoundary?: boolean;
}

/**
 * Position information for a chunk within the document
 */
export interface ChunkPosition {
  startIndex: number;
  endIndex: number;
  pageNumber?: number;
  sectionId?: string;
  paragraphIndex?: number;
}

/**
 * Metadata associated with a document chunk
 */
export interface ChunkMetadata {
  source: string;
  workspaceId: string;
  documentId?: string;
  chunkIndex: number;
  totalChunks: number;
  extractedAt: Date;
  language?: string;
  contentType: 'text' | 'table' | 'image' | 'mixed';
  headers?: string[];
  tableData?: unknown;
  imageMetadata?: unknown;
  quality: {
    completeness: number;
    coherence: number;
    readability: number;
  };
}

/**
 * Document chunk with content, metadata, and position information
 */
export interface DocumentChunk {
  id: string;
  content: string;
  metadata: ChunkMetadata;
  position: ChunkPosition;
  embeddings?: number[];
  hash: string;
}

/**
 * Chunking performance metrics
 */
export interface ChunkingMetrics {
  totalProcessingTime: number;
  chunksGenerated: number;
  averageChunkSize: number;
  overlapEfficiency: number;
  qualityScore: number;
  memoryUsage: number;
}

/**
 * Input document for chunking
 */
export interface DocumentInput {
  content: string;
  metadata: {
    source: string;
    workspaceId: string;
    documentId?: string;
    language?: string;
    extractedTables?: unknown[];
    extractedImages?: unknown[];
    structure?: {
      headers: string[];
      sections: Array<{
        id: string;
        title: string;
        startIndex: number;
        endIndex: number;
      }>;
    };
  };
}

/**
 * Chunking result with chunks and performance metrics
 */
export interface ChunkingResult {
  chunks: DocumentChunk[];
  metrics: ChunkingMetrics;
  strategy: ChunkingStrategy;
  warnings: string[];
}

/**
 * DocumentChunkingService
 *
 * Intelligent text chunking service with configurable strategies for optimal
 * document segmentation. Supports fixed-size, semantic, and hybrid chunking
 * approaches with overlap handling and boundary detection.
 *
 * Features:
 * - Multiple chunking strategies (fixed-size, semantic, hybrid)
 * - Configurable overlap and boundary preservation
 * - Metadata preservation and enrichment
 * - Performance monitoring and quality metrics
 * - Memory-efficient processing for large documents
 * - Content type detection and specialized handling
 */
export class DocumentChunkingService {
  private readonly DEFAULT_STRATEGY: ChunkingStrategy = {
    type: 'hybrid',
    maxChunkSize: 1000,
    overlapSize: 100,
    preserveStructure: true,
    sentenceBoundary: true,
    paragraphBoundary: true,
  };

  private readonly SENTENCE_ENDINGS = /[.!?]+\s+/g;
  private readonly PARAGRAPH_BREAKS = /\n\s*\n/g;


  /**
   * Chunk a document using the specified strategy
   */
  async chunkDocument(
    document: DocumentInput,
    strategy: Partial<ChunkingStrategy> = {},
  ): Promise<ChunkingResult> {
    const startTime = performance.now();
    const memoryBefore = process.memoryUsage().heapUsed;

    try {
      console.log(`Starting document chunking for: ${document.metadata.source}`);

      // Merge strategy with defaults
      const finalStrategy: ChunkingStrategy = { ...this.DEFAULT_STRATEGY, ...strategy };

      // Validate inputs
      this.validateInputs(document, finalStrategy);

      // Preprocess document content
      const preprocessedContent = this.preprocessContent(document.content);

      // Generate chunks based on strategy
      let chunks: DocumentChunk[];
      switch (finalStrategy.type) {
        case 'fixed-size':
          chunks = await this.chunkFixedSize(document, preprocessedContent, finalStrategy);
          break;
        case 'semantic':
          chunks = await this.chunkSemantic(document, preprocessedContent, finalStrategy);
          break;
        case 'hybrid':
          chunks = await this.chunkHybrid(document, preprocessedContent, finalStrategy);
          break;
        default:
          throw new Error(`Unsupported chunking strategy: ${finalStrategy.type}`);
      }

      // Post-process chunks
      chunks = await this.postProcessChunks(chunks, document, finalStrategy);

      // Calculate metrics
      const endTime = performance.now();
      const memoryAfter = process.memoryUsage().heapUsed;
      const metrics = this.calculateMetrics(chunks, startTime, endTime, memoryBefore, memoryAfter);

      // Generate warnings
      const warnings = this.generateWarnings(chunks, finalStrategy, metrics);

      console.log(`Document chunking completed: ${chunks.length} chunks generated in ${metrics.totalProcessingTime}ms`);

      return {
        chunks,
        metrics,
        strategy: finalStrategy,
        warnings,
      };

    } catch (error) {
      console.error('Document chunking failed:', error);
      throw this.createChunkingError('CHUNKING_FAILED', error instanceof Error ? error.message : 'Unknown error', error);
    }
  }

  /**
   * Validate chunking inputs
   */
  private validateInputs(document: DocumentInput, strategy: ChunkingStrategy): void {
    if (!document.content || document.content.trim().length === 0) {
      throw new Error('Document content cannot be empty');
    }

    if (!document.metadata.source || !document.metadata.workspaceId) {
      throw new Error('Document metadata must include source and workspaceId');
    }

    if (strategy.maxChunkSize <= 0 || strategy.maxChunkSize > 10000) {
      throw new Error('maxChunkSize must be between 1 and 10000 characters');
    }

    if (strategy.overlapSize < 0 || strategy.overlapSize >= strategy.maxChunkSize) {
      throw new Error('overlapSize must be between 0 and maxChunkSize');
    }
  }

  /**
   * Preprocess document content for chunking
   */
  private preprocessContent(content: string): string {
    // Normalize whitespace
    let processed = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Remove excessive whitespace while preserving structure
    processed = processed.replace(/[ \t]+/g, ' ');
    processed = processed.replace(/\n{3,}/g, '\n\n');

    // Trim leading/trailing whitespace
    processed = processed.trim();

    return processed;
  }

  /**
   * Fixed-size chunking strategy
   */
  private async chunkFixedSize(
    document: DocumentInput,
    content: string,
    strategy: ChunkingStrategy,
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    let currentIndex = 0;
    let chunkIndex = 0;

    while (currentIndex < content.length) {
      const endIndex = Math.min(currentIndex + strategy.maxChunkSize, content.length);
      let chunkContent = content.substring(currentIndex, endIndex);

      // Adjust for sentence boundaries if enabled
      if (strategy.sentenceBoundary && endIndex < content.length) {
        const adjustedEnd = this.findSentenceBoundary(content, currentIndex, endIndex);
        chunkContent = content.substring(currentIndex, adjustedEnd);
      }

      // Create chunk
      const chunk = this.createChunk(
        chunkContent,
        document,
        chunkIndex,
        currentIndex,
        currentIndex + chunkContent.length,
      );

      chunks.push(chunk);

      // Move to next chunk with overlap
      currentIndex += chunkContent.length - strategy.overlapSize;
      chunkIndex++;
    }

    return chunks;
  }

  /**
   * Semantic chunking strategy (simplified implementation)
   */
  private async chunkSemantic(
    document: DocumentInput,
    content: string,
    strategy: ChunkingStrategy,
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];

    // Split by paragraphs first
    const paragraphs = content.split(this.PARAGRAPH_BREAKS).filter(p => p.trim().length > 0);

    let currentChunk = '';
    let currentIndex = 0;
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      const paragraphWithBreak = paragraph + '\n\n';

      // If adding this paragraph would exceed max size, finalize current chunk
      if (currentChunk.length + paragraphWithBreak.length > strategy.maxChunkSize && currentChunk.length > 0) {
        const chunk = this.createChunk(
          currentChunk.trim(),
          document,
          chunkIndex,
          currentIndex - currentChunk.length,
          currentIndex,
        );
        chunks.push(chunk);

        // Start new chunk with overlap
        const overlapContent = this.getOverlapContent(currentChunk, strategy.overlapSize);
        currentChunk = overlapContent + paragraphWithBreak;
        chunkIndex++;
      } else {
        currentChunk += paragraphWithBreak;
      }

      currentIndex += paragraphWithBreak.length;
    }

    // Add final chunk if there's remaining content
    if (currentChunk.trim().length > 0) {
      const chunk = this.createChunk(
        currentChunk.trim(),
        document,
        chunkIndex,
        currentIndex - currentChunk.length,
        currentIndex,
      );
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Hybrid chunking strategy combining fixed-size and semantic approaches
   */
  private async chunkHybrid(
    document: DocumentInput,
    content: string,
    strategy: ChunkingStrategy,
  ): Promise<DocumentChunk[]> {
    // Start with semantic chunking, then apply size constraints
    const semanticChunks = await this.chunkSemantic(document, content, strategy);
    const refinedChunks: DocumentChunk[] = [];

    for (const chunk of semanticChunks) {
      if (chunk.content.length <= strategy.maxChunkSize) {
        refinedChunks.push(chunk);
      } else {
        // Split oversized semantic chunks using fixed-size approach
        const subChunks = await this.chunkFixedSize(
          {
            content: chunk.content,
            metadata: document.metadata,
          },
          chunk.content,
          strategy,
        );

        // Update chunk indices and positions
        subChunks.forEach((subChunk, index) => {
          subChunk.id = `${chunk.id}_${index}`;
          subChunk.metadata.chunkIndex = refinedChunks.length;
          subChunk.position.startIndex += chunk.position.startIndex;
          subChunk.position.endIndex += chunk.position.startIndex;
          refinedChunks.push(subChunk);
        });
      }
    }

    // Update total chunks count in metadata
    refinedChunks.forEach(chunk => {
      chunk.metadata.totalChunks = refinedChunks.length;
    });

    return refinedChunks;
  }

  /**
   * Create a document chunk with metadata
   */
  private createChunk(
    content: string,
    document: DocumentInput,
    chunkIndex: number,
    startIndex: number,
    endIndex: number,
  ): DocumentChunk {
    const chunkId = `chunk_${document.metadata.workspaceId}_${Date.now()}_${chunkIndex}`;
    const hash = this.generateContentHash(content);

    // Detect content type
    const contentType = this.detectContentType(content);

    // Calculate quality metrics
    const quality = this.calculateChunkQuality(content);

    const chunk: DocumentChunk = {
      id: chunkId,
      content: content.trim(),
      metadata: {
        source: document.metadata.source,
        workspaceId: document.metadata.workspaceId,
        documentId: document.metadata.documentId,
        chunkIndex,
        totalChunks: 0, // Will be updated later
        extractedAt: new Date(),
        language: document.metadata.language || 'en',
        contentType,
        quality,
      },
      position: {
        startIndex,
        endIndex,
        pageNumber: this.estimatePageNumber(startIndex, document.content.length),
        sectionId: this.findSectionId(content, document.metadata.structure),
      },
      hash,
    };

    return chunk;
  }

  /**
   * Post-process chunks for quality and consistency
   */
  private async postProcessChunks(
    chunks: DocumentChunk[],
    document: DocumentInput,
    _strategy: ChunkingStrategy,
  ): Promise<DocumentChunk[]> {
    // Update total chunks count
    chunks.forEach(chunk => {
      chunk.metadata.totalChunks = chunks.length;
    });

    // Remove empty or very small chunks
    const filteredChunks = chunks.filter(chunk =>
      chunk.content.trim().length >= 10, // Minimum viable chunk size
    );

    // Enhance metadata with headers if structure is available
    if (document.metadata.structure?.headers) {
      filteredChunks.forEach(chunk => {
        chunk.metadata.headers = this.extractRelevantHeaders(
          chunk.content,
          document.metadata.structure.headers,
        );
      });
    }

    return filteredChunks;
  }

  /**
   * Helper methods
   */

  private findSentenceBoundary(content: string, start: number, end: number): number {
    const searchText = content.substring(start, end + 50); // Look ahead a bit
    const sentences = searchText.split(this.SENTENCE_ENDINGS);

    if (sentences.length > 1) {
      const lastCompleteSentence = sentences.slice(0, -1).join('. ') + '.';
      return start + lastCompleteSentence.length;
    }

    return end;
  }

  private getOverlapContent(content: string, overlapSize: number): string {
    if (overlapSize <= 0 || content.length <= overlapSize) {
      return '';
    }

    const overlapText = content.substring(content.length - overlapSize);

    // Try to start overlap at a sentence boundary
    const sentenceStart = overlapText.search(/[.!?]\s+/);
    if (sentenceStart !== -1) {
      return overlapText.substring(sentenceStart + 2);
    }

    return overlapText;
  }

  private detectContentType(content: string): ChunkMetadata['contentType'] {
    // Simple heuristics for content type detection
    if (content.includes('|') && content.includes('\n') && content.split('|').length > 4) {
      return 'table';
    }

    if (content.includes('![') || content.includes('<img')) {
      return 'image';
    }

    if (content.includes('|') || content.includes('<img') || content.includes('![')) {
      return 'mixed';
    }

    return 'text';
  }

  private calculateChunkQuality(content: string): ChunkMetadata['quality'] {
    const length = content.length;
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = content.split(/\s+/).filter(w => w.length > 0);

    // Completeness: based on sentence structure
    const completeness = sentences.length > 0 && content.trim().endsWith('.') ? 1.0 : 0.8;

    // Coherence: based on average sentence length
    const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : 0;
    const coherence = Math.min(1.0, avgSentenceLength / 15); // Optimal around 15 words per sentence

    // Readability: simple metric based on word and sentence count
    const readability = Math.min(1.0, (words.length * sentences.length) / (length * 0.1));

    return {
      completeness: Math.round(completeness * 100) / 100,
      coherence: Math.round(coherence * 100) / 100,
      readability: Math.round(readability * 100) / 100,
    };
  }

  private estimatePageNumber(position: number, _totalLength: number): number {
    // Rough estimate: 2000 characters per page
    return Math.floor(position / 2000) + 1;
  }

  private findSectionId(content: string, structure?: DocumentInput['metadata']['structure']): string | undefined {
    if (!structure?.sections) return undefined;

    // Find the section that would contain this content based on headers
    const firstLine = content.split('\n')[0];
    const matchingSection = structure.sections.find(section =>
      firstLine.includes(section.title) || section.title.includes(firstLine.substring(0, 50)),
    );

    return matchingSection?.id;
  }

  private extractRelevantHeaders(content: string, headers: string[]): string[] {
    return headers.filter(header =>
      content.toLowerCase().includes(header.toLowerCase()) ||
      header.toLowerCase().includes(content.substring(0, 50).toLowerCase()),
    );
  }

  private generateContentHash(content: string): string {
    // Simple hash function for content deduplication
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private calculateMetrics(
    chunks: DocumentChunk[],
    startTime: number,
    endTime: number,
    memoryBefore: number,
    memoryAfter: number,
  ): ChunkingMetrics {
    const totalProcessingTime = endTime - startTime;
    const chunksGenerated = chunks.length;
    const averageChunkSize = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunksGenerated;

    // Calculate overlap efficiency (how much content is actually overlapped)
    const uniqueContent = new Set(chunks.map(chunk => chunk.hash)).size;
    const overlapEfficiency = uniqueContent / chunksGenerated;

    // Calculate overall quality score
    const qualityScore = chunks.reduce((sum, chunk) => {
      const chunkQuality = (chunk.metadata.quality.completeness +
                           chunk.metadata.quality.coherence +
                           chunk.metadata.quality.readability) / 3;
      return sum + chunkQuality;
    }, 0) / chunksGenerated;

    return {
      totalProcessingTime: Math.round(totalProcessingTime * 100) / 100,
      chunksGenerated,
      averageChunkSize: Math.round(averageChunkSize * 100) / 100,
      overlapEfficiency: Math.round(overlapEfficiency * 100) / 100,
      qualityScore: Math.round(qualityScore * 100) / 100,
      memoryUsage: memoryAfter - memoryBefore,
    };
  }

  private generateWarnings(
    chunks: DocumentChunk[],
    strategy: ChunkingStrategy,
    metrics: ChunkingMetrics,
  ): string[] {
    const warnings: string[] = [];

    if (metrics.averageChunkSize < strategy.maxChunkSize * 0.5) {
      warnings.push('Average chunk size is significantly smaller than target size');
    }

    if (metrics.qualityScore < 0.7) {
      warnings.push('Overall chunk quality is below recommended threshold');
    }

    if (chunks.length > 1000) {
      warnings.push('Large number of chunks generated - consider increasing chunk size');
    }

    if (metrics.overlapEfficiency < 0.8) {
      warnings.push('High content overlap detected - consider reducing overlap size');
    }

    return warnings;
  }

  private createChunkingError(code: string, message: string, originalError?: unknown): Error {
    const error = new Error(message);
    (error as unknown as Record<string, unknown>).code = code;
    (error as unknown as Record<string, unknown>).originalError = originalError;
    return error;
  }
}

import { performance } from 'perf_hooks';
import { createHash } from 'crypto';

import { DocumentChunk, DocumentChunkingService, ChunkingStrategy } from './documentChunkingService';
import { MivaaEmbeddingIntegration, EmbeddingRequest } from './mivaaEmbeddingIntegration';

/**
 * Mivaa document structure from PDF extractor
 */
export interface MivaaDocument {
  id?: string;
  filename: string;
  markdown: string;
  tables: TableData[];
  images: ImageMetadata[];
  metadata: MivaaDocumentMetadata;
  extractionTimestamp: string;
  processingStats?: {
    pages: number;
    processingTime: number;
    extractionQuality: number;
  };
}

/**
 * Table data extracted by Mivaa
 */
export interface TableData {
  id: string;
  caption?: string;
  headers: string[];
  rows: string[][];
  position: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  format: 'csv' | 'json' | 'markdown';
  rawData?: string;
}

/**
 * Image metadata from Mivaa extraction
 */
export interface ImageMetadata {
  id: string;
  filename: string;
  caption?: string;
  altText?: string;
  position: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  format: string;
  size: number;
  url?: string;
  base64?: string;
  extractedText?: string;
  confidence: number;
}

/**
 * Mivaa document metadata
 */
export interface MivaaDocumentMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
  pages: number;
  language?: string;
  keywords?: string[];
  extractionMethod: string;
  confidence: number;
  processingVersion: string;
}

/**
 * RAG-compatible document structure
 */
export interface RagDocument {
  id: string;
  title: string;
  content: string;
  chunks: DocumentChunk[];
  metadata: RagMetadata;
  workspace: string;
  embeddings?: {
    document: number[];
    chunks: Array<{
      chunkId: string;
      embedding: number[];
    }>;
  };
  tables: ProcessedTableData[];
  images: ProcessedImageData[];
  structure: DocumentStructure;
  quality: QualityMetrics;
}

/**
 * RAG metadata structure
 */
export interface RagMetadata {
  source: string;
  sourceType: 'mivaa-pdf';
  originalFilename: string;
  extractedAt: Date;
  transformedAt: Date;
  workspaceId: string;
  documentId: string;
  version: string;
  language: string;
  author?: string;
  subject?: string;
  pages: number;
  processingStats: {
    totalChunks: number;
    totalTables: number;
    totalImages: number;
    averageChunkSize: number;
    extractionQuality: number;
    transformationQuality: number;
  };
  tags: string[];
  categories: string[];
}

/**
 * Processed table data for RAG
 */
export interface ProcessedTableData {
  id: string;
  title: string;
  description?: string;
  structuredData: {
    headers: string[];
    rows: string[][];
    summary: string;
  };
  searchableText: string;
  position: TableData['position'];
  confidence: number;
  relatedChunks: string[];
}

/**
 * Processed image data for RAG
 */
export interface ProcessedImageData {
  id: string;
  title: string;
  description: string;
  extractedText?: string;
  searchableText: string;
  position: ImageMetadata['position'];
  confidence: number;
  relatedChunks: string[];
  url?: string;
}

/**
 * Document structure information
 */
export interface DocumentStructure {
  headers: Array<{
    level: number;
    text: string;
    position: number;
    chunkIds: string[];
  }>;
  sections: Array<{
    id: string;
    title: string;
    startPosition: number;
    endPosition: number;
    chunkIds: string[];
  }>;
  tableOfContents: Array<{
    title: string;
    level: number;
    chunkIds: string[];
  }>;
}

/**
 * Quality metrics for transformation
 */
export interface QualityMetrics {
  contentPreservation: number;
  structurePreservation: number;
  metadataCompleteness: number;
  chunkingQuality: number;
  overallQuality: number;
  warnings: string[];
  recommendations: string[];
}

/**
 * Transformation configuration
 */
export interface TransformationConfig {
  chunking: ChunkingStrategy;
  embeddings: {
    enabled: boolean;
    generateDocumentEmbedding: boolean;
    generateChunkEmbeddings: boolean;
  };
  tables: {
    includeInChunks: boolean;
    generateSummaries: boolean;
    extractSearchableText: boolean;
  };
  images: {
    includeInChunks: boolean;
    extractText: boolean;
    generateDescriptions: boolean;
  };
  structure: {
    preserveHeaders: boolean;
    generateTableOfContents: boolean;
    detectSections: boolean;
  };
  quality: {
    minimumChunkSize: number;
    maximumChunkSize: number;
    minimumConfidence: number;
  };
}

/**
 * Transformation result
 */
export interface TransformationResult {
  success: boolean;
  ragDocument: RagDocument;
  metrics: {
    processingTime: number;
    inputSize: number;
    outputSize: number;
    chunksGenerated: number;
    tablesProcessed: number;
    imagesProcessed: number;
    qualityScore: number;
  };
  warnings: string[];
  errors: string[];
}

/**
 * MivaaToRagTransformer
 *
 * Transforms Mivaa PDF extractor output into RAG-compatible document format.
 * Handles markdown content, tables, images, and metadata transformation with
 * intelligent chunking, embedding generation, and quality preservation.
 *
 * Features:
 * - Markdown content transformation and chunking
 * - Table data processing and searchable text generation
 * - Image metadata processing and text extraction
 * - Document structure preservation and enhancement
 * - Quality metrics and validation
 * - Configurable transformation options
 * - Comprehensive error handling and logging
 */
export class MivaaToRagTransformer {
  private readonly chunkingService: DocumentChunkingService;
  private readonly embeddingService?: MivaaEmbeddingIntegration;
  private readonly defaultConfig: TransformationConfig = {
    chunking: {
      type: 'hybrid',
      maxChunkSize: 1000,
      overlapSize: 100,
      preserveStructure: true,
      sentenceBoundary: true,
      paragraphBoundary: true,
    },
    embeddings: {
      enabled: false,
      generateDocumentEmbedding: false,
      generateChunkEmbeddings: false,
    },
    tables: {
      includeInChunks: true,
      generateSummaries: true,
      extractSearchableText: true,
    },
    images: {
      includeInChunks: false,
      extractText: true,
      generateDescriptions: true,
    },
    structure: {
      preserveHeaders: true,
      generateTableOfContents: true,
      detectSections: true,
    },
    quality: {
      minimumChunkSize: 50,
      maximumChunkSize: 2000,
      minimumConfidence: 0.7,
    },
  };

  constructor(
    chunkingService: DocumentChunkingService,
    embeddingService?: MivaaEmbeddingIntegration,
  ) {
    this.chunkingService = chunkingService;
    this.embeddingService = embeddingService || undefined;
  }

  /**
   * Transform Mivaa document to RAG format
   */
  async transformDocument(
    mivaaDocument: MivaaDocument,
    workspaceId: string,
    config: Partial<TransformationConfig> = {},
  ): Promise<TransformationResult> {
    const startTime = performance.now();
    const finalConfig = { ...this.defaultConfig, ...config };
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      console.log(`Starting Mivaa to RAG transformation for: ${mivaaDocument.filename}`);

      // Validate input document
      this.validateMivaaDocument(mivaaDocument);

      // Generate document ID
      const documentId = this.generateDocumentId(mivaaDocument, workspaceId);

      // Process markdown content and create chunks
      const { chunks, processedContent } = await this.processMarkdownContent(
        mivaaDocument,
        documentId,
        workspaceId,
        finalConfig,
      );

      // Process tables
      const processedTables = await this.processTables(
        mivaaDocument.tables,
        chunks,
        finalConfig,
      );

      // Process images
      const processedImages = await this.processImages(
        mivaaDocument.images,
        chunks,
        finalConfig,
      );

      // Extract document structure
      const structure = this.extractDocumentStructure(
        processedContent,
        chunks,
        finalConfig,
      );

      // Generate embeddings if enabled
      let embeddings;
      if (finalConfig.embeddings.enabled && this.embeddingService) {
        embeddings = await this.generateEmbeddings(
          processedContent,
          chunks,
          finalConfig,
        );
      }

      // Calculate quality metrics
      const quality = this.calculateQualityMetrics(
        mivaaDocument,
        chunks,
        processedTables,
        processedImages,
        finalConfig,
      );

      // Create RAG metadata
      const metadata = this.createRagMetadata(
        mivaaDocument,
        workspaceId,
        documentId,
        chunks,
        processedTables,
        processedImages,
        quality,
      );

      // Construct RAG document
      const ragDocument: RagDocument = {
        id: documentId,
        title: this.extractTitle(mivaaDocument),
        content: processedContent,
        chunks,
        metadata,
        workspace: workspaceId,
        embeddings,
        tables: processedTables,
        images: processedImages,
        structure,
        quality,
      };

      const processingTime = performance.now() - startTime;

      const result: TransformationResult = {
        success: true,
        ragDocument,
        metrics: {
          processingTime,
          inputSize: mivaaDocument.markdown.length,
          outputSize: processedContent.length,
          chunksGenerated: chunks.length,
          tablesProcessed: processedTables.length,
          imagesProcessed: processedImages.length,
          qualityScore: quality.overallQuality,
        },
        warnings: [...warnings, ...quality.warnings],
        errors,
      };

      console.log(`Mivaa to RAG transformation completed in ${processingTime}ms`);
      console.log(`Generated ${chunks.length} chunks, processed ${processedTables.length} tables, ${processedImages.length} images`);

      return result;

    } catch (error) {
      console.error('Mivaa to RAG transformation failed:', error);

      const processingTime = performance.now() - startTime;
      errors.push(error instanceof Error ? error.message : 'Unknown transformation error');

      return {
        success: false,
        ragDocument: {} as RagDocument,
        metrics: {
          processingTime,
          inputSize: mivaaDocument.markdown.length,
          outputSize: 0,
          chunksGenerated: 0,
          tablesProcessed: 0,
          imagesProcessed: 0,
          qualityScore: 0,
        },
        warnings,
        errors,
      };
    }
  }

  /**
   * Validate Mivaa document structure
   */
  private validateMivaaDocument(document: MivaaDocument): void {
    if (!document.filename) {
      throw new Error('Mivaa document must have a filename');
    }

    if (!document.markdown || document.markdown.trim().length === 0) {
      throw new Error('Mivaa document must have markdown content');
    }

    if (!document.metadata || !document.metadata.pages) {
      throw new Error('Mivaa document must have valid metadata with page count');
    }

    if (!Array.isArray(document.tables)) {
      throw new Error('Mivaa document tables must be an array');
    }

    if (!Array.isArray(document.images)) {
      throw new Error('Mivaa document images must be an array');
    }
  }

  /**
   * Generate unique document ID
   */
  private generateDocumentId(document: MivaaDocument, workspaceId: string): string {
    const content = `${workspaceId}_${document.filename}_${document.extractionTimestamp || Date.now()}`;
    const hash = createHash('sha256').update(content).digest('hex').substring(0, 16);
    return `rag_doc_${hash}`;
  }

  /**
   * Process markdown content and create chunks
   */
  private async processMarkdownContent(
    document: MivaaDocument,
    documentId: string,
    workspaceId: string,
    config: TransformationConfig,
  ): Promise<{ chunks: DocumentChunk[]; processedContent: string }> {
    // Preprocess markdown content
    let processedContent = this.preprocessMarkdown(document.markdown);

    // Integrate table references if configured
    if (config.tables.includeInChunks) {
      processedContent = this.integrateTableReferences(processedContent, document.tables);
    }

    // Create document input for chunking
    const documentInput = {
      content: processedContent,
      metadata: {
        source: document.filename,
        workspaceId,
        documentId,
        language: document.metadata.language || 'en',
        extractedTables: document.tables,
        extractedImages: document.images,
        structure: this.extractBasicStructure(processedContent),
      },
    };

    // Generate chunks
    const chunkingResult = await this.chunkingService.chunkDocument(
      documentInput,
      config.chunking,
    );

    return {
      chunks: chunkingResult.chunks,
      processedContent,
    };
  }

  /**
   * Preprocess markdown content
   */
  private preprocessMarkdown(markdown: string): string {
    // Normalize line endings
    let processed = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Clean up excessive whitespace
    processed = processed.replace(/\n{3,}/g, '\n\n');
    processed = processed.replace(/[ \t]+/g, ' ');

    // Ensure proper header formatting
    processed = processed.replace(/^(#{1,6})\s*(.+)$/gm, '$1 $2');

    // Clean up table formatting
    processed = processed.replace(/\|\s*\|/g, '| |');

    return processed.trim();
  }

  /**
   * Integrate table references into content
   */
  private integrateTableReferences(content: string, tables: TableData[]): string {
    let processedContent = content;

    tables.forEach((table, index) => {
      const tableRef = `[Table ${index + 1}${table.caption ? `: ${table.caption}` : ''}]`;
      const tableMarkdown = this.convertTableToMarkdown(table);

      // Try to find a good insertion point near the table's position
      const insertionPoint = this.findTableInsertionPoint(processedContent, table);

      if (insertionPoint !== -1) {
        processedContent =
          processedContent.slice(0, insertionPoint) +
          `\n\n${tableRef}\n${tableMarkdown}\n\n` +
          processedContent.slice(insertionPoint);
      } else {
        // Append at the end if no good insertion point found
        processedContent += `\n\n${tableRef}\n${tableMarkdown}\n`;
      }
    });

    return processedContent;
  }

  /**
   * Convert table data to markdown format
   */
  private convertTableToMarkdown(table: TableData): string {
    if (table.format === 'markdown' && table.rawData) {
      return table.rawData;
    }

    const headers = table.headers.join(' | ');
    const separator = table.headers.map(() => '---').join(' | ');
    const rows = table.rows.map(row => row.join(' | ')).join('\n');

    return `| ${headers} |\n| ${separator} |\n| ${rows} |`;
  }

  /**
   * Find appropriate insertion point for table
   */
  private findTableInsertionPoint(content: string, table: TableData): number {
    // Simple heuristic: find paragraph breaks near the table's page position
    const lines = content.split('\n');
    const targetLine = Math.floor((table.position.page / 10) * lines.length);

    // Look for paragraph break near target line
    for (let i = Math.max(0, targetLine - 5); i < Math.min(lines.length, targetLine + 5); i++) {
      if (lines[i].trim() === '' && i > 0 && lines[i - 1].trim() !== '') {
        return lines.slice(0, i).join('\n').length;
      }
    }

    return -1;
  }

  /**
   * Extract basic document structure
   */
  private extractBasicStructure(content: string) {
    const headers: string[] = [];
    const sections: Array<{ id: string; title: string; startIndex: number; endIndex: number }> = [];

    const lines = content.split('\n');
    let currentSection: { id: string; title: string; startIndex: number; endIndex: number } | null = null;

    lines.forEach((line, index) => {
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        const _level = headerMatch[1].length;
        const title = headerMatch[2].trim();
        headers.push(title);

        // Close previous section
        if (currentSection) {
          currentSection.endIndex = content.split('\n').slice(0, index).join('\n').length;
          sections.push(currentSection);
        }

        // Start new section
        currentSection = {
          id: `section_${sections.length}`,
          title,
          startIndex: content.split('\n').slice(0, index).join('\n').length,
          endIndex: content.length,
        };
      }
    });

    // Close final section
    if (currentSection) {
      sections.push(currentSection);
    }

    return { headers, sections };
  }

  /**
   * Process tables for RAG compatibility
   */
  private async processTables(
    tables: TableData[],
    chunks: DocumentChunk[],
    config: TransformationConfig,
  ): Promise<ProcessedTableData[]> {
    return Promise.all(tables.map(async (table, index) => {
      const title = table.caption || `Table ${index + 1}`;
      const description = config.tables.generateSummaries ?
        this.generateTableSummary(table) : undefined;

      const searchableText = config.tables.extractSearchableText ?
        this.extractTableSearchableText(table) : '';

      const relatedChunks = this.findRelatedChunks(chunks, table.position);

      return {
        id: table.id,
        title,
        description,
        structuredData: {
          headers: table.headers,
          rows: table.rows,
          summary: description || '',
        },
        searchableText,
        position: table.position,
        confidence: table.confidence,
        relatedChunks: relatedChunks.map(chunk => chunk.id),
      };
    }));
  }

  /**
   * Generate table summary
   */
  private generateTableSummary(table: TableData): string {
    const rowCount = table.rows.length;
    const colCount = table.headers.length;
    const headers = table.headers.join(', ');

    return `Table with ${rowCount} rows and ${colCount} columns. Headers: ${headers}. ${table.caption || ''}`.trim();
  }

  /**
   * Extract searchable text from table
   */
  private extractTableSearchableText(table: TableData): string {
    const headerText = table.headers.join(' ');
    const rowText = table.rows.map(row => row.join(' ')).join(' ');
    const captionText = table.caption || '';

    return `${captionText} ${headerText} ${rowText}`.trim();
  }

  /**
   * Process images for RAG compatibility
   */
  private async processImages(
    images: ImageMetadata[],
    chunks: DocumentChunk[],
    config: TransformationConfig,
  ): Promise<ProcessedImageData[]> {
    return Promise.all(images.map(async (image, index) => {
      const title = image.caption || image.filename || `Image ${index + 1}`;
      const description = config.images.generateDescriptions ?
        this.generateImageDescription(image) : image.altText || title;

      const searchableText = this.extractImageSearchableText(image, description);
      const relatedChunks = this.findRelatedChunks(chunks, image.position);

      return {
        id: image.id,
        title,
        description,
        extractedText: image.extractedText,
        searchableText,
        position: image.position,
        confidence: image.confidence,
        relatedChunks: relatedChunks.map(chunk => chunk.id),
        url: image.url,
      };
    }));
  }

  /**
   * Generate image description
   */
  private generateImageDescription(image: ImageMetadata): string {
    const parts = [];

    if (image.caption) parts.push(image.caption);
    if (image.altText) parts.push(image.altText);
    if (image.extractedText) parts.push(`Contains text: ${image.extractedText}`);

    parts.push(`Image file: ${image.filename}`);
    parts.push(`Format: ${image.format}`);

    return parts.join('. ');
  }

  /**
   * Extract searchable text from image
   */
  private extractImageSearchableText(image: ImageMetadata, description: string): string {
    const parts = [description];

    if (image.extractedText) parts.push(image.extractedText);
    if (image.filename) parts.push(image.filename);

    return parts.join(' ').trim();
  }

  /**
   * Find chunks related to a position
   */
  private findRelatedChunks(chunks: DocumentChunk[], position: { page: number }): DocumentChunk[] {
    // Simple heuristic: find chunks that might be on the same page
    const pageSize = 1000; // Approximate characters per page
    const _targetPosition = position.page * pageSize;

    return chunks.filter(chunk => {
      const chunkStart = chunk.position.startIndex;
      const _chunkEnd = chunk.position.endIndex;
      const chunkPage = Math.floor(chunkStart / pageSize);

      return Math.abs(chunkPage - position.page) <= 1;
    });
  }

  /**
   * Extract document structure
   */
  private extractDocumentStructure(
    content: string,
    chunks: DocumentChunk[],
    config: TransformationConfig,
  ): DocumentStructure {
    const headers = this.extractHeaders(content, chunks);
    const sections = this.extractSections(content, chunks, headers);
    const tableOfContents = config.structure.generateTableOfContents ?
      this.generateTableOfContents(headers) : [];

    return {
      headers,
      sections,
      tableOfContents,
    };
  }

  /**
   * Extract headers from content
   */
  private extractHeaders(content: string, chunks: DocumentChunk[]) {
    const headers: DocumentStructure['headers'] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const text = headerMatch[2].trim();
        const position = content.split('\n').slice(0, index).join('\n').length;

        // Find related chunks
        const relatedChunks = chunks.filter(chunk =>
          position >= chunk.position.startIndex && position <= chunk.position.endIndex,
        );

        headers.push({
          level,
          text,
          position,
          chunkIds: relatedChunks.map(chunk => chunk.id),
        });
      }
    });

    return headers;
  }

  /**
   * Extract sections from content
   */
  private extractSections(
    content: string,
    chunks: DocumentChunk[],
    headers: DocumentStructure['headers'],
  ): DocumentStructure['sections'] {
    const sections: DocumentStructure['sections'] = [];

    headers.forEach((header, index) => {
      const nextHeader = headers[index + 1];
      const startPosition = header.position;
      const endPosition = nextHeader ? nextHeader.position : content.length;

      const relatedChunks = chunks.filter(chunk =>
        chunk.position.startIndex >= startPosition && chunk.position.endIndex <= endPosition,
      );

      sections.push({
        id: `section_${index}`,
        title: header.text,
        startPosition,
        endPosition,
        chunkIds: relatedChunks.map(chunk => chunk.id),
      });
    });

    return sections;
  }

  /**
   * Generate table of contents
   */
  private generateTableOfContents(headers: DocumentStructure['headers']): DocumentStructure['tableOfContents'] {
    return headers.map(header => ({
      title: header.text,
      level: header.level,
      chunkIds: header.chunkIds,
    }));
  }

  /**
   * Generate embeddings for document and chunks
   */
  private async generateEmbeddings(
    content: string,
    chunks: DocumentChunk[],
    config: TransformationConfig,
  ) {
    if (!this.embeddingService) return undefined;

    const embeddings: RagDocument['embeddings'] = {
      document: [],
      chunks: [],
    };

    // Generate document-level embedding
    if (config.embeddings.generateDocumentEmbedding) {
      const documentInput: EmbeddingRequest = {
        id: 'document',
        text: content.substring(0, 8000), // Limit for embedding model
        metadata: { type: 'document' },
      };

      const documentEmbedding = await this.embeddingService.generateEmbedding(documentInput);
      embeddings.document = documentEmbedding.embeddings[0];
    }

    // Generate chunk embeddings
    if (config.embeddings.generateChunkEmbeddings) {
      const chunkInputs: EmbeddingRequest[] = chunks.map(chunk => ({
        id: chunk.id,
        text: chunk.content,
        metadata: { type: 'chunk', chunkIndex: chunk.metadata.chunkIndex },
      }));

      const chunkEmbeddings = await this.embeddingService.generateBatchEmbeddings(chunkInputs);

      embeddings.chunks = chunkEmbeddings.embeddings.map((embedding: number[], index: number) => ({
        chunkId: chunks[index]?.id || `chunk-${index}`,
        embedding: embedding,
      }));
    }

    return embeddings;
  }

  /**
   * Calculate quality metrics
   */
  private calculateQualityMetrics(
    mivaaDocument: MivaaDocument,
    chunks: DocumentChunk[],
    tables: ProcessedTableData[],
    images: ProcessedImageData[],
    config: TransformationConfig,
  ): QualityMetrics {
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Content preservation score
    const originalLength = mivaaDocument.markdown.length;
    const processedLength = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
    const contentPreservation = Math.min(1, processedLength / originalLength);

    // Structure preservation score
    const structurePreservation = this.calculateStructurePreservation(mivaaDocument, chunks);

    // Metadata completeness score
    const metadataCompleteness = this.calculateMetadataCompleteness(mivaaDocument);

    // Chunking quality score
    const chunkingQuality = this.calculateChunkingQuality(chunks, config);

    // Overall quality score
    const overallQuality = (
      contentPreservation * 0.3 +
      structurePreservation * 0.25 +
      metadataCompleteness * 0.2 +
      chunkingQuality * 0.25
    );

    // Generate warnings and recommendations
    if (contentPreservation < 0.9) {
      warnings.push('Significant content loss detected during transformation');
    }

    if (chunks.length === 0) {
      warnings.push('No chunks generated from document');
    }

    if (chunks.some(chunk => chunk.content.length < config.quality.minimumChunkSize)) {
      warnings.push('Some chunks are below minimum size threshold');
    }

    if (overallQuality < 0.8) {
      recommendations.push('Consider adjusting chunking parameters for better quality');
    }

    return {
      contentPreservation,
      structurePreservation,
      metadataCompleteness,
      chunkingQuality,
      overallQuality,
      warnings,
      recommendations,
    };
  }

  /**
   * Calculate structure preservation score
   */
  private calculateStructurePreservation(mivaaDocument: MivaaDocument, chunks: DocumentChunk[]): number {
    // Simple heuristic based on header preservation
    const headerCount = (mivaaDocument.markdown.match(/^#{1,6}\s+/gm) || []).length;
    const preservedHeaders = chunks.reduce((count, chunk) => {
      return count + (chunk.content.match(/^#{1,6}\s+/gm) || []).length;
    }, 0);

    return headerCount > 0 ? Math.min(1, preservedHeaders / headerCount) : 1;
  }

  /**
   * Calculate metadata completeness score
   */
  private calculateMetadataCompleteness(mivaaDocument: MivaaDocument): number {
    const metadata = mivaaDocument.metadata;
    let score = 0;
    let totalFields = 0;

    // Check essential metadata fields
    const fields = [
      'title', 'author', 'subject', 'creator', 'producer',
      'creationDate', 'modificationDate', 'language', 'keywords',
    ];

    fields.forEach(field => {
      totalFields++;
      if (metadata[field as keyof MivaaDocumentMetadata] &&
          metadata[field as keyof MivaaDocumentMetadata] !== '') {
        score++;
      }
    });

    // Always present fields
    if (metadata.pages > 0) score++;
    if (metadata.extractionMethod) score++;
    if (metadata.confidence > 0) score++;
    if (metadata.processingVersion) score++;
    totalFields += 4;

    return totalFields > 0 ? score / totalFields : 0;
  }

  /**
   * Calculate chunking quality score
   */
  private calculateChunkingQuality(chunks: DocumentChunk[], config: TransformationConfig): number {
    if (chunks.length === 0) return 0;

    let qualityScore = 0;
    let factors = 0;

    // Size distribution quality
    const avgSize = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunks.length;
    const sizeVariance = chunks.reduce((sum, chunk) => {
      return sum + Math.pow(chunk.content.length - avgSize, 2);
    }, 0) / chunks.length;
    const sizeConsistency = Math.max(0, 1 - (sizeVariance / (avgSize * avgSize)));
    qualityScore += sizeConsistency;
    factors++;

    // Boundary quality (check for sentence/paragraph boundaries)
    const boundaryQuality = chunks.filter(chunk => {
      const content = chunk.content.trim();
      return content.endsWith('.') || content.endsWith('!') || content.endsWith('?') ||
             content.endsWith('\n') || content.includes('\n\n');
    }).length / chunks.length;
    qualityScore += boundaryQuality;
    factors++;

    // Size compliance
    const sizeCompliance = chunks.filter(chunk =>
      chunk.content.length >= config.quality.minimumChunkSize &&
      chunk.content.length <= config.quality.maximumChunkSize,
    ).length / chunks.length;
    qualityScore += sizeCompliance;
    factors++;

    return factors > 0 ? qualityScore / factors : 0;
  }

  /**
   * Create RAG metadata from Mivaa document
   */
  private createRagMetadata(
    mivaaDocument: MivaaDocument,
    workspaceId: string,
    documentId: string,
    chunks: DocumentChunk[],
    tables: ProcessedTableData[],
    images: ProcessedImageData[],
    quality: QualityMetrics,
  ): RagMetadata {
    const avgChunkSize = chunks.length > 0 ?
      chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunks.length : 0;

    return {
      source: mivaaDocument.filename,
      sourceType: 'mivaa-pdf',
      originalFilename: mivaaDocument.filename,
      extractedAt: new Date(mivaaDocument.extractionTimestamp),
      transformedAt: new Date(),
      workspaceId,
      documentId,
      version: '1.0',
      language: mivaaDocument.metadata.language || 'en',
      author: mivaaDocument.metadata.author,
      subject: mivaaDocument.metadata.subject,
      pages: mivaaDocument.metadata.pages,
      processingStats: {
        totalChunks: chunks.length,
        totalTables: tables.length,
        totalImages: images.length,
        averageChunkSize: avgChunkSize,
        extractionQuality: mivaaDocument.metadata.confidence,
        transformationQuality: quality.overallQuality,
      },
      tags: mivaaDocument.metadata.keywords || [],
      categories: this.extractCategories(mivaaDocument),
    };
  }

  /**
   * Extract title from Mivaa document
   */
  private extractTitle(mivaaDocument: MivaaDocument): string {
    // Try metadata title first
    if (mivaaDocument.metadata.title) {
      return mivaaDocument.metadata.title;
    }

    // Try to extract from first header in markdown
    const headerMatch = mivaaDocument.markdown.match(/^#\s+(.+)$/m);
    if (headerMatch) {
      return headerMatch[1].trim();
    }

    // Fall back to filename without extension
    const filename = mivaaDocument.filename;
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    return nameWithoutExt.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Extract categories from document content
   */
  private extractCategories(mivaaDocument: MivaaDocument): string[] {
    const categories: string[] = [];

    // Extract from subject
    if (mivaaDocument.metadata.subject) {
      categories.push(mivaaDocument.metadata.subject);
    }

    // Extract from keywords
    if (mivaaDocument.metadata.keywords) {
      categories.push(...mivaaDocument.metadata.keywords);
    }

    // Extract from content analysis (simple heuristics)
    const content = mivaaDocument.markdown.toLowerCase();

    // Technical document indicators
    if (content.includes('api') || content.includes('technical') || content.includes('specification')) {
      categories.push('technical');
    }

    // Business document indicators
    if (content.includes('business') || content.includes('strategy') || content.includes('plan')) {
      categories.push('business');
    }

    // Research document indicators
    if (content.includes('research') || content.includes('study') || content.includes('analysis')) {
      categories.push('research');
    }

    return [...new Set(categories)]; // Remove duplicates
  }
}

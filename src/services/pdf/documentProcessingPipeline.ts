import {
  MivaaIntegrationConfig,
  ExtractionResult,
  RagDocument,
  ProcessingPipelineResult,
  TableData,
  ImageData,
} from './mivaaIntegrationService';

/**
 * Text chunking configuration
 */
interface ChunkingConfig {
  maxChunkSize: number;
  overlapSize: number;
  preserveStructure: boolean;
  splitOnSentences: boolean;
}

/**
 * Workspace context for processing
 */
interface WorkspaceContext {
  projectId?: string;
  userId?: string;
  tags?: string[];
  contextWindow: number;
  relevantDocuments?: string[];
}

/**
 * Document Processing Pipeline
 *
 * Transforms extracted content from Mivaa into RAG-ready format with
 * text chunking, workspace-aware processing, and standardized output.
 */
export class DocumentProcessingPipeline {
  private config: MivaaIntegrationConfig;
  private chunkingConfig: ChunkingConfig;

  constructor(config: MivaaIntegrationConfig) {
    this.config = config;
    this.chunkingConfig = {
      maxChunkSize: config.workspaceConfig.chunkSize || 1000,
      overlapSize: Math.floor((config.workspaceConfig.chunkSize || 1000) * 0.1),
      preserveStructure: true,
      splitOnSentences: true,
    };
  }

  /**
   * Initialize the processing pipeline
   */
  async initialize(): Promise<void> {
    // Initialize any required processing components
    console.log('Document Processing Pipeline initialized');
  }

  /**
   * Process extraction result for RAG integration
   */
  async processForRag(
    extractionResult: ExtractionResult,
    workspaceAware: boolean = false,
  ): Promise<ProcessingPipelineResult> {
    const startTime = Date.now();
    const ragDocuments: RagDocument[] = [];
    const errors: string[] = [];

    try {
      // Build workspace context if enabled
      const workspaceContext = workspaceAware ?
        await this.buildWorkspaceContext(extractionResult.documentId) :
        undefined;

      // Process markdown content
      if (extractionResult.data.markdown) {
        const markdownDocs = await this.processMarkdownContent(
          extractionResult.data.markdown,
          extractionResult.documentId,
          workspaceContext,
        );
        ragDocuments.push(...markdownDocs);
      }

      // Process tables
      if (extractionResult.data.tables && extractionResult.data.tables.length > 0) {
        const tableDocs = await this.processTableContent(
          extractionResult.data.tables,
          extractionResult.documentId,
          workspaceContext,
        );
        ragDocuments.push(...tableDocs);
      }

      // Process images
      if (extractionResult.data.images && extractionResult.data.images.length > 0) {
        const imageDocs = await this.processImageContent(
          extractionResult.data.images,
          extractionResult.documentId,
          workspaceContext,
        );
        ragDocuments.push(...imageDocs);
      }

      // Generate summary
      const summary = this.generateProcessingSummary(ragDocuments, Date.now() - startTime);

      return {
        documentId: extractionResult.documentId,
        ragDocuments,
        summary,
        errors: errors.length > 0 ? errors : undefined,
      };

    } catch (error) {
      errors.push(`Pipeline processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return {
        documentId: extractionResult.documentId,
        ragDocuments: [],
        summary: {
          totalChunks: 0,
          textChunks: 0,
          tableChunks: 0,
          imageChunks: 0,
          processingTime: Date.now() - startTime,
        },
        errors,
      };
    }
  }

  /**
   * Process markdown content into RAG documents
   */
  private async processMarkdownContent(
    markdown: string,
    documentId: string,
    workspaceContext?: WorkspaceContext,
  ): Promise<RagDocument[]> {
    const ragDocuments: RagDocument[] = [];

    // Split markdown into logical sections
    const sections = this.splitMarkdownIntoSections(markdown);

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];

      // Chunk each section if it's too large
      const chunks = this.chunkText(section.content, this.chunkingConfig);

      for (let j = 0; j < chunks.length; j++) {
        const chunk = chunks[j];

        ragDocuments.push({
          id: `${documentId}_text_${i}_${j}`,
          content: chunk,
          metadata: {
            source: documentId,
            type: 'text',
            pageNumber: section.pageNumber,
            chunkIndex: j,
            extractedAt: new Date(),
            workspace: workspaceContext ? {
              projectId: workspaceContext.projectId,
              userId: workspaceContext.userId,
              tags: workspaceContext.tags,
            } : undefined,
          },
        });
      }
    }

    return ragDocuments;
  }

  /**
   * Process table content into RAG documents
   */
  private async processTableContent(
    tables: TableData[],
    documentId: string,
    workspaceContext?: WorkspaceContext,
  ): Promise<RagDocument[]> {
    const ragDocuments: RagDocument[] = [];

    for (const table of tables) {
      // Convert CSV to structured text
      const structuredText = this.convertTableToStructuredText(table);

      ragDocuments.push({
        id: `${documentId}_table_${table.id}`,
        content: structuredText,
        metadata: {
          source: documentId,
          type: 'table',
          pageNumber: table.pageNumber,
          extractedAt: new Date(),
          workspace: workspaceContext ? {
            projectId: workspaceContext.projectId,
            userId: workspaceContext.userId,
            tags: workspaceContext.tags,
          } : undefined,
        },
      });
    }

    return ragDocuments;
  }

  /**
   * Process image content into RAG documents
   */
  private async processImageContent(
    images: ImageData[],
    documentId: string,
    workspaceContext?: WorkspaceContext,
  ): Promise<RagDocument[]> {
    const ragDocuments: RagDocument[] = [];

    for (const image of images) {
      // Create descriptive text for the image
      const imageDescription = this.generateImageDescription(image);

      ragDocuments.push({
        id: `${documentId}_image_${image.id}`,
        content: imageDescription,
        metadata: {
          source: documentId,
          type: 'image',
          pageNumber: image.pageNumber,
          extractedAt: new Date(),
          workspace: workspaceContext ? {
            projectId: workspaceContext.projectId,
            userId: workspaceContext.userId,
            tags: workspaceContext.tags,
          } : undefined,
        },
      });
    }

    return ragDocuments;
  }

  /**
   * Build workspace context for processing
   */
  private async buildWorkspaceContext(_documentId: string): Promise<WorkspaceContext> {
    // This would typically integrate with workspace management systems
    // For now, return basic context
    return {
      contextWindow: this.config.workspaceConfig.contextWindow,
      tags: ['pdf-extraction', 'mivaa-processed'],
    };
  }

  /**
   * Split markdown into logical sections
   */
  private splitMarkdownIntoSections(markdown: string): Array<{
    content: string;
    pageNumber?: number;
  }> {
    const sections: Array<{ content: string; pageNumber?: number }> = [];

    // Split by headers or page breaks
    const lines = markdown.split('\n');
    let currentSection = '';
    let currentPageNumber: number | undefined;

    for (const line of lines) {
      // Check for page indicators or headers
      if (line.match(/^#{1,6}\s/) || line.includes('---PAGE---')) {
        if (currentSection.trim()) {
          sections.push({
            content: currentSection.trim(),
            pageNumber: currentPageNumber,
          });
        }
        currentSection = line + '\n';

        // Extract page number if present
        const pageMatch = line.match(/page\s*(\d+)/i);
        if (pageMatch) {
          currentPageNumber = parseInt(pageMatch[1]);
        }
      } else {
        currentSection += line + '\n';
      }
    }

    // Add the last section
    if (currentSection.trim()) {
      sections.push({
        content: currentSection.trim(),
        pageNumber: currentPageNumber,
      });
    }

    return sections.length > 0 ? sections : [{ content: markdown }];
  }

  /**
   * Chunk text into smaller pieces for RAG processing
   */
  private chunkText(text: string, config: ChunkingConfig): string[] {
    const chunks: string[] = [];

    if (text.length <= config.maxChunkSize) {
      return [text];
    }

    // Split by sentences if configured
    let sentences: string[] = [];
    if (config.splitOnSentences) {
      sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    } else {
      // Split by paragraphs
      sentences = text.split(/\n\s*\n/).filter(s => s.trim().length > 0);
    }

    let currentChunk = '';

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();

      // If adding this sentence would exceed the chunk size
      if (currentChunk.length + trimmedSentence.length > config.maxChunkSize) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }

        // Start new chunk with overlap if configured
        if (config.overlapSize > 0 && chunks.length > 0) {
          const lastChunk = chunks[chunks.length - 1];
          const overlapText = lastChunk.slice(-config.overlapSize);
          currentChunk = overlapText + ' ' + trimmedSentence;
        } else {
          currentChunk = trimmedSentence;
        }
      } else {
        currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
      }
    }

    // Add the last chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text];
  }

  /**
   * Convert table data to structured text
   */
  private convertTableToStructuredText(table: TableData): string {
    const lines = table.csvData.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return `Table from page ${table.pageNumber} (empty)`;
    }

    let structuredText = `Table from page ${table.pageNumber}:\n`;

    // Add headers if available
    if (table.headers && table.headers.length > 0) {
      structuredText += `Headers: ${table.headers.join(', ')}\n`;
    }

    // Add table dimensions
    structuredText += `Dimensions: ${table.rowCount} rows × ${table.columnCount} columns\n\n`;

    // Add table content in a readable format
    structuredText += 'Table Content:\n';
    for (let i = 0; i < Math.min(lines.length, 10); i++) { // Limit to first 10 rows
      const row = lines[i].split(',').map(cell => cell.trim().replace(/"/g, ''));
      structuredText += `Row ${i + 1}: ${row.join(' | ')}\n`;
    }

    if (lines.length > 10) {
      structuredText += `... and ${lines.length - 10} more rows\n`;
    }

    return structuredText;
  }

  /**
   * Generate descriptive text for images
   */
  private generateImageDescription(image: ImageData): string {
    let description = `Image from page ${image.pageNumber}:\n`;
    description += `Format: ${image.format}\n`;
    description += `Dimensions: ${image.width} × ${image.height} pixels\n`;

    // Add basic image analysis
    const aspectRatio = image.width / image.height;
    if (aspectRatio > 2) {
      description += 'Layout: Wide/landscape orientation, possibly a chart or diagram\n';
    } else if (aspectRatio < 0.5) {
      description += 'Layout: Tall/portrait orientation, possibly a table or list\n';
    } else {
      description += 'Layout: Square/balanced orientation\n';
    }

    // Add metadata if available
    if (image.metadata) {
      description += `Additional metadata: ${JSON.stringify(image.metadata)}\n`;
    }

    description += 'Note: This is an extracted image that may contain charts, diagrams, or other visual content relevant to the document.';

    return description;
  }

  /**
   * Generate processing summary
   */
  private generateProcessingSummary(
    ragDocuments: RagDocument[],
    processingTime: number,
  ): ProcessingPipelineResult['summary'] {
    const textChunks = ragDocuments.filter(doc => doc.metadata.type === 'text').length;
    const tableChunks = ragDocuments.filter(doc => doc.metadata.type === 'table').length;
    const imageChunks = ragDocuments.filter(doc => doc.metadata.type === 'image').length;

    return {
      totalChunks: ragDocuments.length,
      textChunks,
      tableChunks,
      imageChunks,
      processingTime,
    };
  }

  /**
   * Validate RAG document structure
   */
  private validateRagDocument(document: RagDocument): boolean {
    return !!(
      document.id &&
      document.content &&
      document.metadata &&
      document.metadata.source &&
      document.metadata.type &&
      document.metadata.extractedAt
    );
  }

  /**
   * Apply workspace-aware enhancements to content
   */
  private async applyWorkspaceEnhancements(
    content: string,
    workspaceContext: WorkspaceContext,
  ): Promise<string> {
    // This could include:
    // - Adding project-specific context
    // - Linking to related documents
    // - Applying domain-specific processing
    // - Adding semantic tags

    let enhancedContent = content;

    if (workspaceContext.tags && workspaceContext.tags.length > 0) {
      enhancedContent += `\n\nTags: ${workspaceContext.tags.join(', ')}`;
    }

    if (workspaceContext.projectId) {
      enhancedContent += `\nProject: ${workspaceContext.projectId}`;
    }

    return enhancedContent;
  }
}

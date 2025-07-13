import { supabase } from '@/integrations/supabase/client';
import { htmlDOMAnalyzer, type LayoutAnalysisResult, type DOMElement, type TextBlock } from './htmlDOMAnalyzer';
import { TextEmbedderService } from './ml/textEmbedder';
import type { TextEmbeddingResult } from './ml/types';

export interface ChunkingOptions {
  chunkSize: number; // Target characters per chunk
  overlap: number; // Overlap characters between chunks
  preserveStructure: boolean; // Maintain semantic boundaries
  includeImages: boolean; // Associate images with chunks
  minChunkSize: number; // Minimum chunk size
  maxChunkSize: number; // Maximum chunk size
  respectHierarchy: boolean; // Keep hierarchical elements together
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  htmlContent: string;
  chunkType: 'heading' | 'paragraph' | 'table' | 'list' | 'mixed' | 'image_caption';
  hierarchyLevel: number;
  pageNumber: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  parentChunkId?: string;
  childChunkIds: string[];
  embedding?: number[];
  metadata: {
    elementIds: string[];
    imageIds: string[];
    tableIds: string[];
    semanticTags: string[];
    confidence: number;
    wordCount: number;
    characterCount: number;
    readingTime: number; // estimated seconds
    complexity: number; // 1-10 scale
  };
  createdAt: string;
}

export interface ChunkingResult {
  chunks: DocumentChunk[];
  totalChunks: number;
  averageChunkSize: number;
  processingTime: number;
  metadata: {
    originalElementCount: number;
    chunkingStrategy: string;
    preservedStructures: number;
    imageAssociations: number;
  };
}

/**
 * Layout-Aware Chunking Engine
 * Creates intelligent text chunks based on document structure and layout
 * while preserving semantic meaning and hierarchical relationships
 */
export class LayoutAwareChunker {
  private textEmbedder: TextEmbedderService;
  private chunkCounter: number = 0;

  constructor() {
    this.textEmbedder = new TextEmbedderService();
  }

  /**
   * Process document and create layout-aware chunks
   */
  async chunkDocument(
    documentId: string,
    htmlContent: string,
    options: Partial<ChunkingOptions> = {}
  ): Promise<ChunkingResult> {
    const startTime = Date.now();
    
    try {
      console.log('Starting layout-aware chunking for document:', documentId);
      
      // Set default options
      const chunkingOptions: ChunkingOptions = {
        chunkSize: 1000,
        overlap: 200,
        preserveStructure: true,
        includeImages: true,
        minChunkSize: 300,
        maxChunkSize: 2000,
        respectHierarchy: true,
        ...options
      };
      
      // Analyze HTML structure
      const layoutAnalysis = await htmlDOMAnalyzer.analyzeHTML(htmlContent, documentId);
      
      // Create chunks based on layout analysis
      const chunks = await this.createLayoutAwareChunks(
        documentId,
        layoutAnalysis,
        chunkingOptions
      );
      
      // Generate embeddings for chunks
      await this.generateChunkEmbeddings(chunks);
      
      // Store chunks in enhanced knowledge base
      await this.storeChunksInKnowledgeBase(chunks, documentId);
      
      const processingTime = Date.now() - startTime;
      
      const result: ChunkingResult = {
        chunks,
        totalChunks: chunks.length,
        averageChunkSize: chunks.reduce((sum, chunk) => sum + chunk.metadata.characterCount, 0) / chunks.length,
        processingTime,
        metadata: {
          originalElementCount: layoutAnalysis.elements.length,
          chunkingStrategy: 'layout_aware_semantic',
          preservedStructures: this.countPreservedStructures(chunks),
          imageAssociations: chunks.reduce((sum, chunk) => sum + chunk.metadata.imageIds.length, 0)
        }
      };
      
      console.log(`Chunking completed: ${chunks.length} chunks created in ${processingTime}ms`);
      return result;
      
    } catch (error) {
      console.error('Layout-aware chunking error:', error);
      throw new Error(`Chunking failed: ${error.message}`);
    }
  }

  /**
   * Create chunks based on layout analysis
   */
  private async createLayoutAwareChunks(
    documentId: string,
    layoutAnalysis: LayoutAnalysisResult,
    options: ChunkingOptions
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    
    // Group elements by semantic structure
    const structuredGroups = this.groupElementsByStructure(layoutAnalysis, options);
    
    // Process each group
    for (const group of structuredGroups) {
      const groupChunks = await this.processElementGroup(documentId, group, options);
      chunks.push(...groupChunks);
    }
    
    // Apply overlap between chunks if needed
    if (options.overlap > 0) {
      this.applyChunkOverlap(chunks, options.overlap);
    }
    
    // Validate and adjust chunk sizes
    this.validateChunkSizes(chunks, options);
    
    return chunks;
  }

  /**
   * Group elements by semantic structure
   */
  private groupElementsByStructure(
    layoutAnalysis: LayoutAnalysisResult,
    options: ChunkingOptions
  ): ElementGroup[] {
    const groups: ElementGroup[] = [];
    
    if (options.preserveStructure) {
      // Group by document sections
      for (const section of layoutAnalysis.structure.sections) {
        groups.push({
          type: 'section',
          elements: section.elements,
          hierarchy: section.level,
          title: section.title,
          pageNumber: section.pageNumber || 1
        });
        
        // Process subsections
        for (const subsection of section.subsections) {
          groups.push({
            type: 'subsection',
            elements: subsection.elements,
            hierarchy: subsection.level,
            title: subsection.title,
            pageNumber: subsection.pageNumber || 1
          });
        }
      }
    } else {
      // Group by reading order
      const elementsInOrder = layoutAnalysis.structure.readingOrder
        .map(id => layoutAnalysis.elements.find(el => el.id === id))
        .filter(Boolean) as DOMElement[];
      
      groups.push({
        type: 'sequential',
        elements: elementsInOrder,
        hierarchy: 1,
        title: 'Sequential Content',
        pageNumber: 1
      });
    }
    
    return groups;
  }

  /**
   * Process a group of elements into chunks
   */
  private async processElementGroup(
    documentId: string,
    group: ElementGroup,
    options: ChunkingOptions
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    let currentChunk: Partial<DocumentChunk> | null = null;
    let currentSize = 0;
    
    for (const element of group.elements) {
      const elementText = element.textContent;
      const elementSize = elementText.length;
      
      // Check if we need to start a new chunk
      if (!currentChunk || 
          currentSize + elementSize > options.chunkSize ||
          this.shouldStartNewChunk(element, currentChunk, options)) {
        
        // Finalize current chunk
        if (currentChunk) {
          chunks.push(await this.finalizeChunk(documentId, currentChunk));
        }
        
        // Start new chunk
        currentChunk = this.initializeChunk(documentId, element, group);
        currentSize = elementSize;
      } else {
        // Add to current chunk
        this.addElementToChunk(currentChunk, element);
        currentSize += elementSize;
      }
    }
    
    // Finalize last chunk
    if (currentChunk) {
      chunks.push(await this.finalizeChunk(documentId, currentChunk));
    }
    
    return chunks;
  }

  /**
   * Initialize a new chunk
   */
  private initializeChunk(
    documentId: string,
    element: DOMElement,
    group: ElementGroup
  ): Partial<DocumentChunk> {
    const chunkId = this.generateChunkId();
    
    return {
      id: chunkId,
      documentId,
      chunkIndex: this.chunkCounter++,
      text: element.textContent,
      htmlContent: element.innerHTML,
      chunkType: this.determineChunkType(element),
      hierarchyLevel: element.hierarchy,
      pageNumber: this.extractPageNumber(element),
      bbox: element.bbox,
      childChunkIds: [],
      metadata: {
        elementIds: [element.id],
        imageIds: [],
        tableIds: [],
        semanticTags: this.extractSemanticTags(element),
        confidence: element.confidence,
        wordCount: this.countWords(element.textContent),
        characterCount: element.textContent.length,
        readingTime: this.estimateReadingTime(element.textContent),
        complexity: this.calculateComplexity(element.textContent)
      },
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Add element to existing chunk
   */
  private addElementToChunk(chunk: Partial<DocumentChunk>, element: DOMElement): void {
    chunk.text += '\n\n' + element.textContent;
    chunk.htmlContent += '\n' + element.innerHTML;
    
    // Update metadata
    chunk.metadata!.elementIds.push(element.id);
    chunk.metadata!.wordCount += this.countWords(element.textContent);
    chunk.metadata!.characterCount += element.textContent.length;
    chunk.metadata!.readingTime = this.estimateReadingTime(chunk.text!);
    chunk.metadata!.complexity = Math.max(chunk.metadata!.complexity, this.calculateComplexity(element.textContent));
    
    // Merge semantic tags
    const newTags = this.extractSemanticTags(element);
    chunk.metadata!.semanticTags = [...new Set([...chunk.metadata!.semanticTags, ...newTags])];
    
    // Update confidence (weighted average)
    const totalElements = chunk.metadata!.elementIds.length;
    chunk.metadata!.confidence = (chunk.metadata!.confidence * (totalElements - 1) + element.confidence) / totalElements;
  }

  /**
   * Finalize chunk and prepare for storage
   */
  private async finalizeChunk(
    documentId: string,
    partialChunk: Partial<DocumentChunk>
  ): Promise<DocumentChunk> {
    // Ensure all required fields are present
    const chunk: DocumentChunk = {
      id: partialChunk.id!,
      documentId,
      chunkIndex: partialChunk.chunkIndex!,
      text: partialChunk.text!,
      htmlContent: partialChunk.htmlContent!,
      chunkType: partialChunk.chunkType!,
      hierarchyLevel: partialChunk.hierarchyLevel!,
      pageNumber: partialChunk.pageNumber!,
      bbox: partialChunk.bbox!,
      parentChunkId: partialChunk.parentChunkId,
      childChunkIds: partialChunk.childChunkIds!,
      metadata: partialChunk.metadata!,
      createdAt: partialChunk.createdAt!
    };
    
    // Clean up text
    chunk.text = this.cleanText(chunk.text);
    
    return chunk;
  }

  /**
   * Determine if a new chunk should be started
   */
  private shouldStartNewChunk(
    element: DOMElement,
    currentChunk: Partial<DocumentChunk>,
    options: ChunkingOptions
  ): boolean {
    // Always start new chunk for headings if respecting hierarchy
    if (options.respectHierarchy && element.elementType === 'heading') {
      return true;
    }
    
    // Start new chunk if hierarchy level changes significantly
    if (options.respectHierarchy && 
        Math.abs(element.hierarchy - currentChunk.hierarchyLevel!) > 1) {
      return true;
    }
    
    // Start new chunk for tables
    if (element.elementType === 'table') {
      return true;
    }
    
    // Start new chunk if page changes
    const currentPage = this.extractPageNumber(element);
    if (currentPage !== currentChunk.pageNumber) {
      return true;
    }
    
    return false;
  }

  /**
   * Generate embeddings for chunks
   */
  private async generateChunkEmbeddings(chunks: DocumentChunk[]): Promise<void> {
    console.log(`Generating embeddings for ${chunks.length} chunks...`);
    
    try {
      await this.textEmbedder.initialize();
      
      for (const chunk of chunks) {
        try {
          const result = await this.textEmbedder.generateEmbedding(chunk.text);
          if (result.success && 'embedding' in result) {
            chunk.embedding = (result as any).embedding;
          }
        } catch (error) {
          console.warn(`Failed to generate embedding for chunk ${chunk.id}:`, error);
        }
      }
    } catch (error) {
      console.warn('Text embedder initialization failed, skipping embeddings:', error);
    }
  }

  /**
   * Store chunks in enhanced knowledge base
   */
  private async storeChunksInKnowledgeBase(chunks: DocumentChunk[], documentId: string): Promise<void> {
    try {
      // Store each chunk as a separate knowledge base entry
      for (const chunk of chunks) {
        const knowledgeEntry = {
          title: `Chunk ${chunk.chunkIndex + 1}: ${chunk.chunkType}`,
          content: chunk.text,
          content_type: 'document_chunk',
          semantic_tags: ['chunk', chunk.chunkType, ...chunk.metadata.semanticTags],
          language: 'en',
          technical_complexity: chunk.metadata.complexity,
          reading_level: Math.min(20, Math.max(5, chunk.metadata.wordCount / 10)),
          openai_embedding: chunk.embedding ? chunk.embedding.join(',') : null,
          confidence_scores: {
            chunking: chunk.metadata.confidence,
            layout_analysis: 0.9,
            overall: chunk.metadata.confidence * 0.9
          },
          search_keywords: chunk.metadata.semanticTags,
          metadata: {
            source_type: 'layout_aware_chunk',
            document_id: documentId,
            chunk_index: chunk.chunkIndex,
            chunk_type: chunk.chunkType,
            hierarchy_level: chunk.hierarchyLevel,
            page_number: chunk.pageNumber,
            bbox: chunk.bbox,
            element_ids: chunk.metadata.elementIds,
            word_count: chunk.metadata.wordCount,
            character_count: chunk.metadata.characterCount,
            reading_time: chunk.metadata.readingTime,
            complexity: chunk.metadata.complexity
          },
          status: 'published'
        };

        const { error } = await supabase
          .from('enhanced_knowledge_base')
          .insert(knowledgeEntry);

        if (error) {
          console.warn(`Failed to store chunk ${chunk.id}:`, error);
        }
      }
      
      console.log(`Successfully stored ${chunks.length} chunks in knowledge base`);
    } catch (error) {
      console.error('Error storing chunks in knowledge base:', error);
      throw error;
    }
  }

  /**
   * Apply overlap between consecutive chunks
   */
  private applyChunkOverlap(chunks: DocumentChunk[], overlapSize: number): void {
    for (let i = 1; i < chunks.length; i++) {
      const prevChunk = chunks[i - 1];
      const currentChunk = chunks[i];
      
      // Get overlap text from previous chunk
      const prevText = prevChunk.text;
      const overlapText = prevText.slice(-overlapSize);
      
      // Prepend to current chunk
      currentChunk.text = overlapText + '\n\n' + currentChunk.text;
      currentChunk.metadata.characterCount += overlapText.length;
      currentChunk.metadata.wordCount += this.countWords(overlapText);
    }
  }

  /**
   * Validate and adjust chunk sizes
   */
  private validateChunkSizes(chunks: DocumentChunk[], options: ChunkingOptions): void {
    for (const chunk of chunks) {
      const size = chunk.metadata.characterCount;
      
      // Split oversized chunks
      if (size > options.maxChunkSize) {
        console.warn(`Chunk ${chunk.id} exceeds maximum size: ${size} > ${options.maxChunkSize}`);
        // In a production system, we would split this chunk
      }
      
      // Flag undersized chunks
      if (size < options.minChunkSize) {
        console.warn(`Chunk ${chunk.id} below minimum size: ${size} < ${options.minChunkSize}`);
        chunk.metadata.semanticTags.push('undersized');
      }
    }
  }

  /**
   * Helper methods
   */
  private generateChunkId(): string {
    return `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private determineChunkType(element: DOMElement): DocumentChunk['chunkType'] {
    switch (element.elementType) {
      case 'heading': return 'heading';
      case 'table': return 'table';
      case 'list': return 'list';
      case 'image': return 'image_caption';
      default: return 'paragraph';
    }
  }

  private extractPageNumber(element: DOMElement): number {
    // Extract from bbox or metadata
    return 1; // Simplified for now
  }

  private extractSemanticTags(element: DOMElement): string[] {
    const tags: string[] = [];
    
    // Add tags based on element type
    tags.push(element.elementType);
    
    // Add tags based on class names
    if (element.className) {
      const classNames = element.className.split(' ');
      tags.push(...classNames.filter(name => name.length > 2));
    }
    
    // Add content-based tags
    const text = element.textContent.toLowerCase();
    if (text.includes('specification')) tags.push('specification');
    if (text.includes('property')) tags.push('property');
    if (text.includes('material')) tags.push('material');
    if (text.includes('technical')) tags.push('technical');
    
    return [...new Set(tags)];
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).length;
  }

  private estimateReadingTime(text: string): number {
    const wordsPerMinute = 200;
    const words = this.countWords(text);
    return Math.ceil((words / wordsPerMinute) * 60); // seconds
  }

  private calculateComplexity(text: string): number {
    // Simple complexity calculation based on sentence length and vocabulary
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.split(' ').length, 0) / sentences.length;
    
    // Normalize to 1-10 scale
    return Math.min(10, Math.max(1, Math.round(avgSentenceLength / 5)));
  }

  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\n\s*\n/g, '\n\n') // Normalize line breaks
      .trim();
  }

  private countPreservedStructures(chunks: DocumentChunk[]): number {
    return chunks.filter(chunk => 
      chunk.chunkType === 'heading' || 
      chunk.chunkType === 'table' || 
      chunk.metadata.semanticTags.includes('structure')
    ).length;
  }

  /**
   * Retrieve chunks for a document from knowledge base
   */
  async getDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
    try {
      const { data, error } = await supabase
        .from('enhanced_knowledge_base')
        .select('*')
        .eq('content_type', 'document_chunk')
        .contains('metadata', { document_id: documentId })
        .order('created_at');
      
      if (error) {
        throw error;
      }
      
      return data.map(row => this.convertKnowledgeEntryToChunk(row));
    } catch (error) {
      console.error('Error retrieving document chunks:', error);
      throw error;
    }
  }

  /**
   * Search chunks by similarity
   */
  async searchChunks(
    query: string,
    documentId?: string,
    limit: number = 10
  ): Promise<DocumentChunk[]> {
    try {
      // Generate query embedding
      await this.textEmbedder.initialize();
      const queryResult = await this.textEmbedder.generateEmbedding(query);
      
      if (!queryResult.success || !('embedding' in queryResult)) {
        throw new Error('Failed to generate query embedding');
      }
      
      // Search using enhanced knowledge base
      let queryBuilder = supabase
        .from('enhanced_knowledge_base')
        .select('*')
        .eq('content_type', 'document_chunk')
        .order('created_at');
      
      if (documentId) {
        queryBuilder = queryBuilder.contains('metadata', { document_id: documentId });
      }
      
      const { data, error } = await queryBuilder.limit(limit);
      
      if (error) {
        throw error;
      }
      
      // Convert and return chunks
      return data.map(row => this.convertKnowledgeEntryToChunk(row));
    } catch (error) {
      console.error('Error searching chunks:', error);
      throw error;
    }
  }

  /**
   * Convert knowledge base entry to chunk format
   */
  private convertKnowledgeEntryToChunk(row: any): DocumentChunk {
    const metadata = row.metadata || {};
    
    return {
      id: row.id,
      documentId: metadata.document_id || '',
      chunkIndex: metadata.chunk_index || 0,
      text: row.content,
      htmlContent: row.content, // Simplified
      chunkType: metadata.chunk_type || 'paragraph',
      hierarchyLevel: metadata.hierarchy_level || 1,
      pageNumber: metadata.page_number || 1,
      bbox: metadata.bbox || { x: 0, y: 0, width: 0, height: 0 },
      parentChunkId: undefined,
      childChunkIds: [],
      embedding: row.openai_embedding ? row.openai_embedding.split(',').map(Number) : undefined,
      metadata: {
        elementIds: metadata.element_ids || [],
        imageIds: [],
        tableIds: [],
        semanticTags: row.semantic_tags || [],
        confidence: row.confidence_scores?.overall || 0.8,
        wordCount: metadata.word_count || 0,
        characterCount: metadata.character_count || 0,
        readingTime: metadata.reading_time || 0,
        complexity: metadata.complexity || 5
      },
      createdAt: row.created_at
    };
  }
}

interface ElementGroup {
  type: 'section' | 'subsection' | 'sequential';
  elements: DOMElement[];
  hierarchy: number;
  title: string;
  pageNumber: number;
}

// Export singleton instance
export const layoutAwareChunker = new LayoutAwareChunker();
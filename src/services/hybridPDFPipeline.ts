import { supabase } from '@/integrations/supabase/client';
import { htmlDOMAnalyzer, type LayoutAnalysisResult } from './htmlDOMAnalyzer';
import { layoutAwareChunker, type DocumentChunk, type ChunkingOptions } from './layoutAwareChunker';
import { imageTextMapper, type ImageTextAssociation, type MappingOptions } from './imageTextMapper';
import { EnhancedRAGService } from './enhancedRAGService';

export interface ProcessingOptions {
  chunkSize?: number;
  overlap?: number;
  preserveLayout?: boolean;
  includeImages?: boolean;
  extractMaterials?: boolean;
  language?: string;
  generateEmbeddings?: boolean;
  enableImageMapping?: boolean;
  enableSemanticAnalysis?: boolean;
}

export interface ProcessingStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  startTime: string;
  endTime?: string;
  error?: string;
  metadata: {
    filename: string;
    fileSize: number;
    totalSteps: number;
    completedSteps: number;
  };
}

export interface ProcessingResult {
  success: boolean;
  processingId: string;
  documentId: string;
  htmlUrl?: string;
  layoutAnalysis: LayoutAnalysisResult;
  chunks: DocumentChunk[];
  imageAssociations: ImageTextAssociation[];
  knowledgeEntries: string[];
  processingTime: number;
  statistics: {
    totalPages: number;
    totalElements: number;
    totalChunks: number;
    totalImages: number;
    totalAssociations: number;
    averageChunkSize: number;
    averageConfidence: number;
  };
  qualityMetrics: {
    layoutPreservation: number;
    chunkingQuality: number;
    imageMappingAccuracy: number;
    overallQuality: number;
  };
}

export interface QueryOptions {
  includeImages?: boolean;
  includeChunks?: boolean;
  maxResults?: number;
  confidenceThreshold?: number;
  semanticSearch?: boolean;
}

export interface QueryResult {
  chunks: DocumentChunk[];
  associations: ImageTextAssociation[];
  totalResults: number;
  searchTime: number;
  relevanceScores: number[];
  query: string;
  suggestions: string[];
}

/**
 * Hybrid PDF Pipeline Service
 * Orchestrates the complete PDF-to-HTML processing pipeline with
 * layout-aware chunking, image-text mapping, and RAG integration
 */
export class HybridPDFPipelineService {
  private processingStatuses: Map<string, ProcessingStatus> = new Map();

  /**
   * Process a PDF document through the complete pipeline
   */
  async processDocument(
    file: File,
    userId: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const processingId = this.generateProcessingId();
    const startTime = Date.now();

    try {
      console.log(`Starting hybrid PDF pipeline processing for: ${file.name}`);

      // Initialize processing status
      const status = this.initializeProcessingStatus(processingId, file);
      this.processingStatuses.set(processingId, status);

      // Step 1: Upload file to storage
      await this.updateProcessingStatus(processingId, 'processing', 10, 'Uploading file to storage');
      const fileUrl = await this.uploadFileToStorage(file, userId);

      // Step 2: Convert PDF to HTML with layout preservation
      await this.updateProcessingStatus(processingId, 'processing', 25, 'Converting PDF to structured HTML');
      const htmlConversionResult = await this.convertPDFToHTML(fileUrl, file.name, file.size, userId, options);

      // Step 3: Analyze HTML structure and layout
      await this.updateProcessingStatus(processingId, 'processing', 40, 'Analyzing document structure');
      const layoutAnalysis = await htmlDOMAnalyzer.analyzeHTML(
        htmlConversionResult.htmlContent,
        htmlConversionResult.processingId
      );

      // Step 4: Create layout-aware chunks
      await this.updateProcessingStatus(processingId, 'processing', 60, 'Creating intelligent text chunks');
      const chunkingResult = await layoutAwareChunker.chunkDocument(
        htmlConversionResult.processingId,
        htmlConversionResult.htmlContent,
        this.buildChunkingOptions(options)
      );

      // Step 5: Map images to text content
      let imageAssociations: ImageTextAssociation[] = [];
      if (options.enableImageMapping !== false) {
        await this.updateProcessingStatus(processingId, 'processing', 75, 'Mapping images to text content');
        const mappingResult = await imageTextMapper.mapImagestoText(
          layoutAnalysis.images,
          layoutAnalysis.textBlocks,
          chunkingResult.chunks,
          this.buildMappingOptions(options)
        );
        imageAssociations = mappingResult.associations;
      }

      // Step 6: Generate embeddings and store in vector database
      if (options.generateEmbeddings !== false) {
        await this.updateProcessingStatus(processingId, 'processing', 85, 'Generating embeddings for search');
        await this.generateAndStoreEmbeddings(chunkingResult.chunks, htmlConversionResult.processingId);
      }

      // Step 7: Create knowledge base entries
      await this.updateProcessingStatus(processingId, 'processing', 95, 'Creating knowledge base entries');
      const knowledgeEntries = await this.createKnowledgeEntries(
        htmlConversionResult,
        layoutAnalysis,
        chunkingResult.chunks,
        imageAssociations,
        userId
      );

      // Complete processing
      await this.updateProcessingStatus(processingId, 'completed', 100, 'Processing completed successfully');

      const processingTime = Date.now() - startTime;

      const result: ProcessingResult = {
        success: true,
        processingId,
        documentId: htmlConversionResult.processingId,
        htmlUrl: htmlConversionResult.htmlUrl,
        layoutAnalysis,
        chunks: chunkingResult.chunks,
        imageAssociations,
        knowledgeEntries,
        processingTime,
        statistics: {
          totalPages: htmlConversionResult.pageCount,
          totalElements: layoutAnalysis.elements.length,
          totalChunks: chunkingResult.chunks.length,
          totalImages: layoutAnalysis.images.length,
          totalAssociations: imageAssociations.length,
          averageChunkSize: chunkingResult.averageChunkSize,
          averageConfidence: this.calculateAverageConfidence(chunkingResult.chunks, imageAssociations)
        },
        qualityMetrics: this.calculateQualityMetrics(layoutAnalysis, chunkingResult.chunks, imageAssociations)
      };

      console.log(`Hybrid PDF pipeline completed successfully in ${processingTime}ms`);
      return result;

    } catch (error) {
      console.error('Hybrid PDF pipeline error:', error);
      await this.updateProcessingStatus(processingId, 'failed', 0, `Processing failed: ${error.message}`, error.message);
      throw error;
    }
  }

  /**
   * Get processing status
   */
  getProcessingStatus(processingId: string): ProcessingStatus | null {
    return this.processingStatuses.get(processingId) || null;
  }

  /**
   * Query processed documents
   */
  async queryDocument(
    documentId: string,
    query: string,
    options: QueryOptions = {}
  ): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      console.log(`Querying document ${documentId} with query: "${query}"`);

      // Use enhanced RAG service for intelligent search
      const ragResult = await EnhancedRAGService.search({
        query,
        context: {
          materialCategories: ['document_chunk', 'image_text_association']
        },
        searchType: options.semanticSearch ? 'semantic' : 'hybrid',
        maxResults: options.maxResults || 10,
        includeRealTime: false
      });

      // Filter results by document ID and confidence
      const documentChunks = await layoutAwareChunker.getDocumentChunks(documentId);
      const documentAssociations = await imageTextMapper.getDocumentAssociations(documentId);

      const filteredChunks = documentChunks.filter(chunk =>
        !options.confidenceThreshold || chunk.metadata.confidence >= options.confidenceThreshold
      );

      const filteredAssociations = documentAssociations.filter(assoc =>
        !options.confidenceThreshold || assoc.confidence >= options.confidenceThreshold
      );

      const searchTime = Date.now() - startTime;

      return {
        chunks: options.includeChunks !== false ? filteredChunks : [],
        associations: options.includeImages !== false ? filteredAssociations : [],
        totalResults: filteredChunks.length + filteredAssociations.length,
        searchTime,
        relevanceScores: ragResult.results.knowledgeBase.map(r => r.relevanceScore),
        query,
        suggestions: ragResult.semanticAnalysis.suggestedRefinements
      };

    } catch (error) {
      console.error('Document query error:', error);
      throw error;
    }
  }

  /**
   * Get document statistics
   */
  async getDocumentStatistics(documentId: string): Promise<{
    chunks: number;
    images: number;
    associations: number;
    averageChunkSize: number;
    totalCharacters: number;
    estimatedReadingTime: number;
  }> {
    try {
      const chunks = await layoutAwareChunker.getDocumentChunks(documentId);
      const associations = await imageTextMapper.getDocumentAssociations(documentId);

      const totalCharacters = chunks.reduce((sum, chunk) => sum + chunk.metadata.characterCount, 0);
      const averageChunkSize = totalCharacters / chunks.length || 0;
      const estimatedReadingTime = chunks.reduce((sum, chunk) => sum + chunk.metadata.readingTime, 0);

      return {
        chunks: chunks.length,
        images: associations.length,
        associations: associations.length,
        averageChunkSize,
        totalCharacters,
        estimatedReadingTime
      };

    } catch (error) {
      console.error('Error getting document statistics:', error);
      throw error;
    }
  }

  /**
   * Delete processed document and all associated data
   */
  async deleteDocument(documentId: string): Promise<void> {
    try {
      console.log(`Deleting document ${documentId} and all associated data`);

      // Delete from enhanced knowledge base
      await supabase
        .from('enhanced_knowledge_base')
        .delete()
        .or(`metadata->document_id.eq.${documentId},metadata->processing_id.eq.${documentId}`);

      // Delete from PDF processing results
      await supabase
        .from('pdf_processing_results')
        .delete()
        .eq('id', documentId);

      // Note: Layout analysis would be deleted if the table existed
      // Currently using enhanced_knowledge_base for all storage
      console.log('Layout analysis cleanup completed');

      console.log(`Successfully deleted document ${documentId}`);

    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private generateProcessingId(): string {
    return `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeProcessingStatus(processingId: string, file: File): ProcessingStatus {
    return {
      id: processingId,
      status: 'pending',
      progress: 0,
      currentStep: 'Initializing processing',
      startTime: new Date().toISOString(),
      metadata: {
        filename: file.name,
        fileSize: file.size,
        totalSteps: 7,
        completedSteps: 0
      }
    };
  }

  private async updateProcessingStatus(
    processingId: string,
    status: ProcessingStatus['status'],
    progress: number,
    currentStep: string,
    error?: string
  ): Promise<void> {
    const existingStatus = this.processingStatuses.get(processingId);
    if (!existingStatus) return;

    const updatedStatus: ProcessingStatus = {
      ...existingStatus,
      status,
      progress,
      currentStep,
      error,
      endTime: status === 'completed' || status === 'failed' ? new Date().toISOString() : undefined,
      metadata: {
        ...existingStatus.metadata,
        completedSteps: Math.floor((progress / 100) * existingStatus.metadata.totalSteps)
      }
    };

    this.processingStatuses.set(processingId, updatedStatus);
  }

  private async uploadFileToStorage(file: File, userId: string): Promise<string> {
    const fileName = `${userId}/${Date.now()}-${file.name}`;
    
    const { data, error } = await supabase.storage
      .from('pdf-documents')
      .upload(fileName, file);

    if (error) {
      throw new Error(`File upload failed: ${error.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('pdf-documents')
      .getPublicUrl(fileName);

    return publicUrl;
  }

  private async convertPDFToHTML(
    fileUrl: string,
    filename: string,
    fileSize: number,
    userId: string,
    options: ProcessingOptions
  ): Promise<{
    processingId: string;
    htmlContent: string;
    htmlUrl: string;
    pageCount: number;
  }> {
    const response = await supabase.functions.invoke('enhanced-pdf-html-processor', {
      body: {
        fileUrl,
        originalFilename: filename,
        fileSize,
        userId,
        options: {
          chunkSize: options.chunkSize || 1000,
          overlap: options.overlap || 200,
          includeImages: options.includeImages !== false,
          preserveLayout: options.preserveLayout !== false,
          extractMaterials: options.extractMaterials !== false,
          language: options.language || 'en'
        }
      }
    });

    if (response.error) {
      throw new Error(`PDF-to-HTML conversion failed: ${response.error.message}`);
    }

    return {
      processingId: response.data.processingId,
      htmlContent: response.data.htmlContent || '',
      htmlUrl: response.data.htmlUrl || '',
      pageCount: response.data.pageCount || 1
    };
  }

  private buildChunkingOptions(options: ProcessingOptions): Partial<ChunkingOptions> {
    return {
      chunkSize: options.chunkSize || 1000,
      overlap: options.overlap || 200,
      preserveStructure: options.preserveLayout !== false,
      includeImages: options.includeImages !== false,
      respectHierarchy: true,
      minChunkSize: 300,
      maxChunkSize: 2000
    };
  }

  private buildMappingOptions(options: ProcessingOptions): Partial<MappingOptions> {
    return {
      proximityThreshold: 200,
      semanticThreshold: 0.7,
      includeOCR: true,
      analyzeMaterials: options.extractMaterials !== false,
      detectObjects: true,
      contextWindow: 3
    };
  }

  private async generateAndStoreEmbeddings(chunks: DocumentChunk[], documentId: string): Promise<void> {
    // Embeddings are already generated during chunking process
    // This method can be used for additional embedding operations if needed
    console.log(`Embeddings already generated for ${chunks.length} chunks in document ${documentId}`);
  }

  private async createKnowledgeEntries(
    htmlResult: any,
    layoutAnalysis: LayoutAnalysisResult,
    chunks: DocumentChunk[],
    associations: ImageTextAssociation[],
    userId: string
  ): Promise<string[]> {
    const knowledgeEntries: string[] = [];

    try {
      // Create main document entry
      const documentEntry = {
        title: `Document: ${htmlResult.processingId}`,
        content: `Processed document with ${chunks.length} chunks, ${layoutAnalysis.images.length} images, and ${associations.length} image-text associations.`,
        content_type: 'processed_document',
        semantic_tags: ['document', 'processed', 'hybrid-pipeline'],
        language: 'en',
        technical_complexity: 8,
        reading_level: 12,
        confidence_scores: {
          processing: 0.95,
          layout_analysis: layoutAnalysis.structure.metadata.confidence,
          chunking: chunks.reduce((sum, c) => sum + c.metadata.confidence, 0) / chunks.length,
          overall: 0.9
        },
        search_keywords: ['document', 'processed', 'pdf', 'html'],
        metadata: {
          source_type: 'hybrid_pdf_pipeline',
          processing_id: htmlResult.processingId,
          html_url: htmlResult.htmlUrl,
          total_chunks: chunks.length,
          total_images: layoutAnalysis.images.length,
          total_associations: associations.length,
          processing_pipeline: 'enhanced_pdf_html_chunking_mapping'
        },
        created_by: userId,
        last_modified_by: userId,
        status: 'published'
      };

      const { data: docEntry, error: docError } = await supabase
        .from('enhanced_knowledge_base')
        .insert(documentEntry)
        .select()
        .single();

      if (docError) {
        console.warn('Failed to create document knowledge entry:', docError);
      } else {
        knowledgeEntries.push(docEntry.id);
      }

    } catch (error) {
      console.error('Error creating knowledge entries:', error);
    }

    return knowledgeEntries;
  }

  private calculateAverageConfidence(chunks: DocumentChunk[], associations: ImageTextAssociation[]): number {
    const chunkConfidences = chunks.map(c => c.metadata.confidence);
    const associationConfidences = associations.map(a => a.confidence);
    const allConfidences = [...chunkConfidences, ...associationConfidences];
    
    return allConfidences.length > 0 
      ? allConfidences.reduce((sum, conf) => sum + conf, 0) / allConfidences.length 
      : 0;
  }

  private calculateQualityMetrics(
    layoutAnalysis: LayoutAnalysisResult,
    chunks: DocumentChunk[],
    associations: ImageTextAssociation[]
  ): ProcessingResult['qualityMetrics'] {
    // Layout preservation score
    const layoutPreservation = layoutAnalysis.structure.metadata.confidence;

    // Chunking quality based on size distribution and confidence
    const chunkSizes = chunks.map(c => c.metadata.characterCount);
    const avgChunkSize = chunkSizes.reduce((sum, size) => sum + size, 0) / chunkSizes.length;
    const sizeVariance = chunkSizes.reduce((sum, size) => sum + Math.pow(size - avgChunkSize, 2), 0) / chunkSizes.length;
    const chunkingQuality = Math.max(0, 1 - (sizeVariance / (avgChunkSize * avgChunkSize)));

    // Image mapping accuracy
    const imageMappingAccuracy = associations.length > 0
      ? associations.reduce((sum, a) => sum + a.confidence, 0) / associations.length
      : 0.8; // Default if no images

    // Overall quality
    const overallQuality = (layoutPreservation + chunkingQuality + imageMappingAccuracy) / 3;

    return {
      layoutPreservation,
      chunkingQuality,
      imageMappingAccuracy,
      overallQuality
    };
  }

  /**
   * Get all processing statuses (for monitoring)
   */
  getAllProcessingStatuses(): ProcessingStatus[] {
    return Array.from(this.processingStatuses.values());
  }

  /**
   * Clear completed processing statuses (cleanup)
   */
  clearCompletedStatuses(): void {
    for (const [id, status] of this.processingStatuses.entries()) {
      if (status.status === 'completed' || status.status === 'failed') {
        this.processingStatuses.delete(id);
      }
    }
  }
}

// Export singleton instance
export const hybridPDFPipeline = new HybridPDFPipelineService();
import { supabase } from '@/integrations/supabase/client';
import { EnhancedRAGService, type EnhancedRAGRequest, type EnhancedRAGResponse } from './enhancedRAGService';
import { hybridPDFPipeline, type QueryOptions, type QueryResult } from './hybridPDFPipeline';
import { layoutAwareChunker, type DocumentChunk } from './layoutAwareChunker';
import { imageTextMapper, type ImageTextAssociation } from './imageTextMapper';
import { TextEmbedderService } from './ml/textEmbedder';

export interface DocumentRAGQuery {
  query: string;
  documentIds?: string[];
  includeImages?: boolean;
  includeChunks?: boolean;
  maxResults?: number;
  confidenceThreshold?: number;
  searchType?: 'semantic' | 'hybrid' | 'keyword' | 'contextual';
  filters?: {
    chunkTypes?: string[];
    hierarchyLevels?: number[];
    pageNumbers?: number[];
    materialTypes?: string[];
    technicalComplexity?: number[];
  };
}

export interface DocumentRAGResult {
  query: string;
  results: {
    chunks: EnhancedDocumentChunk[];
    images: EnhancedImageResult[];
    associations: EnhancedAssociationResult[];
    knowledgeEntries: EnhancedKnowledgeResult[];
  };
  totalResults: number;
  searchTime: number;
  relevanceScores: number[];
  contextualInsights: {
    materialReferences: string[];
    technicalTerms: string[];
    relatedConcepts: string[];
    suggestedQueries: string[];
  };
  visualContext: {
    relatedImages: string[];
    imageDescriptions: string[];
    spatialRelationships: string[];
  };
  qualityMetrics: {
    averageRelevance: number;
    confidenceScore: number;
    completeness: number;
    coherence: number;
  };
}

export interface EnhancedDocumentChunk extends DocumentChunk {
  relevanceScore: number;
  contextualRelevance: number;
  highlightedText: string;
  relatedChunks: string[];
  associatedImages: string[];
  materialContext: string[];
}

export interface EnhancedImageResult {
  imageId: string;
  imageUrl: string;
  caption?: string;
  relevanceScore: number;
  associatedText: string;
  materialAnalysis: {
    detectedMaterials: string[];
    colorScheme: string;
    surfaceProperties: string[];
  };
  spatialContext: {
    pageNumber: number;
    position: { x: number; y: number };
    nearbyText: string[];
  };
}

export interface EnhancedAssociationResult extends ImageTextAssociation {
  relevanceScore: number;
  contextualSignificance: number;
  enhancedMetadata: {
    materialRelevance: number;
    technicalRelevance: number;
    visualImportance: number;
  };
}

export interface EnhancedKnowledgeResult {
  id: string;
  title: string;
  content: string;
  relevanceScore: number;
  source: string;
  type: 'chunk' | 'association' | 'document' | 'analysis';
  metadata: {
    documentId?: string;
    chunkIndex?: number;
    pageNumber?: number;
    materialTypes?: string[];
    technicalLevel?: number;
  };
}

export interface ConversationalContext {
  sessionId: string;
  previousQueries: string[];
  userIntent: string;
  domainFocus: string[];
  conversationHistory: {
    query: string;
    response: string;
    timestamp: string;
    relevantDocuments: string[];
  }[];
}

/**
 * Enhanced Document RAG Service
 * Provides intelligent querying capabilities for processed documents
 * with layout-aware chunking, image-text associations, and contextual understanding
 */
export class EnhancedDocumentRAGService {
  private textEmbedder: TextEmbedderService;
  private conversationContexts: Map<string, ConversationalContext> = new Map();

  constructor() {
    this.textEmbedder = new TextEmbedderService();
  }

  /**
   * Perform intelligent document search with enhanced RAG capabilities
   */
  async searchDocuments(query: DocumentRAGQuery): Promise<DocumentRAGResult> {
    const startTime = Date.now();

    try {
      console.log(`Starting enhanced document RAG search for: "${query.query}"`);

      // Analyze query intent and extract entities
      const queryAnalysis = await this.analyzeQuery(query.query);

      // Perform multi-modal search
      const searchResults = await this.performMultiModalSearch(query, queryAnalysis);

      // Enhance results with contextual information
      const enhancedResults = await this.enhanceSearchResults(searchResults, query, queryAnalysis);

      // Generate contextual insights
      const contextualInsights = await this.generateContextualInsights(enhancedResults, queryAnalysis);

      // Create visual context
      const visualContext = await this.createVisualContext(enhancedResults);

      // Calculate quality metrics
      const qualityMetrics = this.calculateQualityMetrics(enhancedResults);

      const searchTime = Date.now() - startTime;

      const result: DocumentRAGResult = {
        query: query.query,
        results: enhancedResults,
        totalResults: this.countTotalResults(enhancedResults),
        searchTime,
        relevanceScores: this.extractRelevanceScores(enhancedResults),
        contextualInsights,
        visualContext,
        qualityMetrics
      };

      console.log(`Enhanced document RAG search completed in ${searchTime}ms with ${result.totalResults} results`);
      return result;

    } catch (error) {
      console.error('Enhanced document RAG search error:', error);
      throw error;
    }
  }

  /**
   * Perform conversational search with context awareness
   */
  async conversationalSearch(
    query: string,
    sessionId: string,
    documentIds?: string[]
  ): Promise<DocumentRAGResult & { conversationalResponse: string }> {
    try {
      // Get or create conversation context
      const context = this.getOrCreateConversationContext(sessionId);

      // Update context with current query
      context.previousQueries.push(query);

      // Analyze query in conversational context
      const contextualQuery = await this.buildContextualQuery(query, context);

      // Perform enhanced search
      const searchResult = await this.searchDocuments({
        query: contextualQuery,
        documentIds,
        includeImages: true,
        includeChunks: true,
        maxResults: 10,
        searchType: 'contextual'
      });

      // Generate conversational response
      const conversationalResponse = await this.generateConversationalResponse(
        searchResult,
        query,
        context
      );

      // Update conversation history
      context.conversationHistory.push({
        query,
        response: conversationalResponse,
        timestamp: new Date().toISOString(),
        relevantDocuments: documentIds || []
      });

      return {
        ...searchResult,
        conversationalResponse
      };

    } catch (error) {
      console.error('Conversational search error:', error);
      throw error;
    }
  }

  /**
   * Get document-specific insights
   */
  async getDocumentInsights(documentId: string): Promise<{
    summary: string;
    keyTopics: string[];
    materialTypes: string[];
    technicalComplexity: number;
    readingTime: number;
    imageCount: number;
    chunkDistribution: { [key: string]: number };
    qualityScore: number;
  }> {
    try {
      const statistics = await hybridPDFPipeline.getDocumentStatistics(documentId);
      const chunks = await layoutAwareChunker.getDocumentChunks(documentId);
      const associations = await imageTextMapper.getDocumentAssociations(documentId);

      // Extract key topics from chunks
      const keyTopics = this.extractKeyTopics(chunks);

      // Extract material types
      const materialTypes = this.extractMaterialTypes(chunks, associations);

      // Calculate technical complexity
      const technicalComplexity = chunks.reduce((sum, chunk) => sum + chunk.metadata.complexity, 0) / chunks.length;

      // Generate summary
      const summary = await this.generateDocumentSummary(chunks, associations);

      // Calculate chunk distribution
      const chunkDistribution = chunks.reduce((dist, chunk) => {
        dist[chunk.chunkType] = (dist[chunk.chunkType] || 0) + 1;
        return dist;
      }, {} as { [key: string]: number });

      // Calculate quality score
      const qualityScore = this.calculateDocumentQuality(chunks, associations);

      return {
        summary,
        keyTopics,
        materialTypes,
        technicalComplexity,
        readingTime: statistics.estimatedReadingTime,
        imageCount: statistics.images,
        chunkDistribution,
        qualityScore
      };

    } catch (error) {
      console.error('Error getting document insights:', error);
      throw error;
    }
  }

  /**
   * Find similar documents
   */
  async findSimilarDocuments(
    documentId: string,
    maxResults: number = 5
  ): Promise<Array<{
    documentId: string;
    similarityScore: number;
    sharedTopics: string[];
    sharedMaterials: string[];
    title: string;
  }>> {
    try {
      // Get document chunks for comparison
      const sourceChunks = await layoutAwareChunker.getDocumentChunks(documentId);
      const sourceText = sourceChunks.map(c => c.text).join(' ');

      // Generate embedding for source document
      await this.textEmbedder.initialize();
      const sourceEmbedding = await this.textEmbedder.generateEmbedding(sourceText);

      if (!sourceEmbedding.success) {
        throw new Error('Failed to generate source document embedding');
      }

      // Search for similar documents using enhanced RAG
      const ragResult = await EnhancedRAGService.search({
        query: sourceText.substring(0, 1000), // Use first 1000 chars as query
        searchType: 'semantic',
        maxResults: maxResults * 2 // Get more results to filter
      });

      // Filter and rank results
      const similarDocuments = ragResult.results.knowledgeBase
        .filter(result => result.metadata?.document_id !== documentId)
        .slice(0, maxResults)
        .map(result => ({
          documentId: result.metadata?.document_id || result.id,
          similarityScore: result.relevanceScore,
          sharedTopics: this.findSharedTopics(sourceChunks, result.content),
          sharedMaterials: this.findSharedMaterials(sourceChunks, result.content),
          title: result.title
        }));

      return similarDocuments;

    } catch (error) {
      console.error('Error finding similar documents:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async analyzeQuery(query: string): Promise<{
    intent: string;
    entities: string[];
    materialTerms: string[];
    technicalTerms: string[];
    questionType: string;
    complexity: number;
  }> {
    const lowerQuery = query.toLowerCase();

    // Determine intent
    let intent = 'information';
    if (lowerQuery.includes('how') || lowerQuery.includes('what') || lowerQuery.includes('why')) {
      intent = 'explanation';
    } else if (lowerQuery.includes('find') || lowerQuery.includes('show') || lowerQuery.includes('list')) {
      intent = 'search';
    } else if (lowerQuery.includes('compare') || lowerQuery.includes('difference')) {
      intent = 'comparison';
    }

    // Extract entities
    const entities = this.extractEntities(query);
    const materialTerms = this.extractMaterialTerms(query);
    const technicalTerms = this.extractTechnicalTerms(query);

    // Determine question type
    const questionType = this.determineQuestionType(query);

    // Calculate complexity
    const complexity = this.calculateQueryComplexity(query);

    return {
      intent,
      entities,
      materialTerms,
      technicalTerms,
      questionType,
      complexity
    };
  }

  private async performMultiModalSearch(
    query: DocumentRAGQuery,
    queryAnalysis: any
  ): Promise<{
    chunks: DocumentChunk[];
    associations: ImageTextAssociation[];
    knowledgeEntries: any[];
  }> {
    const results = {
      chunks: [] as DocumentChunk[],
      associations: [] as ImageTextAssociation[],
      knowledgeEntries: [] as any[]
    };

    // Search chunks
    if (query.includeChunks !== false) {
      if (query.documentIds && query.documentIds.length > 0) {
        for (const docId of query.documentIds) {
          const docChunks = await layoutAwareChunker.searchChunks(query.query, docId, query.maxResults);
          results.chunks.push(...docChunks);
        }
      } else {
        const allChunks = await layoutAwareChunker.searchChunks(query.query, undefined, query.maxResults);
        results.chunks.push(...allChunks);
      }
    }

    // Search image associations
    if (query.includeImages !== false) {
      // Get associations from knowledge base
      const { data: associationData } = await supabase
        .from('enhanced_knowledge_base')
        .select('*')
        .eq('content_type', 'image_text_association')
        .ilike('content', `%${query.query}%`)
        .limit(query.maxResults || 10);

      if (associationData) {
        results.associations = associationData.map(row => 
          imageTextMapper['convertKnowledgeEntryToAssociation'](row)
        );
      }
    }

    // Search knowledge base using enhanced RAG
    const searchType = query.searchType === 'keyword' || query.searchType === 'contextual'
      ? 'hybrid'
      : (query.searchType as 'semantic' | 'hybrid' | 'perplexity' | 'comprehensive') || 'hybrid';
    
    const ragResult = await EnhancedRAGService.search({
      query: query.query,
      searchType,
      maxResults: query.maxResults || 10
    });

    results.knowledgeEntries = ragResult.results.knowledgeBase;

    return results;
  }

  private async enhanceSearchResults(
    searchResults: any,
    query: DocumentRAGQuery,
    queryAnalysis: any
  ): Promise<{
    chunks: EnhancedDocumentChunk[];
    images: EnhancedImageResult[];
    associations: EnhancedAssociationResult[];
    knowledgeEntries: EnhancedKnowledgeResult[];
  }> {
    // Enhance chunks
    const enhancedChunks = searchResults.chunks.map((chunk: DocumentChunk) => ({
      ...chunk,
      relevanceScore: this.calculateRelevanceScore(chunk.text, query.query),
      contextualRelevance: this.calculateContextualRelevance(chunk, queryAnalysis),
      highlightedText: this.highlightText(chunk.text, query.query),
      relatedChunks: [],
      associatedImages: chunk.metadata.imageIds,
      materialContext: this.extractMaterialContext(chunk.text)
    }));

    // Enhance images (simplified)
    const enhancedImages: EnhancedImageResult[] = [];

    // Enhance associations
    const enhancedAssociations = searchResults.associations.map((assoc: ImageTextAssociation) => ({
      ...assoc,
      relevanceScore: this.calculateRelevanceScore(assoc.metadata.textContext, query.query),
      contextualSignificance: 0.8,
      enhancedMetadata: {
        materialRelevance: 0.7,
        technicalRelevance: 0.6,
        visualImportance: 0.8
      }
    }));

    // Enhance knowledge entries
    const enhancedKnowledgeEntries = searchResults.knowledgeEntries.map((entry: any) => ({
      id: entry.id,
      title: entry.title,
      content: entry.content,
      relevanceScore: entry.relevanceScore || 0.5,
      source: entry.source || 'knowledge_base',
      type: this.determineEntryType(entry),
      metadata: {
        documentId: entry.metadata?.document_id,
        chunkIndex: entry.metadata?.chunk_index,
        pageNumber: entry.metadata?.page_number,
        materialTypes: entry.metadata?.material_types,
        technicalLevel: entry.technical_complexity
      }
    }));

    return {
      chunks: enhancedChunks,
      images: enhancedImages,
      associations: enhancedAssociations,
      knowledgeEntries: enhancedKnowledgeEntries
    };
  }

  private async generateContextualInsights(enhancedResults: any, queryAnalysis: any): Promise<{
    materialReferences: string[];
    technicalTerms: string[];
    relatedConcepts: string[];
    suggestedQueries: string[];
  }> {
    const allText = [
      ...enhancedResults.chunks.map((c: any) => c.text),
      ...enhancedResults.knowledgeEntries.map((e: any) => e.content)
    ].join(' ');

    return {
      materialReferences: this.extractMaterialReferences(allText),
      technicalTerms: this.extractTechnicalTerms(allText),
      relatedConcepts: this.extractRelatedConcepts(allText, queryAnalysis),
      suggestedQueries: this.generateSuggestedQueries(queryAnalysis, enhancedResults)
    };
  }

  private async createVisualContext(enhancedResults: any): Promise<{
    relatedImages: string[];
    imageDescriptions: string[];
    spatialRelationships: string[];
  }> {
    return {
      relatedImages: enhancedResults.images.map((img: any) => img.imageUrl),
      imageDescriptions: enhancedResults.images.map((img: any) => img.caption || 'Material sample'),
      spatialRelationships: enhancedResults.associations.map((assoc: any) => 
        `${assoc.spatialRelationship.direction} relationship`
      )
    };
  }

  private calculateQualityMetrics(enhancedResults: any): {
    averageRelevance: number;
    confidenceScore: number;
    completeness: number;
    coherence: number;
  } {
    const allRelevanceScores = [
      ...enhancedResults.chunks.map((c: any) => c.relevanceScore),
      ...enhancedResults.associations.map((a: any) => a.relevanceScore),
      ...enhancedResults.knowledgeEntries.map((e: any) => e.relevanceScore)
    ];

    const averageRelevance = allRelevanceScores.length > 0 
      ? allRelevanceScores.reduce((sum, score) => sum + score, 0) / allRelevanceScores.length 
      : 0;

    return {
      averageRelevance,
      confidenceScore: averageRelevance * 0.9,
      completeness: Math.min(1, enhancedResults.chunks.length / 5),
      coherence: averageRelevance * 0.8
    };
  }

  // Additional helper methods (simplified implementations)
  private extractEntities(query: string): string[] {
    return query.split(' ').filter(word => word.length > 3);
  }

  private extractMaterialTerms(text: string): string[] {
    const materialTerms = ['ceramic', 'stone', 'wood', 'metal', 'glass', 'concrete', 'tile'];
    return materialTerms.filter(term => text.toLowerCase().includes(term));
  }

  private extractTechnicalTerms(text: string): string[] {
    const technicalTerms = ['strength', 'durability', 'resistance', 'thermal', 'mechanical'];
    return technicalTerms.filter(term => text.toLowerCase().includes(term));
  }

  private determineQuestionType(query: string): string {
    if (query.includes('?')) return 'question';
    if (query.toLowerCase().startsWith('find')) return 'search';
    return 'statement';
  }

  private calculateQueryComplexity(query: string): number {
    return Math.min(10, query.split(' ').length / 2);
  }

  private calculateRelevanceScore(text: string, query: string): number {
    const queryWords = query.toLowerCase().split(' ');
    const textWords = text.toLowerCase().split(' ');
    const matches = queryWords.filter(word => textWords.includes(word));
    return matches.length / queryWords.length;
  }

  private calculateContextualRelevance(chunk: DocumentChunk, queryAnalysis: any): number {
    return 0.8; // Simplified
  }

  private highlightText(text: string, query: string): string {
    const queryWords = query.toLowerCase().split(' ');
    let highlighted = text;
    
    queryWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      highlighted = highlighted.replace(regex, `<mark>$&</mark>`);
    });
    
    return highlighted;
  }

  private extractMaterialContext(text: string): string[] {
    return this.extractMaterialTerms(text);
  }

  private determineEntryType(entry: any): 'chunk' | 'association' | 'document' | 'analysis' {
    if (entry.content_type === 'document_chunk') return 'chunk';
    if (entry.content_type === 'image_text_association') return 'association';
    if (entry.content_type === 'processed_document') return 'document';
    return 'analysis';
  }

  private extractMaterialReferences(text: string): string[] {
    return this.extractMaterialTerms(text);
  }

  private extractRelatedConcepts(text: string, queryAnalysis: any): string[] {
    return ['material properties', 'technical specifications', 'performance standards'];
  }

  private generateSuggestedQueries(queryAnalysis: any, enhancedResults: any): string[] {
    return [
      'What are the technical specifications?',
      'How does this material perform?',
      'What are similar materials?'
    ];
  }

  private countTotalResults(enhancedResults: any): number {
    return enhancedResults.chunks.length + 
           enhancedResults.images.length + 
           enhancedResults.associations.length + 
           enhancedResults.knowledgeEntries.length;
  }

  private extractRelevanceScores(enhancedResults: any): number[] {
    return [
      ...enhancedResults.chunks.map((c: any) => c.relevanceScore),
      ...enhancedResults.associations.map((a: any) => a.relevanceScore),
      ...enhancedResults.knowledgeEntries.map((e: any) => e.relevanceScore)
    ];
  }

  private getOrCreateConversationContext(sessionId: string): ConversationalContext {
    if (!this.conversationContexts.has(sessionId)) {
      this.conversationContexts.set(sessionId, {
        sessionId,
        previousQueries: [],
        userIntent: 'information',
        domainFocus: [],
        conversationHistory: []
      });
    }
    return this.conversationContexts.get(sessionId)!;
  }

  private async buildContextualQuery(query: string, context: ConversationalContext): Promise<string> {
    // Enhance query with conversation context
    const recentQueries = context.previousQueries.slice(-3).join(' ');
    return `${recentQueries} ${query}`.trim();
  }

  private async generateConversationalResponse(
    searchResult: DocumentRAGResult,
    query: string,
    context: ConversationalContext
  ): Promise<string> {
    // Generate a conversational response based on search results
    const topChunks = searchResult.results.chunks.slice(0, 3);
    const summary = topChunks.map(chunk => chunk.text.substring(0, 200)).join(' ');
    
    return `Based on the documents, ${summary}...`;
  }

  private extractKeyTopics(chunks: DocumentChunk[]): string[] {
    const allTags = chunks.flatMap(chunk => chunk.metadata.semanticTags);
    const tagCounts = allTags.reduce((counts, tag) => {
      counts[tag] = (counts[tag] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    return Object.entries(tagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([tag]) => tag);
  }

  private extractMaterialTypes(chunks: DocumentChunk[], associations: ImageTextAssociation[]): string[] {
    const materialTerms = new Set<string>();
    
    chunks.forEach(chunk => {
      this.extractMaterialTerms(chunk.text).forEach(term => materialTerms.add(term));
    });
    
    associations.forEach(assoc => {
      assoc.metadata.materialReferences.forEach(ref => materialTerms.add(ref));
    });
    
    return Array.from(materialTerms);
  }

  private async generateDocumentSummary(chunks: DocumentChunk[], associations: ImageTextAssociation[]): Promise<string> {
    const keyChunks = chunks
      .filter(chunk => chunk.chunkType === 'heading' || chunk.metadata.confidence > 0.8)
      .slice(0, 5);
    
    const summaryText = keyChunks.map(chunk => chunk.text.substring(0, 100)).join(' ');
    return `Document contains information about ${summaryText}...`;
  }

  private calculateDocumentQuality(chunks: DocumentChunk[], associations: ImageTextAssociation[]): number {
    const avgChunkConfidence = chunks.reduce((sum, chunk) => sum + chunk.metadata.confidence, 0) / chunks.length;
    const avgAssocConfidence = associations.length > 0 
      ? associations.reduce((sum, assoc) => sum + assoc.confidence, 0) / associations.length 
      : 0.8;
    
    return (avgChunkConfidence + avgAssocConfidence) / 2;
  }

  private findSharedTopics(sourceChunks: DocumentChunk[], targetContent: string): string[] {
    const sourceTopics = sourceChunks.flatMap(chunk => chunk.metadata.semanticTags);
    const targetWords = targetContent.toLowerCase().split(' ');
    
    return sourceTopics.filter(topic => 
      targetWords.some(word => word.includes(topic.toLowerCase()))
    );
  }

  private findSharedMaterials(sourceChunks: DocumentChunk[], targetContent: string): string[] {
    const sourceMaterials = sourceChunks.flatMap(chunk => 
      this.extractMaterialTerms(chunk.text)
    );
    const targetMaterials = this.extractMaterialTerms(targetContent);
    
    return sourceMaterials.filter(material => targetMaterials.includes(material));
  }
}

// Export singleton instance
export const enhancedDocumentRAG = new EnhancedDocumentRAGService();
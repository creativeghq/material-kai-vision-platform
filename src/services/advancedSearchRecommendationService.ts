/**
 * Advanced Search & Recommendation Engine
 * 
 * Implements multi-modal search combining text, visual, and metadata queries.
 * Creates recommendation system using product embeddings and user behavior patterns.
 * 
 * Features:
 * - Multi-modal search (text + visual + metadata)
 * - Embedding-based similarity search
 * - User behavior tracking and analysis
 * - Personalized recommendations
 * - Search result ranking and optimization
 * - Real-time recommendation updates
 */

import { supabase } from '@/integrations/supabase/client';
import { BaseService, ServiceConfig } from './base/BaseService';
import { MultiVectorSearchService } from './multiVectorSearchService';
import { AnalyticsService } from './AnalyticsService';

// Core interfaces
export interface AdvancedSearchRequest {
  query: string;
  searchType: 'text' | 'visual' | 'multimodal' | 'hybrid';
  imageData?: string;
  imageUrl?: string;
  filters?: SearchFilters;
  userContext?: UserContext;
  workspaceId: string;
  userId?: string;
  sessionId?: string;
  limit?: number;
  offset?: number;
}

export interface SearchFilters {
  categories?: string[];
  materialTypes?: string[];
  priceRange?: [number, number];
  dateRange?: [string, string];
  qualityThreshold?: number;
  sourceDocuments?: string[];
  productTypes?: string[];
  brands?: string[];
  colors?: string[];
  applications?: string[];
  minConfidence?: number;
}

export interface UserContext {
  userId: string;
  preferences: UserPreferences;
  searchHistory: SearchHistoryItem[];
  behaviorProfile: UserBehaviorProfile;
  currentSession: SessionContext;
}

export interface UserPreferences {
  preferredCategories: string[];
  preferredMaterials: string[];
  priceRange: [number, number];
  qualityPreference: 'high' | 'medium' | 'any';
  visualStyle: string[];
  functionalRequirements: string[];
  excludedCategories: string[];
  searchWeights: {
    textRelevance: number;
    visualSimilarity: number;
    qualityScore: number;
    priceWeight: number;
    brandPreference: number;
  };
}

export interface UserBehaviorProfile {
  searchPatterns: {
    frequentQueries: string[];
    preferredSearchTypes: string[];
    avgSessionDuration: number;
    searchFrequency: number;
  };
  interactionPatterns: {
    clickThroughRate: number;
    dwellTime: number;
    conversionRate: number;
    preferredResultTypes: string[];
  };
  preferences: {
    implicitCategories: string[];
    implicitMaterials: string[];
    qualityTolerance: number;
    priceElasticity: number;
  };
}

export interface SessionContext {
  sessionId: string;
  startTime: string;
  currentQuery: string;
  searchCount: number;
  viewedResults: string[];
  clickedResults: string[];
  timeSpent: number;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  searchType: string;
  timestamp: string;
  resultsCount: number;
  clickedResults: string[];
  satisfaction: number; // 1-5 rating
  sessionId: string;
}

export interface AdvancedSearchResult {
  id: string;
  type: 'product' | 'chunk' | 'image' | 'material';
  title: string;
  description: string;
  content?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  category: string;
  subcategory?: string;
  brand?: string;
  price?: number;
  currency?: string;
  
  // Scoring and relevance
  relevanceScore: number;
  qualityScore: number;
  confidenceScore: number;
  personalizedScore: number;
  
  // Multi-modal scores
  textSimilarity: number;
  visualSimilarity: number;
  semanticSimilarity: number;
  metadataSimilarity: number;
  
  // Metadata
  metadata: Record<string, any>;
  tags: string[];
  properties: Record<string, any>;
  
  // Source information
  sourceDocument?: string;
  sourceChunk?: string;
  extractedAt?: string;
  
  // Recommendation context
  recommendationReason?: string;
  similarProducts?: string[];
  relatedCategories?: string[];
}

export interface RecommendationRequest {
  userId: string;
  workspaceId: string;
  context?: 'search' | 'browse' | 'product_view' | 'purchase';
  currentProductId?: string;
  currentCategory?: string;
  limit?: number;
  diversityFactor?: number; // 0-1, higher = more diverse recommendations
  includeExplanations?: boolean;
}

export interface RecommendationResult {
  id: string;
  productId: string;
  title: string;
  description: string;
  imageUrl?: string;
  category: string;
  price?: number;
  
  // Recommendation scoring
  recommendationScore: number;
  confidenceScore: number;
  diversityScore: number;
  
  // Recommendation reasoning
  reason: string;
  reasonType: 'similar_products' | 'user_behavior' | 'trending' | 'complementary' | 'quality_based';
  explanation: string;
  
  // Supporting data
  similarityFactors: string[];
  userBehaviorFactors: string[];
  qualityMetrics: Record<string, number>;
  
  metadata: Record<string, any>;
}

export interface AdvancedSearchResponse {
  results: AdvancedSearchResult[];
  totalCount: number;
  searchTime: number;
  searchId: string;
  
  // Search analytics
  queryAnalysis: {
    intent: string;
    entities: string[];
    categories: string[];
    confidence: number;
  };
  
  // Result analytics
  resultDistribution: {
    byType: Record<string, number>;
    byCategory: Record<string, number>;
    byQuality: Record<string, number>;
  };
  
  // Personalization
  personalizationApplied: boolean;
  userProfile: UserBehaviorProfile;
  
  // Recommendations
  relatedRecommendations: RecommendationResult[];
  
  // Performance metrics
  performance: {
    searchTime: number;
    indexTime: number;
    rankingTime: number;
    personalizationTime: number;
  };
}

export interface RecommendationResponse {
  recommendations: RecommendationResult[];
  totalCount: number;
  generationTime: number;
  recommendationId: string;
  
  // Analytics
  algorithmUsed: string[];
  diversityAchieved: number;
  confidenceDistribution: Record<string, number>;
  
  // User context
  userProfile: UserBehaviorProfile;
  sessionContext: SessionContext;
  
  // Performance
  performance: {
    dataRetrievalTime: number;
    computationTime: number;
    rankingTime: number;
    totalTime: number;
  };
}

/**
 * Advanced Search & Recommendation Engine Service
 */
export class AdvancedSearchRecommendationService extends BaseService {
  private multiVectorService: MultiVectorSearchService;
  private analyticsService: typeof AnalyticsService;

  constructor() {
    const config: ServiceConfig = {
      name: 'AdvancedSearchRecommendationService',
      version: '1.0.0',
      environment: 'production',
      enabled: true,
      timeout: 30000,
      retries: 3,
    };
    super(config);
    this.multiVectorService = new MultiVectorSearchService();
    this.analyticsService = AnalyticsService;
  }

  /**
   * Initialize the service
   */
  protected async doInitialize(): Promise<void> {
    // Initialize dependencies
    await this.multiVectorService.initialize();
    console.log('AdvancedSearchRecommendationService initialized');
  }

  /**
   * Health check implementation
   */
  protected async doHealthCheck(): Promise<void> {
    // Check if service is responsive
    if (!this.isInitialized) {
      throw new Error('Service not initialized');
    }
    // Additional health checks can be added here
  }

  /**
   * Perform advanced multi-modal search
   */
  async search(request: AdvancedSearchRequest): Promise<AdvancedSearchResponse> {
    return this.executeOperation(async () => {
      const startTime = Date.now();
      const searchId = `search-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      this.logger.info(`🔍 Advanced search: ${request.query} (${request.searchType})`);
      
      // Step 1: Analyze query and extract intent
      const queryAnalysis = await this.analyzeQuery(request.query);
      
      // Step 2: Get user context and behavior profile
      const userContext = request.userContext || await this.getUserContext(request.userId, request.workspaceId);
      
      // Step 3: Perform multi-modal search
      const searchResults = await this.performMultiModalSearch(request, queryAnalysis);
      
      // Step 4: Apply personalization and ranking
      const personalizedResults = await this.personalizeResults(searchResults, userContext, queryAnalysis);
      
      // Step 5: Generate related recommendations
      const recommendations = await this.generateRelatedRecommendations(request, personalizedResults, userContext);
      
      // Step 6: Track search analytics
      await this.trackSearchAnalytics(request, personalizedResults, searchId, Date.now() - startTime);
      
      const searchTime = Date.now() - startTime;
      
      return {
        results: personalizedResults,
        totalCount: personalizedResults.length,
        searchTime,
        searchId,
        queryAnalysis,
        resultDistribution: this.analyzeResultDistribution(personalizedResults),
        personalizationApplied: !!request.userId,
        userProfile: userContext.behaviorProfile,
        relatedRecommendations: recommendations,
        performance: {
          searchTime,
          indexTime: 0, // Will be populated by sub-operations
          rankingTime: 0,
          personalizationTime: 0,
        },
      };
    }, 'search');
  }

  /**
   * Generate personalized recommendations
   */
  async getRecommendations(request: RecommendationRequest): Promise<RecommendationResponse> {
    return this.executeOperation(async () => {
      const startTime = Date.now();
      const recommendationId = `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      this.logger.info(`🎯 Generating recommendations for user: ${request.userId}`);

      // Step 1: Get user behavior profile
      const userProfile = await this.getUserBehaviorProfile(request.userId, request.workspaceId);

      // Step 2: Get session context
      const sessionContext = await this.getSessionContext(request.userId);

      // Step 3: Generate recommendations using multiple algorithms
      const recommendations = await this.generateRecommendations(request, userProfile, sessionContext);

      // Step 4: Apply diversity and ranking
      const rankedRecommendations = await this.rankAndDiversifyRecommendations(
        recommendations,
        request.diversityFactor || 0.3
      );

      // Step 5: Track recommendation analytics
      await this.trackRecommendationAnalytics(request, rankedRecommendations, recommendationId);

      const generationTime = Date.now() - startTime;

      return {
        recommendations: rankedRecommendations,
        totalCount: rankedRecommendations.length,
        generationTime,
        recommendationId,
        algorithmUsed: ['collaborative_filtering', 'content_based', 'embedding_similarity'],
        diversityAchieved: this.calculateDiversityScore(rankedRecommendations),
        confidenceDistribution: this.analyzeConfidenceDistribution(rankedRecommendations),
        userProfile,
        sessionContext,
        performance: {
          dataRetrievalTime: 0,
          computationTime: 0,
          rankingTime: 0,
          totalTime: generationTime,
        },
      };
    }, 'getRecommendations');
  }

  /**
   * Analyze query to extract intent and entities
   */
  private async analyzeQuery(query: string): Promise<{
    intent: string;
    entities: string[];
    categories: string[];
    confidence: number;
  }> {
    // Simple intent analysis - can be enhanced with NLP models
    const lowerQuery = query.toLowerCase();

    // Intent detection
    let intent = 'search';
    if (lowerQuery.includes('recommend') || lowerQuery.includes('suggest')) {
      intent = 'recommendation';
    } else if (lowerQuery.includes('compare') || lowerQuery.includes('vs')) {
      intent = 'comparison';
    } else if (lowerQuery.includes('similar') || lowerQuery.includes('like')) {
      intent = 'similarity';
    }

    // Entity extraction (materials, colors, properties)
    const materialEntities = ['wood', 'metal', 'glass', 'ceramic', 'stone', 'fabric', 'plastic', 'concrete'];
    const colorEntities = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'gray', 'brown'];
    const propertyEntities = ['waterproof', 'fireproof', 'durable', 'lightweight', 'flexible', 'transparent'];

    const entities = [
      ...materialEntities.filter(entity => lowerQuery.includes(entity)),
      ...colorEntities.filter(entity => lowerQuery.includes(entity)),
      ...propertyEntities.filter(entity => lowerQuery.includes(entity)),
    ];

    // Category detection
    const categoryKeywords = {
      flooring: ['floor', 'tile', 'plank', 'carpet', 'vinyl', 'laminate'],
      wall_covering: ['wall', 'panel', 'wallpaper', 'paint', 'cladding'],
      furniture: ['chair', 'table', 'desk', 'cabinet', 'sofa', 'bed'],
      lighting: ['light', 'lamp', 'fixture', 'led', 'bulb'],
      textile: ['fabric', 'textile', 'curtain', 'upholstery'],
      accessory: ['hardware', 'handle', 'knob', 'fitting'],
    };

    const categories = Object.entries(categoryKeywords)
      .filter(([_, keywords]) => keywords.some(keyword => lowerQuery.includes(keyword)))
      .map(([category]) => category);

    const confidence = Math.min(
      0.5 + (entities.length * 0.1) + (categories.length * 0.15),
      1.0
    );

    return { intent, entities, categories, confidence };
  }

  /**
   * Get user context including preferences and behavior profile
   */
  private async getUserContext(userId?: string, workspaceId?: string): Promise<UserContext> {
    if (!userId) {
      return this.getDefaultUserContext();
    }

    try {
      // Get user preferences
      const preferences = await this.getUserPreferences(userId, workspaceId);

      // Get search history
      const searchHistory = await this.getSearchHistory(userId, 50);

      // Get behavior profile
      const behaviorProfile = await this.getUserBehaviorProfile(userId, workspaceId);

      // Get current session
      const currentSession = await this.getSessionContext(userId);

      return {
        userId,
        preferences,
        searchHistory,
        behaviorProfile,
        currentSession,
      };
    } catch (error) {
      this.logger.warn(`Failed to get user context: ${error}`);
      return this.getDefaultUserContext();
    }
  }

  /**
   * Perform multi-modal search combining different search types
   */
  private async performMultiModalSearch(
    request: AdvancedSearchRequest,
    queryAnalysis: any
  ): Promise<AdvancedSearchResult[]> {
    const results: AdvancedSearchResult[] = [];

    try {
      // Text-based search
      if (request.searchType === 'text' || request.searchType === 'hybrid' || request.searchType === 'multimodal') {
        const textResults = await this.performTextSearch(request, queryAnalysis);
        results.push(...textResults);
      }

      // Visual search
      if ((request.searchType === 'visual' || request.searchType === 'hybrid' || request.searchType === 'multimodal')
          && (request.imageData || request.imageUrl)) {
        const visualResults = await this.performVisualSearch(request);
        results.push(...visualResults);
      }

      // Semantic search using embeddings
      if (request.searchType === 'multimodal' || request.searchType === 'hybrid') {
        const semanticResults = await this.performSemanticSearch(request, queryAnalysis);
        results.push(...semanticResults);
      }

      // Metadata search
      if (request.filters && Object.keys(request.filters).length > 0) {
        const metadataResults = await this.performMetadataSearch(request);
        results.push(...metadataResults);
      }

      // Deduplicate and merge results
      return this.deduplicateAndMergeResults(results);

    } catch (error) {
      this.logger.error(`Multi-modal search failed: ${error}`);
      return [];
    }
  }

  /**
   * Perform text-based search
   */
  private async performTextSearch(
    request: AdvancedSearchRequest,
    queryAnalysis: any
  ): Promise<AdvancedSearchResult[]> {
    try {
      // Search in document chunks
      const { data: chunks, error } = await supabase
        .from('document_chunks')
        .select(`
          id,
          content,
          metadata,
          document_id,
          chunk_index,
          documents!inner(filename, metadata)
        `)
        .eq('workspace_id', request.workspaceId)
        .textSearch('content', request.query)
        .limit(request.limit || 20);

      if (error) {
        throw new Error(`Text search failed: ${error.message}`);
      }

      return (chunks || []).map(chunk => ({
        id: chunk.id,
        type: 'chunk' as const,
        title: `${chunk.documents.filename} - Chunk ${chunk.chunk_index}`,
        description: chunk.content.substring(0, 200) + '...',
        content: chunk.content,
        category: chunk.metadata?.category || 'document',
        relevanceScore: 0.8, // Will be calculated properly
        qualityScore: 0.7,
        confidenceScore: 0.75,
        personalizedScore: 0.0, // Will be set during personalization
        textSimilarity: 0.8,
        visualSimilarity: 0.0,
        semanticSimilarity: 0.0,
        metadataSimilarity: 0.0,
        metadata: chunk.metadata || {},
        tags: chunk.metadata?.tags || [],
        properties: {},
        sourceDocument: chunk.documents.filename,
        sourceChunk: chunk.id,
        extractedAt: chunk.metadata?.created_at,
      }));
    } catch (error) {
      this.logger.error(`Text search error: ${error}`);
      return [];
    }
  }

  /**
   * Perform visual search using image similarity
   */
  private async performVisualSearch(request: AdvancedSearchRequest): Promise<AdvancedSearchResult[]> {
    try {
      // Use multi-vector service for visual search
      const visualQuery = {
        imageData: request.imageData,
        imageUrl: request.imageUrl,
        weights: { visual: 1.0, multimodal: 0.5 },
        filters: request.filters,
        options: { limit: request.limit || 15 }
      };

      const visualResults = await MultiVectorSearchService.search(visualQuery);

      return visualResults.results.map(result => ({
        id: result.id,
        type: result.type as 'product' | 'chunk' | 'image' | 'material',
        title: result.title,
        description: result.description,
        imageUrl: result.imageUrl,
        thumbnailUrl: result.thumbnailUrl,
        category: result.category,
        relevanceScore: result.similarity_score,
        qualityScore: result.quality_score || 0.7,
        confidenceScore: result.confidence_score || 0.75,
        personalizedScore: 0.0,
        textSimilarity: 0.0,
        visualSimilarity: result.similarity_score,
        semanticSimilarity: 0.0,
        metadataSimilarity: 0.0,
        metadata: result.metadata,
        tags: result.tags || [],
        properties: result.properties || {},
      }));
    } catch (error) {
      this.logger.error(`Visual search error: ${error}`);
      return [];
    }
  }

  /**
   * Perform semantic search using embeddings
   */
  private async performSemanticSearch(
    request: AdvancedSearchRequest,
    queryAnalysis: any
  ): Promise<AdvancedSearchResult[]> {
    try {
      // Use multi-vector service for semantic search
      const semanticQuery = {
        text: request.query,
        weights: {
          text: 0.7,
          multimodal: 0.8,
          application: queryAnalysis.categories.length > 0 ? 0.6 : 0.3
        },
        filters: request.filters,
        options: { limit: request.limit || 15 }
      };

      const semanticResults = await MultiVectorSearchService.search(semanticQuery);

      return semanticResults.results.map(result => ({
        id: result.id,
        type: result.type as 'product' | 'chunk' | 'image' | 'material',
        title: result.title,
        description: result.description,
        imageUrl: result.imageUrl,
        category: result.category,
        relevanceScore: result.similarity_score,
        qualityScore: result.quality_score || 0.7,
        confidenceScore: result.confidence_score || 0.75,
        personalizedScore: 0.0,
        textSimilarity: 0.3,
        visualSimilarity: 0.0,
        semanticSimilarity: result.similarity_score,
        metadataSimilarity: 0.0,
        metadata: result.metadata,
        tags: result.tags || [],
        properties: result.properties || {},
      }));
    } catch (error) {
      this.logger.error(`Semantic search error: ${error}`);
      return [];
    }
  }

  /**
   * Perform metadata-based filtering search
   */
  private async performMetadataSearch(request: AdvancedSearchRequest): Promise<AdvancedSearchResult[]> {
    try {
      let query = supabase
        .from('products')
        .select(`
          id,
          name,
          description,
          metadata,
          category,
          price,
          currency,
          image_url,
          thumbnail_url,
          created_at
        `)
        .eq('workspace_id', request.workspaceId);

      // Apply filters
      if (request.filters?.categories?.length) {
        query = query.in('category', request.filters.categories);
      }

      if (request.filters?.priceRange) {
        query = query
          .gte('price', request.filters.priceRange[0])
          .lte('price', request.filters.priceRange[1]);
      }

      if (request.filters?.materialTypes?.length) {
        // Filter by material type in metadata
        query = query.contains('metadata', { material_type: request.filters.materialTypes });
      }

      const { data: products, error } = await query.limit(request.limit || 20);

      if (error) {
        throw new Error(`Metadata search failed: ${error.message}`);
      }

      return (products || []).map(product => ({
        id: product.id,
        type: 'product' as const,
        title: product.name,
        description: product.description || '',
        imageUrl: product.image_url,
        thumbnailUrl: product.thumbnail_url,
        category: product.category,
        price: product.price,
        currency: product.currency,
        relevanceScore: 0.6, // Lower for metadata-only matches
        qualityScore: 0.8,
        confidenceScore: 0.9, // High confidence for exact metadata matches
        personalizedScore: 0.0,
        textSimilarity: 0.0,
        visualSimilarity: 0.0,
        semanticSimilarity: 0.0,
        metadataSimilarity: 1.0,
        metadata: product.metadata || {},
        tags: product.metadata?.tags || [],
        properties: product.metadata?.properties || {},
      }));
    } catch (error) {
      this.logger.error(`Metadata search error: ${error}`);
      return [];
    }
  }

  /**
   * Get user behavior profile from analytics
   */
  private async getUserBehaviorProfile(userId: string, workspaceId?: string): Promise<UserBehaviorProfile> {
    try {
      // Get search analytics for the user
      const { data: searchEvents, error } = await supabase
        .from('search_analytics')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        throw new Error(`Failed to get search analytics: ${error.message}`);
      }

      // Analyze search patterns
      const searches = searchEvents || [];
      const frequentQueries = this.extractFrequentQueries(searches);
      const preferredSearchTypes = this.extractPreferredSearchTypes(searches);

      // Get analytics events for interaction patterns
      const { data: analyticsEvents } = await supabase
        .from('analytics_events')
        .select('*')
        .eq('user_id', userId)
        .in('event_type', ['search_click', 'product_view', 'result_interaction'])
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .limit(200);

      const interactions = analyticsEvents || [];

      return {
        searchPatterns: {
          frequentQueries,
          preferredSearchTypes,
          avgSessionDuration: this.calculateAvgSessionDuration(searches),
          searchFrequency: searches.length / 30, // searches per day
        },
        interactionPatterns: {
          clickThroughRate: this.calculateClickThroughRate(searches, interactions),
          dwellTime: this.calculateAvgDwellTime(interactions),
          conversionRate: this.calculateConversionRate(interactions),
          preferredResultTypes: this.extractPreferredResultTypes(interactions),
        },
        preferences: {
          implicitCategories: this.extractImplicitCategories(searches, interactions),
          implicitMaterials: this.extractImplicitMaterials(searches),
          qualityTolerance: 0.7, // Default
          priceElasticity: 0.5, // Default
        },
      };
    } catch (error) {
      this.logger.warn(`Failed to get user behavior profile: ${error}`);
      return this.getDefaultBehaviorProfile();
    }
  }

  /**
   * Get user preferences from database or defaults
   */
  private async getUserPreferences(userId: string, workspaceId?: string): Promise<UserPreferences> {
    try {
      // Try to get stored preferences
      const { data: preferences } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId || 'default')
        .single();

      if (preferences?.preferences) {
        return preferences.preferences;
      }
    } catch (error) {
      this.logger.debug(`No stored preferences found for user: ${userId}`);
    }

    // Return default preferences
    return {
      preferredCategories: [],
      preferredMaterials: [],
      priceRange: [0, 10000],
      qualityPreference: 'medium',
      visualStyle: [],
      functionalRequirements: [],
      excludedCategories: [],
      searchWeights: {
        textRelevance: 0.3,
        visualSimilarity: 0.25,
        qualityScore: 0.2,
        priceWeight: 0.15,
        brandPreference: 0.1,
      },
    };
  }

  /**
   * Get search history for user
   */
  private async getSearchHistory(userId: string, limit: number = 50): Promise<SearchHistoryItem[]> {
    try {
      const { data: searches, error } = await supabase
        .from('search_analytics')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to get search history: ${error.message}`);
      }

      return (searches || []).map(search => ({
        id: search.id,
        query: search.input_data?.query || '',
        searchType: search.input_data?.search_type || 'text',
        timestamp: search.created_at,
        resultsCount: search.result_data?.total_count || 0,
        clickedResults: search.result_data?.clicked_results || [],
        satisfaction: search.confidence_score || 3, // Default neutral
        sessionId: search.session_id || '',
      }));
    } catch (error) {
      this.logger.warn(`Failed to get search history: ${error}`);
      return [];
    }
  }

  /**
   * Get current session context
   */
  private async getSessionContext(userId: string): Promise<SessionContext> {
    // Generate or get current session ID
    const sessionId = `session-${Date.now()}-${userId.substring(0, 8)}`;

    return {
      sessionId,
      startTime: new Date().toISOString(),
      currentQuery: '',
      searchCount: 0,
      viewedResults: [],
      clickedResults: [],
      timeSpent: 0,
    };
  }

  /**
   * Generate recommendations using multiple algorithms
   */
  private async generateRecommendations(
    request: RecommendationRequest,
    userProfile: UserBehaviorProfile,
    sessionContext: SessionContext
  ): Promise<RecommendationResult[]> {
    const recommendations: RecommendationResult[] = [];

    try {
      // Algorithm 1: Collaborative Filtering (similar users)
      const collaborativeRecs = await this.generateCollaborativeRecommendations(request, userProfile);
      recommendations.push(...collaborativeRecs);

      // Algorithm 2: Content-Based (similar products)
      const contentRecs = await this.generateContentBasedRecommendations(request, userProfile);
      recommendations.push(...contentRecs);

      // Algorithm 3: Embedding Similarity
      const embeddingRecs = await this.generateEmbeddingBasedRecommendations(request, userProfile);
      recommendations.push(...embeddingRecs);

      // Algorithm 4: Trending/Popular items
      const trendingRecs = await this.generateTrendingRecommendations(request);
      recommendations.push(...trendingRecs);

      // Algorithm 5: Quality-based recommendations
      const qualityRecs = await this.generateQualityBasedRecommendations(request, userProfile);
      recommendations.push(...qualityRecs);

      return recommendations;
    } catch (error) {
      this.logger.error(`Failed to generate recommendations: ${error}`);
      return [];
    }
  }

  /**
   * Generate collaborative filtering recommendations
   */
  private async generateCollaborativeRecommendations(
    request: RecommendationRequest,
    userProfile: UserBehaviorProfile
  ): Promise<RecommendationResult[]> {
    try {
      // Find similar users based on search patterns and interactions
      const similarUsers = await this.findSimilarUsers(request.userId, userProfile);

      if (similarUsers.length === 0) {
        return [];
      }

      // Get products that similar users interacted with
      const { data: interactions } = await supabase
        .from('analytics_events')
        .select('event_data')
        .in('user_id', similarUsers.map(u => u.userId))
        .in('event_type', ['product_view', 'search_click'])
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      const productIds = new Set<string>();
      (interactions || []).forEach(interaction => {
        const productId = interaction.event_data?.product_id;
        if (productId) productIds.add(productId);
      });

      // Get product details
      const { data: products } = await supabase
        .from('products')
        .select('*')
        .in('id', Array.from(productIds))
        .eq('workspace_id', request.workspaceId)
        .limit(request.limit || 10);

      return (products || []).map(product => ({
        id: `collab-${product.id}`,
        productId: product.id,
        title: product.name,
        description: product.description || '',
        imageUrl: product.image_url,
        category: product.category,
        price: product.price,
        recommendationScore: 0.8,
        confidenceScore: 0.75,
        diversityScore: 0.6,
        reason: 'Users with similar preferences also liked this',
        reasonType: 'similar_products' as const,
        explanation: 'Based on collaborative filtering from users with similar search patterns',
        similarityFactors: ['search_patterns', 'interaction_history'],
        userBehaviorFactors: ['similar_users', 'shared_preferences'],
        qualityMetrics: { quality_score: 0.8 },
        metadata: product.metadata || {},
      }));
    } catch (error) {
      this.logger.error(`Collaborative filtering error: ${error}`);
      return [];
    }
  }

  /**
   * Generate content-based recommendations
   */
  private async generateContentBasedRecommendations(
    request: RecommendationRequest,
    userProfile: UserBehaviorProfile
  ): Promise<RecommendationResult[]> {
    try {
      // Get user's preferred categories and materials
      const preferredCategories = userProfile.preferences.implicitCategories;
      const preferredMaterials = userProfile.preferences.implicitMaterials;

      if (preferredCategories.length === 0 && preferredMaterials.length === 0) {
        return [];
      }

      let query = supabase
        .from('products')
        .select('*')
        .eq('workspace_id', request.workspaceId);

      // Filter by preferred categories
      if (preferredCategories.length > 0) {
        query = query.in('category', preferredCategories);
      }

      // Filter by preferred materials in metadata
      if (preferredMaterials.length > 0) {
        // This is a simplified approach - in production, you'd use more sophisticated metadata querying
        query = query.contains('metadata', { material_type: preferredMaterials[0] });
      }

      const { data: products } = await query.limit(request.limit || 10);

      return (products || []).map(product => ({
        id: `content-${product.id}`,
        productId: product.id,
        title: product.name,
        description: product.description || '',
        imageUrl: product.image_url,
        category: product.category,
        price: product.price,
        recommendationScore: 0.75,
        confidenceScore: 0.8,
        diversityScore: 0.4, // Lower diversity for content-based
        reason: 'Matches your preferred categories and materials',
        reasonType: 'user_behavior' as const,
        explanation: 'Based on your search history and interaction patterns',
        similarityFactors: ['category_match', 'material_preference'],
        userBehaviorFactors: ['search_history', 'category_preferences'],
        qualityMetrics: { quality_score: 0.75 },
        metadata: product.metadata || {},
      }));
    } catch (error) {
      this.logger.error(`Content-based recommendation error: ${error}`);
      return [];
    }
  }

  /**
   * Generate embedding-based recommendations
   */
  private async generateEmbeddingBasedRecommendations(
    request: RecommendationRequest,
    userProfile: UserBehaviorProfile
  ): Promise<RecommendationResult[]> {
    try {
      // Use the most frequent query from user's search history as seed
      const seedQuery = userProfile.searchPatterns.frequentQueries[0] || 'high quality materials';

      // Use multi-vector search to find similar products
      const embeddingQuery = {
        text: seedQuery,
        weights: {
          text: 0.4,
          multimodal: 0.6,
          application: 0.5
        },
        filters: {
          categories: userProfile.preferences.implicitCategories,
        },
        options: { limit: request.limit || 10 }
      };

      const embeddingResults = await MultiVectorSearchService.search(embeddingQuery);

      return embeddingResults.results.map(result => ({
        id: `embedding-${result.id}`,
        productId: result.id,
        title: result.title,
        description: result.description,
        imageUrl: result.imageUrl,
        category: result.category,
        price: result.price,
        recommendationScore: result.similarity_score,
        confidenceScore: 0.85,
        diversityScore: 0.7,
        reason: 'Semantically similar to your interests',
        reasonType: 'similar_products' as const,
        explanation: 'Based on semantic similarity to your search patterns',
        similarityFactors: ['semantic_similarity', 'embedding_match'],
        userBehaviorFactors: ['search_queries', 'semantic_preferences'],
        qualityMetrics: { quality_score: result.quality_score || 0.8 },
        metadata: result.metadata || {},
      }));
    } catch (error) {
      this.logger.error(`Embedding-based recommendation error: ${error}`);
      return [];
    }
  }

  /**
   * Generate trending recommendations
   */
  private async generateTrendingRecommendations(request: RecommendationRequest): Promise<RecommendationResult[]> {
    try {
      // Get most viewed/searched products in the last 7 days
      const { data: trendingData } = await supabase
        .from('analytics_events')
        .select('event_data')
        .eq('event_type', 'product_view')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      // Count product views
      const productViews = new Map<string, number>();
      (trendingData || []).forEach(event => {
        const productId = event.event_data?.product_id;
        if (productId) {
          productViews.set(productId, (productViews.get(productId) || 0) + 1);
        }
      });

      // Get top trending products
      const topProductIds = Array.from(productViews.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, request.limit || 5)
        .map(([productId]) => productId);

      if (topProductIds.length === 0) {
        return [];
      }

      const { data: products } = await supabase
        .from('products')
        .select('*')
        .in('id', topProductIds)
        .eq('workspace_id', request.workspaceId);

      return (products || []).map(product => ({
        id: `trending-${product.id}`,
        productId: product.id,
        title: product.name,
        description: product.description || '',
        imageUrl: product.image_url,
        category: product.category,
        price: product.price,
        recommendationScore: 0.7,
        confidenceScore: 0.9,
        diversityScore: 0.8,
        reason: 'Trending and popular this week',
        reasonType: 'trending' as const,
        explanation: 'This product is currently popular among users',
        similarityFactors: ['popularity', 'recent_views'],
        userBehaviorFactors: ['community_interest'],
        qualityMetrics: { quality_score: 0.8 },
        metadata: product.metadata || {},
      }));
    } catch (error) {
      this.logger.error(`Trending recommendation error: ${error}`);
      return [];
    }
  }

  /**
   * Generate quality-based recommendations
   */
  private async generateQualityBasedRecommendations(
    request: RecommendationRequest,
    userProfile: UserBehaviorProfile
  ): Promise<RecommendationResult[]> {
    try {
      // Get high-quality products based on quality assessments
      const { data: qualityProducts } = await supabase
        .from('quality_assessments')
        .select(`
          entity_id,
          quality_score,
          confidence_score,
          products!inner(*)
        `)
        .eq('entity_type', 'product')
        .eq('products.workspace_id', request.workspaceId)
        .gte('quality_score', userProfile.preferences.qualityTolerance)
        .order('quality_score', { ascending: false })
        .limit(request.limit || 8);

      return (qualityProducts || []).map(item => ({
        id: `quality-${item.entity_id}`,
        productId: item.entity_id,
        title: item.products.name,
        description: item.products.description || '',
        imageUrl: item.products.image_url,
        category: item.products.category,
        price: item.products.price,
        recommendationScore: item.quality_score,
        confidenceScore: item.confidence_score,
        diversityScore: 0.5,
        reason: 'High quality product that meets your standards',
        reasonType: 'quality_based' as const,
        explanation: 'Selected based on superior quality metrics and assessments',
        similarityFactors: ['quality_score', 'assessment_metrics'],
        userBehaviorFactors: ['quality_preference'],
        qualityMetrics: {
          quality_score: item.quality_score,
          confidence_score: item.confidence_score
        },
        metadata: item.products.metadata || {},
      }));
    } catch (error) {
      this.logger.error(`Quality-based recommendation error: ${error}`);
      return [];
    }
  }

  // Helper methods for analytics and processing
  private extractFrequentQueries(searches: any[]): string[] {
    const queryCount = new Map<string, number>();
    searches.forEach(search => {
      const query = search.input_data?.query;
      if (query) {
        queryCount.set(query, (queryCount.get(query) || 0) + 1);
      }
    });

    return Array.from(queryCount.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([query]) => query);
  }

  private extractPreferredSearchTypes(searches: any[]): string[] {
    const typeCount = new Map<string, number>();
    searches.forEach(search => {
      const type = search.input_data?.search_type || 'text';
      typeCount.set(type, (typeCount.get(type) || 0) + 1);
    });

    return Array.from(typeCount.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([type]) => type);
  }

  private calculateAvgSessionDuration(searches: any[]): number {
    if (searches.length === 0) return 0;
    const totalTime = searches.reduce((sum, search) => sum + (search.processing_time_ms || 0), 0);
    return totalTime / searches.length;
  }

  private calculateClickThroughRate(searches: any[], interactions: any[]): number {
    if (searches.length === 0) return 0;
    const clickEvents = interactions.filter(i => i.event_type === 'search_click').length;
    return clickEvents / searches.length;
  }

  private calculateAvgDwellTime(interactions: any[]): number {
    const dwellTimes = interactions
      .filter(i => i.event_data?.dwell_time)
      .map(i => i.event_data.dwell_time);

    if (dwellTimes.length === 0) return 0;
    return dwellTimes.reduce((sum, time) => sum + time, 0) / dwellTimes.length;
  }

  private calculateConversionRate(interactions: any[]): number {
    const views = interactions.filter(i => i.event_type === 'product_view').length;
    const conversions = interactions.filter(i => i.event_type === 'conversion').length;
    return views > 0 ? conversions / views : 0;
  }

  private extractPreferredResultTypes(interactions: any[]): string[] {
    const typeCount = new Map<string, number>();
    interactions.forEach(interaction => {
      const type = interaction.event_data?.result_type;
      if (type) {
        typeCount.set(type, (typeCount.get(type) || 0) + 1);
      }
    });

    return Array.from(typeCount.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([type]) => type);
  }

  private extractImplicitCategories(searches: any[], interactions: any[]): string[] {
    const categories = new Set<string>();

    // From search queries
    searches.forEach(search => {
      const query = search.input_data?.query?.toLowerCase() || '';
      if (query.includes('floor')) categories.add('flooring');
      if (query.includes('wall')) categories.add('wall_covering');
      if (query.includes('furniture')) categories.add('furniture');
      if (query.includes('light')) categories.add('lighting');
      if (query.includes('fabric')) categories.add('textile');
    });

    // From interactions
    interactions.forEach(interaction => {
      const category = interaction.event_data?.category;
      if (category) categories.add(category);
    });

    return Array.from(categories);
  }

  private extractImplicitMaterials(searches: any[]): string[] {
    const materials = new Set<string>();
    const materialKeywords = ['wood', 'metal', 'glass', 'ceramic', 'stone', 'fabric', 'plastic', 'concrete'];

    searches.forEach(search => {
      const query = search.input_data?.query?.toLowerCase() || '';
      materialKeywords.forEach(material => {
        if (query.includes(material)) materials.add(material);
      });
    });

    return Array.from(materials);
  }

  private getDefaultUserContext(): UserContext {
    return {
      userId: 'anonymous',
      preferences: {
        preferredCategories: [],
        preferredMaterials: [],
        priceRange: [0, 10000],
        qualityPreference: 'medium',
        visualStyle: [],
        functionalRequirements: [],
        excludedCategories: [],
        searchWeights: {
          textRelevance: 0.3,
          visualSimilarity: 0.25,
          qualityScore: 0.2,
          priceWeight: 0.15,
          brandPreference: 0.1,
        },
      },
      searchHistory: [],
      behaviorProfile: this.getDefaultBehaviorProfile(),
      currentSession: {
        sessionId: 'anonymous-session',
        startTime: new Date().toISOString(),
        currentQuery: '',
        searchCount: 0,
        viewedResults: [],
        clickedResults: [],
        timeSpent: 0,
      },
    };
  }

  private getDefaultBehaviorProfile(): UserBehaviorProfile {
    return {
      searchPatterns: {
        frequentQueries: [],
        preferredSearchTypes: ['text'],
        avgSessionDuration: 0,
        searchFrequency: 0,
      },
      interactionPatterns: {
        clickThroughRate: 0,
        dwellTime: 0,
        conversionRate: 0,
        preferredResultTypes: [],
      },
      preferences: {
        implicitCategories: [],
        implicitMaterials: [],
        qualityTolerance: 0.7,
        priceElasticity: 0.5,
      },
    };
  }

  private async findSimilarUsers(userId: string, userProfile: UserBehaviorProfile): Promise<{ userId: string; similarity: number }[]> {
    // Simplified similar user finding - in production, this would use more sophisticated algorithms
    try {
      const { data: otherUsers } = await supabase
        .from('search_analytics')
        .select('user_id')
        .neq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      const uniqueUsers = [...new Set((otherUsers || []).map(u => u.user_id))];

      // Return a subset as similar users (simplified)
      return uniqueUsers.slice(0, 5).map(uid => ({
        userId: String(uid),
        similarity: 0.7 + Math.random() * 0.3, // Simplified similarity score
      }));
    } catch (error) {
      return [];
    }
  }

  private deduplicateAndMergeResults(results: AdvancedSearchResult[]): AdvancedSearchResult[] {
    const seen = new Map<string, AdvancedSearchResult>();

    results.forEach(result => {
      const key = `${result.type}-${result.id}`;
      const existing = seen.get(key);

      if (!existing || result.relevanceScore > existing.relevanceScore) {
        seen.set(key, result);
      }
    });

    return Array.from(seen.values())
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private personalizeResults(
    results: AdvancedSearchResult[],
    userContext: UserContext,
    queryAnalysis: any
  ): Promise<AdvancedSearchResult[]> {
    // Apply personalization scoring
    return Promise.resolve(results.map(result => {
      let personalizedScore = result.relevanceScore;

      // Boost based on user preferences
      if (userContext.preferences.preferredCategories.includes(result.category)) {
        personalizedScore += 0.2;
      }

      // Boost based on quality preference
      if (userContext.preferences.qualityPreference === 'high' && result.qualityScore > 0.8) {
        personalizedScore += 0.15;
      }

      // Boost based on search history
      const hasSearchedSimilar = userContext.searchHistory.some(h =>
        h.query.toLowerCase().includes(result.category.toLowerCase())
      );
      if (hasSearchedSimilar) {
        personalizedScore += 0.1;
      }

      return {
        ...result,
        personalizedScore: Math.min(personalizedScore, 1.0),
        relevanceScore: personalizedScore,
      };
    }).sort((a, b) => b.personalizedScore - a.personalizedScore));
  }

  private generateRelatedRecommendations(
    request: AdvancedSearchRequest,
    results: AdvancedSearchResult[],
    userContext: UserContext
  ): Promise<RecommendationResult[]> {
    // Generate quick recommendations based on search results
    const topCategories = results.slice(0, 3).map(r => r.category);

    return Promise.resolve(topCategories.map((category, index) => ({
      id: `related-${index}`,
      productId: `related-product-${index}`,
      title: `Related ${category} products`,
      description: `Discover more ${category} options`,
      category,
      recommendationScore: 0.6 - (index * 0.1),
      confidenceScore: 0.7,
      diversityScore: 0.8,
      reason: `Related to your search for ${request.query}`,
      reasonType: 'similar_products' as const,
      explanation: 'Based on your current search results',
      similarityFactors: ['search_context'],
      userBehaviorFactors: ['current_search'],
      qualityMetrics: { quality_score: 0.7 },
      metadata: {},
    })));
  }

  private analyzeResultDistribution(results: AdvancedSearchResult[]) {
    const byType: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byQuality: Record<string, number> = {};

    results.forEach(result => {
      byType[result.type] = (byType[result.type] || 0) + 1;
      byCategory[result.category] = (byCategory[result.category] || 0) + 1;

      const qualityBucket = result.qualityScore > 0.8 ? 'high' :
                           result.qualityScore > 0.6 ? 'medium' : 'low';
      byQuality[qualityBucket] = (byQuality[qualityBucket] || 0) + 1;
    });

    return { byType, byCategory, byQuality };
  }

  private rankAndDiversifyRecommendations(
    recommendations: RecommendationResult[],
    diversityFactor: number
  ): Promise<RecommendationResult[]> {
    // Simple diversity algorithm - ensure variety in categories
    const diversified: RecommendationResult[] = [];
    const usedCategories = new Set<string>();

    // First pass: add highest scoring from each category
    recommendations
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .forEach(rec => {
        if (!usedCategories.has(rec.category) || diversified.length < 3) {
          diversified.push(rec);
          usedCategories.add(rec.category);
        }
      });

    // Second pass: fill remaining slots with highest scoring
    const remaining = recommendations.filter(r => !diversified.includes(r));
    diversified.push(...remaining.slice(0, Math.max(0, 10 - diversified.length)));

    return Promise.resolve(diversified);
  }

  private calculateDiversityScore(recommendations: RecommendationResult[]): number {
    const categories = new Set(recommendations.map(r => r.category));
    return categories.size / Math.max(recommendations.length, 1);
  }

  private analyzeConfidenceDistribution(recommendations: RecommendationResult[]): Record<string, number> {
    const distribution: Record<string, number> = { high: 0, medium: 0, low: 0 };

    recommendations.forEach(rec => {
      if (rec.confidenceScore > 0.8) distribution.high++;
      else if (rec.confidenceScore > 0.6) distribution.medium++;
      else distribution.low++;
    });

    return distribution;
  }

  private async trackSearchAnalytics(
    request: AdvancedSearchRequest,
    results: AdvancedSearchResult[],
    searchId: string,
    processingTime: number
  ): Promise<void> {
    try {
      await this.analyticsService.trackEvent({
        event_type: 'advanced_search',
        workspace_id: request.workspaceId,
        user_id: request.userId,
        metadata: {
          search_id: searchId,
          query: request.query,
          search_type: request.searchType,
          results_count: results.length,
          processing_time: processingTime,
          filters_applied: request.filters,
          personalization_applied: !!request.userId,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn(`Failed to track search analytics: ${error}`);
    }
  }

  private async trackRecommendationAnalytics(
    request: RecommendationRequest,
    recommendations: RecommendationResult[],
    recommendationId: string
  ): Promise<void> {
    try {
      await this.analyticsService.trackEvent({
        event_type: 'recommendation_generated',
        workspace_id: request.workspaceId,
        user_id: request.userId,
        metadata: {
          recommendation_id: recommendationId,
          context: request.context,
          recommendations_count: recommendations.length,
          algorithms_used: ['collaborative_filtering', 'content_based', 'embedding_similarity'],
          diversity_factor: request.diversityFactor,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn(`Failed to track recommendation analytics: ${error}`);
    }
  }
}

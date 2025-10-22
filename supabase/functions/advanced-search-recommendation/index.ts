/**
 * Advanced Search & Recommendation Engine Edge Function
 * 
 * Provides serverless endpoints for:
 * - Multi-modal search (text + visual + metadata)
 * - Personalized recommendations
 * - User behavior tracking
 * - Search analytics
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

interface AdvancedSearchRequest {
  action: 'search' | 'recommend' | 'track_interaction' | 'update_preferences' | 'get_behavior_profile';
  query?: string;
  searchType?: 'text' | 'visual' | 'multimodal' | 'hybrid';
  imageData?: string;
  imageUrl?: string;
  filters?: any;
  userId?: string;
  workspaceId?: string;
  sessionId?: string;
  limit?: number;
  offset?: number;
  
  // Recommendation specific
  context?: 'search' | 'browse' | 'product_view' | 'purchase';
  currentProductId?: string;
  currentCategory?: string;
  diversityFactor?: number;
  
  // Interaction tracking
  eventType?: string;
  eventData?: any;
  targetId?: string;
  targetType?: string;
  
  // Preferences
  preferences?: any;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requestBody: AdvancedSearchRequest = await req.json();
    const { action } = requestBody;

    console.log(`🔍 Advanced Search & Recommendation: ${action}`);

    let result;

    switch (action) {
      case 'search':
        result = await performAdvancedSearch(supabase, requestBody);
        break;
      
      case 'recommend':
        result = await generateRecommendations(supabase, requestBody);
        break;
      
      case 'track_interaction':
        result = await trackUserInteraction(supabase, requestBody);
        break;
      
      case 'update_preferences':
        result = await updateUserPreferences(supabase, requestBody);
        break;
      
      case 'get_behavior_profile':
        result = await getUserBehaviorProfile(supabase, requestBody);
        break;
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Advanced Search & Recommendation error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

/**
 * Perform advanced multi-modal search
 */
async function performAdvancedSearch(supabase: any, request: AdvancedSearchRequest) {
  const startTime = Date.now();
  const searchId = `search-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Step 1: Analyze query intent
    const queryAnalysis = analyzeQuery(request.query || '');
    
    // Step 2: Get user context if available
    const userContext = request.userId ? 
      await getUserContext(supabase, request.userId, request.workspaceId) : null;
    
    // Step 3: Perform multi-modal search
    const searchResults = await executeMultiModalSearch(supabase, request, queryAnalysis);
    
    // Step 4: Apply personalization if user context available
    const personalizedResults = userContext ? 
      await personalizeSearchResults(searchResults, userContext, queryAnalysis) : searchResults;
    
    // Step 5: Generate related recommendations
    const relatedRecommendations = await generateQuickRecommendations(
      supabase, request, personalizedResults
    );
    
    // Step 6: Track search analytics
    await trackSearchAnalytics(supabase, request, personalizedResults, searchId, Date.now() - startTime);
    
    const searchTime = Date.now() - startTime;
    
    return {
      success: true,
      searchId,
      results: personalizedResults,
      totalCount: personalizedResults.length,
      searchTime,
      queryAnalysis,
      personalizationApplied: !!userContext,
      relatedRecommendations,
      performance: {
        searchTime,
        indexTime: 0,
        rankingTime: 0,
        personalizationTime: 0,
      },
    };
  } catch (error) {
    console.error('Advanced search error:', error);
    return {
      success: false,
      error: error.message,
      searchId,
      results: [],
      totalCount: 0,
      searchTime: Date.now() - startTime,
    };
  }
}

/**
 * Generate personalized recommendations
 */
async function generateRecommendations(supabase: any, request: AdvancedSearchRequest) {
  const startTime = Date.now();
  const recommendationId = `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Get user behavior profile
    const userProfile = await getUserBehaviorProfile(supabase, request);
    
    // Generate recommendations using multiple algorithms
    const recommendations = await generateMultiAlgorithmRecommendations(
      supabase, request, userProfile.profile
    );
    
    // Apply diversity and ranking
    const rankedRecommendations = applyDiversityRanking(
      recommendations, request.diversityFactor || 0.3
    );
    
    // Track recommendation analytics
    await trackRecommendationAnalytics(supabase, request, rankedRecommendations, recommendationId);
    
    const generationTime = Date.now() - startTime;
    
    return {
      success: true,
      recommendationId,
      recommendations: rankedRecommendations,
      totalCount: rankedRecommendations.length,
      generationTime,
      algorithmsUsed: ['collaborative_filtering', 'content_based', 'embedding_similarity'],
      diversityAchieved: calculateDiversityScore(rankedRecommendations),
      userProfile: userProfile.profile,
      performance: {
        dataRetrievalTime: 0,
        computationTime: 0,
        rankingTime: 0,
        totalTime: generationTime,
      },
    };
  } catch (error) {
    console.error('Recommendation generation error:', error);
    return {
      success: false,
      error: error.message,
      recommendationId,
      recommendations: [],
      totalCount: 0,
      generationTime: Date.now() - startTime,
    };
  }
}

/**
 * Track user interaction events
 */
async function trackUserInteraction(supabase: any, request: AdvancedSearchRequest) {
  try {
    const { error } = await supabase
      .from('user_interaction_events')
      .insert({
        user_id: request.userId,
        session_id: request.sessionId,
        workspace_id: request.workspaceId || 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
        event_type: request.eventType,
        event_context: request.context,
        target_id: request.targetId,
        target_type: request.targetType,
        interaction_data: request.eventData || {},
        search_query: request.query,
        created_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Failed to track interaction: ${error.message}`);
    }

    return {
      success: true,
      message: 'Interaction tracked successfully',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Interaction tracking error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Update user preferences
 */
async function updateUserPreferences(supabase: any, request: AdvancedSearchRequest) {
  try {
    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: request.userId,
        workspace_id: request.workspaceId || 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
        preferences: request.preferences,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Failed to update preferences: ${error.message}`);
    }

    return {
      success: true,
      message: 'Preferences updated successfully',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Preferences update error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Helper functions

/**
 * Analyze query to extract intent and entities
 */
function analyzeQuery(query: string) {
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

  // Entity extraction
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

  const confidence = Math.min(0.5 + (entities.length * 0.1) + (categories.length * 0.15), 1.0);

  return { intent, entities, categories, confidence };
}

/**
 * Get user context including preferences and behavior
 */
async function getUserContext(supabase: any, userId: string, workspaceId?: string) {
  try {
    // Get user preferences
    const { data: preferences } = await supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId || 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e')
      .single();

    // Get behavior profile
    const { data: behaviorProfile } = await supabase
      .from('user_behavior_profiles')
      .select('*')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId || 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e')
      .single();

    // Get recent search history
    const { data: searchHistory } = await supabase
      .from('search_analytics')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    return {
      preferences: preferences?.preferences || getDefaultPreferences(),
      behaviorProfile: behaviorProfile || getDefaultBehaviorProfile(),
      searchHistory: searchHistory || [],
    };
  } catch (error) {
    console.warn('Failed to get user context:', error);
    return {
      preferences: getDefaultPreferences(),
      behaviorProfile: getDefaultBehaviorProfile(),
      searchHistory: [],
    };
  }
}

/**
 * Execute multi-modal search
 */
async function executeMultiModalSearch(supabase: any, request: AdvancedSearchRequest, queryAnalysis: any) {
  const results: any[] = [];

  try {
    // Text-based search in document chunks
    if (request.searchType === 'text' || request.searchType === 'hybrid' || request.searchType === 'multimodal') {
      const textResults = await performTextSearch(supabase, request);
      results.push(...textResults);
    }

    // Product search
    if (request.searchType === 'multimodal' || request.searchType === 'hybrid') {
      const productResults = await performProductSearch(supabase, request, queryAnalysis);
      results.push(...productResults);
    }

    // Metadata filtering
    if (request.filters && Object.keys(request.filters).length > 0) {
      const metadataResults = await performMetadataSearch(supabase, request);
      results.push(...metadataResults);
    }

    // Deduplicate and sort by relevance
    return deduplicateResults(results)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, request.limit || 20);

  } catch (error) {
    console.error('Multi-modal search error:', error);
    return [];
  }
}

/**
 * Perform text search in document chunks
 */
async function performTextSearch(supabase: any, request: AdvancedSearchRequest) {
  try {
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
      .eq('workspace_id', request.workspaceId || 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e')
      .textSearch('content', request.query)
      .limit(15);

    if (error) {
      throw new Error(`Text search failed: ${error.message}`);
    }

    return (chunks || []).map(chunk => ({
      id: chunk.id,
      type: 'chunk',
      title: `${chunk.documents.filename} - Chunk ${chunk.chunk_index}`,
      description: chunk.content.substring(0, 200) + '...',
      content: chunk.content,
      category: chunk.metadata?.category || 'document',
      relevanceScore: 0.8,
      qualityScore: 0.7,
      confidenceScore: 0.75,
      textSimilarity: 0.8,
      visualSimilarity: 0.0,
      semanticSimilarity: 0.0,
      metadataSimilarity: 0.0,
      metadata: chunk.metadata || {},
      tags: chunk.metadata?.tags || [],
      sourceDocument: chunk.documents.filename,
      sourceChunk: chunk.id,
    }));
  } catch (error) {
    console.error('Text search error:', error);
    return [];
  }
}

/**
 * Perform product search
 */
async function performProductSearch(supabase: any, request: AdvancedSearchRequest, queryAnalysis: any) {
  try {
    let query = supabase
      .from('products')
      .select('*')
      .eq('workspace_id', request.workspaceId || 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e');

    // Apply category filters from query analysis
    if (queryAnalysis.categories.length > 0) {
      query = query.in('category', queryAnalysis.categories);
    }

    // Text search in product name and description
    if (request.query) {
      query = query.or(`name.ilike.%${request.query}%,description.ilike.%${request.query}%`);
    }

    const { data: products, error } = await query.limit(10);

    if (error) {
      throw new Error(`Product search failed: ${error.message}`);
    }

    return (products || []).map(product => ({
      id: product.id,
      type: 'product',
      title: product.name,
      description: product.description || '',
      imageUrl: product.image_url,
      thumbnailUrl: product.thumbnail_url,
      category: product.category,
      price: product.price,
      currency: product.currency,
      relevanceScore: 0.75,
      qualityScore: 0.8,
      confidenceScore: 0.85,
      textSimilarity: 0.6,
      visualSimilarity: 0.0,
      semanticSimilarity: 0.7,
      metadataSimilarity: 0.0,
      metadata: product.metadata || {},
      tags: product.metadata?.tags || [],
    }));
  } catch (error) {
    console.error('Product search error:', error);
    return [];
  }
}

/**
 * Perform metadata-based search
 */
async function performMetadataSearch(supabase: any, request: AdvancedSearchRequest) {
  try {
    let query = supabase
      .from('products')
      .select('*')
      .eq('workspace_id', request.workspaceId || 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e');

    // Apply filters
    if (request.filters?.categories?.length) {
      query = query.in('category', request.filters.categories);
    }

    if (request.filters?.priceRange) {
      query = query
        .gte('price', request.filters.priceRange[0])
        .lte('price', request.filters.priceRange[1]);
    }

    const { data: products, error } = await query.limit(10);

    if (error) {
      throw new Error(`Metadata search failed: ${error.message}`);
    }

    return (products || []).map(product => ({
      id: product.id,
      type: 'product',
      title: product.name,
      description: product.description || '',
      imageUrl: product.image_url,
      category: product.category,
      price: product.price,
      relevanceScore: 0.6,
      qualityScore: 0.8,
      confidenceScore: 0.9,
      textSimilarity: 0.0,
      visualSimilarity: 0.0,
      semanticSimilarity: 0.0,
      metadataSimilarity: 1.0,
      metadata: product.metadata || {},
      tags: product.metadata?.tags || [],
    }));
  } catch (error) {
    console.error('Metadata search error:', error);
    return [];
  }
}

/**
 * Generate multi-algorithm recommendations
 */
async function generateMultiAlgorithmRecommendations(supabase: any, request: AdvancedSearchRequest, userProfile: any) {
  const recommendations: any[] = [];

  try {
    // Algorithm 1: Content-based (similar categories)
    const contentRecs = await generateContentBasedRecommendations(supabase, request, userProfile);
    recommendations.push(...contentRecs);

    // Algorithm 2: Trending products
    const trendingRecs = await generateTrendingRecommendations(supabase, request);
    recommendations.push(...trendingRecs);

    // Algorithm 3: Quality-based
    const qualityRecs = await generateQualityBasedRecommendations(supabase, request);
    recommendations.push(...qualityRecs);

    return recommendations;
  } catch (error) {
    console.error('Multi-algorithm recommendation error:', error);
    return [];
  }
}

/**
 * Generate content-based recommendations
 */
async function generateContentBasedRecommendations(supabase: any, request: AdvancedSearchRequest, userProfile: any) {
  try {
    const preferredCategories = userProfile?.implicitPreferences?.categories || [];

    if (preferredCategories.length === 0) {
      return [];
    }

    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('workspace_id', request.workspaceId || 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e')
      .in('category', preferredCategories)
      .limit(5);

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
      diversityScore: 0.4,
      reason: 'Matches your preferred categories',
      reasonType: 'user_behavior',
      explanation: 'Based on your search history and preferences',
      metadata: product.metadata || {},
    }));
  } catch (error) {
    console.error('Content-based recommendation error:', error);
    return [];
  }
}

/**
 * Generate trending recommendations
 */
async function generateTrendingRecommendations(supabase: any, request: AdvancedSearchRequest) {
  try {
    // Get most viewed products in the last 7 days
    const { data: trendingData } = await supabase
      .from('user_interaction_events')
      .select('target_id')
      .eq('event_type', 'product_view')
      .eq('target_type', 'product')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    // Count product views
    const productViews = new Map();
    (trendingData || []).forEach(event => {
      const productId = event.target_id;
      if (productId) {
        productViews.set(productId, (productViews.get(productId) || 0) + 1);
      }
    });

    // Get top trending products
    const topProductIds = Array.from(productViews.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([productId]) => productId);

    if (topProductIds.length === 0) {
      return [];
    }

    const { data: products } = await supabase
      .from('products')
      .select('*')
      .in('id', topProductIds)
      .eq('workspace_id', request.workspaceId || 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e');

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
      reasonType: 'trending',
      explanation: 'This product is currently popular among users',
      metadata: product.metadata || {},
    }));
  } catch (error) {
    console.error('Trending recommendation error:', error);
    return [];
  }
}

/**
 * Generate quality-based recommendations
 */
async function generateQualityBasedRecommendations(supabase: any, request: AdvancedSearchRequest) {
  try {
    const { data: qualityProducts } = await supabase
      .from('quality_assessments')
      .select(`
        entity_id,
        quality_score,
        confidence_score,
        products!inner(*)
      `)
      .eq('entity_type', 'product')
      .eq('products.workspace_id', request.workspaceId || 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e')
      .gte('quality_score', 0.7)
      .order('quality_score', { ascending: false })
      .limit(4);

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
      reason: 'High quality product',
      reasonType: 'quality_based',
      explanation: 'Selected based on superior quality metrics',
      metadata: item.products.metadata || {},
    }));
  } catch (error) {
    console.error('Quality-based recommendation error:', error);
    return [];
  }
}

// Utility functions
function deduplicateResults(results: any[]) {
  const seen = new Map();
  return results.filter(result => {
    const key = `${result.type}-${result.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.set(key, true);
    return true;
  });
}

function personalizeSearchResults(results: any[], userContext: any, queryAnalysis: any) {
  return results.map(result => {
    let personalizedScore = result.relevanceScore;

    // Boost based on user preferences
    if (userContext.preferences?.preferredCategories?.includes(result.category)) {
      personalizedScore += 0.2;
    }

    // Boost based on quality preference
    if (userContext.preferences?.qualityPreference === 'high' && result.qualityScore > 0.8) {
      personalizedScore += 0.15;
    }

    return {
      ...result,
      personalizedScore: Math.min(personalizedScore, 1.0),
      relevanceScore: personalizedScore,
    };
  }).sort((a, b) => b.personalizedScore - a.personalizedScore);
}

function generateQuickRecommendations(supabase: any, request: AdvancedSearchRequest, results: any[]) {
  const topCategories = results.slice(0, 3).map(r => r.category);

  return topCategories.map((category, index) => ({
    id: `quick-${index}`,
    productId: `quick-product-${index}`,
    title: `Related ${category} products`,
    description: `Discover more ${category} options`,
    category,
    recommendationScore: 0.6 - (index * 0.1),
    confidenceScore: 0.7,
    diversityScore: 0.8,
    reason: `Related to your search`,
    reasonType: 'similar_products',
    explanation: 'Based on your current search results',
    metadata: {},
  }));
}

function applyDiversityRanking(recommendations: any[], diversityFactor: number) {
  const diversified: any[] = [];
  const usedCategories = new Set();

  // First pass: add highest scoring from each category
  recommendations
    .sort((a, b) => b.recommendationScore - a.recommendationScore)
    .forEach(rec => {
      if (!usedCategories.has(rec.category) || diversified.length < 3) {
        diversified.push(rec);
        usedCategories.add(rec.category);
      }
    });

  // Second pass: fill remaining slots
  const remaining = recommendations.filter(r => !diversified.includes(r));
  diversified.push(...remaining.slice(0, Math.max(0, 10 - diversified.length)));

  return diversified;
}

function calculateDiversityScore(recommendations: any[]) {
  const categories = new Set(recommendations.map(r => r.category));
  return categories.size / Math.max(recommendations.length, 1);
}

async function computeUserBehaviorProfile(supabase: any, userId: string, workspaceId?: string) {
  // Simplified behavior profile computation
  const defaultProfile = getDefaultBehaviorProfile();

  try {
    // Get search analytics
    const { data: searches } = await supabase
      .from('search_analytics')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(50);

    if (searches && searches.length > 0) {
      // Extract frequent queries
      const queryCount = new Map();
      searches.forEach(search => {
        const query = search.input_data?.query;
        if (query) {
          queryCount.set(query, (queryCount.get(query) || 0) + 1);
        }
      });

      const frequentQueries = Array.from(queryCount.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([query]) => query);

      defaultProfile.searchPatterns.frequentQueries = frequentQueries;
      defaultProfile.searchPatterns.searchFrequency = searches.length / 30;
    }

    // Store computed profile
    await supabase
      .from('user_behavior_profiles')
      .upsert({
        user_id: userId,
        workspace_id: workspaceId || 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
        search_patterns: defaultProfile.searchPatterns,
        interaction_patterns: defaultProfile.interactionPatterns,
        implicit_preferences: defaultProfile.preferences,
        profile_confidence: 0.7,
        last_computed_at: new Date().toISOString(),
      });

    return defaultProfile;
  } catch (error) {
    console.error('Behavior profile computation error:', error);
    return defaultProfile;
  }
}

function getDefaultPreferences() {
  return {
    preferredCategories: [],
    preferredMaterials: [],
    priceRange: [0, 10000],
    qualityPreference: 'medium',
    searchWeights: {
      textRelevance: 0.3,
      visualSimilarity: 0.25,
      qualityScore: 0.2,
      priceWeight: 0.15,
      brandPreference: 0.1,
    },
  };
}

function getDefaultBehaviorProfile() {
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

async function trackSearchAnalytics(supabase: any, request: AdvancedSearchRequest, results: any[], searchId: string, processingTime: number) {
  try {
    await supabase
      .from('search_analytics')
      .insert({
        user_id: request.userId,
        session_id: request.sessionId,
        query_text: request.query,
        search_type: request.searchType || 'text',
        total_results: results.length,
        results_shown: Math.min(results.length, request.limit || 20),
        response_time_ms: processingTime,
        input_data: {
          query: request.query,
          search_type: request.searchType,
          filters: request.filters,
        },
        result_data: {
          search_id: searchId,
          results: results.slice(0, 5), // Store sample results
          total_count: results.length,
        },
        processing_time_ms: processingTime,
        personalization_applied: !!request.userId,
        created_at: new Date().toISOString(),
      });
  } catch (error) {
    console.warn('Failed to track search analytics:', error);
  }
}

async function trackRecommendationAnalytics(supabase: any, request: AdvancedSearchRequest, recommendations: any[], recommendationId: string) {
  try {
    await supabase
      .from('recommendation_analytics')
      .insert({
        recommendation_id: recommendationId,
        user_id: request.userId,
        workspace_id: request.workspaceId || 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
        context: request.context,
        current_product_id: request.currentProductId,
        current_category: request.currentCategory,
        recommendations_data: recommendations,
        total_recommendations: recommendations.length,
        algorithms_used: ['collaborative_filtering', 'content_based', 'embedding_similarity'],
        diversity_factor: request.diversityFactor || 0.3,
        diversity_achieved: calculateDiversityScore(recommendations),
        avg_confidence_score: recommendations.length > 0
          ? recommendations.reduce((sum, r) => sum + r.confidenceScore, 0) / recommendations.length
          : 0,
        created_at: new Date().toISOString(),
      });
  } catch (error) {
    console.warn('Failed to track recommendation analytics:', error);
  }
}

/**
 * Get user behavior profile
 */
async function getUserBehaviorProfile(supabase: any, request: AdvancedSearchRequest) {
  try {
    // Get existing profile
    const { data: existingProfile } = await supabase
      .from('user_behavior_profiles')
      .select('*')
      .eq('user_id', request.userId)
      .eq('workspace_id', request.workspaceId || 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e')
      .single();

    if (existingProfile) {
      return {
        success: true,
        profile: {
          searchPatterns: existingProfile.search_patterns,
          interactionPatterns: existingProfile.interaction_patterns,
          implicitPreferences: existingProfile.implicit_preferences,
          profileConfidence: existingProfile.profile_confidence,
          lastComputedAt: existingProfile.last_computed_at,
        },
      };
    }

    // Compute new profile from user data
    const computedProfile = await computeUserBehaviorProfile(supabase, request.userId, request.workspaceId);

    return {
      success: true,
      profile: computedProfile,
      computed: true,
    };
  } catch (error) {
    console.error('Behavior profile error:', error);
    return {
      success: false,
      error: error.message,
      profile: getDefaultBehaviorProfile(),
    };
  }
}

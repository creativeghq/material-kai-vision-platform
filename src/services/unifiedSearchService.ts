import { supabase } from '@/integrations/supabase/client';

export interface UnifiedSearchRequest {
  query: string;
  type?: 'text' | 'image' | 'hybrid';
  context?: {
    roomType?: string;
    style?: string;
    categories?: string[];
  };
  maxResults?: number;
}

export interface UnifiedSearchResult {
  id: string;
  title: string;
  content: string;
  type: 'knowledge_document' | 'material' | 'embedded_material';
  confidence: number;
  source: string;
  metadata: Record<string, any>;
}

export interface UnifiedSearchResponse {
  success: boolean;
  query: string;
  results: UnifiedSearchResult[];
  suggestions: {
    materials: string[];
    applications: string[];
    relatedQueries: string[];
  };
  totalResults: number;
  processingTime: number;
}

export class UnifiedSearchService {
  /**
   * Unified search supporting text, image, and hybrid queries
   * Integrates PDF knowledge base, materials catalog, and vector similarity
   */
  static async search(request: UnifiedSearchRequest): Promise<UnifiedSearchResponse> {
    try {
      const startTime = Date.now();
      const { data: { user } } = await supabase.auth.getUser();
      
      // For image queries, convert image to description first
      let searchQuery = request.query;
      if (request.type === 'image') {
        searchQuery = await this.convertImageToDescription(request.query);
      }

      // Enhanced RAG search with unified approach
      const { data, error } = await supabase.functions.invoke('enhanced-rag-search', {
        body: {
          query: searchQuery,
          searchType: request.type || 'hybrid',
          maxResults: request.maxResults || 10,
          context: request.context,
          userId: user?.id
        }
      });

      if (error) {
        throw error;
      }

      const processingTime = Date.now() - startTime;

      // Format unified results from knowledge base, materials, and embeddings
      const allResults: UnifiedSearchResult[] = [
        ...(data.results.knowledgeBase || []).map((item: any) => ({
          id: item.id,
          title: item.title,
          content: item.content,
          type: 'knowledge_document' as const,
          confidence: item.confidence,
          source: 'pdf_knowledge_base',
          metadata: item.metadata || {}
        })),
        ...(data.results.materials || []).map((item: any) => ({
          id: item.id,
          title: item.title,
          content: item.content,
          type: 'material' as const,
          confidence: item.confidence,
          source: 'materials_catalog',
          metadata: {
            category: item.category,
            properties: item.properties
          }
        })),
        ...(data.results.embeddedMaterials || []).map((item: any) => ({
          id: item.id,
          title: item.title,
          content: item.content,
          type: 'embedded_material' as const,
          confidence: item.confidence,
          source: 'vector_embeddings',
          metadata: {
            category: item.category,
            properties: item.properties,
            embeddingType: item.embeddingType
          }
        }))
      ];

      // Sort by confidence
      allResults.sort((a, b) => b.confidence - a.confidence);

      // Generate suggestions from results
      const suggestions = this.generateSuggestions(allResults, request.query);

      return {
        success: true,
        query: request.query,
        results: allResults,
        suggestions,
        totalResults: allResults.length,
        processingTime
      };

    } catch (error) {
      console.error('Unified search error:', error);
      throw error;
    }
  }

  /**
   * Get material suggestions for 3D generation based on PDF knowledge
   */
  static async getMaterialSuggestionsFor3D(prompt: string, roomType?: string, style?: string): Promise<{
    materials: string[];
    context: string;
    source: string;
  }> {
    try {
      // Search knowledge base for relevant materials
      const searchTerms = [prompt, roomType, style].filter(Boolean).join(' ');
      
      const { data: knowledgeResults, error } = await supabase
        .from('enhanced_knowledge_base')
        .select('content, material_categories, search_keywords, metadata')
        .or(`content.ilike.%${searchTerms}%,search_keywords.cs.{${roomType},${style}}`)
        .eq('status', 'published')
        .limit(3);

      if (error) {
        console.error('Error fetching material suggestions:', error);
        return { materials: [], context: '', source: 'fallback' };
      }

      if (knowledgeResults && knowledgeResults.length > 0) {
        // Extract materials and create context
        const allMaterials = knowledgeResults.flatMap(entry => 
          [...(entry.material_categories || []), ...(entry.search_keywords || [])]
        );
        
        const uniqueMaterials = [...new Set(allMaterials)]
          .filter(material => material && material.length > 2)
          .slice(0, 8);

        const context = knowledgeResults
          .map(entry => entry.content.substring(0, 200))
          .join(' ');

        return {
          materials: uniqueMaterials,
          context,
          source: 'pdf_knowledge_base'
        };
      }

      // Fallback to materials catalog
      const { data: materialResults, error: matError } = await supabase
        .from('materials_catalog')
        .select('name, category, description')
        .limit(5);

      if (materialResults) {
        return {
          materials: materialResults.map(mat => mat.name),
          context: materialResults.map(mat => mat.description).join(' '),
          source: 'materials_catalog'
        };
      }

      return { materials: [], context: '', source: 'none' };

    } catch (error) {
      console.error('Error getting 3D material suggestions:', error);
      return { materials: [], context: '', source: 'error' };
    }
  }

  /**
   * Convert image to text description for search
   */
  private static async convertImageToDescription(imageData: string): Promise<string> {
    try {
      const { data, error } = await supabase.functions.invoke('material-recognition', {
        body: {
          imageData,
          options: {
            returnDescription: true
          }
        }
      });

      if (error) {
        throw error;
      }

      return data.description || 'material analysis';
    } catch (error) {
      console.error('Error converting image to description:', error);
      return 'material analysis';
    }
  }

  /**
   * Generate search suggestions from results
   */
  private static generateSuggestions(results: UnifiedSearchResult[], query: string): {
    materials: string[];
    applications: string[];
    relatedQueries: string[];
  } {
    const materials = new Set<string>();
    const applications = new Set<string>();
    const relatedQueries = new Set<string>();

    results.forEach(result => {
      // Extract materials from metadata
      if (result.metadata.category) {
        materials.add(result.metadata.category);
      }
      
      if (result.metadata.material_categories) {
        result.metadata.material_categories.forEach((cat: string) => materials.add(cat));
      }

      // Generate related queries
      const words = result.title.toLowerCase().split(' ');
      words.forEach(word => {
        if (word.length > 4 && word !== query.toLowerCase()) {
          relatedQueries.add(`${word} materials`);
        }
      });

      // Extract applications from content
      const content = result.content.toLowerCase();
      const applicationKeywords = ['flooring', 'wall', 'ceiling', 'kitchen', 'bathroom', 'commercial', 'residential'];
      applicationKeywords.forEach(keyword => {
        if (content.includes(keyword)) {
          applications.add(keyword);
        }
      });
    });

    return {
      materials: Array.from(materials).slice(0, 5),
      applications: Array.from(applications).slice(0, 5),
      relatedQueries: Array.from(relatedQueries).slice(0, 3)
    };
  }

  /**
   * Get search analytics for performance monitoring
   */
  static async getSearchAnalytics(timeRange = '7 days') {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(timeRange.split(' ')[0]));

      const { data, error } = await supabase
        .from('search_analytics')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const totalSearches = data.length;
      const avgResponseTime = data.reduce((sum, s) => sum + (s.response_time_ms || 0), 0) / data.length || 0;

      return {
        totalSearches,
        avgResponseTime: Math.round(avgResponseTime),
        recentSearches: data.slice(0, 10),
        searchTrends: this.analyzeSearchTrends(data)
      };

    } catch (error) {
      console.error('Error fetching search analytics:', error);
      throw error;
    }
  }

  private static analyzeSearchTrends(searchData: any[]) {
    const queryFrequency: Record<string, number> = {};
    
    searchData.forEach(search => {
      const query = search.query_text.toLowerCase();
      queryFrequency[query] = (queryFrequency[query] || 0) + 1;
    });

    return Object.entries(queryFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([query, count]) => ({ query, count }));
  }
}

export const unifiedSearchService = UnifiedSearchService;
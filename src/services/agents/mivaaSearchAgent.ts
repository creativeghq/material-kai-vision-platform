/**
 * MIVAA Search Agent - All Users
 * Search and retrieve materials from MIVAA database
 */

import { Agent, Task } from 'praisonai';
import { supabase } from '@/integrations/supabase/client';

export interface MivaaSearchAgentConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface MaterialSearchQuery {
  query: string;
  searchType?: 'semantic' | 'vector' | 'hybrid';
  limit?: number;
  filters?: Record<string, unknown>;
}

export interface MaterialSearchResult {
  query: string;
  materials: MaterialMatch[];
  totalResults: number;
  executionTime: number;
  timestamp: string;
  reasoning: string;
}

export interface MaterialMatch {
  id: string;
  name: string;
  description: string;
  properties: Record<string, unknown>;
  relevanceScore: number;
  source: string;
}

/**
 * MIVAA Search Agent for material database queries
 */
export class MivaaSearchAgent {
  private agent: Agent;

  constructor(_config: MivaaSearchAgentConfig = {}) {
    this.agent = new Agent({
      name: 'MIVAA Search Agent',
      role: 'Material Database Specialist',
      goal: 'Search and retrieve relevant materials from the MIVAA database',
      backstory: `You are a specialized material database search agent with expertise in
        material properties, classifications, and retrieval. You help users find the most
        relevant materials based on their queries and requirements.`,
      verbose: true,
    });
  }

  /**
   * Search for materials in MIVAA database
   */
  async searchMaterials(query: MaterialSearchQuery): Promise<MaterialSearchResult> {
    const startTime = Date.now();

    try {
      // Build search context
      const searchContext = await this.buildSearchContext(query);

      const searchPrompt = `
        User Query: ${query.query}
        
        Search Type: ${query.searchType || 'hybrid'}
        Maximum Results: ${query.limit || 10}
        
        ${searchContext}
        
        Based on the query, identify the most relevant materials and explain your reasoning.
        Consider material properties, use cases, and relevance to the user's needs.
      `;

      const task = new Task({
        name: 'Material Search Task',
        description: searchPrompt,
        expected_output: 'A list of relevant materials with reasoning for each match',
        agent: this.agent,
      });

      const agentResult = await this.agent.execute(task);
      const materials = await this.retrieveMaterials(query);
      const executionTime = Date.now() - startTime;

      return {
        query: query.query,
        materials,
        totalResults: materials.length,
        executionTime,
        timestamp: new Date().toISOString(),
        reasoning: String(agentResult),
      };
    } catch (error) {
      throw new Error(`Material search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Build search context from database
   */
  private async buildSearchContext(_query: MaterialSearchQuery): Promise<string> {
    try {
      // Get material categories and properties for context
      const { data: categories } = await supabase
        .from('material_categories')
        .select('id, name, description')
        .limit(10);

      const categoryContext = categories
        ? `Available categories: ${categories.map((c: any) => c.name).join(', ')}`
        : '';

      return categoryContext;
    } catch (error) {
      console.error('Error building search context:', error);
      return '';
    }
  }

  /**
   * Retrieve materials from database based on query
   */
  private async retrieveMaterials(query: MaterialSearchQuery): Promise<MaterialMatch[]> {
    try {
      const { data: materials } = await supabase
        .from('materials')
        .select('*')
        .limit(query.limit || 10);

      if (!materials) return [];

      return materials.map((material: any) => ({
        id: material.id,
        name: material.name,
        description: material.description || '',
        properties: material.properties || {},
        relevanceScore: this.calculateRelevance(material, query.query),
        source: 'MIVAA Database',
      }));
    } catch (error) {
      console.error('Error retrieving materials:', error);
      return [];
    }
  }

  /**
   * Calculate relevance score for a material
   */
  private calculateRelevance(material: any, query: string): number {
    let score = 0;

    const queryLower = query.toLowerCase();
    const nameLower = (material.name || '').toLowerCase();
    const descLower = (material.description || '').toLowerCase();

    // Exact name match
    if (nameLower === queryLower) score += 1;

    // Name contains query
    if (nameLower.includes(queryLower)) score += 0.7;

    // Description contains query
    if (descLower.includes(queryLower)) score += 0.4;

    // Property matches
    if (material.properties) {
      const propString = JSON.stringify(material.properties).toLowerCase();
      if (propString.includes(queryLower)) score += 0.3;
    }

    return Math.min(score, 1);
  }

  /**
   * Semantic search for materials
   */
  async semanticSearch(query: string, limit?: number): Promise<MaterialSearchResult> {
    return this.searchMaterials({
      query,
      searchType: 'semantic',
      limit: limit || 10,
    });
  }

  /**
   * Vector search for materials
   */
  async vectorSearch(query: string, limit?: number): Promise<MaterialSearchResult> {
    return this.searchMaterials({
      query,
      searchType: 'vector',
      limit: limit || 10,
    });
  }

  /**
   * Hybrid search combining multiple search types
   */
  async hybridSearch(query: string, limit?: number): Promise<MaterialSearchResult> {
    return this.searchMaterials({
      query,
      searchType: 'hybrid',
      limit: limit || 10,
    });
  }
}

export const createMivaaSearchAgent = (config?: MivaaSearchAgentConfig): MivaaSearchAgent => {
  return new MivaaSearchAgent(config);
};


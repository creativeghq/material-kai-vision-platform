/**
 * Search Agent
 * Default agent for all users - RAG-powered knowledge base search
 */

import { Agent, createTool } from '@mastra/core';
import { z } from 'zod';
import { UnifiedSearchService } from '../services/unifiedSearchService';
import { supabase } from '../integrations/supabase/client';

/**
 * Search Agent Tool: RAG Search
 * Searches the knowledge base using UnifiedSearchService with all 7 Python backend strategies
 */
const ragSearchTool = createTool({
  id: 'rag-search',
  description: 'Search the knowledge base for materials, products, and technical information using advanced RAG strategies',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
    searchType: z
      .enum(['semantic', 'visual', 'multi_vector', 'hybrid', 'material', 'keyword', 'all'])
      .default('all')
      .describe(
        'Search strategy: semantic (text embeddings), visual (CLIP embeddings), multi_vector (all embeddings), hybrid (semantic+keyword), material (property-based), keyword (exact match), all (parallel - 3-4x faster!)',
      ),
    maxResults: z.number().default(10).describe('Maximum number of results to return'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    results: z.array(z.any()).optional(),
    total: z.number().optional(),
    strategy: z.string().optional(),
    processingTime: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    try {
      const { query, searchType, maxResults } = context;

      // Get workspace_id from user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data: workspaceData } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .single();

      if (!workspaceData) {
        throw new Error('No workspace found for user');
      }

      // Execute search using UnifiedSearchService
      const results = await UnifiedSearchService.search({
        query,
        workspace_id: workspaceData.workspace_id,
        strategy: searchType,
        top_k: maxResults,
      });

      return {
        success: true,
        results: results.results,
        total: results.total_results,
        strategy: results.search_type,
        processingTime: results.processing_time,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed',
      };
    }
  },
});

/**
 * Search Agent Tool: Material Search
 * Searches specifically for materials using material properties
 */
const materialSearchTool = createTool({
  id: 'material-search',
  description: 'Search for materials by properties, specifications, and characteristics',
  inputSchema: z.object({
    query: z.string().describe('Material search query'),
    filters: z
      .object({
        category: z.string().optional(),
        properties: z.record(z.string(), z.any()).optional(),
      })
      .optional()
      .describe('Material filters'),
    limit: z.number().default(15).describe('Maximum number of materials to return'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    results: z.array(z.any()).optional(),
    total: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    try {
      const { query, filters, limit } = context;

      // Get workspace_id from user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data: workspaceData } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .single();

      if (!workspaceData) {
        throw new Error('No workspace found for user');
      }

      // Execute material search using UnifiedSearchService
      const results = await UnifiedSearchService.searchMaterials({
        query,
        workspace_id: workspaceData.workspace_id,
        filters,
        limit,
      });

      return {
        success: true,
        results: results.results,
        total: results.total_results,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Material search failed',
      };
    }
  },
});

/**
 * Search Agent Tool: Visual Search
 * Searches using image similarity (CLIP embeddings)
 */
const visualSearchTool = createTool({
  id: 'visual-search',
  description: 'Search for similar materials using image analysis',
  inputSchema: z.object({
    imageUrl: z.string().describe('URL of the image to search with'),
    queryText: z.string().optional().describe('Optional text query to combine with image'),
    maxResults: z.number().default(12).describe('Maximum number of results'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    results: z.array(z.any()).optional(),
    total: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    try {
      const { imageUrl, queryText, maxResults } = context;

      // Get workspace_id from user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data: workspaceData } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .single();

      if (!workspaceData) {
        throw new Error('No workspace found for user');
      }

      // Execute visual search using UnifiedSearchService
      const results = await UnifiedSearchService.searchVisual({
        workspace_id: workspaceData.workspace_id,
        image_url: imageUrl,
        query: queryText,
        limit: maxResults,
      });

      return {
        success: true,
        results: results.results,
        total: results.total_results,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Visual search failed',
      };
    }
  },
});

/**
 * Search Agent Configuration
 */
export const searchAgent = new Agent({
  name: 'SearchAgent',
  instructions: `You are the Search Agent for the Material Kai Vision Platform.

Your primary role is to help users find materials, products, and technical information from our knowledge base.

**Capabilities:**
- Semantic search using RAG (Retrieval Augmented Generation)
- Material property-based search
- Visual similarity search using images
- Hybrid search combining multiple strategies

**Search Strategies:**
1. **Semantic Search**: Use when users ask conceptual questions or need understanding
2. **Material Search**: Use when users specify material properties or technical specs
3. **Visual Search**: Use when users provide images or ask for visually similar materials
4. **Hybrid Search**: Combine multiple strategies for comprehensive results

**Guidelines:**
- Always provide relevant, accurate information from the knowledge base
- If you're unsure, use the 'all' search type to get comprehensive results
- Include images when they help illustrate the materials
- Explain material properties and specifications clearly
- Suggest related materials when appropriate

**Response Format:**
- Start with a brief summary of findings
- List materials with key properties
- Include relevant images
- Provide technical specifications when available
- Suggest next steps or related searches`,

  model: 'anthropic/claude-sonnet-4-20250514',

  tools: {
    ragSearch: ragSearchTool,
    materialSearch: materialSearchTool,
    visualSearch: visualSearchTool,
  },
});

/**
 * Execute search agent with user query
 */
export async function executeSearchAgent(params: {
  query: string;
  userId: string;
  userRole: string;
  threadId?: string;
  resourceId?: string;
  images?: string[];
}) {
  const { query, userId, threadId, resourceId, images } = params;

  try {
    // Build messages array
    const messages = [
      {
        role: 'user' as const,
        content: query,
      },
    ];

    // Add image context if provided
    if (images && images.length > 0) {
      messages.push({
        role: 'user' as const,
        content: `User has provided ${images.length} image(s) for visual search: ${images.join(', ')}`,
      });
    }

    // Execute agent with proper API
    const result = await searchAgent.generate(messages, {
      threadId: threadId || `user-${userId}`,
      resourceId: resourceId || `search-${Date.now()}`,
    });

    return {
      success: true,
      text: result.text,
      agentId: 'search',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Search agent execution failed',
      agentId: 'search',
      timestamp: new Date().toISOString(),
    };
  }
}


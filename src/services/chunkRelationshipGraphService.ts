/**
 * Chunk Relationship Graph Service
 * 
 * Builds and manages relationships between document chunks:
 * - Sequential relationships (chunk order)
 * - Semantic relationships (similar content)
 * - Hierarchical relationships (section structure)
 */

import { supabase } from '@/integrations/supabase/client';

export interface ChunkRelationship {
  id: string;
  source_id: string;
  target_id: string;
  relationship_type: 'sequential' | 'semantic' | 'hierarchical';
  confidence_score: number;
  relationship_strength: number;
  relationship_context: string;
  bidirectional: boolean;
  validation_status: 'pending' | 'validated' | 'rejected';
}

export interface ChunkNode {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  chunk_type: string;
  hierarchy_level: number;
  relationships: ChunkRelationship[];
}

export class ChunkRelationshipGraphService {
  /**
   * Build complete relationship graph for a document
   */
  static async buildRelationshipGraph(documentId: string): Promise<{
    sequential_count: number;
    semantic_count: number;
    hierarchical_count: number;
    total_relationships: number;
  }> {
    try {
      console.log(`🔗 Building relationship graph for document ${documentId}...`);

      // Get all chunks for the document
      const { data: chunks, error: chunksError } = await supabase
        .from('document_chunks')
        .select('id, chunk_index, content, metadata')
        .eq('document_id', documentId)
        .order('chunk_index');

      if (chunksError) throw chunksError;
      if (!chunks || chunks.length === 0) {
        return { sequential_count: 0, semantic_count: 0, hierarchical_count: 0, total_relationships: 0 };
      }

      let sequentialCount = 0;
      let semanticCount = 0;
      let hierarchicalCount = 0;

      // 1. Build sequential relationships (chunk order)
      sequentialCount = await this.buildSequentialRelationships(chunks);

      // 2. Build semantic relationships (similar content)
      semanticCount = await this.buildSemanticRelationships(chunks);

      // 3. Build hierarchical relationships (section structure)
      hierarchicalCount = await this.buildHierarchicalRelationships(chunks);

      const totalRelationships = sequentialCount + semanticCount + hierarchicalCount;

      console.log(`✅ Relationship graph built: ${sequentialCount} sequential, ${semanticCount} semantic, ${hierarchicalCount} hierarchical`);

      return {
        sequential_count: sequentialCount,
        semantic_count: semanticCount,
        hierarchical_count: hierarchicalCount,
        total_relationships: totalRelationships,
      };
    } catch (error) {
      console.error('Error building relationship graph:', error);
      throw error;
    }
  }

  /**
   * Build sequential relationships (chunk order)
   */
  private static async buildSequentialRelationships(chunks: any[]): Promise<number> {
    let count = 0;

    for (let i = 0; i < chunks.length - 1; i++) {
      const currentChunk = chunks[i];
      const nextChunk = chunks[i + 1];

      // Create sequential relationship
      const { error } = await supabase
        .from('knowledge_relationships')
        .upsert(
          {
            source_id: currentChunk.id,
            target_id: nextChunk.id,
            relationship_type: 'sequential',
            confidence_score: 0.95, // High confidence for sequential
            relationship_strength: 0.9,
            relationship_context: `Sequential: chunk ${currentChunk.chunk_index} → ${nextChunk.chunk_index}`,
            bidirectional: false,
            source_type: 'chunk',
            validation_status: 'validated',
          },
          { onConflict: 'source_id,target_id,relationship_type' }
        );

      if (!error) count++;
    }

    console.log(`📊 Created ${count} sequential relationships`);
    return count;
  }

  /**
   * Build semantic relationships (similar content)
   */
  private static async buildSemanticRelationships(chunks: any[]): Promise<number> {
    let count = 0;

    // Calculate semantic similarity between chunks
    for (let i = 0; i < chunks.length; i++) {
      for (let j = i + 1; j < chunks.length; j++) {
        const chunk1 = chunks[i];
        const chunk2 = chunks[j];

        // Calculate similarity
        const similarity = this.calculateContentSimilarity(chunk1.content, chunk2.content);

        // Only create relationship if similarity is above threshold
        if (similarity > 0.6) {
          const { error } = await supabase
            .from('knowledge_relationships')
            .upsert(
              {
                source_id: chunk1.id,
                target_id: chunk2.id,
                relationship_type: 'semantic',
                confidence_score: similarity,
                relationship_strength: similarity,
                relationship_context: `Semantic similarity: ${(similarity * 100).toFixed(1)}%`,
                bidirectional: true,
                source_type: 'chunk',
                validation_status: 'pending',
              },
              { onConflict: 'source_id,target_id,relationship_type' }
            );

          if (!error) count++;
        }
      }
    }

    console.log(`📊 Created ${count} semantic relationships`);
    return count;
  }

  /**
   * Build hierarchical relationships (section structure)
   */
  private static async buildHierarchicalRelationships(chunks: any[]): Promise<number> {
    let count = 0;

    // Group chunks by hierarchy level
    const hierarchyMap = new Map<number, any[]>();

    for (const chunk of chunks) {
      const hierarchyLevel = chunk.metadata?.hierarchy_level || 0;
      if (!hierarchyMap.has(hierarchyLevel)) {
        hierarchyMap.set(hierarchyLevel, []);
      }
      hierarchyMap.get(hierarchyLevel)!.push(chunk);
    }

    // Create parent-child relationships
    const sortedLevels = Array.from(hierarchyMap.keys()).sort();

    for (let i = 0; i < sortedLevels.length - 1; i++) {
      const currentLevel = sortedLevels[i];
      const nextLevel = sortedLevels[i + 1];

      const currentChunks = hierarchyMap.get(currentLevel) || [];
      const nextChunks = hierarchyMap.get(nextLevel) || [];

      // Link each parent to its children
      for (const parent of currentChunks) {
        for (const child of nextChunks) {
          // Check if child comes after parent
          if (child.chunk_index > parent.chunk_index) {
            const { error } = await supabase
              .from('knowledge_relationships')
              .upsert(
                {
                  source_id: parent.id,
                  target_id: child.id,
                  relationship_type: 'hierarchical',
                  confidence_score: 0.85,
                  relationship_strength: 0.8,
                  relationship_context: `Hierarchical: level ${currentLevel} → ${nextLevel}`,
                  bidirectional: false,
                  source_type: 'chunk',
                  validation_status: 'validated',
                },
                { onConflict: 'source_id,target_id,relationship_type' }
              );

            if (!error) count++;
            break; // Only link to first child
          }
        }
      }
    }

    console.log(`📊 Created ${count} hierarchical relationships`);
    return count;
  }

  /**
   * Calculate content similarity using simple text analysis
   */
  private static calculateContentSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;

    // Extract keywords (simple approach)
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    // Calculate Jaccard similarity
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Get related chunks for a given chunk
   */
  static async getRelatedChunks(chunkId: string, relationshipType?: string): Promise<ChunkRelationship[]> {
    try {
      let query = supabase
        .from('knowledge_relationships')
        .select('*')
        .or(`source_id.eq.${chunkId},target_id.eq.${chunkId}`);

      if (relationshipType) {
        query = query.eq('relationship_type', relationshipType);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting related chunks:', error);
      return [];
    }
  }

  /**
   * Get relationship statistics for a document
   */
  static async getRelationshipStats(documentId: string): Promise<{
    total_relationships: number;
    by_type: Record<string, number>;
    avg_confidence: number;
    validation_status: Record<string, number>;
  }> {
    try {
      // Get all chunks for the document
      const { data: chunks } = await supabase
        .from('document_chunks')
        .select('id')
        .eq('document_id', documentId);

      if (!chunks || chunks.length === 0) {
        return {
          total_relationships: 0,
          by_type: {},
          avg_confidence: 0,
          validation_status: {},
        };
      }

      const chunkIds = chunks.map(c => c.id);

      // Get all relationships for these chunks
      const { data: relationships } = await supabase
        .from('knowledge_relationships')
        .select('*')
        .in('source_id', chunkIds);

      if (!relationships) {
        return {
          total_relationships: 0,
          by_type: {},
          avg_confidence: 0,
          validation_status: {},
        };
      }

      // Calculate statistics
      const byType: Record<string, number> = {};
      const validationStatus: Record<string, number> = {};
      let totalConfidence = 0;

      for (const rel of relationships) {
        byType[rel.relationship_type] = (byType[rel.relationship_type] || 0) + 1;
        validationStatus[rel.validation_status] = (validationStatus[rel.validation_status] || 0) + 1;
        totalConfidence += rel.confidence_score || 0;
      }

      return {
        total_relationships: relationships.length,
        by_type: byType,
        avg_confidence: relationships.length > 0 ? totalConfidence / relationships.length : 0,
        validation_status: validationStatus,
      };
    } catch (error) {
      console.error('Error getting relationship stats:', error);
      throw error;
    }
  }
}


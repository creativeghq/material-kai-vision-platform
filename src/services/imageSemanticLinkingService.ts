/**
 * Image Semantic Linking Service
 * 
 * Links images to ALL semantically related chunks using embeddings
 * Extracts metadata and material properties from related chunks
 * Populates image analysis results with real data
 */

import { supabase } from '@/integrations/supabase/client';

export interface ImageChunkLink {
  imageId: string;
  chunkId: string;
  similarityScore: number;
  relationshipType: 'primary' | 'related' | 'context';
}

export interface ExtractedMetadata {
  sizes?: string[];
  factory?: string;
  group?: string;
  collection?: string;
  specifications?: Record<string, unknown>;
  productCodes?: string[];
  availability?: string;
  [key: string]: unknown;
}

export interface MaterialProperties {
  color?: string;
  finish?: string;
  pattern?: string;
  texture?: string;
  composition?: Record<string, unknown>;
  safetyRatings?: Record<string, unknown>;
  thermalProperties?: Record<string, unknown>;
  mechanicalProperties?: Record<string, unknown>;
  confidence?: number;
}

export class ImageSemanticLinkingService {
  private static readonly SIMILARITY_THRESHOLD = 0.65;
  private static readonly MAX_RELATED_CHUNKS = 50;

  /**
   * Link image to all semantically related chunks
   */
  static async linkImageToRelatedChunks(
    imageId: string,
    workspaceId: string,
  ): Promise<ImageChunkLink[]> {
    try {
      console.log(`🔗 Linking image ${imageId} to related chunks...`);

      // Get image visual embedding
      const { data: imageData, error: imageError } = await supabase
        .from('document_images')
        .select('visual_features, chunk_id')
        .eq('id', imageId)
        .single();

      if (imageError || !imageData) {
        console.error('❌ Failed to fetch image:', imageError);
        return [];
      }

      // Get all chunks in workspace with embeddings
      const { data: chunks, error: chunksError } = await supabase
        .from('document_chunks')
        .select('id, content')
        .eq('workspace_id', workspaceId)
        .limit(1000);

      if (chunksError || !chunks) {
        console.error('❌ Failed to fetch chunks:', chunksError);
        return [];
      }

      // Get embeddings for all chunks
      const { data: embeddings, error: embeddingsError } = await supabase
        .from('embeddings')
        .select('chunk_id, embedding')
        .eq('workspace_id', workspaceId)
        .in('chunk_id', chunks.map(c => c.id));

      if (embeddingsError || !embeddings) {
        console.error('❌ Failed to fetch embeddings:', embeddingsError);
        return [];
      }

      // Create embedding map
      const embeddingMap = new Map(embeddings.map(e => [e.chunk_id, e.embedding]));

      // Calculate similarities
      const links: ImageChunkLink[] = [];
      const imageEmbedding = this.extractImageEmbedding(imageData.visual_features);

      for (const chunk of chunks) {
        const chunkEmbedding = embeddingMap.get(chunk.id);
        if (!chunkEmbedding) continue;

        const similarity = this.cosineSimilarity(imageEmbedding, chunkEmbedding);

        if (similarity >= this.SIMILARITY_THRESHOLD) {
          links.push({
            imageId,
            chunkId: chunk.id,
            similarityScore: similarity,
            relationshipType: similarity > 0.85 ? 'primary' : 'related',
          });
        }
      }

      // Sort by similarity and limit
      links.sort((a, b) => b.similarityScore - a.similarityScore);
      const topLinks = links.slice(0, this.MAX_RELATED_CHUNKS);

      // Store relationships in database
      await this.storeChunkRelationships(topLinks);

      // Update image with count
      await supabase
        .from('document_images')
        .update({ related_chunks_count: topLinks.length })
        .eq('id', imageId);

      console.log(`✅ Linked image to ${topLinks.length} chunks`);
      return topLinks;
    } catch (error) {
      console.error('❌ Error linking image to chunks:', error);
      return [];
    }
  }

  /**
   * Extract metadata from related chunks
   */
  static async extractMetadataFromChunks(
    imageId: string,
    chunkIds: string[],
  ): Promise<ExtractedMetadata> {
    try {
      console.log(`📋 Extracting metadata from ${chunkIds.length} chunks...`);

      const { data: chunks, error } = await supabase
        .from('document_chunks')
        .select('content')
        .in('id', chunkIds);

      if (error || !chunks) {
        console.error('❌ Failed to fetch chunks:', error);
        return {};
      }

      const metadata: ExtractedMetadata = {};
      const combinedContent = chunks.map(c => c.content).join(' ');

      // Extract sizes
      const sizeMatches = combinedContent.match(/(\d+\s*[x×]\s*\d+(?:\s*[x×]\s*\d+)?)\s*(cm|mm|m|inches?|")?/gi);
      if (sizeMatches) {
        metadata.sizes = [...new Set(sizeMatches)];
      }

      // Extract factory/group/collection
      const factoryMatch = combinedContent.match(/(?:factory|manufacturer|made by|produced by):\s*([^\n,]+)/i);
      if (factoryMatch) metadata.factory = factoryMatch[1].trim();

      const groupMatch = combinedContent.match(/(?:group|collection|series|line):\s*([^\n,]+)/i);
      if (groupMatch) metadata.group = groupMatch[1].trim();

      const collectionMatch = combinedContent.match(/(?:collection):\s*([^\n,]+)/i);
      if (collectionMatch) metadata.collection = collectionMatch[1].trim();

      // Extract product codes
      const codeMatches = combinedContent.match(/(?:code|sku|product id|ref):\s*([A-Z0-9\-]+)/gi);
      if (codeMatches) {
        metadata.productCodes = codeMatches.map(m => m.split(':')[1].trim());
      }

      // Store in database
      await supabase
        .from('document_images')
        .update({ extracted_metadata: metadata })
        .eq('id', imageId);

      console.log(`✅ Extracted metadata:`, metadata);
      return metadata;
    } catch (error) {
      console.error('❌ Error extracting metadata:', error);
      return {};
    }
  }

  /**
   * Extract material properties from image and related chunks
   */
  static async extractMaterialProperties(
    imageId: string,
    chunkIds: string[],
  ): Promise<MaterialProperties> {
    try {
      console.log(`🎨 Extracting material properties...`);

      const { data: chunks, error } = await supabase
        .from('document_chunks')
        .select('content')
        .in('id', chunkIds);

      if (error || !chunks) {
        console.error('❌ Failed to fetch chunks:', error);
        return {};
      }

      const properties: MaterialProperties = {};
      const combinedContent = chunks.map(c => c.content).join(' ').toLowerCase();

      // Extract color
      const colors = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'gray', 'brown', 'beige', 'cream', 'navy', 'burgundy', 'gold', 'silver', 'copper', 'bronze'];
      const foundColors = colors.filter(c => combinedContent.includes(c));
      if (foundColors.length > 0) properties.color = foundColors.join(', ');

      // Extract finish
      const finishes = ['matte', 'gloss', 'satin', 'metallic', 'brushed', 'polished', 'textured', 'smooth'];
      const foundFinishes = finishes.filter(f => combinedContent.includes(f));
      if (foundFinishes.length > 0) properties.finish = foundFinishes.join(', ');

      // Extract pattern
      const patterns = ['solid', 'striped', 'geometric', 'floral', 'abstract', 'checkered', 'dotted', 'patterned'];
      const foundPatterns = patterns.filter(p => combinedContent.includes(p));
      if (foundPatterns.length > 0) properties.pattern = foundPatterns.join(', ');

      // Extract texture
      const textures = ['smooth', 'rough', 'textured', 'woven', 'knitted', 'embossed', 'velvet', 'silk', 'cotton', 'linen'];
      const foundTextures = textures.filter(t => combinedContent.includes(t));
      if (foundTextures.length > 0) properties.texture = foundTextures.join(', ');

      // Set confidence based on how many properties were found
      properties.confidence = Math.min(1.0, (Object.keys(properties).length - 1) / 4);

      // Store in database
      await supabase
        .from('document_images')
        .update({ material_properties: properties })
        .eq('id', imageId);

      console.log(`✅ Extracted properties:`, properties);
      return properties;
    } catch (error) {
      console.error('❌ Error extracting properties:', error);
      return {};
    }
  }

  /**
   * Helper: Extract embedding from visual features
   */
  private static extractImageEmbedding(visualFeatures: any): number[] {
    if (visualFeatures?.clip_512) {
      return visualFeatures.clip_512;
    }
    // Fallback: return zeros
    return new Array(512).fill(0);
  }

  /**
   * Helper: Calculate cosine similarity
   */
  private static cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Helper: Store chunk relationships
   */
  private static async storeChunkRelationships(links: ImageChunkLink[]): Promise<void> {
    const records = links.map(link => ({
      image_id: link.imageId,
      chunk_id: link.chunkId,
      similarity_score: link.similarityScore,
      relationship_type: link.relationshipType,
    }));

    // Delete existing relationships
    if (links.length > 0) {
      await supabase
        .from('image_chunk_relationships')
        .delete()
        .eq('image_id', links[0].imageId);
    }

    // Insert new relationships
    if (records.length > 0) {
      const { error } = await supabase
        .from('image_chunk_relationships')
        .insert(records);

      if (error) {
        console.error('❌ Error storing relationships:', error);
      }
    }
  }
}


/**
 * Edge Function: Process Image Semantic Linking
 * 
 * Links images to semantically related chunks and extracts metadata/properties
 * Triggered by: Manual call or webhook from PDF processing
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

interface ImageChunkLink {
  image_id: string;
  chunk_id: string;
  similarity_score: number;
  relationship_type: 'primary' | 'related' | 'context';
}

const SIMILARITY_THRESHOLD = 0.65;
const MAX_RELATED_CHUNKS = 50;

Deno.serve(async (req) => {
  try {
    const { imageId, workspaceId } = await req.json();

    if (!imageId || !workspaceId) {
      return new Response(
        JSON.stringify({ error: 'Missing imageId or workspaceId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    console.log(`🔗 Processing semantic linking for image: ${imageId}`);

    // Get image visual embedding
    const { data: imageData, error: imageError } = await supabase
      .from('document_images')
      .select('visual_features, chunk_id')
      .eq('id', imageId)
      .single();

    if (imageError || !imageData) {
      console.error('❌ Failed to fetch image:', imageError);
      return new Response(
        JSON.stringify({ error: 'Image not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get all chunks in workspace with embeddings
    const { data: chunks } = await supabase
      .from('document_chunks')
      .select('id, content')
      .eq('workspace_id', workspaceId)
      .limit(1000);

    if (!chunks || chunks.length === 0) {
      console.log('⚠️  No chunks found in workspace');
      return new Response(
        JSON.stringify({ relatedChunks: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get embeddings for all chunks
    const { data: embeddings } = await supabase
      .from('embeddings')
      .select('chunk_id, embedding')
      .eq('workspace_id', workspaceId)
      .in('chunk_id', chunks.map(c => c.id));

    if (!embeddings || embeddings.length === 0) {
      console.log('⚠️  No embeddings found');
      return new Response(
        JSON.stringify({ relatedChunks: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create embedding map
    const embeddingMap = new Map(embeddings.map(e => [e.chunk_id, e.embedding]));

    // Calculate similarities
    const links: ImageChunkLink[] = [];
    const imageEmbedding = extractImageEmbedding(imageData.visual_features);

    for (const chunk of chunks) {
      const chunkEmbedding = embeddingMap.get(chunk.id);
      if (!chunkEmbedding) continue;

      const similarity = cosineSimilarity(imageEmbedding, chunkEmbedding);

      if (similarity >= SIMILARITY_THRESHOLD) {
        links.push({
          image_id: imageId,
          chunk_id: chunk.id,
          similarity_score: similarity,
          relationship_type: similarity > 0.85 ? 'primary' : 'related',
        });
      }
    }

    // Sort by similarity and limit
    links.sort((a, b) => b.similarity_score - a.similarity_score);
    const topLinks = links.slice(0, MAX_RELATED_CHUNKS);

    // Store relationships
    if (topLinks.length > 0) {
      // Delete existing relationships
      await supabase
        .from('image_chunk_relationships')
        .delete()
        .eq('image_id', imageId);

      // Insert new relationships
      const records = topLinks.map(link => ({
        image_id: link.image_id,
        chunk_id: link.chunk_id,
        similarity_score: link.similarity_score,
        relationship_type: link.relationship_type,
      }));

      const { error: insertError } = await supabase
        .from('image_chunk_relationships')
        .insert(records);

      if (insertError) {
        console.error('❌ Error storing relationships:', insertError);
      }
    }

    // Extract metadata from related chunks
    const relatedChunkIds = topLinks.map(l => l.chunk_id);
    const { data: relatedChunks } = await supabase
      .from('document_chunks')
      .select('content')
      .in('id', relatedChunkIds);

    const metadata = extractMetadata(relatedChunks || []);
    const properties = extractMaterialProperties(relatedChunks || []);

    // Update image with extracted data
    const { error: updateError } = await supabase
      .from('document_images')
      .update({
        related_chunks_count: topLinks.length,
        extracted_metadata: metadata,
        material_properties: properties,
        quality_score: calculateQualityScore(topLinks, metadata, properties),
      })
      .eq('id', imageId);

    if (updateError) {
      console.error('❌ Error updating image:', updateError);
    }

    console.log(`✅ Linked image to ${topLinks.length} chunks`);

    return new Response(
      JSON.stringify({
        success: true,
        relatedChunks: topLinks.length,
        metadata: Object.keys(metadata).length,
        properties: Object.keys(properties).length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

function extractImageEmbedding(visualFeatures: any): number[] {
  if (visualFeatures?.clip_512) {
    return visualFeatures.clip_512;
  }
  return new Array(512).fill(0);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

function extractMetadata(chunks: any[]): Record<string, any> {
  const metadata: Record<string, any> = {};
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

  // Extract product codes
  const codeMatches = combinedContent.match(/(?:code|sku|product id|ref):\s*([A-Z0-9\-]+)/gi);
  if (codeMatches) {
    metadata.productCodes = codeMatches.map(m => m.split(':')[1].trim());
  }

  return metadata;
}

function extractMaterialProperties(chunks: any[]): Record<string, any> {
  const properties: Record<string, any> = {};
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

  properties.confidence = Math.min(1.0, (Object.keys(properties).length) / 4);

  return properties;
}

function calculateQualityScore(links: ImageChunkLink[], metadata: Record<string, any>, properties: Record<string, any>): number {
  let score = 0;

  // Score based on related chunks
  score += Math.min(0.4, (links.length / 50) * 0.4);

  // Score based on metadata
  score += Math.min(0.3, (Object.keys(metadata).length / 5) * 0.3);

  // Score based on properties
  const nonNullProps = Object.values(properties).filter(v => v && v !== 'unknown').length;
  score += Math.min(0.3, (nonNullProps / 4) * 0.3);

  return Math.round(score * 100) / 100;
}


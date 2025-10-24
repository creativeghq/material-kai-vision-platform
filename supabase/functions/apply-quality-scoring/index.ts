import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChunkCoherenceMetrics {
  semantic_completeness: number;
  boundary_quality: number;
  context_preservation: number;
  metadata_richness: number;
  structural_integrity: number;
  overall_coherence: number;
}

interface ChunkQualityData {
  chunk_id: string;
  coherence_score: number;
  coherence_metrics: ChunkCoherenceMetrics;
  quality_assessment: string;
  quality_recommendations: string[];
}

function calculateSemanticCompleteness(content: string): number {
  if (!content || content.length === 0) return 0;

  // Sentence analysis
  const sentences = content.match(/[.!?]+/g) || [];
  const words = content.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  // Better sentence ratio calculation
  const sentenceRatio = wordCount > 0 ? Math.min(sentences.length / (wordCount / 15), 1) : 0;

  // Paragraph structure
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
  const paragraphScore = Math.min(paragraphs.length / 3, 1); // Expect 1-3 paragraphs

  // Content completeness indicators
  const startsWithCapital = /^[A-Z]/.test(content.trim()) ? 1 : 0;
  const endsWithPunctuation = /[.!?]$/.test(content.trim()) ? 1 : 0;

  // Vocabulary diversity
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  const vocabularyDiversity = uniqueWords.size / Math.max(1, wordCount);

  return (
    sentenceRatio * 0.3 +
    paragraphScore * 0.25 +
    startsWithCapital * 0.15 +
    endsWithPunctuation * 0.15 +
    Math.min(vocabularyDiversity, 1) * 0.15
  );
}

function calculateBoundaryQuality(content: string): number {
  const trimmed = content.trim();
  if (!trimmed) return 0;

  let score = 0.3; // Base score for any content

  // Sentence boundary (most important)
  if (/[.!?]\s*$/.test(trimmed)) {
    score += 0.4;
  } else if (/[,;:]\s*$/.test(trimmed)) {
    score += 0.15; // Partial credit for clause boundaries
  }

  // Paragraph boundary
  if (/\n\s*$/.test(content)) {
    score += 0.2;
  }

  // Section/heading boundary
  const lastLine = trimmed.split('\n').pop() || '';
  if (/^#+\s+/.test(lastLine) || /^[A-Z][A-Z\s]+$/.test(lastLine)) {
    score += 0.15;
  }

  // Penalize mid-word breaks
  if (/\w$/.test(trimmed) && !/[.!?,;:\s]$/.test(trimmed)) {
    score -= 0.15;
  }

  return Math.max(0, Math.min(1, score));
}

function calculateContextPreservation(content: string): number {
  let score = 0.4;

  // Contextual references (pronouns, demonstratives)
  const contextualRefs = (content.match(/\b(this|these|that|those|aforementioned|aforementioned|such|same)\b/gi) || []).length;
  if (contextualRefs > 0) {
    score += Math.min(contextualRefs * 0.1, 0.25);
  }

  // Sequential/relational words
  const relationalWords = (content.match(/\b(following|below|above|next|previous|before|after|then|thus|therefore|however|moreover|furthermore)\b/gi) || []).length;
  if (relationalWords > 0) {
    score += Math.min(relationalWords * 0.08, 0.25);
  }

  // Vocabulary diversity (indicates good context)
  const words = content.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const uniqueWords = new Set(words);
  const wordDiversity = words.length > 0 ? uniqueWords.size / words.length : 0;

  // Optimal diversity is 0.6-0.8 (not too repetitive, not too scattered)
  if (wordDiversity >= 0.6 && wordDiversity <= 0.8) {
    score += 0.15;
  } else if (wordDiversity > 0.8) {
    score += 0.08; // Too scattered
  }

  return Math.min(score, 1);
}

function calculateMetadataRichness(metadata: Record<string, any>): number {
  if (!metadata || Object.keys(metadata).length === 0) return 0;

  const requiredFields = ['document_name', 'page_number', 'chunk_index', 'source_document'];
  const presentFields = requiredFields.filter(field => metadata[field] !== undefined).length;

  return presentFields / requiredFields.length;
}

function calculateStructuralIntegrity(content: string): number {
  let score = 0.3;

  const length = content.length;
  const words = content.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  // Content length scoring (optimal: 200-500 chars)
  if (length >= 200 && length <= 500) {
    score += 0.35;
  } else if (length > 500) {
    score += 0.25; // Longer is okay but not ideal for chunks
  } else if (length >= 100) {
    score += 0.15; // Minimum acceptable
  }

  // Word count scoring (optimal: 30-80 words)
  if (wordCount >= 30 && wordCount <= 80) {
    score += 0.25;
  } else if (wordCount > 80) {
    score += 0.15;
  } else if (wordCount >= 15) {
    score += 0.1;
  }

  // Formatting/structure indicators
  const hasFormatting = /[\*_\-\#\[\]]/.test(content) ? 0.1 : 0;
  score += hasFormatting;

  return Math.min(score, 1);
}

function getQualityAssessment(score: number): string {
  if (score >= 0.9) return 'Excellent';
  if (score >= 0.8) return 'Very Good';
  if (score >= 0.7) return 'Good';
  if (score >= 0.6) return 'Fair';
  if (score >= 0.5) return 'Acceptable';
  return 'Poor';
}

function scoreChunk(
  chunkId: string,
  content: string,
  metadata: Record<string, any>,
): ChunkQualityData {
  const semanticCompleteness = calculateSemanticCompleteness(content);
  const boundaryQuality = calculateBoundaryQuality(content);
  const contextPreservation = calculateContextPreservation(content);
  const metadataRichness = calculateMetadataRichness(metadata);
  const structuralIntegrity = calculateStructuralIntegrity(content);

  // Optimized weights for better quality assessment
  // Boundary quality is most important (prevents mid-sentence breaks)
  // Semantic completeness is second (ensures meaningful content)
  // Structural integrity is third (ensures proper chunk size)
  const overallCoherence = (
    boundaryQuality * 0.30 +
    semanticCompleteness * 0.28 +
    structuralIntegrity * 0.20 +
    contextPreservation * 0.15 +
    metadataRichness * 0.07
  );

  const coherenceScore = Math.round(overallCoherence * 100) / 100;
  const qualityAssessment = getQualityAssessment(coherenceScore);

  // Generate recommendations based on weak areas
  const recommendations: string[] = [];
  if (semanticCompleteness < 0.6) recommendations.push('Improve semantic completeness');
  if (boundaryQuality < 0.6) recommendations.push('Check chunk boundaries');
  if (structuralIntegrity < 0.6) recommendations.push('Adjust chunk size');
  if (contextPreservation < 0.5) recommendations.push('Add contextual references');

  return {
    chunk_id: chunkId,
    coherence_score: coherenceScore,
    coherence_metrics: {
      semantic_completeness: Math.round(semanticCompleteness * 100) / 100,
      boundary_quality: Math.round(boundaryQuality * 100) / 100,
      context_preservation: Math.round(contextPreservation * 100) / 100,
      metadata_richness: Math.round(metadataRichness * 100) / 100,
      structural_integrity: Math.round(structuralIntegrity * 100) / 100,
      overall_coherence: coherenceScore,
    },
    quality_assessment: qualityAssessment,
    quality_recommendations: recommendations,
  };
}

// ✅ NEW: Product Quality Scoring Functions
interface ProductQualityData {
  product_id: string;
  quality_score: number;
  confidence_score: number;
  completeness_score: number;
  quality_metrics: {
    name_quality: number;
    description_quality: number;
    metadata_richness: number;
    specification_completeness: number;
    overall_score: number;
  };
  quality_assessment: string;
}

function scoreProduct(
  productId: string,
  name: string,
  description: string,
  longDescription: string,
  specifications: any,
  metadata: any,
): ProductQualityData {
  // Name quality (0-1)
  const nameQuality = calculateProductNameQuality(name);

  // Description quality (0-1)
  const descriptionQuality = calculateProductDescriptionQuality(description, longDescription);

  // Metadata richness (0-1)
  const metadataRichness = calculateProductMetadataRichness(metadata);

  // Specification completeness (0-1)
  const specificationCompleteness = calculateProductSpecificationCompleteness(specifications);

  // Overall quality score
  const overallScore = (
    nameQuality * 0.25 +
    descriptionQuality * 0.35 +
    metadataRichness * 0.2 +
    specificationCompleteness * 0.2
  );

  // Confidence based on data availability
  const confidenceScore = calculateProductConfidence(name, description, specifications, metadata);

  // Completeness based on required fields
  const completenessScore = calculateProductCompleteness(name, description, specifications);

  return {
    product_id: productId,
    quality_score: Math.round(overallScore * 100) / 100,
    confidence_score: Math.round(confidenceScore * 100) / 100,
    completeness_score: Math.round(completenessScore * 100) / 100,
    quality_metrics: {
      name_quality: nameQuality,
      description_quality: descriptionQuality,
      metadata_richness: metadataRichness,
      specification_completeness: specificationCompleteness,
      overall_score: overallScore,
    },
    quality_assessment: getQualityAssessment(overallScore),
  };
}

function calculateProductNameQuality(name: string): number {
  if (!name || name.length === 0) return 0;

  // Check for meaningful name (not just "Product" or "Untitled")
  const genericNames = ['product', 'untitled', 'item', 'material', 'unknown'];
  const isGeneric = genericNames.some(generic =>
    name.toLowerCase().includes(generic.toLowerCase()),
  );

  if (isGeneric) return 0.3;

  // Length and structure quality
  const lengthScore = Math.min(name.length / 50, 1); // Optimal around 50 chars
  const hasUppercase = /[A-Z]/.test(name) ? 1 : 0.8;
  const hasNumbers = /\d/.test(name) ? 1 : 0.9; // Product codes are good

  return (lengthScore * 0.5 + hasUppercase * 0.3 + hasNumbers * 0.2);
}

function calculateProductDescriptionQuality(description: string, longDescription: string): number {
  const desc = description || '';
  const longDesc = longDescription || '';
  const combinedLength = desc.length + longDesc.length;

  if (combinedLength === 0) return 0;

  // Length quality (optimal 100-500 chars)
  const lengthScore = combinedLength < 50 ? combinedLength / 50 :
                     combinedLength > 500 ? Math.max(0.7, 1 - (combinedLength - 500) / 1000) : 1;

  // Content quality indicators
  const hasSpecifications = /\d+\s*(mm|cm|inch|x|×)/.test(desc + longDesc) ? 1 : 0.7;
  const hasMaterials = /(ceramic|porcelain|tile|wood|metal|glass|stone)/.test(desc + longDesc) ? 1 : 0.8;
  const hasFeatures = /(design|collection|series|finish|color|texture)/.test(desc + longDesc) ? 1 : 0.8;

  return (lengthScore * 0.4 + hasSpecifications * 0.25 + hasMaterials * 0.2 + hasFeatures * 0.15);
}

function calculateProductMetadataRichness(metadata: any): number {
  if (!metadata || typeof metadata !== 'object') return 0;

  const keys = Object.keys(metadata);
  const valueCount = keys.filter(key =>
    metadata[key] !== null &&
    metadata[key] !== undefined &&
    metadata[key] !== '',
  ).length;

  // Score based on number of meaningful metadata fields
  return Math.min(valueCount / 10, 1); // Optimal around 10 fields
}

function calculateProductSpecificationCompleteness(specifications: any): number {
  if (!specifications || typeof specifications !== 'object') return 0;

  const importantSpecs = ['dimensions', 'material', 'finish', 'color', 'size', 'weight'];
  const availableSpecs = importantSpecs.filter(spec =>
    specifications[spec] !== null &&
    specifications[spec] !== undefined &&
    specifications[spec] !== '',
  ).length;

  return availableSpecs / importantSpecs.length;
}

function calculateProductConfidence(name: string, description: string, specifications: any, metadata: any): number {
  const hasName = name && name.length > 0 ? 1 : 0;
  const hasDescription = description && description.length > 0 ? 1 : 0;
  const hasSpecs = specifications && Object.keys(specifications).length > 0 ? 1 : 0;
  const hasMetadata = metadata && Object.keys(metadata).length > 0 ? 1 : 0;

  return (hasName * 0.4 + hasDescription * 0.3 + hasSpecs * 0.2 + hasMetadata * 0.1);
}

function calculateProductCompleteness(name: string, description: string, specifications: any): number {
  const requiredFields = [
    name && name.length > 0,
    description && description.length > 0,
    specifications && Object.keys(specifications).length > 0,
  ];

  const completedFields = requiredFields.filter(Boolean).length;
  return completedFields / requiredFields.length;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      document_id,
      include_products = false,
      include_images = false,
      comprehensive = false,
    } = await req.json();

    if (!document_id) {
      return new Response(
        JSON.stringify({ error: 'document_id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    console.log(`🎯 Enhanced quality scoring for document: ${document_id}`);
    console.log(`📋 Options: products=${include_products}, images=${include_images}, comprehensive=${comprehensive}`);
    console.log('📋 Request body received:', JSON.stringify({ document_id, include_products, include_images, comprehensive }));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    );

    console.log(`🎯 Fetching chunks for document ${document_id}...`);

    // Fetch all chunks with pagination
    let allChunks: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: chunks, error: fetchError } = await supabase
        .from('document_chunks')
        .select('*')
        .eq('document_id', document_id)
        .order('chunk_index')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (fetchError) {
        console.error('Failed to fetch chunks:', fetchError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch chunks', details: fetchError }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (!chunks || chunks.length === 0) {
        hasMore = false;
      } else {
        allChunks = allChunks.concat(chunks);
        console.log(`📖 Fetched page ${page + 1}: ${chunks.length} chunks (total: ${allChunks.length})`);
        page++;
        hasMore = chunks.length === pageSize;
      }
    }

    if (allChunks.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No chunks found', scored: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    console.log(`📊 Scoring ${allChunks.length} chunks...`);

    let scoredCount = 0;
    for (let i = 0; i < allChunks.length; i++) {
      const chunk = allChunks[i];
      try {
        const qualityData = scoreChunk(
          chunk.id,
          chunk.content || '',
          chunk.metadata || {},
        );

        const { error: updateError } = await supabase
          .from('document_chunks')
          .update({
            coherence_score: qualityData.coherence_score,
            coherence_metrics: qualityData.coherence_metrics,
            quality_assessment: qualityData.quality_assessment,
            quality_recommendations: qualityData.quality_recommendations,
          })
          .eq('id', chunk.id);

        if (!updateError) {
          scoredCount++;
        } else {
          console.error(`Failed to update chunk ${chunk.id}:`, updateError);
        }

        if ((i + 1) % 100 === 0) {
          console.log(`📊 Scored ${i + 1}/${allChunks.length} chunks`);
        }
      } catch (error) {
        console.error(`Error scoring chunk ${chunk.id}:`, error);
      }
    }

    console.log(`✅ Chunk quality scoring completed: ${scoredCount}/${allChunks.length} chunks scored`);

    // ✅ NEW: Product Quality Scoring
    let scoredProducts = 0;
    let totalProducts = 0;

    if (include_products) {
      console.log('🏷️ Starting product quality scoring...');

      // Fetch all products for the document
      const { data: allProducts, error: productsError } = await supabase
        .from('products')
        .select('id, name, description, long_description, specifications, metadata')
        .eq('source_document_id', document_id);

      if (productsError) {
        console.error('Error fetching products:', productsError);
      } else if (allProducts && allProducts.length > 0) {
        console.log(`📊 Found ${allProducts.length} products to score`);
        totalProducts = allProducts.length;

        for (let i = 0; i < allProducts.length; i++) {
          const product = allProducts[i];
          try {
            const productQualityData = scoreProduct(
              product.id,
              product.name || '',
              product.description || '',
              product.long_description || '',
              product.specifications || {},
              product.metadata || {},
            );

            const { error: updateError } = await supabase
              .from('products')
              .update({
                quality_score: productQualityData.quality_score,
                confidence_score: productQualityData.confidence_score,
                completeness_score: productQualityData.completeness_score,
                quality_metrics: productQualityData.quality_metrics,
                quality_assessment: productQualityData.quality_assessment,
              })
              .eq('id', product.id);

            if (!updateError) {
              scoredProducts++;
            } else {
              console.error(`Failed to update product ${product.id}:`, updateError);
            }

            if ((i + 1) % 10 === 0) {
              console.log(`📊 Scored ${i + 1}/${allProducts.length} products`);
            }
          } catch (error) {
            console.error(`Error scoring product ${product.id}:`, error);
          }
        }
      }

      console.log(`✅ Product quality scoring completed: ${scoredProducts}/${totalProducts} products scored`);
    }

    // Calculate overall document quality score
    let documentQualityScore = 0;
    if (scoredCount > 0) {
      const { data: avgChunkQuality } = await supabase
        .from('document_chunks')
        .select('coherence_score')
        .eq('document_id', document_id)
        .not('coherence_score', 'is', null);

      if (avgChunkQuality && avgChunkQuality.length > 0) {
        const avgScore = avgChunkQuality.reduce((sum: number, chunk: any) =>
          sum + (chunk.coherence_score || 0), 0) / avgChunkQuality.length;
        documentQualityScore = Math.round(avgScore * 100) / 100;
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Enhanced quality scoring completed',
        document_id,
        total_chunks: allChunks.length,
        scored_chunks: scoredCount,
        total_products: totalProducts,
        scored_products: scoredProducts,
        document_quality_score: documentQualityScore,
        options: {
          include_products,
          include_images,
          comprehensive,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});


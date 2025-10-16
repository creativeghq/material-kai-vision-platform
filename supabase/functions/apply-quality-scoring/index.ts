import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  metadata: Record<string, any>
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
  if (semanticCompleteness < 0.6) recommendations.push("Improve semantic completeness");
  if (boundaryQuality < 0.6) recommendations.push("Check chunk boundaries");
  if (structuralIntegrity < 0.6) recommendations.push("Adjust chunk size");
  if (contextPreservation < 0.5) recommendations.push("Add contextual references");

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { document_id } = await req.json();

    if (!document_id) {
      return new Response(
        JSON.stringify({ error: "document_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    console.log(`🎯 Fetching chunks for document ${document_id}...`);

    // Fetch all chunks with pagination
    let allChunks: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: chunks, error: fetchError } = await supabase
        .from("document_chunks")
        .select("*")
        .eq("document_id", document_id)
        .order("chunk_index")
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (fetchError) {
        console.error("Failed to fetch chunks:", fetchError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch chunks", details: fetchError }),
          { status: 500, headers: { "Content-Type": "application/json" } }
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
        JSON.stringify({ message: "No chunks found", scored: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`📊 Scoring ${allChunks.length} chunks...`);

    let scoredCount = 0;
    for (let i = 0; i < allChunks.length; i++) {
      const chunk = allChunks[i];
      try {
        const qualityData = scoreChunk(
          chunk.id,
          chunk.content || "",
          chunk.metadata || {}
        );

        const { error: updateError } = await supabase
          .from("document_chunks")
          .update({
            coherence_score: qualityData.coherence_score,
            coherence_metrics: qualityData.coherence_metrics,
            quality_assessment: qualityData.quality_assessment,
            quality_recommendations: qualityData.quality_recommendations,
          })
          .eq("id", chunk.id);

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

    console.log(`✅ Quality scoring completed: ${scoredCount}/${allChunks.length} chunks scored`);

    return new Response(
      JSON.stringify({
        message: "Quality scoring completed",
        document_id,
        total_chunks: allChunks.length,
        scored_chunks: scoredCount,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});


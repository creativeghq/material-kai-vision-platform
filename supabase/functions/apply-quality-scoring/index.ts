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

  const sentences = content.match(/[.!?]+/g) || [];
  const sentenceRatio = sentences.length / Math.max(1, content.split(/\s+/).length / 10);

  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
  const hasStructure = paragraphs.length > 0 ? 1 : 0;

  const startsWithCapital = /^[A-Z]/.test(content.trim()) ? 1 : 0;
  const endsWithPunctuation = /[.!?]$/.test(content.trim()) ? 1 : 0;

  return (
    Math.min(sentenceRatio, 1) * 0.4 +
    hasStructure * 0.3 +
    startsWithCapital * 0.15 +
    endsWithPunctuation * 0.15
  );
}

function calculateBoundaryQuality(content: string): number {
  const endsSentence = /[.!?]\s*$/.test(content.trim()) ? 0.5 : 0;
  const endsParagraph = /\n\s*$/.test(content) ? 0.3 : 0;
  const endsSection = /^#+\s+/.test(content.trim().split('\n').pop() || '') ? 0.2 : 0;
  const midWordBreak = /\w$/.test(content.trim()) ? -0.1 : 0;

  return Math.max(0, Math.min(1, endsSentence + endsParagraph + endsSection + midWordBreak));
}

function calculateContextPreservation(content: string): number {
  let score = 0.5;

  if (/\b(this|these|that|those|aforementioned)\b/i.test(content)) {
    score += 0.2;
  }

  if (/\b(following|below|above|next|previous)\b/i.test(content)) {
    score += 0.2;
  }

  const words = content.toLowerCase().split(/\s+/);
  const uniqueWords = new Set(words);
  const wordDiversity = uniqueWords.size / words.length;

  if (wordDiversity > 0.5 && wordDiversity < 0.9) {
    score += 0.1;
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
  let score = 0.5;

  if (content.length > 50) score += 0.2;
  if (content.length > 200) score += 0.15;
  if (content.split(/\s+/).length > 20) score += 0.15;

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

  const overallCoherence = (
    semanticCompleteness * 0.25 +
    boundaryQuality * 0.25 +
    contextPreservation * 0.2 +
    metadataRichness * 0.15 +
    structuralIntegrity * 0.15
  );

  const coherenceScore = Math.round(overallCoherence * 100) / 100;
  const qualityAssessment = getQualityAssessment(coherenceScore);

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
    quality_recommendations: [],
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


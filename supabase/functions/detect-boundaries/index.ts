import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface Chunk {
  id: string;
  text: string;
  page_number?: number;
}

interface DetectBoundariesRequest {
  chunks: Chunk[];
  min_boundary_score?: number;
  clustering_enabled?: boolean;
  num_clusters?: number;
}

interface BoundaryDetectionResult {
  chunk_id: string;
  chunk_text: string;
  boundary_score: number;
  boundary_type: string;
  semantic_similarity: number;
  is_product_boundary: boolean;
  reasoning: string;
}

const calculateBoundaryScore = (text: string): number => {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  let score = 0.3; // Base score

  // Sentence boundary (most important)
  if (/[.!?]\s*$/.test(trimmed)) {
    score += 0.4;
  } else if (/[,;:]\s*$/.test(trimmed)) {
    score += 0.15;
  }

  // Paragraph boundary
  if (/\n\s*$/.test(text)) {
    score += 0.2;
  }

  // Section/heading boundary
  const lastLine = trimmed.split("\n").pop() || "";
  if (/^#+\s+/.test(lastLine) || /^[A-Z][A-Z\s]+$/.test(lastLine)) {
    score += 0.15;
  }

  // Penalize mid-word breaks
  if (/\w$/.test(trimmed) && !/[.!?,;:\s]$/.test(trimmed)) {
    score -= 0.15;
  }

  return Math.max(0, Math.min(1, score));
};

const determineBoundaryType = (
  text: string,
  boundaryScore: number,
  semanticSimilarity: number
): string => {
  if (boundaryScore < 0.3) return "weak";
  if (/^#+\s+/.test(text.trim())) return "section";
  if (/\n\s*$/.test(text)) return "paragraph";
  if (/[.!?]\s*$/.test(text.trim())) return "sentence";
  if (semanticSimilarity < 0.5) return "semantic";
  return "weak";
};

const isProductBoundary = (
  text: string,
  boundaryScore: number,
  semanticSimilarity: number
): boolean => {
  return boundaryScore > 0.6 && semanticSimilarity < 0.6;
};

const generateReasoning = (
  boundaryScore: number,
  boundaryType: string,
  semanticSimilarity: number
): string => {
  const parts: string[] = [];

  if (boundaryScore > 0.7) {
    parts.push("Strong boundary marker");
  } else if (boundaryScore > 0.4) {
    parts.push("Moderate boundary marker");
  } else {
    parts.push("Weak boundary marker");
  }

  if (semanticSimilarity < 0.5) {
    parts.push("Low semantic similarity to next chunk");
  } else if (semanticSimilarity > 0.8) {
    parts.push("High semantic similarity to next chunk");
  }

  return parts.join("; ");
};

const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
};

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const body = await req.json();
    const request: DetectBoundariesRequest = body;

    if (!request.chunks || request.chunks.length === 0) {
      return new Response(
        JSON.stringify({ error: "chunks array is required and cannot be empty" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const startTime = Date.now();
    const results: BoundaryDetectionResult[] = [];

    // Process each chunk
    for (let i = 0; i < request.chunks.length; i++) {
      const chunk = request.chunks[i];

      // Calculate boundary score
      const boundaryScore = calculateBoundaryScore(chunk.text);

      // Calculate semantic similarity to next chunk
      // For now, use a simple heuristic based on text length similarity
      let semanticSimilarity = 0;
      if (i < request.chunks.length - 1) {
        const nextChunk = request.chunks[i + 1];
        const lengthRatio = Math.min(
          chunk.text.length,
          nextChunk.text.length
        ) / Math.max(chunk.text.length, nextChunk.text.length);
        // Similarity based on length and first word match
        const firstWordMatch =
          chunk.text.split(" ")[0] === nextChunk.text.split(" ")[0] ? 0.3 : 0;
        semanticSimilarity = lengthRatio * 0.7 + firstWordMatch;
      }

      // Determine boundary type
      const boundaryType = determineBoundaryType(
        chunk.text,
        boundaryScore,
        semanticSimilarity
      );

      // Determine if this is a product boundary
      const isProduct = isProductBoundary(
        chunk.text,
        boundaryScore,
        semanticSimilarity
      );

      // Generate reasoning
      const reasoning = generateReasoning(
        boundaryScore,
        boundaryType,
        semanticSimilarity
      );

      results.push({
        chunk_id: chunk.id,
        chunk_text: chunk.text,
        boundary_score: boundaryScore,
        boundary_type: boundaryType,
        semantic_similarity: semanticSimilarity,
        is_product_boundary: isProduct,
        reasoning,
      });
    }

    // Filter by minimum boundary score if specified
    const minScore = request.min_boundary_score || 0;
    const filteredResults = results.filter((r) => r.boundary_score >= minScore);

    const response = {
      results: filteredResults,
      total_chunks: request.chunks.length,
      detected_boundaries: filteredResults.length,
      product_boundaries: filteredResults.filter((r) => r.is_product_boundary)
        .length,
      processing_time_ms: Date.now() - startTime,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Boundary detection error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});


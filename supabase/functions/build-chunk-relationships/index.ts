import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChunkData {
  id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, any>;
}

// Calculate content similarity using Jaccard similarity
function calculateSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;

  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
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

    console.log(`🔗 Building chunk relationships for document ${document_id}...`);

    // Fetch all chunks for the document
    const { data: chunks, error: chunksError } = await supabase
      .from("document_chunks")
      .select("id, chunk_index, content, metadata")
      .eq("document_id", document_id)
      .order("chunk_index");

    if (chunksError) {
      console.error("Failed to fetch chunks:", chunksError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch chunks", details: chunksError }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!chunks || chunks.length === 0) {
      return new Response(
        JSON.stringify({ message: "No chunks found", relationships_created: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`📊 Processing ${chunks.length} chunks...`);

    let sequentialCount = 0;
    let semanticCount = 0;
    let hierarchicalCount = 0;

    // 1. Build sequential relationships
    console.log("🔗 Building sequential relationships...");
    for (let i = 0; i < chunks.length - 1; i++) {
      const currentChunk = chunks[i];
      const nextChunk = chunks[i + 1];

      const { error } = await supabase
        .from("knowledge_relationships")
        .upsert(
          {
            source_id: currentChunk.id,
            target_id: nextChunk.id,
            relationship_type: "sequential",
            confidence_score: 0.95,
            relationship_strength: 0.9,
            relationship_context: `Sequential: chunk ${currentChunk.chunk_index} → ${nextChunk.chunk_index}`,
            bidirectional: false,
            source_type: "chunk",
            validation_status: "validated",
          },
          { onConflict: "source_id,target_id,relationship_type" }
        );

      if (!error) sequentialCount++;
    }

    console.log(`✅ Created ${sequentialCount} sequential relationships`);

    // 2. Build semantic relationships (sample-based for performance)
    console.log("🔗 Building semantic relationships...");
    const sampleSize = Math.min(chunks.length, 50); // Sample for large documents
    const step = Math.max(1, Math.floor(chunks.length / sampleSize));

    for (let i = 0; i < chunks.length; i += step) {
      for (let j = i + 1; j < chunks.length; j += step) {
        const chunk1 = chunks[i];
        const chunk2 = chunks[j];

        const similarity = calculateSimilarity(chunk1.content, chunk2.content);

        if (similarity > 0.6) {
          const { error } = await supabase
            .from("knowledge_relationships")
            .upsert(
              {
                source_id: chunk1.id,
                target_id: chunk2.id,
                relationship_type: "semantic",
                confidence_score: similarity,
                relationship_strength: similarity,
                relationship_context: `Semantic similarity: ${(similarity * 100).toFixed(1)}%`,
                bidirectional: true,
                source_type: "chunk",
                validation_status: "pending",
              },
              { onConflict: "source_id,target_id,relationship_type" }
            );

          if (!error) semanticCount++;
        }
      }
    }

    console.log(`✅ Created ${semanticCount} semantic relationships`);

    // 3. Build hierarchical relationships
    console.log("🔗 Building hierarchical relationships...");
    const hierarchyMap = new Map<number, ChunkData[]>();

    for (const chunk of chunks) {
      const hierarchyLevel = chunk.metadata?.hierarchy_level || 0;
      if (!hierarchyMap.has(hierarchyLevel)) {
        hierarchyMap.set(hierarchyLevel, []);
      }
      hierarchyMap.get(hierarchyLevel)!.push(chunk);
    }

    const sortedLevels = Array.from(hierarchyMap.keys()).sort();

    for (let i = 0; i < sortedLevels.length - 1; i++) {
      const currentLevel = sortedLevels[i];
      const nextLevel = sortedLevels[i + 1];

      const currentChunks = hierarchyMap.get(currentLevel) || [];
      const nextChunks = hierarchyMap.get(nextLevel) || [];

      for (const parent of currentChunks) {
        for (const child of nextChunks) {
          if (child.chunk_index > parent.chunk_index) {
            const { error } = await supabase
              .from("knowledge_relationships")
              .upsert(
                {
                  source_id: parent.id,
                  target_id: child.id,
                  relationship_type: "hierarchical",
                  confidence_score: 0.85,
                  relationship_strength: 0.8,
                  relationship_context: `Hierarchical: level ${currentLevel} → ${nextLevel}`,
                  bidirectional: false,
                  source_type: "chunk",
                  validation_status: "validated",
                },
                { onConflict: "source_id,target_id,relationship_type" }
              );

            if (!error) hierarchicalCount++;
            break;
          }
        }
      }
    }

    console.log(`✅ Created ${hierarchicalCount} hierarchical relationships`);

    const totalRelationships = sequentialCount + semanticCount + hierarchicalCount;

    console.log(`✅ Chunk relationship graph built: ${totalRelationships} total relationships`);

    return new Response(
      JSON.stringify({
        message: "Chunk relationships built successfully",
        document_id: document_id,
        total_chunks: chunks.length,
        sequential_relationships: sequentialCount,
        semantic_relationships: semanticCount,
        hierarchical_relationships: hierarchicalCount,
        total_relationships: totalRelationships,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as any).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});


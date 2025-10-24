import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmbeddingStabilityData {
  chunk_id: string;
  stability_score: number;
  variance_score: number;
  consistency_score: number;
  anomaly_detected: boolean;
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// Calculate variance in embedding values
function calculateVariance(embedding: number[]): number {
  if (embedding.length === 0) return 0;

  const mean = embedding.reduce((a, b) => a + b, 0) / embedding.length;
  const variance = embedding.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / embedding.length;
  const stdDev = Math.sqrt(variance);

  // Normalize to 0-1 range (typical embeddings have stdDev around 0.1-0.3)
  return Math.min(stdDev / 0.5, 1);
}

// Detect anomalies in embedding
function detectAnomaly(embedding: number[], mean: number, stdDev: number): boolean {
  // Check if any value is more than 3 standard deviations from mean
  return embedding.some(val => Math.abs(val - mean) > 3 * stdDev);
}

// Calculate embedding stability score
function calculateStabilityScore(
  embedding: number[],
  similarChunks: number[][],
): number {
  if (similarChunks.length === 0) return 0.5; // Default if no similar chunks

  // Calculate average similarity to similar chunks
  const similarities = similarChunks.map(chunk => cosineSimilarity(embedding, chunk));
  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

  // Stability is based on consistency with similar chunks
  // High similarity = high stability
  return Math.max(0, Math.min(1, avgSimilarity));
}

// Calculate consistency score
function calculateConsistencyScore(embedding: number[]): number {
  if (embedding.length === 0) return 0;

  // Check for NaN or Infinity values
  const hasInvalidValues = embedding.some(val => !isFinite(val));
  if (hasInvalidValues) return 0;

  // Check magnitude (embeddings should be normalized)
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  const expectedMagnitude = Math.sqrt(embedding.length); // For normalized embeddings

  // Score based on how close to expected magnitude
  const magnitudeRatio = magnitude / expectedMagnitude;
  const magnitudeScore = Math.max(0, 1 - Math.abs(magnitudeRatio - 1));

  // Check distribution (should be relatively uniform)
  const mean = embedding.reduce((a, b) => a + b, 0) / embedding.length;
  const variance = embedding.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / embedding.length;
  const stdDev = Math.sqrt(variance);

  // Score based on variance (should be moderate)
  const varianceScore = Math.max(0, 1 - Math.abs(stdDev - 0.2) / 0.3);

  return (magnitudeScore * 0.6 + varianceScore * 0.4);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { document_id } = await req.json();

    if (!document_id) {
      return new Response(
        JSON.stringify({ error: 'document_id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    );

    console.log(`🎯 Analyzing embedding stability for document ${document_id}...`);

    // Fetch all chunks for the document
    const { data: chunks, error: fetchError } = await supabase
      .from('document_chunks')
      .select('id, content, metadata')
      .eq('document_id', document_id)
      .order('chunk_index');

    if (fetchError) {
      console.error('Failed to fetch chunks:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch chunks', details: fetchError }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (!chunks || chunks.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No chunks found', analyzed: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    console.log(`📊 Analyzing ${chunks.length} chunks for stability...`);

    // For now, generate placeholder stability metrics
    // In production, this would use actual embeddings from your embedding service
    const stabilityMetrics: EmbeddingStabilityData[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Generate pseudo-embedding based on content (for testing)
      const contentHash = chunk.content.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0);

      // Create deterministic but varied embedding
      const embedding = Array(1536).fill(0).map((_, idx) => {
        const seed = contentHash + idx;
        return Math.sin(seed / 1000) * 0.1;
      });

      const variance = calculateVariance(embedding);
      const mean = embedding.reduce((a, b) => a + b, 0) / embedding.length;
      const stdDev = Math.sqrt(embedding.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / embedding.length);
      const anomaly = detectAnomaly(embedding, mean, stdDev);
      const consistency = calculateConsistencyScore(embedding);

      // Stability score based on content characteristics
      const contentLength = chunk.content.length;
      const hasMetadata = chunk.metadata && Object.keys(chunk.metadata).length > 0;
      const stabilityScore = Math.min(1, (contentLength / 500) * 0.6 + (hasMetadata ? 0.4 : 0.2));

      stabilityMetrics.push({
        chunk_id: chunk.id,
        stability_score: Math.round(stabilityScore * 100) / 100,
        variance_score: Math.round(variance * 100) / 100,
        consistency_score: Math.round(consistency * 100) / 100,
        anomaly_detected: anomaly,
      });

      if ((i + 1) % 100 === 0) {
        console.log(`📊 Analyzed ${i + 1}/${chunks.length} chunks`);
      }
    }

    // Store stability metrics
    console.log(`💾 Storing ${stabilityMetrics.length} stability metrics...`);

    const { error: insertError } = await supabase
      .from('embedding_stability_metrics')
      .upsert(
        stabilityMetrics.map(metric => ({
          chunk_id: metric.chunk_id,
          document_id: document_id,
          stability_score: metric.stability_score,
          variance_score: metric.variance_score,
          consistency_score: metric.consistency_score,
          anomaly_detected: metric.anomaly_detected,
          batch_id: `batch_${Date.now()}`,
        })),
        { onConflict: 'chunk_id' },
      );

    if (insertError) {
      console.error('Failed to store stability metrics:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to store metrics', details: insertError }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    console.log(`✅ Embedding stability analysis completed: ${stabilityMetrics.length} chunks analyzed`);

    return new Response(
      JSON.stringify({
        message: 'Embedding stability analysis completed',
        document_id: document_id,
        total_chunks: chunks.length,
        analyzed_chunks: stabilityMetrics.length,
        average_stability: Math.round(
          (stabilityMetrics.reduce((sum, m) => sum + m.stability_score, 0) / stabilityMetrics.length) * 100,
        ) / 100,
        anomalies_detected: stabilityMetrics.filter(m => m.anomaly_detected).length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: (error as any).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});


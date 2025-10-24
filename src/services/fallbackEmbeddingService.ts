/**
 * Fallback Embedding Generation Service
 *
 * Generates embeddings for document chunks when MIVAA service fails to do so.
 * Uses OpenAI's text-embedding-3-small model directly.
 */

import { supabase } from '../integrations/supabase/client';

interface EmbeddingResult {
  chunkId: string;
  embedding: number[];
  success: boolean;
  error?: string;
}

interface FallbackEmbeddingStats {
  totalChunks: number;
  embeddingsGenerated: number;
  embeddingsFailed: number;
  successRate: number;
  processingTime: number;
}

export class FallbackEmbeddingService {
  private openaiApiKey: string;
  private batchSize = 20; // Process in batches to avoid rate limits
  private delayBetweenBatches = 1000; // 1 second between batches

  constructor() {
    this.openaiApiKey = process.env.VITE_OPENAI_API_KEY || '';
    if (!this.openaiApiKey) {
      console.warn('⚠️ OpenAI API key not found - fallback embedding generation will not work');
    }
  }

  /**
   * Generate embeddings for all chunks in a document that don't have embeddings
   */
  async generateMissingEmbeddings(documentId: string): Promise<FallbackEmbeddingStats> {
    const startTime = Date.now();
    console.log(`🔄 Starting fallback embedding generation for document: ${documentId}`);

    if (!this.openaiApiKey) {
      console.error('❌ OpenAI API key not configured - cannot generate embeddings');
      return {
        totalChunks: 0,
        embeddingsGenerated: 0,
        embeddingsFailed: 0,
        successRate: 0,
        processingTime: 0,
      };
    }

    try {
      // Get all chunks for this document that don't have embeddings
      const { data: chunks, error: chunksError } = await supabase
        .from('document_chunks')
        .select('id, content')
        .eq('document_id', documentId);

      if (chunksError) {
        console.error('❌ Failed to fetch chunks:', chunksError);
        return {
          totalChunks: 0,
          embeddingsGenerated: 0,
          embeddingsFailed: 0,
          successRate: 0,
          processingTime: 0,
        };
      }

      if (!chunks || chunks.length === 0) {
        console.log('⚠️ No chunks found for document');
        return {
          totalChunks: 0,
          embeddingsGenerated: 0,
          embeddingsFailed: 0,
          successRate: 0,
          processingTime: 0,
        };
      }

      console.log(`📊 Found ${chunks.length} chunks to process`);

      let embeddingsGenerated = 0;
      let embeddingsFailed = 0;

      // Process chunks in batches
      for (let i = 0; i < chunks.length; i += this.batchSize) {
        const batch = chunks.slice(i, i + this.batchSize);
        console.log(`📦 Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(chunks.length / this.batchSize)}`);

        const results = await Promise.all(
          batch.map(chunk => this.generateAndStoreEmbedding(chunk.id, chunk.content, documentId)),
        );

        embeddingsGenerated += results.filter(r => r.success).length;
        embeddingsFailed += results.filter(r => !r.success).length;

        // Delay between batches to avoid rate limiting
        if (i + this.batchSize < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches));
        }
      }

      const processingTime = Date.now() - startTime;
      const successRate = chunks.length > 0 ? (embeddingsGenerated / chunks.length) * 100 : 0;

      console.log('✅ Fallback embedding generation completed:');
      console.log(`   - Total chunks: ${chunks.length}`);
      console.log(`   - Embeddings generated: ${embeddingsGenerated}`);
      console.log(`   - Failed: ${embeddingsFailed}`);
      console.log(`   - Success rate: ${successRate.toFixed(1)}%`);
      console.log(`   - Processing time: ${processingTime}ms`);

      return {
        totalChunks: chunks.length,
        embeddingsGenerated,
        embeddingsFailed,
        successRate,
        processingTime,
      };
    } catch (error) {
      console.error('❌ Fallback embedding generation failed:', error);
      return {
        totalChunks: 0,
        embeddingsGenerated: 0,
        embeddingsFailed: 0,
        successRate: 0,
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Generate embedding for a single chunk and store it
   */
  private async generateAndStoreEmbedding(
    chunkId: string,
    content: string,
    documentId: string,
  ): Promise<EmbeddingResult> {
    try {
      // Generate embedding using OpenAI API
      const embedding = await this.generateEmbedding(content);

      if (!embedding || embedding.length === 0) {
        return {
          chunkId,
          embedding: [],
          success: false,
          error: 'Empty embedding returned',
        };
      }

      // Store embedding in document_vectors table
      const { error: storeError } = await supabase
        .from('document_vectors')
        .insert({
          document_id: documentId,
          chunk_id: chunkId,
          content,
          embedding,
          model_name: 'text-embedding-3-small',
          metadata: {
            generated_by: 'fallback_service',
            generated_at: new Date().toISOString(),
          },
        });

      if (storeError) {
        console.warn(`⚠️ Failed to store embedding for chunk ${chunkId}:`, storeError);
        return {
          chunkId,
          embedding,
          success: false,
          error: storeError.message,
        };
      }

      return {
        chunkId,
        embedding,
        success: true,
      };
    } catch (error) {
      console.error(`❌ Failed to generate embedding for chunk ${chunkId}:`, error);
      return {
        chunkId,
        embedding: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate embedding using OpenAI API
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      return data.data[0]?.embedding || [];
    } catch (error) {
      console.error('❌ Failed to generate embedding:', error);
      throw error;
    }
  }
}

export const fallbackEmbeddingService = new FallbackEmbeddingService();


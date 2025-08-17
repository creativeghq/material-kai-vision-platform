/**
 * MIVAA Embedding Integration Service
 * Provides embedding generation capabilities through the MIVAA gateway
 */

export interface EmbeddingRequest {
  text: string;
  model?: string;
  dimensions?: number;
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  dimensions: number;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export class MivaaEmbeddingIntegration {
  private readonly gatewayUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.gatewayUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    this.apiKey = process.env.MIVAA_API_KEY || '';
  }

  /**
   * Generate embeddings for the given text using MIVAA service
   */
  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    try {
      const response = await fetch(`${this.gatewayUrl}/api/mivaa/gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          action: 'generate_embedding',
          payload: request,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MIVAA embedding request failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      return result.data as EmbeddingResponse;
    } catch (error) {
      console.error('Error generating embedding via MIVAA gateway:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateBatchEmbeddings(requests: EmbeddingRequest[]): Promise<EmbeddingResponse[]> {
    try {
      const response = await fetch(`${this.gatewayUrl}/api/mivaa/gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          action: 'generate_batch_embeddings',
          payload: { requests },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MIVAA batch embedding request failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      return result.data as EmbeddingResponse[];
    } catch (error) {
      console.error('Error generating batch embeddings via MIVAA gateway:', error);
      throw error;
    }
  }

  /**
   * Check if the MIVAA embedding service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.gatewayUrl}/api/mivaa/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('MIVAA embedding service health check failed:', error);
      return false;
    }
  }
}

/**
 * OpenAI API Configuration
 * 
 * Manages OpenAI API models and their specific requirements for embedding generation.
 */

import { z } from 'zod';
import type { BaseApiConfig } from '../apiConfig';

// OpenAI embedding input schema
const embeddingInputSchema = z.object({
  input: z.union([
    z.string().min(1, "Input text is required"),
    z.array(z.string().min(1)).min(1, "At least one input text is required")
  ]),
  model: z.string().min(1, "Model is required"),
  encoding_format: z.enum(['float', 'base64']).optional().default('float'),
  dimensions: z.number().int().min(1).optional(),
  user: z.string().optional(),
});

// OpenAI embedding output schema
const embeddingOutputSchema = z.object({
  object: z.literal('list'),
  data: z.array(z.object({
    object: z.literal('embedding'),
    index: z.number().int(),
    embedding: z.array(z.number()),
  })),
  model: z.string(),
  usage: z.object({
    prompt_tokens: z.number().int(),
    total_tokens: z.number().int(),
  }),
});

// OpenAI API specific configuration
export interface OpenAIApiConfig extends BaseApiConfig {
  type: 'openai';
  models: {
    [modelId: string]: {
      maxTokens: number;
      inputSchema: z.ZodSchema;
      outputSchema: z.ZodSchema;
      costPerToken?: number;
      defaultParams?: Record<string, any>;
      description?: string;
      category?: string;
      status?: 'working' | 'failing' | 'unknown';
      dimensions?: number;
    };
  };
}

export const openaiConfig: OpenAIApiConfig = {
  name: 'OpenAI API',
  type: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: typeof window === 'undefined' ? process.env.OPENAI_API_KEY : undefined,
  timeout: 30000, // 30 seconds for embedding generation
  retryAttempts: 3,
  rateLimit: {
    requestsPerMinute: 3000, // OpenAI's default rate limit for embeddings
    burstLimit: 100,
  },
  environment: 'production',
  
  models: {
    // Text Embedding 3 Small - 512 dimensions (legacy support)
    'text-embedding-3-small': {
      maxTokens: 8191,
      inputSchema: embeddingInputSchema,
      outputSchema: embeddingOutputSchema,
      costPerToken: 0.00002,
      defaultParams: {
        model: 'text-embedding-3-small',
        encoding_format: 'float',
        dimensions: 512,
      },
      description: 'OpenAI text-embedding-3-small model with 512 dimensions',
      category: 'text-embedding',
      status: 'working',
      dimensions: 512,
    },

    // Text Embedding 3 Large - 768 dimensions (new default)
    'text-embedding-3-large': {
      maxTokens: 8191,
      inputSchema: embeddingInputSchema,
      outputSchema: embeddingOutputSchema,
      costPerToken: 0.00013,
      defaultParams: {
        model: 'text-embedding-3-large',
        encoding_format: 'float',
        dimensions: 768,
      },
      description: 'OpenAI text-embedding-3-large model with 768 dimensions - high performance',
      category: 'text-embedding',
      status: 'working',
      dimensions: 768,
    },

    // Text Embedding 3 Large - Full dimensions (3072)
    'text-embedding-3-large-full': {
      maxTokens: 8191,
      inputSchema: embeddingInputSchema,
      outputSchema: embeddingOutputSchema,
      costPerToken: 0.00013,
      defaultParams: {
        model: 'text-embedding-3-large',
        encoding_format: 'float',
        dimensions: 3072,
      },
      description: 'OpenAI text-embedding-3-large model with full 3072 dimensions - maximum performance',
      category: 'text-embedding',
      status: 'working',
      dimensions: 3072,
    },

    // Text Embedding Ada 002 (legacy)
    'text-embedding-ada-002': {
      maxTokens: 8191,
      inputSchema: embeddingInputSchema,
      outputSchema: embeddingOutputSchema,
      costPerToken: 0.0001,
      defaultParams: {
        model: 'text-embedding-ada-002',
        encoding_format: 'float',
      },
      description: 'OpenAI text-embedding-ada-002 model (legacy) - 1536 dimensions',
      category: 'text-embedding',
      status: 'working',
      dimensions: 1536,
    },
  },
};
/**
 * MIVAA Service Standardization Configuration
 *
 * This file defines standardized interfaces, payload structures, and error handling
 * for all MIVAA service integrations across the platform.
 *
 */

import { z } from 'zod';
import type { UnifiedApiResponse } from '@/types/unified-api-response';

// =============================================================================
// STANDARDIZED INTERFACES
// =============================================================================

/**
 * Standard MIVAA request payload structure
 */
export interface StandardMivaaPayload {
  // Core identification
  action: string;
  requestId?: string;

  // Resource identification (unified field names)
  resourceUrl?: string; // Replaces: documentId, fileUrl, url, image_data
  resourceName?: string; // Replaces: filename, document_name, name
  resourceType?: 'pdf' | 'image' | 'text' | 'url';

  // Processing options
  options?: {
    // PDF processing
    extractionType?: 'markdown' | 'tables' | 'images' | 'all';
    outputFormat?: 'json' | 'text' | 'html';

    // Image processing
    analysisTypes?: string[];
    includeProperties?: boolean;
    includeComposition?: boolean;
    confidenceThreshold?: number;

    // General options
    priority?: 'low' | 'normal' | 'high';
    timeout?: number;
    language?: string;
    quality?: 'standard' | 'high';

    // Custom options
    [key: string]: unknown;
  };

  // Metadata
  metadata?: Record<string, unknown>;
  tags?: string[];
}

/**
 * Standard MIVAA response structure
 * Alias for UnifiedApiResponse for use within this module.
 */
export type StandardMivaaResponse<T = any> = UnifiedApiResponse<T>;

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

export const StandardMivaaPayloadSchema = z.object({
  action: z.string().min(1, 'Action is required'),
  requestId: z.string().optional(),
  resourceUrl: z.string().url().optional(),
  resourceName: z.string().optional(),
  resourceType: z.enum(['pdf', 'image', 'text', 'url']).optional(),
  options: z
    .object({
      extractionType: z
        .enum(['markdown', 'tables', 'images', 'all'])
        .optional(),
      outputFormat: z.enum(['json', 'text', 'html']).optional(),
      analysisTypes: z.array(z.string()).optional(),
      includeProperties: z.boolean().optional(),
      includeComposition: z.boolean().optional(),
      confidenceThreshold: z.number().min(0).max(1).optional(),
      priority: z.enum(['low', 'normal', 'high']).optional(),
      timeout: z.number().min(1000).max(300000).optional(),
      language: z.string().optional(),
      quality: z.enum(['standard', 'high']).optional(),
    })
    .passthrough()
    .optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  tags: z.array(z.string()).optional(),
});

// =============================================================================
// ACTION MAPPING
// =============================================================================

/**
 * Maps frontend actions to MIVAA service endpoints
 */
export const MIVAA_ACTION_MAP: Record<
  string,
  { path: string; method: string }
> = {
  // PDF Processing - Use valid mivaa-gateway actions
  rag_upload: { path: '/api/rag/documents/upload', method: 'POST' },

  // Embeddings
  generate_embedding: { path: '/api/embeddings/generate', method: 'POST' },
  generate_batch_embeddings: { path: '/api/embeddings/batch', method: 'POST' },
  clip_embedding_generation: {
    path: '/api/embeddings/clip-generate',
    method: 'POST',
  },

  // Search
  semantic_search: { path: '/api/search/semantic', method: 'POST' },
  vector_search: { path: '/api/search/vector', method: 'POST' },
  hybrid_search: { path: '/api/search/hybrid', method: 'POST' },

  // Chat & AI - Use valid mivaa-gateway actions
  rag_chat: { path: '/api/rag/chat', method: 'POST' },
  rag_query: { path: '/api/rag/query', method: 'POST' },

  // Health & Status
  health_check: { path: '/health', method: 'GET' },
  service_status: { path: '/api/status', method: 'GET' },
};

// =============================================================================
// PAYLOAD TRANSFORMATION
// =============================================================================

/**
 * Transforms various payload formats to standardized format
 */
export class MivaaPayloadTransformer {
  /**
   * Transform input payload to standard format
   */
  static transformToStandard(
    inputPayload: any,
    action: string,
  ): StandardMivaaPayload {
    const standardPayload: StandardMivaaPayload = {
      action,
      requestId: inputPayload.requestId || crypto.randomUUID(),
    };

    // Handle different resource URL field names
    if (inputPayload.documentId) {
      standardPayload.resourceUrl = inputPayload.documentId;
      standardPayload.resourceType = 'pdf';
    } else if (inputPayload.fileUrl) {
      standardPayload.resourceUrl = inputPayload.fileUrl;
      standardPayload.resourceType = this.inferResourceType(
        inputPayload.fileUrl,
      );
    } else if (inputPayload.url) {
      standardPayload.resourceUrl = inputPayload.url;
      standardPayload.resourceType = this.inferResourceType(inputPayload.url);
    } else if (inputPayload.image_data) {
      standardPayload.resourceUrl = inputPayload.image_data;
      standardPayload.resourceType = 'image';
    }

    // Handle different name field names
    if (inputPayload.filename) {
      standardPayload.resourceName = inputPayload.filename;
    } else if (inputPayload.document_name) {
      standardPayload.resourceName = inputPayload.document_name;
    } else if (inputPayload.name) {
      standardPayload.resourceName = inputPayload.name;
    }

    // Transform options
    standardPayload.options = this.transformOptions(inputPayload, action);

    // Preserve metadata and tags
    standardPayload.metadata = inputPayload.metadata || {};
    standardPayload.tags = inputPayload.tags || [];

    return standardPayload;
  }

  /**
   * Transform standard payload to MIVAA service format
   */
  static transformToMivaaFormat(standardPayload: StandardMivaaPayload): any {
    const { action, resourceUrl, resourceName, options = {} } = standardPayload;

    // Get endpoint configuration
    const endpoint = MIVAA_ACTION_MAP[action];
    if (!endpoint) {
      throw new Error(`Unknown MIVAA action: ${action}`);
    }

    // Handle different endpoint requirements
    if (action === 'rag_upload') {
      return {
        file_url: resourceUrl,
        processing_mode: 'standard',
        categories: 'all',
        workspace_id: standardPayload.workspace_id,
        user_id: standardPayload.user_id,
        document_name: resourceName || 'Uploaded Document',
        tags: standardPayload.tags || [],
        metadata: standardPayload.metadata || {},
      };
    }

    if (action.includes('material_recognition') || action.includes('vision')) {
      return {
        image_data: resourceUrl,
        analysis_type: options.analysisTypes?.[0] || 'material_analysis',
        analysis_options: {
          include_properties: options.includeProperties ?? true,
          include_composition: options.includeComposition ?? true,
          confidence_threshold: options.confidenceThreshold ?? 0.8,
          ...options,
        },
      };
    }

    // Default format for other actions
    return {
      ...standardPayload,
      url: resourceUrl,
      name: resourceName,
      ...options,
    };
  }

  private static inferResourceType(
    url: string,
  ): 'pdf' | 'image' | 'text' | 'url' {
    if (url.includes('.pdf') || url.includes('pdf')) return 'pdf';
    if (
      url.includes('.jpg') ||
      url.includes('.png') ||
      url.includes('.jpeg') ||
      url.includes('image')
    )
      return 'image';
    if (url.startsWith('data:image/')) return 'image';
    return 'url';
  }

  private static transformOptions(
    inputPayload: any,
    _action: string,
  ): StandardMivaaPayload['options'] {
    const options: StandardMivaaPayload['options'] = {};

    // Extract common options
    if (inputPayload.extractionType)
      options.extractionType = inputPayload.extractionType;
    if (inputPayload.outputFormat)
      options.outputFormat = inputPayload.outputFormat;
    if (inputPayload.analysis_options) {
      options.includeProperties =
        inputPayload.analysis_options.include_properties;
      options.includeComposition =
        inputPayload.analysis_options.include_composition;
      options.confidenceThreshold =
        inputPayload.analysis_options.confidence_threshold;
    }

    // Merge any existing options
    if (inputPayload.options) {
      Object.assign(options, inputPayload.options);
    }

    return options;
  }
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

export class MivaaErrorHandler {
  static handleError(error: any, context: string): StandardMivaaResponse {
    console.error(`MIVAA Error in ${context}:`, error);

    let errorCode = 'UNKNOWN_ERROR';
    let errorMessage = 'An unknown error occurred';
    let retryable = false;

    if (error?.response?.status) {
      const status = error.response.status;
      errorCode = `HTTP_${status}`;
      errorMessage = error.response.data?.message || `HTTP ${status} error`;
      retryable = status >= 500 || status === 429; // Server errors and rate limits are retryable
    } else if (error?.message) {
      errorMessage = error.message;
      if (error.message.includes('timeout')) {
        errorCode = 'TIMEOUT_ERROR';
        retryable = true;
      } else if (error.message.includes('network')) {
        errorCode = 'NETWORK_ERROR';
        retryable = true;
      }
    }

    return {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage,
        details: error,
        retryable,
      },
      metadata: {
        processingTime: 0,
        timestamp: new Date().toISOString(),
        endpoint: context,
      },
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================
// All exports are already declared inline above

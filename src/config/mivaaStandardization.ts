/**
 * MIVAA Service Standardization Configuration
 *
 * This file defines standardized interfaces, payload structures, and error handling
 * for all MIVAA service integrations across the platform.
 */

import { z } from 'zod';

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
 */
export interface StandardMivaaResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    retryable?: boolean;
  };
  metadata: {
    requestId?: string;
    processingTime: number;
    timestamp: string;
    version?: string;
    endpoint?: string;
  };
}

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
  // PDF Processing
  pdf_process_document: { path: '/api/documents/process-url', method: 'POST' },
  pdf_extract_markdown: { path: '/api/v1/extract/markdown', method: 'POST' },
  pdf_extract_tables: { path: '/api/v1/extract/tables', method: 'POST' },
  pdf_extract_images: { path: '/api/v1/extract/images', method: 'POST' },

  // Material Recognition - Use valid mivaa-gateway actions
  // REMOVED: material_recognition - Use together_analyze_image instead
  // REMOVED: llama_vision_analysis - Use together_analyze_image instead
  together_analyze_image: { path: '/api/together-ai/analyze-image', method: 'POST' },

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
  // REMOVED: chat_completion - Use rag_chat instead
  // REMOVED: contextual_response - Use rag_query instead
  // REMOVED: semantic_analysis - Use together_analyze_image or rag_query instead
  // REMOVED: multimodal_analysis - Use rag_query instead
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
 * Transforms legacy payload formats to standardized format
 */
export class MivaaPayloadTransformer {
  /**
   * Transform any legacy payload to standard format
   */
  static transformToStandard(
    legacyPayload: any,
    action: string,
  ): StandardMivaaPayload {
    const standardPayload: StandardMivaaPayload = {
      action,
      requestId: legacyPayload.requestId || crypto.randomUUID(),
    };

    // Handle different resource URL field names
    if (legacyPayload.documentId) {
      standardPayload.resourceUrl = legacyPayload.documentId;
      standardPayload.resourceType = 'pdf';
    } else if (legacyPayload.fileUrl) {
      standardPayload.resourceUrl = legacyPayload.fileUrl;
      standardPayload.resourceType = this.inferResourceType(
        legacyPayload.fileUrl,
      );
    } else if (legacyPayload.url) {
      standardPayload.resourceUrl = legacyPayload.url;
      standardPayload.resourceType = this.inferResourceType(legacyPayload.url);
    } else if (legacyPayload.image_data) {
      standardPayload.resourceUrl = legacyPayload.image_data;
      standardPayload.resourceType = 'image';
    }

    // Handle different name field names
    if (legacyPayload.filename) {
      standardPayload.resourceName = legacyPayload.filename;
    } else if (legacyPayload.document_name) {
      standardPayload.resourceName = legacyPayload.document_name;
    } else if (legacyPayload.name) {
      standardPayload.resourceName = legacyPayload.name;
    }

    // Transform options
    standardPayload.options = this.transformOptions(legacyPayload, action);

    // Preserve metadata and tags
    standardPayload.metadata = legacyPayload.metadata || {};
    standardPayload.tags = legacyPayload.tags || [];

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
    if (action === 'pdf_process_document') {
      return {
        url: resourceUrl,
        async_processing: false,
        options: {
          extract_images: true,
          extract_tables: true,
          timeout_seconds: options.timeout
            ? Math.floor(options.timeout / 1000)
            : 300,
          quality: options.quality || 'standard',
          language: options.language || 'auto',
          ...options,
        },
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
    legacyPayload: any,
    _action: string,
  ): StandardMivaaPayload['options'] {
    const options: StandardMivaaPayload['options'] = {};

    // Extract common options
    if (legacyPayload.extractionType)
      options.extractionType = legacyPayload.extractionType;
    if (legacyPayload.outputFormat)
      options.outputFormat = legacyPayload.outputFormat;
    if (legacyPayload.analysis_options) {
      options.includeProperties =
        legacyPayload.analysis_options.include_properties;
      options.includeComposition =
        legacyPayload.analysis_options.include_composition;
      options.confidenceThreshold =
        legacyPayload.analysis_options.confidence_threshold;
    }

    // Merge any existing options
    if (legacyPayload.options) {
      Object.assign(options, legacyPayload.options);
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

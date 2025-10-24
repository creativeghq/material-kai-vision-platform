// Standardized Edge Function Response Types
// Based on the Unified Material API patterns but adapted for Edge Functions

/**
 * Base response structure for all Edge Functions
 */
export interface EdgeFunctionResponse<T = any> {
  /** Indicates if the operation was successful */
  success: boolean;
  /** Response data payload */
  data?: T;
  /** Error information if success is false */
  error?: {
    /** Error code for programmatic handling */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Additional error details */
    details?: Record<string, any>;
  };
  /** Response metadata */
  metadata: {
    /** Processing time in milliseconds */
    processingTime: number;
    /** Timestamp of the response */
    timestamp: string;
    /** Function version or identifier */
    version?: string;
    /** Request ID for tracing */
    requestId?: string;
  };
}

/**
 * Material recognition specific response data
 */
export interface MaterialRecognitionResult {
  /** Array of recognized materials */
  materials: Array<{
    /** Material name */
    name: string;
    /** Confidence score (0-1) */
    confidence: number;
    /** Material properties */
    properties: {
      category: string;
      subcategory?: string;
      color?: string;
      texture?: string;
      finish?: string;
      durability?: string;
      sustainability?: string;
    };
    /** Bounding box if applicable */
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
  /** Analysis metadata */
  analysisMetadata: {
    /** Type of analysis performed */
    analysisType: 'basic' | 'detailed' | 'comprehensive';
    /** Processing method used */
    processingMethod: 'llama_vision' | 'openai_vision' | 'catalog_fallback';
    /** Image dimensions if available */
    imageDimensions?: {
      width: number;
      height: number;
    };
    /** Visual analysis data */
    visualFeatures?: {
      colorPalette?: string[];
      textureAnalysis?: string;
      patternDetection?: string;
      lightingConditions?: string;
    };
  };
}

/**
 * Common CORS headers for Edge Functions
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
} as const;

/**
 * Creates a standardized success response
 */
export function createSuccessResponse<T>(
  data: T,
  metadata: Partial<EdgeFunctionResponse['metadata']> = {},
): EdgeFunctionResponse<T> {
  return {
    success: true,
    data,
    metadata: {
      processingTime: 0, // Should be overridden
      timestamp: new Date().toISOString(),
      ...metadata,
    },
  };
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  code: string,
  message: string,
  details?: Record<string, any>,
  metadata: Partial<EdgeFunctionResponse['metadata']> = {},
): EdgeFunctionResponse {
  const error: { code: string; message: string; details?: Record<string, any> } = {
    code,
    message,
  };

  if (details) {
    error.details = details;
  }

  return {
    success: false,
    error,
    metadata: {
      processingTime: 0, // Should be overridden
      timestamp: new Date().toISOString(),
      ...metadata,
    },
  };
}

/**
 * Creates a Response object with standardized JSON and CORS headers
 */
export function createJSONResponse(
  body: EdgeFunctionResponse,
  status: number = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

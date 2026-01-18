/**
 * MIVAA API Client
 *
 * Centralized client for all MIVAA backend API calls.
 *
 * Features:
 * - Direct calls to MIVAA backend (no proxy overhead)
 * - Supabase auth token integration
 * - Automatic retry logic
 * - Error handling
 * - Type safety
 */

import { supabase } from '@/integrations/supabase/client';
import { RetryHelper } from '@/utils/retryHelper';

// MIVAA API Configuration - use environment variable directly
const MIVAA_API_URL = process.env.MIVAA_GATEWAY_URL || 'https://v1api.materialshub.gr';

/**
 * MIVAA API Response Types
 */
export interface MivaaApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  processing_time?: number;
}

/**
 * PDF Upload Response - returned by /api/rag/documents/upload
 */
export interface PDFUploadResponse {
  job_id: string;
  document_id?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message?: string;
}

/**
 * Job Status Response - returned by /api/rag/documents/job/{job_id}
 */
export interface JobStatusResponse {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  document_id?: string;
  progress: number; // 0-100
  error?: string;
  metadata?: {
    filename?: string;
    file_size?: number;
    current_stage?: string;
    total_pages?: number;
    pages_completed?: number;
    chunks_created?: number;
    images_extracted?: number;
    embeddings_generated?: number;
    products_created?: number;
    embedding_model?: string;
    embedding_dimensions?: string;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
  last_checkpoint?: {
    stage: string;
    created_at: string;
    checkpoint_data?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
}

/**
 * PDF Extraction Result - returned from pdf_process_document action
 */
export interface PDFExtractionResult {
  document_id: string;
  content?: {
    chunks?: Array<{
      id: string;
      content: string;
      text?: string;
      page_number: number;
      metadata?: Record<string, unknown>;
    }>;
    images?: Array<{
      id: string;
      url: string;
      page_number: number;
      caption?: string;
      classification?: 'material' | 'non-material' | 'unknown';
    }>;
    markdown_content?: string;
  };
  metrics?: {
    word_count: number;
    page_count: number;
    processing_time_seconds: number;
  };
  metadata?: {
    author?: string;
    title?: string;
    [key: string]: unknown;
  };
}

/**
 * Search Result Item
 */
export interface SearchResultItem {
  id: string;
  result_type: 'product' | 'chunk' | 'image' | 'document';
  similarity_score: number;
  title?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Search Response - returned by search endpoints
 */
export interface SearchResponse {
  results: SearchResultItem[];
  total_count: number;
  query_embedding?: number[];
  processing_time_ms: number;
}

/**
 * MIVAA API Client Class
 */
export class MivaaApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = MIVAA_API_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Get Supabase auth token for MIVAA authentication
   */
  private async getAuthToken(): Promise<string> {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session) {
      throw new Error('Not authenticated. Please sign in.');
    }

    return session.access_token;
  }

  /**
   * Make authenticated request to MIVAA API with retry logic
   */
  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<MivaaApiResponse<T>> {
    return RetryHelper.withRetry(
      async () => {
        try {
          const token = await this.getAuthToken();
          const url = `${this.baseUrl}${endpoint}`;

          const response = await fetch(url, {
            ...options,
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              ...options.headers,
            },
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const error = new Error(
              errorData.error ||
                errorData.message ||
                `HTTP ${response.status}: ${response.statusText}`,
            );
            (error as any).status = response.status;
            throw error;
          }

          const data = await response.json();
          return {
            success: true,
            data,
            processing_time: data.processing_time,
          };
        } catch (error) {
          console.error(`MIVAA API Error [${endpoint}]:`, error);
          throw error;
        }
      },
      {
        maxAttempts: 3,
        delay: 1000,
        backoffMultiplier: 2,
        retryCondition: (error: unknown) => {
          // Retry on network errors and 5xx server errors
          if (error instanceof Error) {
            const status = (error as any).status;
            return !status || status >= 500;
          }
          return true;
        },
      },
    ).catch((error) => ({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }

  /**
   * Make authenticated request with FormData (for file uploads) with retry logic
   */
  private async requestFormData<T = any>(
    endpoint: string,
    formData: FormData,
  ): Promise<MivaaApiResponse<T>> {
    return RetryHelper.withRetry(
      async () => {
        try {
          const token = await this.getAuthToken();
          const url = `${this.baseUrl}${endpoint}`;

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              // Don't set Content-Type for FormData - browser sets it with boundary
            },
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const error = new Error(
              errorData.error ||
                errorData.message ||
                `HTTP ${response.status}: ${response.statusText}`,
            );
            (error as any).status = response.status;
            throw error;
          }

          const data = await response.json();
          return {
            success: true,
            data,
            processing_time: data.processing_time,
          };
        } catch (error) {
          console.error(`MIVAA API Error [${endpoint}]:`, error);
          throw error;
        }
      },
      {
        maxAttempts: 3,
        delay: 1000,
        backoffMultiplier: 2,
        retryCondition: (error: unknown) => {
          if (error instanceof Error) {
            const status = (error as any).status;
            return !status || status >= 500;
          }
          return true;
        },
      },
    ).catch((error) => ({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }

  // ==================== AI ANALYSIS ====================

  /**
   * Analyze material using AI (semantic analysis)
   * Replaces: ai-material-analysis, hybrid-material-analysis, material-recognition Edge Functions
   */
  async analyzeMaterial(payload: {
    image_url?: string;
    image_data?: string;
    text?: string;
    analysis_type?: 'semantic' | 'visual' | 'hybrid';
  }): Promise<MivaaApiResponse> {
    return this.request('/api/semantic-analysis', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Analyze image using Qwen Vision
   * Replaces: vision-analysis Edge Function
   */
  async analyzeVision(payload: {
    image_url?: string;
    image_data?: string;
    prompt?: string;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/vision/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Multimodal analysis (text + image)
   * Replaces: multimodal-analysis Edge Function
   */
  async analyzeMultimodal(payload: {
    text: string;
    image_url?: string;
    image_data?: string;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/analyze/multimodal', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Material properties analysis
   * Replaces: material-properties-analysis Edge Function
   */
  async analyzeProperties(payload: {
    material_id?: string;
    material_data?: any;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/properties/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Spaceformer spatial analysis
   * AI-powered room layout optimization, material placement, and accessibility analysis
   */
  async analyzeSpaceformer(payload: {
    image_url?: string;
    image_data?: string;
    room_type: string;
    room_dimensions?: { width: number; height: number; depth: number };
    user_preferences?: any;
    constraints?: any;
    analysis_type?: 'full' | 'layout' | 'materials' | 'accessibility';
  }): Promise<MivaaApiResponse> {
    return this.request('/api/spaceformer/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ==================== SEARCH ====================
  // All search methods now use the consolidated /api/rag/search endpoint with strategy parameter

  /**
   * Multi-vector search - THE ONLY search method used in the platform
   * Uses consolidated /api/rag/search endpoint with strategy="multi_vector"
   *
   * Combines 6 specialized CLIP embeddings with intelligent weighting:
   * - text_embedding_1536 (20%) - Semantic understanding
   * - visual_clip_embedding_512 (20%) - Visual similarity
   * - color_clip_embedding_512 (15%) - Color palette matching
   * - texture_clip_embedding_512 (15%) - Texture pattern matching
   * - style_clip_embedding_512 (15%) - Design style matching
   * - material_clip_embedding_512 (15%) - Material type matching
   *
   * This replaces ALL previous search methods (semantic, visual, hybrid, material, etc.)
   */
  async searchMultiVector(payload: {
    query: string;
    workspace_id: string;
    limit?: number;
    similarity_threshold?: number;
    material_filters?: any;
    image_url?: string;
    image_base64?: string;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/rag/search?strategy=multi_vector', {
      method: 'POST',
      body: JSON.stringify({
        query: payload.query,
        workspace_id: payload.workspace_id,
        top_k: payload.limit || 10,
        similarity_threshold: payload.similarity_threshold || 0.7,
        material_filters: payload.material_filters,
        image_url: payload.image_url,
        image_base64: payload.image_base64,
      }),
    });
  }


  // ==================== RAG & KNOWLEDGE ====================

  /**
   * Analyze knowledge content
   * Replaces: analyze-knowledge-content Edge Function
   */
  async analyzeKnowledge(payload: {
    content: string;
    content_type?: string;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/rag/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Extract material knowledge
   * Replaces: extract-material-knowledge Edge Function
   */
  async extractKnowledge(payload: {
    document_id?: string;
    content?: string;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/rag/extract', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ==================== EMBEDDINGS ====================

  /**
   * Generate text embedding
   * Replaces: generate-embedding Edge Function
   */
  async generateEmbedding(payload: {
    text: string;
    model?: string;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/embeddings/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Generate Visual Embedding (SigLIP)
   * Replaces: enhanced-clip-integration Edge Function
   */
  async generateClipEmbedding(payload: {
    image_url?: string;
    image_data?: string;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/embeddings/clip', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ==================== OCR & EXTRACTION ====================

  /**
   * OCR text extraction
   * Replaces: ocr-processing Edge Function
   */
  async extractOcr(payload: {
    image_url?: string;
    image_data?: string;
    language?: string;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/ocr/extract', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * SVBRDF extraction
   * Replaces: svbrdf-extractor Edge Function
   */
  async extractSvbrdf(payload: {
    image_url?: string;
    image_data?: string;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/svbrdf/extract', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ==================== VOICE ====================

  /**
   * Voice to material search
   * Replaces: voice-to-material Edge Function
   */
  async voiceToMaterial(payload: {
    audio_data?: string;
    audio_url?: string;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/voice/transcribe', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ==================== AGENT ORCHESTRATION ====================

  /**
   * Material agent orchestration
   * Replaces: material-agent-orchestrator Edge Function
   */
  async orchestrateAgent(payload: {
    query: string;
    context?: any;
    tools?: string[];
  }): Promise<MivaaApiResponse> {
    return this.request('/api/agent/orchestrate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ==================== CHAT ====================

  /**
   * Chat completion
   * Replaces: chat-completion Edge Function
   */
  async chatCompletion(payload: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/chat/completions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Contextual response
   * Replaces: contextual-response Edge Function
   */
  async contextualResponse(payload: {
    query: string;
    context?: any;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/chat/contextual', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ==================== PDF PROCESSING ====================

  /**
   * Upload PDF for processing
   * Uses consolidated /api/rag/documents/upload endpoint
   * Supports both file upload and URL-based processing
   *
   * @returns PDFUploadResponse with job_id for tracking
   */
  async uploadPDF(formData: FormData): Promise<MivaaApiResponse<PDFUploadResponse>> {
    return this.requestFormData('/api/rag/documents/upload', formData);
  }

  /**
   * Get job status - ALIGNED WITH BACKEND ENDPOINT
   *
   * Backend endpoint: GET /api/rag/documents/job/{job_id}
   * @returns JobStatusResponse with progress, metadata, and last_checkpoint
   */
  async getJobStatus(jobId: string): Promise<MivaaApiResponse<JobStatusResponse>> {
    return this.request(`/api/rag/documents/job/${jobId}`, {
      method: 'GET',
    });
  }

  /**
   * Get job result
   * @returns PDFExtractionResult with document content and metrics
   */
  async getJobResult(jobId: string): Promise<MivaaApiResponse<PDFExtractionResult>> {
    return this.request(`/api/rag/documents/job/${jobId}/result`, {
      method: 'GET',
    });
  }

  // ==================== INTERNAL/ADMIN ENDPOINTS ====================

  /**
   * Create chunks for a document
   * Used by admin UI to manually trigger chunk generation
   */
  async createChunks(
    jobId: string,
    payload: {
      job_id: string;
      document_id: string;
      workspace_id: string;
      extracted_text?: string;
      chunk_size?: number;
      chunk_overlap?: number;
    },
  ): Promise<MivaaApiResponse> {
    return this.request(`/api/internal/create-chunks/${jobId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Generate embeddings for products
   * Used by admin UI to manually trigger embedding generation
   */
  async generateProductEmbeddings(payload: {
    workspace_id: string;
    document_id: string;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/internal/generate-product-embeddings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

// Export singleton instance
export const mivaaApi = new MivaaApiClient();

// Factory function for explicit instantiation
export const getMivaaApiClient = () => mivaaApi;

// Export default
export default mivaaApi;

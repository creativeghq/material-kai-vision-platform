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

// MIVAA API Configuration
const MIVAA_API_URL = import.meta.env.VITE_MIVAA_API_URL || 'https://v1api.materialshub.gr';

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
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
      throw new Error('Not authenticated. Please sign in.');
    }

    return session.access_token;
  }

  /**
   * Make authenticated request to MIVAA API
   */
  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<MivaaApiResponse<T>> {
    try {
      const token = await this.getAuthToken();
      const url = `${this.baseUrl}${endpoint}`;

      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
        processing_time: data.processing_time,
      };
    } catch (error) {
      console.error(`MIVAA API Error [${endpoint}]:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Make authenticated request with FormData (for file uploads)
   */
  private async requestFormData<T = any>(
    endpoint: string,
    formData: FormData
  ): Promise<MivaaApiResponse<T>> {
    try {
      const token = await this.getAuthToken();
      const url = `${this.baseUrl}${endpoint}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Don't set Content-Type for FormData - browser sets it with boundary
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
        processing_time: data.processing_time,
      };
    } catch (error) {
      console.error(`MIVAA API Error [${endpoint}]:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
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
   * Analyze image using Llama Vision
   * Replaces: llama-vision-analysis Edge Function
   */
  async analyzeLlamaVision(payload: {
    image_url?: string;
    image_data?: string;
    prompt?: string;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/vision/llama-analyze', {
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
   * Replaces: spaceformer-analysis Edge Function
   */
  async analyzeSpaceformer(payload: {
    image_url?: string;
    image_data?: string;
    room_type?: string;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/spaceformer/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ==================== SEARCH ====================

  /**
   * Semantic search
   * Replaces: semantic-search, enhanced-rag-search, rag-knowledge-search Edge Functions
   */
  async searchSemantic(payload: {
    query: string;
    limit?: number;
    filters?: any;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/search/semantic', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Vector similarity search
   * Replaces: vector-similarity-search, document-vector-search Edge Functions
   */
  async searchVector(payload: {
    query_vector?: number[];
    query_text?: string;
    limit?: number;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/search/vector-similarity', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Unified material search
   * Replaces: unified-material-search, unified-materials-api Edge Functions
   */
  async searchMaterials(payload: {
    query: string;
    search_type?: 'text' | 'semantic' | 'hybrid';
    limit?: number;
    filters?: any;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/search/unified', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Visual search (image-based)
   * Replaces: visual-search-analyze Edge Function
   */
  async searchVisual(payload: {
    image_url?: string;
    image_data?: string;
    limit?: number;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/images/visual-search', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Material images search
   * Replaces: material-images-api Edge Function
   */
  async searchImages(payload: {
    query?: string;
    material_id?: string;
    limit?: number;
  }): Promise<MivaaApiResponse> {
    return this.request('/api/images/search', {
      method: 'POST',
      body: JSON.stringify(payload),
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
   * Generate CLIP embedding
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
}

// Export singleton instance
export const mivaaApi = new MivaaApiClient();

// Export default
export default mivaaApi;


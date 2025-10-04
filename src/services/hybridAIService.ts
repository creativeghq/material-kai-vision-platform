import { BaseService, ServiceConfig } from './base/BaseService';

export interface AIProvider {
  name: string;
  priority: number; // 1 = highest priority
  available: boolean;
}

export interface HybridRequest {
  prompt: string;
  model?: string;
  type: 'material-analysis' | '3d-generation' | 'text-processing' | 'general';
  imageUrl?: string;
  maxRetries?: number;
  minimumScore?: number;
}

export interface HybridResponse {
  success: boolean;
  data: unknown;
  provider: string;
  attempts: Array<{
    provider: string;
    success: boolean;
    score?: number;
    error?: string;
    processing_time_ms: number;
  }>;
  final_score: number;
  validation: unknown;
  total_processing_time_ms: number;
}

export interface HybridAIServiceConfig extends ServiceConfig {
  providers: AIProvider[];
  defaultMinScore: number;
  defaultMaxRetries: number;
  enableValidation: boolean;
}

export class HybridAIService extends BaseService<HybridAIServiceConfig> {
  private readonly PROVIDERS: AIProvider[] = [
    { name: 'mivaa', priority: 1, available: true },
    { name: 'claude', priority: 2, available: true },
  ];

  private readonly DEFAULT_MIN_SCORE = 0.7;
  private readonly DEFAULT_MAX_RETRIES = 2;

  protected async doInitialize(): Promise<void> {
    // Initialize providers and validation
  }

  protected async doHealthCheck(): Promise<void> {
    if (!this.PROVIDERS.some(p => p.available)) {
      throw new Error('No AI providers available');
    }
  }

  // Main hybrid processing function
  async processRequest(request: HybridRequest): Promise<HybridResponse> {
    const startTime = Date.now();
    const attempts: HybridResponse['attempts'] = [];
    const minimumScore = request.minimumScore ?? this.DEFAULT_MIN_SCORE;
    const maxRetries = request.maxRetries ?? this.DEFAULT_MAX_RETRIES;

    // Sort providers by priority
    const sortedProviders = this.PROVIDERS
      .filter(p => p.available)
      .sort((a, b) => a.priority - b.priority);

    let bestResult: unknown = null;
    let bestScore = 0;
    let bestValidation: unknown = null;

    for (const provider of sortedProviders) {
      if (attempts.length >= maxRetries) {
        break;
      }

      const attemptStart = Date.now();

      try {
        console.log(`Attempting ${request.type} with ${provider.name}`);

        let result: unknown;
        switch (provider.name) {
          case 'mivaa':
            result = await HybridAIService.callMIVAA(request);
            break;
          case 'claude':
            result = await HybridAIService.callClaude(request);
            break;
          default:
            throw new Error(`Unknown provider: ${provider.name}`);
        }

        // Validate the response
        const validation = HybridAIService.validateResponse(result as Record<string, unknown>, request);
        const processingTime = Date.now() - attemptStart;

        attempts.push({
          provider: provider.name,
          success: true,
          score: (validation as any).score,
          processing_time_ms: processingTime,
        });

        // Check if this is the best result so far
        if ((validation as any).score > bestScore) {
          bestResult = result;
          bestScore = (validation as any).score;
          bestValidation = validation;
        }

        // If score meets minimum threshold, we can stop
        if ((validation as any).score >= minimumScore) {
          console.log(`${provider.name} met minimum score threshold: ${(validation as any).score}`);
          break;
        }

        console.log(`${provider.name} score ${(validation as any).score} below threshold ${minimumScore}, trying next provider`);

      } catch (error) {
        const processingTime = Date.now() - attemptStart;

        attempts.push({
          provider: provider.name,
          success: false,
          error: (error as any).message,
          processing_time_ms: processingTime,
        });

        console.error(`${provider.name} failed:`, (error as any).message);
      }
    }

    const totalProcessingTime = Date.now() - startTime;

    // Return best result or failure
    if (bestResult) {
      return {
        success: true,
        data: bestResult,
        provider: attempts.find(a => a.score === bestScore)?.provider || 'unknown',
        attempts,
        final_score: bestScore,
        validation: bestValidation,
        total_processing_time_ms: totalProcessingTime,
      };
    } else {
      return {
        success: false,
        data: null,
        provider: 'none',
        attempts,
        final_score: 0,
        validation: { score: 0, issues: ['All providers failed'] },
        total_processing_time_ms: totalProcessingTime,
      };
    }
  }

  // Call hybrid analysis edge function
  static async callHybridAnalysis(request: HybridRequest): Promise<HybridResponse> {
    const { supabase } = await import('@/integrations/supabase/client');

    const { data, error } = await supabase.functions.invoke('hybrid-material-analysis', {
      body: request,
    });

    if (error) {
      throw new Error(`Hybrid analysis failed: ${error.message}`);
    }

    return data;
  }

  // MIVAA API calls (primary provider)
  private static async callMIVAA(request: HybridRequest): Promise<HybridResponse> {
    const mivaaGatewayUrl = process.env.NEXT_PUBLIC_MIVAA_GATEWAY_URL || 'http://localhost:3000';
    const mivaaApiKey = process.env.NEXT_PUBLIC_MIVAA_API_KEY;
    
    if (!mivaaApiKey) {
      throw new Error('MIVAA API key not configured');
    }

    // Map request type to MIVAA action
    let mivaaAction: string;
    switch (request.type) {
      case 'material-analysis':
        mivaaAction = request.imageUrl ? 'llama_vision_analysis' : 'chat_completion';
        break;
      case '3d-generation':
        mivaaAction = 'chat_completion';
        break;
      case 'text-processing':
        mivaaAction = 'chat_completion';
        break;
      default:
        mivaaAction = 'chat_completion';
    }

    const systemPrompt = HybridAIService.getSystemPrompt(request.type);

    const payload: Record<string, unknown> = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: request.prompt },
      ],
      options: {
        max_tokens: 2000,
        temperature: 0.1,
      },
    };

    // Add image data for vision analysis
    if (request.imageUrl && mivaaAction === 'llama_vision_analysis') {
      payload.image_data = request.imageUrl;
      payload.analysis_type = 'material_analysis';
    }

    const response = await fetch(`${mivaaGatewayUrl}/api/mivaa/gateway`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mivaaApiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Material-Kai-Vision-Platform-Client/1.0',
      },
      body: JSON.stringify({
        action: mivaaAction,
        payload,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`MIVAA gateway error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(`MIVAA ${mivaaAction} error: ${result.error?.message || 'Unknown error'}`);
    }

    // Return standardized response format
    return {
      success: true,
      data: {
        text: result.data.content || result.data.response || result.data.analysis,
        raw_response: result.data,
        action: mivaaAction,
      },
      provider: 'mivaa',
      attempts: [{
        provider: 'mivaa',
        success: true,
        processing_time_ms: 0,
      }],
      final_score: 0.9,
      validation: {},
      total_processing_time_ms: 0,
    };
  }

  // Claude API calls (for client-side use)
  private static async callClaude(_request: HybridRequest): Promise<unknown> {
    // This would be called from edge function, not client
    throw new Error('Use callHybridAnalysis instead for client-side calls');
  }

  // Get system prompts for different types
  private static getSystemPrompt(type: string): string {
    switch (type) {
      case 'material-analysis':
        return `You are an expert materials scientist. Analyze materials and respond with valid JSON containing:
        {
          "material_name": "specific material name",
          "category": "one of: metals, plastics, ceramics, composites, textiles, wood, glass, rubber, concrete, other",
          "confidence": 0.0-1.0,
          "properties": {object with density, strength, thermal properties, etc.},
          "chemical_composition": {object with chemical info},
          "safety_considerations": [array of safety notes],
          "standards": [array of relevant standards]
        }`;

      case '3d-generation':
        return `You are an interior design expert. Parse requests and respond with JSON:
        {
          "room_type": "living room, kitchen, bedroom, etc.",
          "style": "modern, Swedish, industrial, etc.",
          "materials": [array of mentioned materials],
          "features": [array of furniture/features],
          "layout": "layout specifications",
          "enhanced_prompt": "detailed prompt for image generation"
        }`;

      case 'text-processing':
        return 'You are an expert in document analysis and text extraction. Provide clear, structured responses.';

      default:
        return 'You are a helpful AI assistant. Provide accurate and detailed responses.';
    }
  }

  // Simple validation - server-side validation now handles comprehensive checks
  private static validateResponse(result: Record<string, unknown>, _request: HybridRequest): any {
    // Basic validation for all request types - server now handles detailed validation
    const hasContent = result && (result.text || result.raw_response || result.image_url || Object.keys(result).length > 0);
    const hasError = result?.error || result?.status === 'error';

    return {
      score: hasError ? 0.1 : (hasContent ? 0.9 : 0.3),
      confidence: hasContent ? 0.8 : 0.2,
      reasoning: hasContent ? 'Response contains content' : 'Response is empty or invalid',
      issues: hasContent ? [] : ['Empty or invalid response'],
      suggestions: hasContent ? [] : ['Retry with different parameters'],
    };
  }

  // Check provider availability (calls edge function)
  static async checkProviderAvailability(): Promise<Record<string, boolean>> {
    try {
      const { supabase } = await import('@/integrations/supabase/client');

      const { data, error } = await supabase.functions.invoke('hybrid-material-analysis', {
        body: { check_availability: true },
      });

      if (error) {
        return { openai: false, claude: false };
      }

      return data.availability || { openai: false, claude: false };
    } catch {
      return { openai: false, claude: false };
    }
  }

}

// Create and export a singleton instance for static-like access
const hybridAIConfig: HybridAIServiceConfig = {
  name: 'HybridAIService',
  version: '1.0.0',
  environment: 'development',
  enabled: true,
  providers: [
    { name: 'openai', priority: 1, available: true },
    { name: 'claude', priority: 2, available: true },
  ],
  defaultMinScore: 0.7,
  defaultMaxRetries: 2,
  enableValidation: true,
};

let hybridAIInstance: HybridAIService | null = null;

// Static-like access functions
export const HybridAIServiceStatic = {
  async processRequest(request: HybridRequest): Promise<HybridResponse> {
    if (!hybridAIInstance) {
      hybridAIInstance = new HybridAIService(hybridAIConfig);
      await hybridAIInstance.initialize();
    }
    return hybridAIInstance.processRequest(request);
  },
};

// Extend the class with static methods for backward compatibility
(HybridAIService as unknown as { processRequest: typeof HybridAIServiceStatic.processRequest }).processRequest = HybridAIServiceStatic.processRequest;

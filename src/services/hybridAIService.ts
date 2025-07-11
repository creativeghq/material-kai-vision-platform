import { ResponseValidator } from './responseValidator';

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
  data: any;
  provider: string;
  attempts: Array<{
    provider: string;
    success: boolean;
    score?: number;
    error?: string;
    processing_time_ms: number;
  }>;
  final_score: number;
  validation: any;
  total_processing_time_ms: number;
}

export class HybridAIService {
  private static readonly PROVIDERS: AIProvider[] = [
    { name: 'openai', priority: 1, available: true },
    { name: 'claude', priority: 2, available: true }
  ];

  private static readonly DEFAULT_MIN_SCORE = 0.7;
  private static readonly DEFAULT_MAX_RETRIES = 2;

  // Main hybrid processing function
  static async processRequest(request: HybridRequest): Promise<HybridResponse> {
    const startTime = Date.now();
    const attempts: HybridResponse['attempts'] = [];
    const minimumScore = request.minimumScore ?? this.DEFAULT_MIN_SCORE;
    const maxRetries = request.maxRetries ?? this.DEFAULT_MAX_RETRIES;

    // Sort providers by priority
    const sortedProviders = this.PROVIDERS
      .filter(p => p.available)
      .sort((a, b) => a.priority - b.priority);

    let bestResult: any = null;
    let bestScore = 0;
    let bestValidation: any = null;

    for (const provider of sortedProviders) {
      if (attempts.length >= maxRetries) {
        break;
      }

      const attemptStart = Date.now();
      
      try {
        console.log(`Attempting ${request.type} with ${provider.name}`);
        
        let result: any;
        switch (provider.name) {
          case 'openai':
            result = await this.callOpenAI(request);
            break;
          case 'claude':
            result = await this.callClaude(request);
            break;
          default:
            throw new Error(`Unknown provider: ${provider.name}`);
        }

        // Validate the response
        const validation = this.validateResponse(result, request);
        const processingTime = Date.now() - attemptStart;

        attempts.push({
          provider: provider.name,
          success: true,
          score: validation.score,
          processing_time_ms: processingTime
        });

        // Check if this is the best result so far
        if (validation.score > bestScore) {
          bestResult = result;
          bestScore = validation.score;
          bestValidation = validation;
        }

        // If score meets minimum threshold, we can stop
        if (validation.score >= minimumScore) {
          console.log(`${provider.name} met minimum score threshold: ${validation.score}`);
          break;
        }

        console.log(`${provider.name} score ${validation.score} below threshold ${minimumScore}, trying next provider`);

      } catch (error) {
        const processingTime = Date.now() - attemptStart;
        
        attempts.push({
          provider: provider.name,
          success: false,
          error: error.message,
          processing_time_ms: processingTime
        });

        console.error(`${provider.name} failed:`, error.message);
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
        total_processing_time_ms: totalProcessingTime
      };
    } else {
      return {
        success: false,
        data: null,
        provider: 'none',
        attempts,
        final_score: 0,
        validation: { score: 0, issues: ['All providers failed'] },
        total_processing_time_ms: totalProcessingTime
      };
    }
  }

  // Call hybrid analysis edge function
  static async callHybridAnalysis(request: any): Promise<HybridResponse> {
    const { supabase } = await import('@/integrations/supabase/client');
    
    const { data, error } = await supabase.functions.invoke('hybrid-material-analysis', {
      body: request
    });

    if (error) {
      throw new Error(`Hybrid analysis failed: ${error.message}`);
    }

    return data;
  }

  // OpenAI API calls (for client-side use)
  private static async callOpenAI(request: HybridRequest): Promise<any> {
    // This would be called from edge function, not client
    throw new Error('Use callHybridAnalysis instead for client-side calls');
  }

  // Claude API calls (for client-side use)
  private static async callClaude(request: HybridRequest): Promise<any> {
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

  // Validate responses based on type
  private static validateResponse(result: any, request: HybridRequest): any {
    switch (request.type) {
      case 'material-analysis':
        return ResponseValidator.validateMaterialAnalysis(result, request.prompt);
      
      case '3d-generation':
        return ResponseValidator.validate3DGeneration(
          result.image_url || '', 
          request.prompt, 
          result, 
          result.matched_materials || []
        );
      
      case 'text-processing':
        return ResponseValidator.validateTextProcessing(
          result.text || result.raw_response || '', 
          request.prompt.length
        );
      
      default:
        // Basic validation for general requests
        const hasContent = result && (result.text || result.raw_response || Object.keys(result).length > 0);
        return {
          score: hasContent ? 0.8 : 0.2,
          confidence: hasContent ? 0.8 : 0.2,
          reasoning: hasContent ? 'Response contains content' : 'Response is empty or invalid',
          issues: hasContent ? [] : ['Empty or invalid response'],
          suggestions: hasContent ? [] : ['Retry with different parameters']
        };
    }
  }

  // Check provider availability (calls edge function)
  static async checkProviderAvailability(): Promise<Record<string, boolean>> {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      
      const { data, error } = await supabase.functions.invoke('hybrid-material-analysis', {
        body: { check_availability: true }
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
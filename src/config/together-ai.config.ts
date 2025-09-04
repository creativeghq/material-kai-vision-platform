/**
 * Together AI Configuration for LLaMA 3.2 Vision
 *
 * This file provides a single source of truth for all Together AI model configurations
 * across the Material Kai Vision Platform. It ensures consistency between frontend
 * services, Supabase functions, and visual analysis integration.
 *
 * Environment Variables Required:
 * - TOGETHER_API_KEY: Together AI API key for model access
 * - TOGETHER_MODEL: The Together AI model to use (default: meta-llama/Llama-Vision-90B)
 * - TOGETHER_MAX_TOKENS: Maximum tokens per request (default: 4096)
 * - TOGETHER_TEMPERATURE: Model temperature for consistency (default: 0.1)
 * - TOGETHER_TIMEOUT: Request timeout in seconds (default: 60)
 * - TOGETHER_MAX_RETRIES: Maximum retry attempts (default: 3)
 * - TOGETHER_RATE_LIMIT_RPM: Rate limit requests per minute (default: 60)
 */

export interface TogetherAIModelConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  costPerRequest: number;
  supportsVision: boolean;
  description: string;
  status: 'active' | 'deprecated' | 'experimental';
  contextWindow: number;
}

export interface TogetherAIConfig {
  // Primary configuration
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;

  // Performance settings
  maxRetries: number;
  retryDelay: number;
  rateLimitRPM: number;
  requestInterval: number;

  // Cost tracking
  costPerRequest: number;
  monthlyBudget: number;
  alertThreshold: number;

  // Validation functions
  validateModel: (model: string) => boolean;
  validateRequest: (request: any) => boolean;

  // Model compatibility matrix
  supportedModels: Record<string, TogetherAIModelConfig>;
}

/**
 * Rate limiting configuration for Together AI API
 */
export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  concurrentRequests: number;
  backoffMultiplier: number;
}

/**
 * Default Together AI configuration for LLaMA 3.2 Vision
 * Optimized for material analysis with cost-effective settings
 */
export const TOGETHER_AI_CONFIG: TogetherAIConfig = {
  // Primary model configuration for visual analysis
  model: process.env.TOGETHER_MODEL || 'meta-llama/Llama-Vision-90B',
  maxTokens: parseInt(process.env.TOGETHER_MAX_TOKENS || '4096'),
  temperature: parseFloat(process.env.TOGETHER_TEMPERATURE || '0.1'),
  timeout: parseInt(process.env.TOGETHER_TIMEOUT || '60000'), // 60 seconds

  // Performance settings
  maxRetries: parseInt(process.env.TOGETHER_MAX_RETRIES || '3'),
  retryDelay: 2000, // 2 seconds base delay
  rateLimitRPM: parseInt(process.env.TOGETHER_RATE_LIMIT_RPM || '60'),
  requestInterval: 1000, // 1 second between requests

  // Cost tracking and budgeting
  costPerRequest: 0.10, // ~$0.10 per image analysis
  monthlyBudget: 50.00, // $50/month target
  alertThreshold: 0.8, // Alert at 80% of budget

  // Validation functions
  validateModel: (model: string): boolean => {
    return Object.keys(TOGETHER_AI_CONFIG.supportedModels).includes(model);
  },

  validateRequest: (request: any): boolean => {
    if (!request.messages || !Array.isArray(request.messages)) {
      return false;
    }
    if (request.max_tokens && request.max_tokens > TOGETHER_AI_CONFIG.maxTokens) {
      return false;
    }
    return true;
  },

  // Model compatibility matrix
  supportedModels: {
    'meta-llama/Llama-Vision-90B': {
      model: 'meta-llama/Llama-Vision-90B',
      maxTokens: 4096,
      temperature: 0.1,
      costPerRequest: 0.10,
      supportsVision: true,
      description: 'LLaMA 3.2 Vision 90B - Optimized for visual understanding and material analysis',
      status: 'active',
      contextWindow: 8192,
    },
    'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo': {
      model: 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo',
      maxTokens: 4096,
      temperature: 0.1,
      costPerRequest: 0.05,
      supportsVision: true,
      description: 'LLaMA 3.2 11B Vision Turbo - Faster, more cost-effective for simpler analysis',
      status: 'experimental',
      contextWindow: 4096,
    },
    'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo': {
      model: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
      maxTokens: 4096,
      temperature: 0.1,
      costPerRequest: 0.15,
      supportsVision: true,
      description: 'LLaMA 3.2 90B Vision Turbo - Higher performance for complex analysis',
      status: 'experimental',
      contextWindow: 8192,
    },
  },
} as const;

/**
 * Rate limiting configuration for cost management
 */
export const RATE_LIMIT_CONFIG: RateLimitConfig = {
  requestsPerMinute: parseInt(process.env.TOGETHER_RATE_LIMIT_RPM || '60'),
  requestsPerHour: parseInt(process.env.TOGETHER_RATE_LIMIT_RPH || '500'),
  requestsPerDay: parseInt(process.env.TOGETHER_RATE_LIMIT_RPD || '1000'),
  concurrentRequests: parseInt(process.env.TOGETHER_CONCURRENT_REQUESTS || '5'),
  backoffMultiplier: parseFloat(process.env.TOGETHER_BACKOFF_MULTIPLIER || '2.0'),
};

/**
 * Get the current Together AI model configuration
 */
export function getCurrentModelConfig(): TogetherAIModelConfig {
  const currentModel = TOGETHER_AI_CONFIG.model;
  const config = TOGETHER_AI_CONFIG.supportedModels[currentModel];

  if (!config) {
    throw new Error(`Unsupported Together AI model: ${currentModel}`);
  }

  return config;
}

/**
 * Validate Together AI configuration on startup
 */
export function validateTogetherAIConfig(): void {
  const currentModel = TOGETHER_AI_CONFIG.model;
  const apiKey = process.env.TOGETHER_API_KEY;

  // Check if API key is present
  if (!apiKey) {
    throw new Error('TOGETHER_API_KEY environment variable is required');
  }

  // Check if model is supported
  if (!TOGETHER_AI_CONFIG.validateModel(currentModel)) {
    throw new Error(`Unsupported Together AI model: ${currentModel}. Supported models: ${Object.keys(TOGETHER_AI_CONFIG.supportedModels).join(', ')}`);
  }

  // Check if model supports vision
  const modelConfig = getCurrentModelConfig();
  if (!modelConfig.supportsVision) {
    throw new Error(`Model ${currentModel} does not support vision analysis`);
  }

  // Validate rate limiting settings
  if (RATE_LIMIT_CONFIG.requestsPerMinute <= 0) {
    throw new Error('Rate limit must be greater than 0 requests per minute');
  }

  // Warn about cost implications
  const estimatedMonthlyCost = (RATE_LIMIT_CONFIG.requestsPerDay * 30 * modelConfig.costPerRequest);
  if (estimatedMonthlyCost > TOGETHER_AI_CONFIG.monthlyBudget) {
    console.warn(`⚠️ Current rate limits may exceed monthly budget. Estimated cost: $${estimatedMonthlyCost.toFixed(2)}, Budget: $${TOGETHER_AI_CONFIG.monthlyBudget}`);
  }

  console.log(`✅ Together AI configuration validated: ${currentModel} with vision support enabled`);
}

/**
 * Get Together AI API headers for requests
 */
export function getTogetherAIHeaders(): Record<string, string> {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) {
    throw new Error('TOGETHER_API_KEY environment variable is required');
  }

  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Material-Kai-Vision-Platform/1.0',
  };
}

/**
 * Create LLaMA Vision request payload for material analysis
 */
export function createVisionAnalysisPayload(
  imageUrl: string,
  prompt: string,
  options: Partial<{
    maxTokens: number;
    temperature: number;
    systemPrompt: string;
  }> = {}
): object {
  const modelConfig = getCurrentModelConfig();
  
  return {
    model: TOGETHER_AI_CONFIG.model,
    messages: [
      ...(options.systemPrompt ? [{
        role: 'system',
        content: options.systemPrompt
      }] : []),
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl
            }
          }
        ]
      }
    ],
    max_tokens: options.maxTokens || TOGETHER_AI_CONFIG.maxTokens,
    temperature: options.temperature || TOGETHER_AI_CONFIG.temperature,
    stream: false,
  };
}

/**
 * Material analysis system prompt for consistent results
 */
export const MATERIAL_ANALYSIS_SYSTEM_PROMPT = `You are an expert material analyst for interior design and architectural applications. 

Analyze the provided material image and extract structured information about its properties. Focus on properties relevant for interior design, architectural applications, and material search.

Respond with valid JSON in the exact format specified in the user prompt. Be precise, consistent, and focus on visual characteristics that would be useful for material selection and specification.

Key analysis areas:
- Material type and category
- Visual texture and surface quality
- Color palette and finish type
- Pattern characteristics
- Perceived quality and application suitability

Maintain consistency across similar materials and provide confidence scores for your assessments.`;

/**
 * Get cost estimation for a number of image analyses
 */
export function estimateAnalysisCost(imageCount: number): {
  totalCost: number;
  perImageCost: number;
  withinBudget: boolean;
  remainingBudget: number;
} {
  const modelConfig = getCurrentModelConfig();
  const totalCost = imageCount * modelConfig.costPerRequest;
  const withinBudget = totalCost <= TOGETHER_AI_CONFIG.monthlyBudget;
  const remainingBudget = TOGETHER_AI_CONFIG.monthlyBudget - totalCost;

  return {
    totalCost,
    perImageCost: modelConfig.costPerRequest,
    withinBudget,
    remainingBudget: Math.max(0, remainingBudget),
  };
}

/**
 * Get rate limit recommendation based on budget
 */
export function getRateLimitRecommendation(): {
  maxDailyRequests: number;
  maxMonthlyRequests: number;
  recommendedRPM: number;
} {
  const modelConfig = getCurrentModelConfig();
  const maxMonthlyRequests = Math.floor(TOGETHER_AI_CONFIG.monthlyBudget / modelConfig.costPerRequest);
  const maxDailyRequests = Math.floor(maxMonthlyRequests / 30);
  const recommendedRPM = Math.floor(maxDailyRequests / (24 * 60)); // Spread evenly across the day

  return {
    maxDailyRequests,
    maxMonthlyRequests,
    recommendedRPM: Math.max(1, recommendedRPM), // At least 1 request per minute
  };
}

/**
 * Validate that we're using the optimal model for cost-effectiveness
 */
export function isOptimalForBudget(): {
  optimal: boolean;
  recommendation?: string;
  estimatedMonthlyCost: number;
} {
  const currentModel = getCurrentModelConfig();
  const monthlyRequestEstimate = RATE_LIMIT_CONFIG.requestsPerDay * 30;
  const estimatedMonthlyCost = monthlyRequestEstimate * currentModel.costPerRequest;

  if (estimatedMonthlyCost <= TOGETHER_AI_CONFIG.monthlyBudget) {
    return {
      optimal: true,
      estimatedMonthlyCost,
    };
  }

  // Check if a cheaper model would work
  const cheaperModels = Object.entries(TOGETHER_AI_CONFIG.supportedModels)
    .filter(([_, config]) => config.costPerRequest < currentModel.costPerRequest && config.supportsVision)
    .sort((a, b) => a[1].costPerRequest - b[1].costPerRequest);

  if (cheaperModels.length > 0) {
    const cheapestModel = cheaperModels[0];
    if (cheapestModel) {
      const [modelName, modelConfig] = cheapestModel;
      return {
        optimal: false,
        recommendation: `Consider switching to ${modelName} to reduce costs from $${estimatedMonthlyCost.toFixed(2)} to $${(monthlyRequestEstimate * modelConfig.costPerRequest).toFixed(2)} per month`,
        estimatedMonthlyCost,
      };
    }
  }

  return {
    optimal: false,
    recommendation: 'Reduce request volume or increase budget to stay within cost targets',
    estimatedMonthlyCost,
  };
}

// Validate configuration on module load
try {
  validateTogetherAIConfig();
} catch (error) {
  console.error('❌ Together AI configuration validation failed:', error);
  // Don't throw in production, just log the error
  if (process.env.NODE_ENV !== 'production') {
    throw error;
  }
}
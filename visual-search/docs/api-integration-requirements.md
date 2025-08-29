+++
# --- Basic Metadata ---
id = "LLAMA-VISUAL-SEARCH-API-REQS-V1"
title = "API Integration Requirements for Visual Search"
context_type = "documentation"
scope = "Detailed API integration requirements for LLaMA 3.2 Vision and CLIP services"
target_audience = ["dev-python", "dev-react", "lead-backend", "technical-architect", "devops-lead"]
granularity = "detailed"
status = "active"
last_updated = "2025-08-28"
tags = ["api", "integration", "llama-vision", "clip", "together-ai", "openai", "hugging-face", "requirements"]
related_context = [
    "visual-search/docs/llama-visual-search-master-plan.md",
    "visual-search/docs/technical-architecture.md",
    "docs/deployment/secrets-configuration-guide.md"
]
template_schema_doc = ".ruru/templates/toml-md/21_api_requirements.README.md"
relevance = "Critical: Defines external API integration specifications"
+++

# API Integration Requirements for Visual Search

## Overview

This document defines the comprehensive API integration requirements for implementing LLaMA 3.2 Vision and CLIP-based visual material search. The integration strategy focuses on external API services to minimize infrastructure complexity while maintaining high performance and reliability.

## API Service Architecture

### Primary Services
1. **Together AI** - LLaMA 3.2 Vision 90B API
2. **Hugging Face Inference API** - CLIP embedding generation
3. **OpenAI** - Text embeddings and fallback CLIP services
4. **Supabase** - Database and storage (existing)

### Service Redundancy Strategy
- **Primary + Fallback**: Each critical service has backup providers
- **Load Balancing**: Distribute requests across multiple API keys
- **Graceful Degradation**: Reduced functionality when services unavailable

## Together AI Integration (LLaMA 3.2 Vision)

### Service Overview
- **Primary Use**: Material visual analysis and structured property extraction
- **Model**: `meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo`
- **Endpoint**: `https://api.together.xyz/v1/chat/completions`
- **Expected Cost**: ~$40/month for typical usage

### API Configuration

```typescript
interface TogetherAIConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  defaultParams: {
    temperature: number;
    max_tokens: number;
    response_format: { type: 'json_object' };
  };
  rateLimit: {
    requestsPerMinute: number;
    tokensPerHour: number;
  };
  timeout: number;
  retries: number;
}

const TOGETHER_AI_CONFIG: TogetherAIConfig = {
  baseURL: 'https://api.together.xyz/v1',
  apiKey: process.env.TOGETHER_AI_API_KEY,
  model: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
  defaultParams: {
    temperature: 0.1,
    max_tokens: 1000,
    response_format: { type: 'json_object' }
  },
  rateLimit: {
    requestsPerMinute: 60,
    tokensPerHour: 1000000
  },
  timeout: 20000,
  retries: 3
};
```

### Request Format

```typescript
interface LlamaVisionRequest {
  model: string;
  messages: Array<{
    role: 'user';
    content: Array<{
      type: 'text' | 'image_url';
      text?: string;
      image_url?: {
        url: string;
        detail?: 'low' | 'high' | 'auto';
      };
    }>;
  }>;
  temperature: number;
  max_tokens: number;
  response_format: { type: 'json_object' };
}

const MATERIAL_ANALYSIS_PROMPT = `
Analyze this material image and provide a comprehensive analysis in JSON format with the following structure:
{
  "material_type": "Primary material classification",
  "surface_texture": "Detailed texture description",
  "color_description": "Color analysis with specific color names",
  "finish_type": "Surface finish classification (matte, glossy, satin, etc.)",
  "pattern_grain": "Pattern and grain details",
  "reflectivity": "Reflectivity characteristics (high, medium, low)",
  "visual_characteristics": "General visual properties",
  "structural_properties": {
    "hardness": "estimated hardness category",
    "transparency": "opacity level",
    "surface_quality": "surface quality assessment",
    "wear_resistance": "estimated durability"
  },
  "confidence_score": "Confidence in analysis (0-1)",
  "key_features": ["list", "of", "distinctive", "features"]
}

Focus on material properties that would be useful for visual search and matching.
`;
```

### Response Handling

```typescript
interface LlamaVisionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface MaterialAnalysisResult {
  material_type: string;
  surface_texture: string;
  color_description: string;
  finish_type: string;
  pattern_grain: string;
  reflectivity: string;
  visual_characteristics: string;
  structural_properties: {
    hardness: string;
    transparency: string;
    surface_quality: string;
    wear_resistance: string;
  };
  confidence_score: number;
  key_features: string[];
  metadata: {
    model_version: string;
    processing_time_ms: number;
    token_usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };
}
```

### Error Handling & Retry Logic

```typescript
interface APIError {
  code: string;
  message: string;
  type: 'rate_limit' | 'timeout' | 'invalid_request' | 'server_error';
  retryable: boolean;
  retryAfter?: number;
}

class TogetherAIClient {
  async analyzeImage(
    imageBuffer: Buffer, 
    options: AnalysisOptions = {}
  ): Promise<MaterialAnalysisResult> {
    const maxRetries = options.retries || TOGETHER_AI_CONFIG.retries;
    let lastError: APIError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.makeRequest({
          model: TOGETHER_AI_CONFIG.model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: MATERIAL_ANALYSIS_PROMPT },
              { 
                type: 'image_url', 
                image_url: { 
                  url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`,
                  detail: 'high'
                }
              }
            ]
          }],
          ...TOGETHER_AI_CONFIG.defaultParams
        });

        return this.parseResponse(response);
      } catch (error) {
        lastError = this.classifyError(error);
        
        if (!lastError.retryable || attempt === maxRetries) {
          throw lastError;
        }

        await this.backoff(attempt, lastError.retryAfter);
      }
    }
  }

  private async backoff(attempt: number, retryAfter?: number): Promise<void> {
    const delay = retryAfter || Math.min(1000 * Math.pow(2, attempt), 10000);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
```

## CLIP Integration (Hugging Face)

### Service Overview
- **Primary Use**: Visual embedding generation for similarity search
- **Model**: `openai/clip-vit-base-patch32`
- **Endpoint**: `https://api-inference.huggingface.co/models/openai/clip-vit-base-patch32`
- **Expected Cost**: ~$10/month for typical usage

### API Configuration

```typescript
interface HuggingFaceConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
  timeout: number;
  retries: number;
}

const HUGGING_FACE_CONFIG: HuggingFaceConfig = {
  baseURL: 'https://api-inference.huggingface.co',
  apiKey: process.env.HUGGING_FACE_API_KEY,
  model: 'openai/clip-vit-base-patch32',
  rateLimit: {
    requestsPerMinute: 120,
    requestsPerDay: 10000
  },
  timeout: 15000,
  retries: 2
};
```

### CLIP Embedding Generation

```typescript
interface CLIPRequest {
  inputs: string | Buffer; // Image data
  options?: {
    wait_for_model?: boolean;
    use_cache?: boolean;
  };
}

interface CLIPResponse {
  embeddings?: number[][];
  error?: string;
}

class HuggingFaceCLIPClient {
  async generateEmbedding(imageBuffer: Buffer): Promise<number[]> {
    const response = await fetch(`${HUGGING_FACE_CONFIG.baseURL}/models/${HUGGING_FACE_CONFIG.model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HUGGING_FACE_CONFIG.apiKey}`,
        'Content-Type': 'application/octet-stream'
      },
      body: imageBuffer
    });

    if (!response.ok) {
      throw new Error(`CLIP API error: ${response.status} ${response.statusText}`);
    }

    const result: CLIPResponse = await response.json();
    
    if (result.error) {
      throw new Error(`CLIP processing error: ${result.error}`);
    }

    if (!result.embeddings || result.embeddings.length === 0) {
      throw new Error('No embeddings returned from CLIP API');
    }

    return result.embeddings[0]; // Return first embedding vector
  }

  async generateTextEmbedding(text: string): Promise<number[]> {
    // Alternative endpoint for text embeddings if needed
    const response = await fetch(`${HUGGING_FACE_CONFIG.baseURL}/models/sentence-transformers/clip-ViT-B-32`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HUGGING_FACE_CONFIG.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: text,
        options: { wait_for_model: true }
      })
    });

    const result = await response.json();
    return result.embeddings[0];
  }
}
```

## OpenAI Integration (Text Embeddings + Fallback)

### Service Overview
- **Primary Use**: Text embeddings for hybrid search
- **Secondary Use**: Fallback CLIP embeddings via custom proxy
- **Model**: `text-embedding-3-small` for text, custom CLIP proxy for images
- **Expected Cost**: ~$15/month

### Configuration

```typescript
interface OpenAIConfig {
  apiKey: string;
  baseURL: string;
  textEmbeddingModel: string;
  rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
  timeout: number;
}

const OPENAI_CONFIG: OpenAIConfig = {
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
  textEmbeddingModel: 'text-embedding-3-small',
  rateLimit: {
    requestsPerMinute: 500,
    tokensPerMinute: 100000
  },
  timeout: 10000
};
```

### Text Embedding Generation

```typescript
class OpenAIEmbeddingClient {
  async generateTextEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${OPENAI_CONFIG.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENAI_CONFIG.textEmbeddingModel,
        input: text,
        encoding_format: 'float'
      })
    });

    const result = await response.json();
    return result.data[0].embedding;
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${OPENAI_CONFIG.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENAI_CONFIG.textEmbeddingModel,
        input: texts,
        encoding_format: 'float'
      })
    });

    const result = await response.json();
    return result.data.map(item => item.embedding);
  }
}
```

## Unified Visual Analysis Service

### Service Orchestration

```typescript
interface VisualAnalysisOptions {
  enableLlamaAnalysis: boolean;
  enableCLIPEmbedding: boolean;
  enableTextEmbedding: boolean;
  priority: 'speed' | 'accuracy' | 'balanced';
  fallbackOptions: {
    useFallbackCLIP: boolean;
    skipOnFailure: boolean;
  };
}

class UnifiedVisualAnalysisService {
  private llamaClient: TogetherAIClient;
  private clipClient: HuggingFaceCLIPClient;
  private openaiClient: OpenAIEmbeddingClient;

  async analyzeImage(
    imageBuffer: Buffer, 
    options: VisualAnalysisOptions
  ): Promise<CompleteAnalysisResult> {
    const startTime = Date.now();
    const results: Partial<CompleteAnalysisResult> = {};
    const errors: Array<{ service: string; error: Error }> = [];

    // Execute analyses in parallel for speed
    const analysisPromises: Promise<void>[] = [];

    if (options.enableLlamaAnalysis) {
      analysisPromises.push(
        this.llamaClient.analyzeImage(imageBuffer)
          .then(result => { results.llamaAnalysis = result; })
          .catch(error => { errors.push({ service: 'llama', error }); })
      );
    }

    if (options.enableCLIPEmbedding) {
      analysisPromises.push(
        this.clipClient.generateEmbedding(imageBuffer)
          .then(embedding => { results.clipEmbedding = embedding; })
          .catch(async (error) => {
            errors.push({ service: 'clip', error });
            
            // Try fallback if enabled
            if (options.fallbackOptions.useFallbackCLIP) {
              try {
                results.clipEmbedding = await this.generateFallbackCLIPEmbedding(imageBuffer);
              } catch (fallbackError) {
                errors.push({ service: 'clip-fallback', error: fallbackError });
              }
            }
          })
      );
    }

    if (options.enableTextEmbedding && results.llamaAnalysis) {
      analysisPromises.push(
        this.generateDescriptionEmbedding(results.llamaAnalysis)
          .then(embedding => { results.descriptionEmbedding = embedding; })
          .catch(error => { errors.push({ service: 'text-embedding', error }); })
      );
    }

    await Promise.allSettled(analysisPromises);

    const processingTime = Date.now() - startTime;

    return {
      ...results as CompleteAnalysisResult,
      metadata: {
        processingTimeMs: processingTime,
        errors: errors,
        servicesUsed: this.getUsedServices(results),
        timestamp: new Date().toISOString()
      }
    };
  }

  private async generateDescriptionEmbedding(
    llamaAnalysis: MaterialAnalysisResult
  ): Promise<number[]> {
    const description = [
      llamaAnalysis.material_type,
      llamaAnalysis.surface_texture,
      llamaAnalysis.color_description,
      llamaAnalysis.visual_characteristics
    ].filter(Boolean).join(' ');

    return this.openaiClient.generateTextEmbedding(description);
  }

  private async generateFallbackCLIPEmbedding(imageBuffer: Buffer): Promise<number[]> {
    // Implement fallback CLIP embedding generation
    // This could use a different service or local processing
    throw new Error('Fallback CLIP embedding not yet implemented');
  }
}
```

## Rate Limiting & Cost Management

### Rate Limiting Strategy

```typescript
interface RateLimiter {
  service: string;
  requestsPerMinute: number;
  requestsPerHour: number;
  tokenLimitPerHour?: number;
  currentUsage: {
    requestsThisMinute: number;
    requestsThisHour: number;
    tokensThisHour: number;
  };
}

class APIRateLimiter {
  private limiters: Map<string, RateLimiter> = new Map();
  private requestQueues: Map<string, Array<() => Promise<any>>> = new Map();

  async executeWithRateLimit<T>(
    service: string,
    operation: () => Promise<T>,
    estimatedTokens: number = 0
  ): Promise<T> {
    const limiter = this.limiters.get(service);
    if (!limiter) {
      return operation();
    }

    await this.waitForCapacity(service, estimatedTokens);
    
    try {
      const result = await operation();
      this.recordUsage(service, estimatedTokens);
      return result;
    } catch (error) {
      // Handle rate limit errors
      if (this.isRateLimitError(error)) {
        await this.handleRateLimitError(service, error);
        return this.executeWithRateLimit(service, operation, estimatedTokens);
      }
      throw error;
    }
  }

  private async waitForCapacity(service: string, tokens: number): Promise<void> {
    const limiter = this.limiters.get(service);
    if (!limiter) return;

    // Check request limits
    if (limiter.currentUsage.requestsThisMinute >= limiter.requestsPerMinute) {
      await this.waitUntilNextMinute();
    }

    if (limiter.currentUsage.requestsThisHour >= limiter.requestsPerHour) {
      await this.waitUntilNextHour();
    }

    // Check token limits
    if (limiter.tokenLimitPerHour && 
        limiter.currentUsage.tokensThisHour + tokens > limiter.tokenLimitPerHour) {
      await this.waitUntilNextHour();
    }
  }
}
```

### Cost Monitoring

```typescript
interface CostTracker {
  service: string;
  costPerRequest?: number;
  costPerToken?: number;
  monthlyBudget: number;
  currentMonthSpend: number;
}

class APICostMonitor {
  private trackers: Map<string, CostTracker> = new Map();

  constructor() {
    this.trackers.set('together-ai', {
      service: 'together-ai',
      costPerToken: 0.0001, // Estimate
      monthlyBudget: 50,
      currentMonthSpend: 0
    });

    this.trackers.set('hugging-face', {
      service: 'hugging-face',
      costPerRequest: 0.001, // Estimate
      monthlyBudget: 15,
      currentMonthSpend: 0
    });

    this.trackers.set('openai', {
      service: 'openai',
      costPerToken: 0.00002, // text-embedding-3-small
      monthlyBudget: 20,
      currentMonthSpend: 0
    });
  }

  async recordUsage(
    service: string, 
    tokens: number = 0, 
    requests: number = 1
  ): Promise<void> {
    const tracker = this.trackers.get(service);
    if (!tracker) return;

    const cost = (tracker.costPerToken ? tokens * tracker.costPerToken : 0) +
                 (tracker.costPerRequest ? requests * tracker.costPerRequest : 0);

    tracker.currentMonthSpend += cost;

    // Alert if approaching budget
    if (tracker.currentMonthSpend > tracker.monthlyBudget * 0.8) {
      await this.sendBudgetAlert(service, tracker);
    }

    // Block if over budget
    if (tracker.currentMonthSpend > tracker.monthlyBudget) {
      throw new Error(`Monthly budget exceeded for ${service}`);
    }
  }

  async getBudgetStatus(): Promise<Record<string, BudgetStatus>> {
    const status: Record<string, BudgetStatus> = {};

    for (const [service, tracker] of this.trackers) {
      status[service] = {
        monthlyBudget: tracker.monthlyBudget,
        currentSpend: tracker.currentMonthSpend,
        percentageUsed: (tracker.currentMonthSpend / tracker.monthlyBudget) * 100,
        remainingBudget: tracker.monthlyBudget - tracker.currentMonthSpend
      };
    }

    return status;
  }
}
```

## Environment Configuration

### Required Environment Variables

```bash
# Together AI Configuration
TOGETHER_AI_API_KEY=your_together_ai_api_key
TOGETHER_AI_BASE_URL=https://api.together.xyz/v1  # Optional override

# Hugging Face Configuration
HUGGING_FACE_API_KEY=your_hugging_face_api_key
HUGGING_FACE_BASE_URL=https://api-inference.huggingface.co  # Optional override

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
OPENAI_ORG_ID=your_openai_org_id  # Optional

# Rate Limiting Configuration
API_RATE_LIMIT_ENABLED=true
API_COST_MONITORING_ENABLED=true

# Fallback Configuration
ENABLE_API_FALLBACKS=true
API_TIMEOUT_MS=20000
API_MAX_RETRIES=3

# Development/Testing
VISUAL_SEARCH_DEBUG=false
API_MOCK_MODE=false  # For testing without API calls
```

### Configuration Validation

```typescript
interface EnvironmentConfig {
  togetherAI: {
    apiKey: string;
    baseURL: string;
  };
  huggingFace: {
    apiKey: string;
    baseURL: string;
  };
  openAI: {
    apiKey: string;
    orgId?: string;
  };
  features: {
    rateLimitingEnabled: boolean;
    costMonitoringEnabled: boolean;
    fallbacksEnabled: boolean;
    debugMode: boolean;
    mockMode: boolean;
  };
  limits: {
    timeoutMs: number;
    maxRetries: number;
  };
}

function validateEnvironmentConfig(): EnvironmentConfig {
  const requiredVars = [
    'TOGETHER_AI_API_KEY',
    'HUGGING_FACE_API_KEY',
    'OPENAI_API_KEY'
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Required environment variable ${varName} is not set`);
    }
  }

  return {
    togetherAI: {
      apiKey: process.env.TOGETHER_AI_API_KEY!,
      baseURL: process.env.TOGETHER_AI_BASE_URL || 'https://api.together.xyz/v1'
    },
    huggingFace: {
      apiKey: process.env.HUGGING_FACE_API_KEY!,
      baseURL: process.env.HUGGING_FACE_BASE_URL || 'https://api-inference.huggingface.co'
    },
    openAI: {
      apiKey: process.env.OPENAI_API_KEY!,
      orgId: process.env.OPENAI_ORG_ID
    },
    features: {
      rateLimitingEnabled: process.env.API_RATE_LIMIT_ENABLED === 'true',
      costMonitoringEnabled: process.env.API_COST_MONITORING_ENABLED === 'true',
      fallbacksEnabled: process.env.ENABLE_API_FALLBACKS === 'true',
      debugMode: process.env.VISUAL_SEARCH_DEBUG === 'true',
      mockMode: process.env.API_MOCK_MODE === 'true'
    },
    limits: {
      timeoutMs: parseInt(process.env.API_TIMEOUT_MS || '20000'),
      maxRetries: parseInt(process.env.API_MAX_RETRIES || '3')
    }
  };
}
```

## Monitoring & Health Checks

### API Health Monitoring

```typescript
interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  lastChecked: Date;
  errorRate: number;
  details?: string;
}

class APIHealthMonitor {
  private healthStatus: Map<string, HealthCheck> = new Map();
  private checkInterval: NodeJS.Timeout;

  constructor() {
    this.startHealthChecks();
  }

  private startHealthChecks(): void {
    this.checkInterval = setInterval(async () => {
      await Promise.all([
        this.checkTogetherAIHealth(),
        this.checkHuggingFaceHealth(),
        this.checkOpenAIHealth()
      ]);
    }, 60000); // Check every minute
  }

  private async checkTogetherAIHealth(): Promise<void> {
    const start = Date.now();
    try {
      const response = await fetch('https://api.together.xyz/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.TOGETHER_AI_API_KEY}` },
        timeout: 5000
      });
      
      const responseTime = Date.now() - start;
      const status = response.ok ? 'healthy' : 'degraded';
      
      this.healthStatus.set('together-ai', {
        service: 'together-ai',
        status,
        responseTime,
        lastChecked: new Date(),
        errorRate: this.calculateErrorRate('together-ai')
      });
    } catch (error) {
      this.healthStatus.set('together-ai', {
        service: 'together-ai',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        lastChecked: new Date(),
        errorRate: this.calculateErrorRate('together-ai'),
        details: error.message
      });
    }
  }

  async getOverallHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: HealthCheck[];
  }> {
    const services = Array.from(this.healthStatus.values());
    const unhealthyCount = services.filter(s => s.status === 'unhealthy').length;
    const degradedCount = services.filter(s => s.status === 'degraded').length;

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyCount > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedCount > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    return { status: overallStatus, services };
  }
}
```

## Testing Strategy

### API Integration Tests

```typescript
describe('Visual Analysis API Integration', () => {
  let analysisService: UnifiedVisualAnalysisService;
  let testImageBuffer: Buffer;

  beforeAll(async () => {
    // Load test image
    testImageBuffer = await fs.readFile('test/fixtures/sample-material.jpg');
    analysisService = new UnifiedVisualAnalysisService();
  });

  describe('LLaMA 3.2 Vision Integration', () => {
    test('should analyze material image successfully', async () => {
      const result = await analysisService.analyzeImage(testImageBuffer, {
        enableLlamaAnalysis: true,
        enableCLIPEmbedding: false,
        enableTextEmbedding: false,
        priority: 'accuracy',
        fallbackOptions: { useFallbackCLIP: false, skipOnFailure: false }
      });

      expect(result.llamaAnalysis).toBeDefined();
      expect(result.llamaAnalysis.material_type).toBeTruthy();
      expect(result.llamaAnalysis.confidence_score).toBeGreaterThan(0.5);
    });

    test('should handle rate limiting gracefully', async () => {
      // Mock rate limit response
      const mockFetch = jest.fn().mockRejectedValueOnce(
        new Error('Rate limit exceeded')
      );
      
      // Test retry mechanism
      // ... implementation
    });
  });

  describe('CLIP Integration', () => {
    test('should generate image embeddings', async () => {
      const embedding = await analysisService.generateCLIPEmbedding(testImageBuffer);
      
      expect(embedding).toHaveLength(512);
      expect(embedding.every(val => typeof val === 'number')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should gracefully handle API failures', async () => {
      // Mock API failure
      const mockService = new UnifiedVisualAnalysisService();
      // ... test error scenarios
    });
  });
});
```

### Mock Services for Development

```typescript
class MockVisualAnalysisService implements VisualAnalysisInterface {
  async analyzeImage(
    imageBuffer: Buffer, 
    options: VisualAnalysisOptions
  ): Promise<CompleteAnalysisResult> {
    // Return mock data for development
    return {
      llamaAnalysis: {
        material_type: 'Wood',
        surface_texture: 'Smooth grain',
        color_description: 'Natural brown with darker grain lines',
        finish_type: 'Matte',
        pattern_grain: 'Linear wood grain pattern',
        reflectivity: 'Low',
        visual_characteristics: 'Natural wood appearance with visible grain',
        structural_properties
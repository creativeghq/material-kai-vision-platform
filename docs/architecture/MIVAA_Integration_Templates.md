+++
# --- Basic Metadata ---
id = "MIVAA-INTEGRATION-TEMPLATES-V1"
title = "MIVAA Integration Templates & Developer Guide"
context_type = "technical_documentation"
scope = "Standard patterns and templates for MIVAA gateway integration"
target_audience = ["dev-core-web", "dev-react", "lead-backend", "lead-frontend"]
granularity = "detailed"
status = "active"
last_updated = "2025-09-09"
tags = ["mivaa", "templates", "integration", "patterns", "developer-guide", "multimodal", "ai"]
related_context = [
    "docs/architecture/OpenAI_Integration_Catalog_Migration_Plan.md",
    "docs/architecture/ADR-001-MIVAA-Modular-Multimodal-Standardization.md",
    "src/api/mivaa-gateway.ts",
    "src/services/visualFeatureExtractionService.ts"
]
template_schema_doc = ".ruru/templates/toml-md/16_ai_rule.README.md"
relevance = "High: Essential for consistent MIVAA integration patterns"
+++

# MIVAA Integration Templates & Developer Guide

## Overview

This document provides standardized templates and patterns for integrating with the MIVAA gateway, replacing direct OpenAI API calls with the modular MIVAA-first architecture.

## 🎯 Available MIVAA Actions

### **Visual Analysis Actions**
```typescript
'llama_vision_analysis'        // LLaMA 3.2 Vision semantic analysis
'clip_embedding_generation'    // CLIP visual embeddings (512D)
```

### **Text Processing Actions**  
```typescript
'embedding_generation'         // Text embeddings (1536D)
'batch_embedding'             // Bulk text embedding processing
'semantic_analysis'           // Text analysis and classification
```

### **Conversational Actions**
```typescript
'chat_completion'             // GPT-4 style responses
'contextual_response'         // RAG-aware contextual responses
```

### **Audio Processing Actions**
```typescript
'audio_transcription'         // Whisper-style speech to text
```

### **Document Processing Actions**
```typescript
'extract_text'               // Document text extraction
'process_document'           // Document analysis
'analyze_material'           // Material-specific document analysis
```

## 📋 Integration Patterns & Templates

### **Pattern A: Parallel Visual Analysis**
*For functions requiring both LLaMA vision and CLIP embeddings*

#### Template Implementation
```typescript
import { MivaaGatewayController } from '@/api/mivaa-gateway';

class VisualAnalysisService {
  private static mivaaGateway = new MivaaGatewayController();

  static async performParallelVisualAnalysis(params: {
    user_id: string;
    image_url: string;
    image_data: string;
    analysis_type: string;
    context?: any;
    include_embeddings?: boolean;
  }): Promise<[LlamaResult, ClipEmbeddings]> {
    
    // Prepare parallel MIVAA requests
    const llamaRequest = {
      action: 'llama_vision_analysis',
      payload: {
        user_id: params.user_id,
        image_url: params.image_url,
        image_data: params.image_data,
        analysis_type: params.analysis_type,
        context: params.context || {},
        options: {
          include_confidence_scores: true,
          include_detailed_properties: params.include_embeddings || false
        }
      }
    };

    const clipRequest = {
      action: 'clip_embedding_generation',
      payload: {
        user_id: params.user_id,
        image_url: params.image_url,
        image_data: params.image_data,
        embedding_type: 'visual_similarity',
        options: {
          normalize: true,
          dimensions: 512
        }
      }
    };

    // Execute both requests in parallel
    const [llamaResponse, clipResponse] = await Promise.all([
      this.mivaaGateway.makeRequest(llamaRequest),
      params.include_embeddings ? 
        this.mivaaGateway.makeRequest(clipRequest) : 
        Promise.resolve(null)
    ]);

    // Process and return results
    const llamaResult = this.adaptLlamaResponse(llamaResponse);
    const clipEmbeddings = clipResponse?.success ? 
      this.extractClipEmbeddings(clipResponse) : null;

    return [llamaResult, clipEmbeddings];
  }

  private static adaptLlamaResponse(response: any): LlamaResult {
    // Adapt MIVAA response to expected format
    return {
      success: response.success,
      analysis_id: response.data?.analysis_id || `analysis_${Date.now()}`,
      materials_detected: response.data?.materials || [],
      overall_analysis: response.data?.analysis || {},
      processing_time_ms: response.metadata?.processingTime || 0,
      model_used: response.data?.model_used || 'llama-3.2-vision'
    };
  }

  private static extractClipEmbeddings(response: any): ClipEmbeddings {
    return {
      embedding: response.data?.embedding || response.data?.visual_embedding,
      embedding_type: 'clip_512d',
      model_used: response.data?.model_used || 'clip-vit-base-patch32',
      processing_time_ms: response.metadata?.processingTime || 0
    };
  }
}
```

#### Migration Example
```typescript
// ❌ OLD: Direct OpenAI calls
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${openaiKey}` },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: imageUrl }}] }]
  })
});

// ✅ NEW: Parallel MIVAA pattern  
const [llamaResult, clipEmbeddings] = await VisualAnalysisService.performParallelVisualAnalysis({
  user_id: request.user_id,
  image_url: imageUrl,
  image_data: imageData,
  analysis_type: 'comprehensive_material_analysis',
  include_embeddings: true
});
```

**Apply to**: [`hybrid-material-analysis`](supabase/functions/hybrid-material-analysis/index.ts:375), [`ai-material-analysis`](supabase/functions/ai-material-analysis/index.ts:248)

---

### **Pattern B: MIVAA-Only Embedding**
*For functions currently using OpenAI fallbacks*

#### Template Implementation
```typescript
import { MivaaGatewayController } from '@/api/mivaa-gateway';

class EmbeddingService {
  private static mivaaGateway = new MivaaGatewayController();

  static async generateEmbedding(text: string, options?: {
    model?: string;
    dimensions?: number;
    user_id?: string;
  }): Promise<number[]> {
    
    const request = {
      action: 'embedding_generation',
      payload: {
        text: text,
        model: options?.model || 'text-embedding-ada-002',
        dimensions: options?.dimensions || 1536,
        user_id: options?.user_id || 'system'
      }
    };

    const response = await this.mivaaGateway.makeRequest(request);
    
    if (!response.success) {
      throw new Error(`MIVAA embedding generation failed: ${response.error}`);
    }

    return response.data.embedding;
  }

  static async generateBatchEmbeddings(texts: string[], options?: {
    model?: string;
    dimensions?: number;
    user_id?: string;
  }): Promise<number[][]> {
    
    const request = {
      action: 'batch_embedding',
      payload: {
        texts: texts,
        model: options?.model || 'text-embedding-ada-002',
        dimensions: options?.dimensions || 1536,
        user_id: options?.user_id || 'system'
      }
    };

    const response = await this.mivaaGateway.makeRequest(request);
    
    if (!response.success) {
      throw new Error(`MIVAA batch embedding generation failed: ${response.error}`);
    }

    return response.data.embeddings;
  }
}
```

#### Migration Example
```typescript
// ❌ OLD: OpenAI with fallback
async function generateQueryEmbeddingViaOpenAI(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: 'text-embedding-ada-002',
      input: text
    })
  });
  // ... error handling
}

// Try MIVAA, fallback to OpenAI
try {
  return await generateViaMivaa(text);
} catch (error) {
  return await generateQueryEmbeddingViaOpenAI(text);
}

// ✅ NEW: MIVAA-only with proper error handling
const embedding = await EmbeddingService.generateEmbedding(text, {
  model: 'text-embedding-ada-002',
  user_id: request.user_id
});
```

**Apply to**: [`unified-material-search`](supabase/functions/unified-material-search/index.ts:68), [`enhanced-rag-search`](supabase/functions/enhanced-rag-search/index_optimized.ts:129)

---

### **Pattern C: Chat Completion Integration**
*For functions requiring conversational AI responses*

#### Template Implementation
```typescript
import { MivaaGatewayController } from '@/api/mivaa-gateway';

class ConversationalService {
  private static mivaaGateway = new MivaaGatewayController();

  static async generateChatCompletion(params: {
    messages: Array<{role: string; content: string}>;
    model?: string;
    max_tokens?: number;
    temperature?: number;
    user_id?: string;
  }): Promise<string> {
    
    const request = {
      action: 'chat_completion',
      payload: {
        messages: params.messages,
        model: params.model || 'gpt-4',
        max_tokens: params.max_tokens || 1500,
        temperature: params.temperature || 0.1,
        user_id: params.user_id || 'system'
      }
    };

    const response = await this.mivaaGateway.makeRequest(request);
    
    if (!response.success) {
      throw new Error(`MIVAA chat completion failed: ${response.error}`);
    }

    return response.data.choices[0].message.content;
  }

  static async generateContextualResponse(params: {
    query: string;
    context: any[];
    user_id?: string;
  }): Promise<string> {
    
    const request = {
      action: 'contextual_response',
      payload: {
        query: params.query,
        context: params.context,
        user_id: params.user_id || 'system'
      }
    };

    const response = await this.mivaaGateway.makeRequest(request);
    
    if (!response.success) {
      throw new Error(`MIVAA contextual response failed: ${response.error}`);
    }

    return response.data.response;
  }
}
```

#### Migration Example
```typescript
// ❌ OLD: Direct OpenAI chat completion
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${openaiKey}` },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery }
    ]
  })
});

// ✅ NEW: MIVAA chat completion
const response = await ConversationalService.generateChatCompletion({
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userQuery }
  ],
  model: 'gpt-4',
  user_id: request.user_id
});
```

**Apply to**: [`rag-knowledge-search`](supabase/functions/rag-knowledge-search/index.ts:186), [`material-agent-orchestrator`](supabase/functions/material-agent-orchestrator/index.ts:404)

---

### **Pattern D: Audio Transcription Integration**
*For functions requiring speech-to-text processing*

#### Template Implementation
```typescript
import { MivaaGatewayController } from '@/api/mivaa-gateway';

class AudioService {
  private static mivaaGateway = new MivaaGatewayController();

  static async transcribeAudio(params: {
    audio_data: Uint8Array;
    format: string;
    language?: string;
    user_id?: string;
  }): Promise<{text: string; confidence: number; processing_time_ms: number}> {
    
    // Convert audio data to base64 for transport
    const audioBase64 = btoa(String.fromCharCode(...params.audio_data));
    
    const request = {
      action: 'audio_transcription',
      payload: {
        audio_data: audioBase64,
        format: params.format,
        language: params.language || 'auto',
        user_id: params.user_id || 'system',
        options: {
          response_format: 'json',
          temperature: 0.0
        }
      }
    };

    const response = await this.mivaaGateway.makeRequest(request);
    
    if (!response.success) {
      throw new Error(`MIVAA audio transcription failed: ${response.error}`);
    }

    return {
      text: response.data.text,
      confidence: response.data.confidence || 1.0,
      processing_time_ms: response.metadata?.processingTime || 0
    };
  }
}
```

#### Migration Example
```typescript
// ❌ OLD: Direct OpenAI Whisper
const formData = new FormData();
formData.append('file', audioBlob, 'audio.webm');
formData.append('model', 'whisper-1');

const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${openaiKey}` },
  body: formData
});

// ✅ NEW: MIVAA audio transcription
const transcriptionResult = await AudioService.transcribeAudio({
  audio_data: audioData,
  format: 'webm',
  language: 'en',
  user_id: request.user_id
});
```

**Apply to**: [`voice-to-material`](supabase/functions/voice-to-material/index.ts:171)

---

### **Pattern E: Core Service Refactor**
*For services requiring architectural changes*

#### Template Implementation
```typescript
import { MivaaGatewayController } from '@/api/mivaa-gateway';

class RefactoredEmbeddingService {
  private mivaaGateway: MivaaGatewayController;
  private config: EmbeddingConfig;

  constructor(config: EmbeddingConfig) {
    this.config = config;
    this.mivaaGateway = new MivaaGatewayController();
  }

  // Preserve existing interface while changing backend
  async generateEmbedding(text: string): Promise<number[]> {
    return await this.mivaaGateway.makeRequest({
      action: 'embedding_generation',
      payload: {
        text: text,
        model: this.config.model,
        dimensions: this.config.dimensions,
        user_id: 'service'
      }
    }).then(response => {
      if (!response.success) {
        throw new Error(`Embedding generation failed: ${response.error}`);
      }
      return response.data.embedding;
    });
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    return await this.mivaaGateway.makeRequest({
      action: 'batch_embedding',
      payload: {
        texts: texts,
        model: this.config.model,
        dimensions: this.config.dimensions,
        user_id: 'service'
      }
    }).then(response => {
      if (!response.success) {
        throw new Error(`Batch embedding generation failed: ${response.error}`);
      }
      return response.data.embeddings;
    });
  }

  // Existing methods remain unchanged - only backend implementation changes
  async processText(text: string): Promise<ProcessedTextResult> {
    const embedding = await this.generateEmbedding(text);
    // ... rest of existing logic
    return processedResult;
  }
}
```

**Apply to**: [`embeddingGenerationService`](src/services/embeddingGenerationService.ts:6), [`hybridAIService`](src/services/hybridAIService.ts:89)

---

### **Pattern F: Error Handling & Fallbacks**
*Robust error handling for production systems*

#### Template Implementation
```typescript
class RobustMivaaService {
  private static mivaaGateway = new MivaaGatewayController();
  private static retryConfig = { maxRetries: 3, backoffMs: 1000 };

  static async makeRequestWithRetry(request: GatewayRequest): Promise<any> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await this.mivaaGateway.makeRequest(request);
        
        if (response.success) {
          return response;
        }
        
        throw new Error(`MIVAA request failed: ${response.error}`);
        
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on certain error types
        if (this.isNonRetriableError(error)) {
          throw error;
        }
        
        if (attempt < this.retryConfig.maxRetries) {
          const backoffTime = this.retryConfig.backoffMs * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          console.warn(`MIVAA request attempt ${attempt} failed, retrying in ${backoffTime}ms:`, error);
        }
      }
    }
    
    throw new Error(`MIVAA request failed after ${this.retryConfig.maxRetries} attempts: ${lastError.message}`);
  }

  private static isNonRetriableError(error: any): boolean {
    // Don't retry on authentication, validation, or quota errors
    const errorMessage = error.message?.toLowerCase() || '';
    return errorMessage.includes('unauthorized') || 
           errorMessage.includes('invalid') || 
           errorMessage.includes('quota exceeded');
  }
}
```

---

## 🚀 Migration Cookbook

### **Step 1: Identify Current OpenAI Pattern**
```typescript
// Look for these patterns in your function:
const openaiKey = Deno.env.get('OPENAI_API_KEY');
const response = await fetch('https://api.openai.com/v1/...');
```

### **Step 2: Choose Appropriate Template**
- **Vision + Embeddings** → Pattern A (Parallel Visual Analysis)
- **Text Embeddings Only** → Pattern B (MIVAA-Only Embedding)  
- **Chat/Completion** → Pattern C (Chat Completion Integration)
- **Audio Processing** → Pattern D (Audio Transcription Integration)
- **Core Service** → Pattern E (Core Service Refactor)

### **Step 3: Implement Template**
1. Import [`MivaaGatewayController`](src/api/mivaa-gateway.ts:1)
2. Replace OpenAI calls with appropriate MIVAA actions
3. Adapt response format to match existing interfaces
4. Add robust error handling using Pattern F

### **Step 4: Test & Validate**
```typescript
// Add validation to ensure functionality preservation
const originalResult = await oldOpenAIFunction(input);
const mivaaResult = await newMivaaFunction(input);

// Compare results for regression testing
const similarity = compareResults(originalResult, mivaaResult);
if (similarity < 0.95) {
  console.warn('MIVAA result differs significantly from OpenAI');
}
```

## 🔧 Utility Functions

### **Response Adapter**
```typescript
class MivaaResponseAdapter {
  static adaptOpenAIEmbeddingResponse(mivaaResponse: any): OpenAIEmbeddingResponse {
    return {
      object: 'list',
      data: [{
        object: 'embedding',
        embedding: mivaaResponse.data.embedding,
        index: 0
      }],
      model: mivaaResponse.data.model_used || 'text-embedding-ada-002',
      usage: {
        prompt_tokens: mivaaResponse.metadata?.inputTokens || 0,
        total_tokens: mivaaResponse.metadata?.totalTokens || 0
      }
    };
  }

  static adaptOpenAIChatResponse(mivaaResponse: any): OpenAIChatResponse {
    return {
      id: mivaaResponse.data.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: mivaaResponse.data.model_used || 'gpt-4',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: mivaaResponse.data.content || mivaaResponse.data.response
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: mivaaResponse.metadata?.inputTokens || 0,
        completion_tokens: mivaaResponse.metadata?.outputTokens || 0,
        total_tokens: mivaaResponse.metadata?.totalTokens || 0
      }
    };
  }
}
```

### **Performance Monitor**
```typescript
class MivaaPerformanceMonitor {
  static async measureMigrationImpact<T>(
    oldFunction: () => Promise<T>,
    newFunction: () => Promise<T>,
    testName: string
  ): Promise<{oldResult: T, newResult: T, performance: PerformanceComparison}> {
    
    const oldStart = Date.now();
    const oldResult = await oldFunction();
    const oldTime = Date.now() - oldStart;

    const newStart = Date.now();
    const newResult = await newFunction();
    const newTime = Date.now() - newStart;

    const performance = {
      oldLatency: oldTime,
      newLatency: newTime,
      latencyChange: ((newTime - oldTime) / oldTime) * 100,
      testName: testName
    };

    console.log(`Migration Performance Test: ${testName}`, performance);
    
    return { oldResult, newResult, performance };
  }
}
```

## 📊 Common Migration Scenarios

### **Scenario 1: Function with Existing MIVAA Fallback**
```typescript
// Current pattern with fallback
try {
  return await callMivaa(params);
} catch (error) {
  return await callOpenAI(params);  // Remove this
}

// Target pattern - MIVAA only
return await callMivaa(params);  // Enhance error handling instead
```

### **Scenario 2: Function with Multiple OpenAI Calls**
```typescript
// Current: Sequential OpenAI calls
const embedding = await openaiEmbedding(text);
const analysis = await openaiVision(image);

// Target: Parallel MIVAA calls
const [embedding, analysis] = await Promise.all([
  mivaaGateway.makeRequest({action: 'embedding_generation', payload: {text}}),
  mivaaGateway.makeRequest({action: 'llama_vision_analysis', payload: {image}})
]);
```

### **Scenario 3: Function with Complex OpenAI Configuration**
```typescript
// Current: Complex OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
  timeout: 30000
});

// Target: Simplified MIVAA gateway
const mivaaGateway = new MivaaGatewayController();
// All configuration handled in gateway
```

## ⚡ Performance Best Practices

### **1. Parallel Execution**
```typescript
// ✅ Good: Parallel independent requests
const [result1, result2] = await Promise.all([
  mivaaGateway.makeRequest({action: 'action1', payload: data1}),
  mivaaGateway.makeRequest({action: 'action2', payload: data2})
]);

// ❌ Avoid: Sequential dependent requests where parallelism possible
const result1 = await mivaaGateway.makeRequest({action: 'action1', payload: data1});
const result2 = await mivaaGateway.makeRequest({action: 'action2', payload: data2});
```

### **2. Batch Processing**
```typescript
// ✅ Good: Batch multiple similar requests
const embeddings = await mivaaGateway.makeRequest({
  action: 'batch_embedding',
  payload: { texts: multipleTexts }
});

// ❌ Avoid: Individual requests in loop
const embeddings = [];
for (const text of multipleTexts) {
  const embedding = await mivaaGateway.makeRequest({
    action: 'embedding_generation',
    payload: { text }
  });
  embeddings.push(embedding);
}
```

### **3. Error Context**
```typescript
// ✅ Good: Provide context in error handling
try {
  return await mivaaGateway.makeRequest(request);
} catch (error) {
  console.error('MIVAA request failed:', {
    action: request.action,
    user_id: request.payload.user_id,
    error: error.message,
    timestamp: new Date().toISOString()
  });
  throw error;
}
```

## 🧪 Testing Framework

### **Migration Test Template**
```typescript
describe('MIVAA Migration Tests', () => {
  test('should maintain functional compatibility', async () => {
    const testInput = { /* test data */ };
    
    // Test both implementations
    const mivaaResult = await newMivaaFunction(testInput);
    const expectedResult = await referenceFunction(testInput);
    
    // Validate compatibility
    expect(mivaaResult.success).toBe(true);
    expect(mivaaResult.data).toMatchObject(expectedResult);
  });

  test('should handle errors gracefully', async () => {
    const invalidInput = { /* invalid data */ };
    
    await expect(newMivaaFunction(invalidInput))
      .rejects
      .toThrow('MIVAA');
  });

  test('should maintain performance characteristics', async () => {
    const testInput = { /* performance test data */ };
    
    const start = Date.now();
    await newMivaaFunction(testInput);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(5000); // 5s max for most operations
  });
});
```

This template library ensures consistent, efficient, and maintainable MIVAA integrations across the platform while preserving existing functionality and performance characteristics.
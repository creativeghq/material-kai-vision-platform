# API Strategy Implementation Guide

## External API Integration Strategy

### 1. HuggingFace Inference API Setup

```typescript
// services/ml/huggingFaceService.ts
export class HuggingFaceMLService {
  private apiKey: string;
  private baseUrl = 'https://api-inference.huggingface.co/models/';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async classifyMaterial(imageFile: File): Promise<MaterialClassificationResult> {
    const formData = new FormData();
    formData.append('file', imageFile);

    const response = await fetch(
      `${this.baseUrl}microsoft/resnet-50`, 
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData
      }
    );

    return await response.json();
  }

  async extractSVBRDF(imageFile: File): Promise<SVBRDFResult> {
    // Use specialized SVBRDF model
    const response = await fetch(
      `${this.baseUrl}custom-svbrdf-model`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: await this.fileToBase64(imageFile)
        })
      }
    );

    return await response.json();
  }
}
```

### 2. Replicate Integration

```typescript
// services/ml/replicateService.ts
export class ReplicateMLService {
  private apiKey: string;
  private baseUrl = 'https://api.replicate.com/v1/predictions';

  async processDepthEstimation(imageUrl: string): Promise<DepthResult> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: "midas-depth-estimation-v3",
        input: {
          image: imageUrl
        }
      })
    });

    const prediction = await response.json();
    
    // Poll for completion
    return await this.pollForCompletion(prediction.id);
  }

  async generateSVBRDFMaps(imageUrl: string): Promise<SVBRDFMaps> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: "svbrdf-extraction-v2",
        input: {
          image: imageUrl,
          extract_albedo: true,
          extract_normal: true,
          extract_roughness: true,
          extract_metallic: true
        }
      })
    });

    return await this.pollForCompletion((await response.json()).id);
  }
}
```

### 3. Hybrid Processing Strategy

```typescript
// services/ml/hybridProcessingStrategy.ts
export class HybridProcessingStrategy {
  constructor(
    private huggingFace: HuggingFaceMLService,
    private replicate: ReplicateMLService,
    private clientML: ClientMLService
  ) {}

  async processImage(file: File, options: ProcessingOptions): Promise<ProcessingResult> {
    const results: Partial<ProcessingResult> = {};

    // Parallel processing for speed
    const promises = [];

    // 1. Basic analysis on client (fast)
    if (options.includeColorAnalysis) {
      promises.push(
        this.clientML.extractColors(file).then(colors => {
          results.colors = colors;
        })
      );
    }

    // 2. Material classification via HuggingFace (medium speed)
    if (options.includeMaterialClassification) {
      promises.push(
        this.huggingFace.classifyMaterial(file).then(classification => {
          results.materialType = classification;
        })
      );
    }

    // 3. SVBRDF extraction via Replicate (slow but high quality)
    if (options.includeSVBRDF) {
      promises.push(
        this.uploadAndProcess(file).then(url => 
          this.replicate.generateSVBRDFMaps(url)
        ).then(svbrdf => {
          results.svbrdf = svbrdf;
        })
      );
    }

    await Promise.allSettled(promises);
    return results as ProcessingResult;
  }

  private determineStrategy(file: File, options: ProcessingOptions): ProcessingStrategy {
    const fileSize = file.size;
    const complexity = this.calculateComplexity(options);

    if (fileSize < 1024 * 1024 && complexity < 0.5) {
      return 'client-only';
    } else if (complexity > 0.8) {
      return 'external-api-heavy';
    } else {
      return 'hybrid';
    }
  }
}
```

### 4. Cost Optimization

```typescript
// services/ml/costOptimizer.ts
export class CostOptimizer {
  private usageTracker = new Map<string, number>();
  private monthlyBudget = 500; // $500/month

  async optimizeProcessing(
    file: File, 
    options: ProcessingOptions
  ): Promise<OptimizedProcessingPlan> {
    const currentUsage = this.getCurrentMonthUsage();
    const remainingBudget = this.monthlyBudget - currentUsage;

    // If budget is low, prefer client-side processing
    if (remainingBudget < 50) {
      return {
        strategy: 'client-heavy',
        apis: ['basic-huggingface'],
        estimatedCost: 2.50
      };
    }

    // If budget is healthy, use premium APIs
    return {
      strategy: 'api-heavy',
      apis: ['replicate-svbrdf', 'huggingface-premium', 'google-vision'],
      estimatedCost: 15.75
    };
  }

  async cacheResults(key: string, result: any, ttl: number = 3600) {
    // Cache expensive API results to avoid repeat calls
    await this.redis.setex(key, ttl, JSON.stringify(result));
  }
}
```

### 5. Fallback Strategy

```typescript
// services/ml/fallbackStrategy.ts
export class FallbackStrategy {
  async processWithFallback(
    file: File, 
    options: ProcessingOptions
  ): Promise<ProcessingResult> {
    try {
      // Try premium API first
      return await this.replicate.processAdvanced(file, options);
    } catch (error) {
      console.warn('Premium API failed, falling back to HuggingFace');
      
      try {
        // Fallback to HuggingFace
        return await this.huggingFace.processStandard(file, options);
      } catch (error) {
        console.warn('HuggingFace failed, falling back to client-side');
        
        // Final fallback to client-side
        return await this.clientML.processBasic(file, options);
      }
    }
  }
}
```

## Cost-Benefit Analysis Summary

| Processing Type | Development Time | Monthly Cost | Accuracy | Latency |
|----------------|------------------|--------------|----------|---------|
| **Client-Only** | 4-6 weeks | $0 | 70-80% | <100ms |
| **API-Heavy** | 1-2 weeks | $200-500 | 90-95% | 2-5s |
| **Hybrid** | 3-4 weeks | $100-300 | 85-92% | 0.5-3s |

## Recommended Implementation Order

1. **Week 1-2**: Set up HuggingFace API integration
2. **Week 3-4**: Implement Replicate for SVBRDF processing
3. **Week 5-6**: Add client-side color analysis and basic processing
4. **Week 7-8**: Implement hybrid strategy and cost optimization
5. **Week 9-10**: Add fallback mechanisms and performance tuning

This strategy gives us the best balance of development speed, cost control, and functionality.
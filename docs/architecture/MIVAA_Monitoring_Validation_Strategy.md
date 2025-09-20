+++
# --- Basic Metadata ---
id = "MIVAA-MONITORING-VALIDATION-V1"
title = "MIVAA Monitoring & Validation Strategy"
context_type = "technical_specification"
scope = "Comprehensive monitoring, validation, and fallback strategies for MIVAA platform migration"
target_audience = ["sre-veteran", "lead-backend", "util-performance", "dev-core-web"]
granularity = "detailed"
status = "active"
last_updated = "2025-09-09"
tags = ["mivaa", "monitoring", "validation", "fallback", "performance", "reliability", "migration"]
related_context = [
    "docs/architecture/OpenAI_Integration_Catalog_Migration_Plan.md",
    "docs/architecture/ADR-001-MIVAA-Modular-Multimodal-Standardization.md",
    "docs/architecture/MIVAA_Integration_Templates.md",
    "src/api/mivaa-gateway.ts"
]
template_schema_doc = ".ruru/templates/toml-md/16_ai_rule.README.md"
relevance = "Critical: Ensures reliable MIVAA platform operation and migration success"
+++

# MIVAA Monitoring & Validation Strategy

## Executive Summary

This document defines comprehensive monitoring, validation, and fallback strategies to ensure reliable operation during and after the MIVAA platform migration, with zero-downtime transition from scattered OpenAI integrations to unified MIVAA-first architecture.

## 🎯 Success Criteria

### **Migration Success Metrics**
- **Cost Reduction**: Achieve 60%+ reduction in AI API costs (target: $2,850/month savings)
- **Performance**: Maintain <10% latency increase compared to direct OpenAI calls
- **Reliability**: 99.5%+ uptime for critical visual analysis functions
- **Functionality**: 100% functional compatibility with existing OpenAI integrations

### **Operational Health Metrics**
- **MIVAA Gateway**: 99.9% availability and <2s response time for 95% of requests
- **Error Rate**: <1% failure rate for MIVAA actions
- **Fallback Usage**: <5% of requests using temporary fallbacks during migration

## 📊 Monitoring Architecture

### **1. Real-Time Metrics Dashboard**

#### Core MIVAA Gateway Metrics
```typescript
interface MivaaGatewayMetrics {
  // Request metrics
  totalRequests: number;
  requestsPerSecond: number;
  successRate: number;
  errorRate: number;
  
  // Performance metrics
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  
  // Action-specific metrics
  actionMetrics: {
    [action: string]: {
      requestCount: number;
      successRate: number;
      averageLatency: number;
      errorTypes: Record<string, number>;
    }
  };
  
  // Cost metrics
  estimatedCost: number;
  costPerRequest: number;
  monthlyCostProjection: number;
}
```

#### Implementation Location
```typescript
// File: src/services/monitoring/mivaaMetricsCollector.ts
class MivaaMetricsCollector {
  private metrics: MivaaGatewayMetrics;
  private metricsBuffer: MetricEvent[];
  
  collectRequestMetrics(request: GatewayRequest, response: GatewayResponse, duration: number) {
    // Collect metrics for real-time dashboard
    this.updateMetrics(request.action, response.success, duration);
    this.estimateCost(request.action, request.payload);
  }
  
  async publishMetrics() {
    // Send to monitoring service (DataDog, Grafana, etc.)
    await this.publishToMonitoringService(this.metrics);
  }
}
```

### **2. Health Check System**

#### Multi-Level Health Monitoring
```typescript
// File: src/services/monitoring/mivaaHealthMonitor.ts
class MivaaHealthMonitor {
  async performComprehensiveHealthCheck(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkGatewayHealth(),           // MIVAA gateway responsiveness
      this.checkActionAvailability(),     // All actions responding
      this.checkPerformanceThresholds(),  // Latency within bounds
      this.checkErrorRates(),             // Error rates acceptable
      this.checkCostTracking(),           // Cost tracking functioning
    ]);
    
    return this.aggregateHealthStatus(checks);
  }
  
  private async checkActionAvailability(): Promise<ActionHealthStatus[]> {
    const criticalActions = [
      'llama_vision_analysis',
      'clip_embedding_generation', 
      'embedding_generation',
      'chat_completion'
    ];
    
    return await Promise.all(
      criticalActions.map(action => this.checkActionHealth(action))
    );
  }
}
```

### **3. Migration Progress Tracking**

#### Function Migration Status
```typescript
interface MigrationStatus {
  totalFunctions: number;
  migratedFunctions: number;
  inProgressFunctions: number;
  pendingFunctions: number;
  
  migrationProgress: {
    [functionName: string]: {
      status: 'pending' | 'in_progress' | 'testing' | 'completed' | 'rolled_back';
      openaiCallsRemaining: number;
      mivaaActionsImplemented: string[];
      performanceComparison?: PerformanceComparison;
      lastUpdated: string;
    }
  };
}
```

## 🧪 Validation Framework

### **1. A/B Testing Implementation**

#### Parallel Execution for Validation
```typescript
// File: src/services/validation/mivaaABTesting.ts
class MivaaABTestingService {
  async runABTest<T>(
    openaiFunction: () => Promise<T>,
    mivaaFunction: () => Promise<T>,
    testConfig: ABTestConfig
  ): Promise<ABTestResult<T>> {
    
    const startTime = Date.now();
    
    try {
      // Run both implementations in parallel
      const [openaiResult, mivaaResult] = await Promise.allSettled([
        this.timeFunction(openaiFunction),
        this.timeFunction(mivaaFunction)
      ]);
      
      // Compare results
      const comparison = await this.compareResults(
        openaiResult.status === 'fulfilled' ? openaiResult.value : null,
        mivaaResult.status === 'fulfilled' ? mivaaResult.value : null,
        testConfig.comparisonStrategy
      );
      
      return {
        openaiResult: openaiResult.status === 'fulfilled' ? openaiResult.value : null,
        mivaaResult: mivaaResult.status === 'fulfilled' ? mivaaResult.value : null,
        comparison,
        testDuration: Date.now() - startTime,
        recommendation: this.generateRecommendation(comparison)
      };
      
    } catch (error) {
      console.error('A/B test execution failed:', error);
      throw error;
    }
  }
  
  private async compareResults(
    openaiResult: any, 
    mivaaResult: any, 
    strategy: ComparisonStrategy
  ): Promise<ComparisonResult> {
    
    switch (strategy) {
      case 'visual_analysis':
        return this.compareVisualAnalysisResults(openaiResult, mivaaResult);
      case 'embeddings':
        return this.compareEmbeddingResults(openaiResult, mivaaResult);
      case 'chat_completion':
        return this.compareChatResults(openaiResult, mivaaResult);
      default:
        return this.compareGenericResults(openaiResult, mivaaResult);
    }
  }
}
```

### **2. Performance Benchmarking**

#### Comprehensive Performance Testing
```typescript
// File: src/services/validation/performanceBenchmark.ts
class PerformanceBenchmarkService {
  async benchmarkMigration(functionName: string, testCases: TestCase[]): Promise<BenchmarkReport> {
    const results: BenchmarkResult[] = [];
    
    for (const testCase of testCases) {
      console.log(`Benchmarking ${functionName} with ${testCase.description}`);
      
      // Baseline: Original OpenAI implementation
      const baselineMetrics = await this.measurePerformance(
        () => testCase.openaiFunction(testCase.input),
        'openai_baseline'
      );
      
      // Target: New MIVAA implementation  
      const mivaaMetrics = await this.measurePerformance(
        () => testCase.mivaaFunction(testCase.input),
        'mivaa_target'
      );
      
      results.push({
        testCase: testCase.description,
        baseline: baselineMetrics,
        target: mivaaMetrics,
        improvement: this.calculateImprovement(baselineMetrics, mivaaMetrics)
      });
    }
    
    return this.generateBenchmarkReport(functionName, results);
  }
  
  private async measurePerformance(
    testFunction: () => Promise<any>,
    label: string
  ): Promise<PerformanceMetrics> {
    
    const runs = 10; // Multiple runs for statistical significance
    const metrics: number[] = [];
    
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      try {
        await testFunction();
        const duration = performance.now() - start;
        metrics.push(duration);
      } catch (error) {
        console.warn(`Performance test run ${i} failed for ${label}:`, error);
        metrics.push(Infinity); // Record failure
      }
    }
    
    return {
      label,
      runs: runs,
      successful: metrics.filter(m => m !== Infinity).length,
      averageLatency: this.average(metrics.filter(m => m !== Infinity)),
      medianLatency: this.median(metrics.filter(m => m !== Infinity)),
      p95Latency: this.percentile(metrics.filter(m => m !== Infinity), 95),
      errorRate: (metrics.filter(m => m === Infinity).length / runs) * 100
    };
  }
}
```

### **3. Accuracy Validation**

#### Visual Analysis Accuracy Testing
```typescript
class AccuracyValidationService {
  async validateVisualAnalysisAccuracy(): Promise<ValidationReport> {
    // Use golden dataset of pre-validated material images
    const goldenDataset = await this.loadGoldenDataset();
    const results: AccuracyResult[] = [];
    
    for (const testImage of goldenDataset) {
      // Run both OpenAI and MIVAA on same image
      const openaiResult = await this.runOpenAIAnalysis(testImage);
      const mivaaResult = await this.runMivaaAnalysis(testImage);
      
      // Compare against ground truth
      const openaiAccuracy = this.calculateAccuracy(openaiResult, testImage.groundTruth);
      const mivaaAccuracy = this.calculateAccuracy(mivaaResult, testImage.groundTruth);
      
      results.push({
        imageId: testImage.id,
        openaiAccuracy,
        mivaaAccuracy,
        accuracyDifference: mivaaAccuracy - openaiAccuracy,
        materialType: testImage.materialType
      });
    }
    
    return this.generateAccuracyReport(results);
  }
  
  private calculateAccuracy(result: any, groundTruth: any): number {
    // Sophisticated accuracy calculation for material analysis
    const materialTypeMatch = result.material_type === groundTruth.material_type ? 1 : 0;
    const colorAccuracy = this.compareColors(result.color, groundTruth.color);
    const textureAccuracy = this.compareTextures(result.texture, groundTruth.texture);
    const propertiesAccuracy = this.compareProperties(result.properties, groundTruth.properties);
    
    // Weighted accuracy score
    return (materialTypeMatch * 0.4) + 
           (colorAccuracy * 0.2) + 
           (textureAccuracy * 0.2) + 
           (propertiesAccuracy * 0.2);
  }
}
```

## 🛡️ Fallback Strategies

### **1. Graceful Degradation Hierarchy**

#### Primary → Secondary → Emergency Fallback Chain
```typescript
class FallbackStrategy {
  async executeWithFallbacks<T>(
    request: GatewayRequest,
    fallbackConfig: FallbackConfig
  ): Promise<T> {
    
    // Primary: MIVAA Gateway
    try {
      const result = await this.executePrimary(request);
      this.recordSuccess('mivaa_primary', request.action);
      return result;
    } catch (primaryError) {
      console.warn('MIVAA primary failed, trying fallbacks:', primaryError);
    }
    
    // Secondary: MIVAA Direct (bypass gateway)
    if (fallbackConfig.allowDirectMivaa) {
      try {
        const result = await this.executeMivaaDirect(request);
        this.recordSuccess('mivaa_direct', request.action);
        return result;
      } catch (secondaryError) {
        console.warn('MIVAA direct failed:', secondaryError);
      }
    }
    
    // Emergency: Temporary OpenAI fallback (migration only)
    if (fallbackConfig.allowOpenAIFallback && this.isMigrationPhase()) {
      console.warn('Using emergency OpenAI fallback - migration should resolve this');
      const result = await this.executeOpenAIFallback(request);
      this.recordFallbackUsage('openai_emergency', request.action);
      return result;
    }
    
    // Final: Return error if all fallbacks exhausted
    throw new Error(`All fallback strategies exhausted for action: ${request.action}`);
  }
}
```

### **2. Circuit Breaker Pattern**

#### Prevent Cascade Failures
```typescript
class MivaaCircuitBreaker {
  private actionStates: Map<string, CircuitState> = new Map();
  
  async executeWithCircuitBreaker<T>(
    action: string,
    execution: () => Promise<T>
  ): Promise<T> {
    
    const state = this.getCircuitState(action);
    
    // Circuit OPEN: Fast fail
    if (state.status === 'OPEN') {
      if (Date.now() - state.lastFailureTime < state.timeoutMs) {
        throw new Error(`Circuit breaker OPEN for action: ${action}`);
      }
      // Attempt to transition to HALF_OPEN
      state.status = 'HALF_OPEN';
    }
    
    try {
      const result = await execution();
      
      // Success: Reset or transition to CLOSED
      state.failureCount = 0;
      state.status = 'CLOSED';
      
      return result;
      
    } catch (error) {
      state.failureCount++;
      state.lastFailureTime = Date.now();
      
      // Transition to OPEN if failure threshold exceeded
      if (state.failureCount >= state.failureThreshold) {
        state.status = 'OPEN';
        console.error(`Circuit breaker OPENED for action: ${action} after ${state.failureCount} failures`);
      }
      
      throw error;
    }
  }
}
```

### **3. Auto-Recovery Mechanisms**

#### Intelligent Retry with Exponential Backoff
```typescript
class AutoRecoveryService {
  async executeWithRecovery<T>(
    request: GatewayRequest,
    options: RecoveryOptions = {}
  ): Promise<T> {
    
    const maxRetries = options.maxRetries || 3;
    const baseDelayMs = options.baseDelayMs || 1000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeRequest(request);
        
      } catch (error) {
        const shouldRetry = this.shouldRetryError(error, attempt, maxRetries);
        
        if (!shouldRetry) {
          throw error;
        }
        
        // Exponential backoff with jitter
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 0.1 * delayMs;
        const totalDelay = delayMs + jitter;
        
        console.warn(`MIVAA request failed (attempt ${attempt}/${maxRetries}), retrying in ${totalDelay}ms:`, error.message);
        await new Promise(resolve => setTimeout(resolve, totalDelay));
      }
    }
  }
  
  private shouldRetryError(error: any, attempt: number, maxRetries: number): boolean {
    // Don't retry on client errors (4xx) or if max retries reached
    if (attempt >= maxRetries) return false;
    
    const errorMessage = error.message?.toLowerCase() || '';
    
    // Retry on temporary failures
    if (errorMessage.includes('timeout') || 
        errorMessage.includes('rate limit') ||
        errorMessage.includes('service unavailable')) {
      return true;
    }
    
    // Don't retry on permanent failures
    if (errorMessage.includes('unauthorized') || 
        errorMessage.includes('invalid') ||
        errorMessage.includes('not found')) {
      return false;
    }
    
    return true; // Default: retry
  }
}
```

## 📈 Migration Validation Process

### **Phase 1: Pre-Migration Validation**

#### 1. Baseline Performance Measurement
```bash
# Performance baseline script
npm run benchmark:openai-baseline
npm run benchmark:mivaa-readiness-test
npm run test:integration:pre-migration
```

#### 2. MIVAA Service Validation
```typescript
// Pre-migration validation suite
describe('Pre-Migration Validation', () => {
  test('MIVAA gateway responds to all required actions', async () => {
    const requiredActions = [
      'llama_vision_analysis',
      'clip_embedding_generation',
      'embedding_generation',
      'chat_completion',
      'audio_transcription'
    ];
    
    for (const action of requiredActions) {
      await expect(mivaaGateway.makeRequest({
        action,
        payload: { test: true }
      })).resolves.toHaveProperty('success');
    }
  });
  
  test('Performance within acceptable thresholds', async () => {
    const testImage = loadTestImage();
    const start = Date.now();
    
    await mivaaGateway.makeRequest({
      action: 'llama_vision_analysis',
      payload: { image_data: testImage }
    });
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(5000); // 5s threshold
  });
});
```

### **Phase 2: During Migration Validation**

#### 1. Continuous Comparison Testing
```typescript
// File: src/services/validation/migrationValidator.ts
class MigrationValidator {
  async validateMigration(functionName: string): Promise<MigrationValidationReport> {
    const testCases = await this.loadTestCasesFor(functionName);
    const results: ValidationResult[] = [];
    
    for (const testCase of testCases) {
      // Run A/B test
      const abResult = await this.abTestingService.runABTest(
        () => testCase.openaiImplementation(testCase.input),
        () => testCase.mivaaImplementation(testCase.input),
        {
          comparisonStrategy: testCase.comparisonStrategy,
          toleranceThreshold: testCase.toleranceThreshold
        }
      );
      
      results.push({
        testCase: testCase.name,
        functionalEquivalence: abResult.comparison.functionalScore,
        performanceRatio: abResult.comparison.performanceRatio,
        costImpact: abResult.comparison.costDifference,
        passed: this.evaluateTestResult(abResult, testCase.passingCriteria)
      });
    }
    
    return this.generateValidationReport(functionName, results);
  }
}
```

#### 2. Real-Time Regression Detection
```typescript
class RegressionDetector {
  private baselineMetrics: Map<string, BaselineMetrics> = new Map();
  
  async detectRegression(
    functionName: string,
    currentMetrics: PerformanceMetrics
  ): Promise<RegressionAlert | null> {
    
    const baseline = this.baselineMetrics.get(functionName);
    if (!baseline) {
      console.warn(`No baseline metrics for ${functionName}`);
      return null;
    }
    
    const regressions: string[] = [];
    
    // Check latency regression
    if (currentMetrics.averageLatency > baseline.averageLatency * 1.2) {
      regressions.push(`Latency increased by ${((currentMetrics.averageLatency / baseline.averageLatency - 1) * 100).toFixed(1)}%`);
    }
    
    // Check error rate regression
    if (currentMetrics.errorRate > baseline.errorRate * 2) {
      regressions.push(`Error rate increased by ${((currentMetrics.errorRate / baseline.errorRate - 1) * 100).toFixed(1)}%`);
    }
    
    // Check accuracy regression (for applicable functions)
    if (currentMetrics.accuracyScore && currentMetrics.accuracyScore < baseline.accuracyScore * 0.95) {
      regressions.push(`Accuracy decreased by ${((1 - currentMetrics.accuracyScore / baseline.accuracyScore) * 100).toFixed(1)}%`);
    }
    
    if (regressions.length > 0) {
      return {
        functionName,
        severity: this.calculateSeverity(regressions),
        regressions,
        recommendedAction: this.getRecommendedAction(regressions),
        timestamp: new Date().toISOString()
      };
    }
    
    return null;
  }
}
```

### **Phase 3: Post-Migration Validation**

#### 1. Production Health Monitoring
```typescript
class ProductionHealthMonitor {
  async runContinuousValidation(): Promise<void> {
    setInterval(async () => {
      try {
        const healthStatus = await this.mivaaHealthMonitor.performComprehensiveHealthCheck();
        
        if (healthStatus.overall !== 'healthy') {
          await this.alertingService.sendAlert({
            severity: healthStatus.severity,
            message: `MIVAA health check failed: ${healthStatus.details}`,
            actions: healthStatus.recommendedActions
          });
        }
        
        // Check for regressions
        const currentMetrics = await this.metricsCollector.getCurrentMetrics();
        for (const [functionName, metrics] of currentMetrics.entries()) {
          const regression = await this.regressionDetector.detectRegression(functionName, metrics);
          if (regression) {
            await this.handleRegression(regression);
          }
        }
        
      } catch (error) {
        console.error('Health monitoring failed:', error);
      }
    }, 60000); // Check every minute
  }
}
```

## 🚨 Alerting & Incident Response

### **Alert Definitions**

#### Critical Alerts (Immediate Response)
```typescript
const CRITICAL_ALERTS = {
  MIVAA_GATEWAY_DOWN: {
    condition: 'Gateway health check fails for >2 minutes',
    action: 'Activate emergency OpenAI fallback, escalate to on-call engineer',
    severity: 'P0'
  },
  
  HIGH_ERROR_RATE: {
    condition: 'Error rate >5% for >5 minutes',
    action: 'Check MIVAA service logs, consider temporary fallback activation',
    severity: 'P1'
  },
  
  PERFORMANCE_DEGRADATION: {
    condition: 'P95 latency >200% of baseline for >10 minutes',
    action: 'Check resource utilization, scale MIVAA service if needed',
    severity: 'P1'
  }
};
```

#### Warning Alerts (Monitoring)
```typescript
const WARNING_ALERTS = {
  COST_SPIKE: {
    condition: 'Daily cost >150% of projected amount',
    action: 'Review request patterns, check for runaway processes',
    severity: 'P2'
  },
  
  FALLBACK_USAGE: {
    condition: 'OpenAI fallback usage >10% for >1 hour during migration',
    action: 'Review migration progress, investigate MIVAA issues',
    severity: 'P2'
  },
  
  ACCURACY_DECLINE: {
    condition: 'Material analysis accuracy <90% for >1 hour',
    action: 'Review model performance, consider model retraining',
    severity: 'P2'
  }
};
```

### **Incident Response Playbook**

#### 1. MIVAA Service Failure
```
Immediate Actions (0-5 minutes):
1. Activate OpenAI fallback for critical functions
2. Check MIVAA service health status
3. Review recent deployment changes
4. Escalate to engineering team

Investigation (5-30 minutes):
1. Analyze MIVAA service logs
2. Check resource utilization and scaling
3. Verify network connectivity
4. Test individual MIVAA actions

Resolution (30+ minutes):
1. Fix identified issues
2. Gradual traffic restoration to MIVAA
3. Monitor for stability
4. Document incident and lessons learned
```

#### 2. Performance Degradation
```
Immediate Actions (0-10 minutes):
1. Check if degradation affects all actions or specific ones
2. Review current load and scaling metrics
3. Verify no resource constraints

Investigation (10-30 minutes):
1. Compare current vs baseline performance metrics
2. Check for recent configuration changes
3. Analyze slow request patterns
4. Review MIVAA service resource usage

Resolution (30+ minutes):
1. Scale MIVAA service if resource-constrained
2. Optimize request patterns if applicable
3. Consider load balancing adjustments
4. Monitor for performance recovery
```

## 📊 Metrics Collection Implementation

### **1. Request-Level Metrics**
```typescript
// File: src/middleware/mivaaMetricsMiddleware.ts
export function mivaaMetricsMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
    
    // Wrap response to capture completion metrics
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      
      // Collect metrics
      metricsCollector.recordRequest({
        requestId,
        action: req.body?.action,
        success: res.statusCode < 400,
        duration,
        statusCode: res.statusCode,
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString()
      });
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}
```

### **2. Cost Tracking**
```typescript
class CostTracker {
  private costModels = {
    'llama_vision_analysis': 0.008,      // per request
    'clip_embedding_generation': 0.001,  // per request  
    'embedding_generation': 0.0001,      // per 1K tokens
    'chat_completion': 0.03,             // per request
    'audio_transcription': 0.006         // per minute
  };
  
  calculateRequestCost(action: string, payload: any): number {
    const baseCost = this.costModels[action] || 0;
    
    switch (action) {
      case 'embedding_generation':
        const tokens = this.estimateTokens(payload.text);
        return (tokens / 1000) * baseCost;
        
      case 'audio_transcription':
        const minutes = this.estimateAudioMinutes(payload.audio_data);
        return minutes * baseCost;
        
      default:
        return baseCost;
    }
  }
  
  async generateDailyCostReport(): Promise<CostReport> {
    const today = new Date().toISOString().split('T')[0];
    const requests = await this.getRequestsForDate(today);
    
    let totalCost = 0;
    const costByAction: Record<string, number> = {};
    
    for (const request of requests) {
      const cost = this.calculateRequestCost(request.action, request.payload);
      totalCost += cost;
      costByAction[request.action] = (costByAction[request.action] || 0) + cost;
    }
    
    return {
      date: today,
      totalCost,
      costByAction,
      requestCount: requests.length,
      projectedMonthlyCost: totalCost * 30
    };
  }
}
```

## 🔍 Quality Assurance Framework

### **1. Automated Testing Pipeline**
```typescript
// File: tests/integration/mivaa-migration.test.ts
describe('MIVAA Migration Quality Assurance', () => {
  describe('Visual Analysis Functions', () => {
    test('hybrid-material-analysis maintains accuracy', async () => {
      const testImages = loadMaterialTestDataset();
      
      for (const testImage of testImages.slice(0, 10)) { // Sample for CI speed
        const mivaaResult = await hybridMaterialAnalysisMivaa(testImage.url);
        const expectedResult = testImage.expectedOutput;
        
        expect(mivaaResult.material_type).toBe(expectedResult.material_type);
        expect(mivaaResult.confidence_score).toBeGreaterThan(0.7);
        expect(mivaaResult.processing_time_ms).toBeLessThan(5000);
      }
    });
    
    test('parallel processing maintains performance', async () => {
      const testImage = loadPerformanceTestImage();
      
      const start = Date.now();
      const [llamaResult, clipResult] = await Promise.all([
        mivaaGateway.makeRequest({action: 'llama_vision_analysis', payload: {image_data: testImage}}),
        mivaaGateway.makeRequest({action: 'clip_embedding_generation', payload: {image_data: testImage}})
      ]);
      const parallelDuration = Date.now() - start;
      
      // Should be faster than sequential processing
      expect(parallelDuration).toBeLessThan(8000); // Combined threshold
      expect(llamaResult.success).toBe(true);
      expect(clipResult.success).toBe(true);
    });
  });
  
  describe('Cost Optimization', () => {
    test('MIVAA costs below OpenAI equivalent', async () => {
      const testRequests = generateTestRequestBatch(100);
      
      const mivaaCosts = await calculateMivaaCosts(testRequests);
      const openaiCosts = await calculateOpenAICosts(testRequests);
      
      expect(mivaaCosts.total).toBeLessThan(openaiCosts.total * 0.7); // 30%+
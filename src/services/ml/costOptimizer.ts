/**
 * Cost Optimizer & Usage Tracker
 * Manages API costs and optimizes resource usage
 */

import { supabase } from '@/integrations/supabase/client';

import { BaseService, ServiceConfig } from '../base/BaseService';

interface CostOptimizerServiceConfig extends ServiceConfig {
  monthlyBudget: number;
  warningThreshold: number; // Percentage of budget
  emergencyThreshold: number; // Percentage of budget
  costPerProvider: Record<string, number>;
  analysisInterval: number; // Analysis interval in milliseconds
  enableCaching: boolean;
  cacheExpirationMs: number;
  enableBudgetAlerts: boolean;
  enableOptimizationInsights: boolean;
}

interface CostConfig {
  monthlyBudget: number;
  warningThreshold: number; // Percentage of budget
  emergencyThreshold: number; // Percentage of budget
  costPerProvider: Record<string, number>;
}

interface UsageMetrics {
  provider: string;
  endpoint: string;
  requests: number;
  cost: number;
  averageLatency: number;
  errorRate: number;
  timestamp: string;
}

interface BudgetAlert {
  type: 'warning' | 'emergency' | 'info';
  message: string;
  currentSpend: number;
  budgetRemaining: number;
  projectedSpend: number;
}

interface OptimizedStrategy {
  provider: 'client' | 'huggingface' | 'replicate' | 'openai';
  confidence: number;
  estimatedCost: number;
  estimatedTime: number;
  reasoning: string;
}

interface CacheStrategy {
  key: string;
  ttl: number;
  cost_savings: number;
  hit_rate: number;
}

export class CostOptimizer extends BaseService<CostOptimizerServiceConfig> {
  private usageCache = new Map<string, UsageMetrics[]>();
  // private lastAnalysis = 0; // Currently unused

  protected constructor(config?: Partial<CostOptimizerServiceConfig>) {
    const defaultConfig: CostOptimizerServiceConfig = {
      name: 'CostOptimizer',
      version: '1.0.0',
      environment: 'production',
      enabled: true,
      monthlyBudget: 500, // $500/month default
      warningThreshold: 75, // 75% of budget
      emergencyThreshold: 90, // 90% of budget
      costPerProvider: {
        openai: 0.002, // per request average
        huggingface: 0.001,
        replicate: 0.05,
        client: 0.0,
        anthropic: 0.003,
      },
      analysisInterval: 3600000, // 1 hour
      enableCaching: true,
      cacheExpirationMs: 300000, // 5 minutes
      enableBudgetAlerts: true,
      enableOptimizationInsights: true,
      healthCheck: {
        enabled: true,
        interval: 30000,
        timeout: 5000,
      },
    };

    super({ ...defaultConfig, ...config });
  }

  static createInstance(
    config?: Partial<CostOptimizerServiceConfig>,
  ): CostOptimizer {
    return new CostOptimizer(config);
  }

  protected async doInitialize(): Promise<void> {
    // Test Supabase connection
    const { error } = await supabase
      .from('analytics_events')
      .select('count')
      .limit(1);
    if (error) {
      throw new Error(
        `Failed to connect to analytics database: ${error.message}`,
      );
    }

    // Initialize usage cache
    this.usageCache.clear();
    // this.lastAnalysis = 0; // Currently unused
  }

  protected async doHealthCheck(): Promise<void> {
    // Check Supabase connection
    const { error } = await supabase
      .from('analytics_events')
      .select('count')
      .limit(1);
    if (error) {
      throw new Error(`Analytics database connection failed: ${error.message}`);
    }

    // Check if budget configuration is valid
    if (this.config.monthlyBudget <= 0) {
      throw new Error(
        'Invalid budget configuration: monthly budget must be positive',
      );
    }

    if (this.config.warningThreshold >= this.config.emergencyThreshold) {
      throw new Error(
        'Invalid threshold configuration: warning threshold must be less than emergency threshold',
      );
    }
  }

  /**
   * Optimize processing strategy based on budget and requirements
   */
  async optimizeProcessing(
    fileSize: number,
    complexity: number,
    qualityRequirement: 'basic' | 'standard' | 'premium',
    userBudgetPreference?: 'cost' | 'balanced' | 'performance',
  ): Promise<OptimizedStrategy> {
    const currentUsage = await this.getCurrentMonthUsage();
    const remainingBudget = this.config.monthlyBudget - currentUsage.totalCost;
    const preference = userBudgetPreference || 'balanced';

    // Check budget constraints
    if (remainingBudget < 10) {
      return {
        provider: 'client',
        confidence: 0.6,
        estimatedCost: 0,
        estimatedTime: 5000,
        reasoning:
          'Budget nearly exhausted - using client-side processing only',
      };
    }

    // Analyze optimal strategy
    const strategies = await this.analyzeStrategies(
      fileSize,
      complexity,
      qualityRequirement,
    );
    const budgetConstrainedStrategies = strategies.filter(
      (s) => s.estimatedCost <= remainingBudget * 0.1,
    );

    if (budgetConstrainedStrategies.length === 0) {
      return strategies.find((s) => s.provider === 'client') || strategies[0];
    }

    // Select based on user preference
    switch (preference) {
      case 'cost':
        return budgetConstrainedStrategies.reduce((min, current) =>
          current.estimatedCost < min.estimatedCost ? current : min,
        );

      case 'performance':
        return budgetConstrainedStrategies.reduce((fastest, current) =>
          current.estimatedTime < fastest.estimatedTime ? current : fastest,
        );

      case 'balanced':
      default:
        return budgetConstrainedStrategies.reduce((best, current) => {
          const currentScore =
            current.confidence * 0.4 +
            (1 - current.estimatedCost / remainingBudget) * 0.3 +
            (1 - current.estimatedTime / 60000) * 0.3;
          const bestScore =
            best.confidence * 0.4 +
            (1 - best.estimatedCost / remainingBudget) * 0.3 +
            (1 - best.estimatedTime / 60000) * 0.3;
          return currentScore > bestScore ? current : best;
        });
    }
  }

  /**
   * Track API usage and costs
   */
  async trackUsage(
    provider: string,
    endpoint: string,
    cost: number,
    latency: number,
    success: boolean,
  ): Promise<void> {
    const usage: UsageMetrics = {
      provider,
      endpoint,
      requests: 1,
      cost,
      averageLatency: latency,
      errorRate: success ? 0 : 1,
      timestamp: new Date().toISOString(),
    };

    // Store in local cache
    const key = `${provider}-${endpoint}`;
    if (!this.usageCache.has(key)) {
      this.usageCache.set(key, []);
    }
    this.usageCache.get(key)!.push(usage);

    // Store in database for persistence
    try {
      await supabase.from('analytics_events').insert([
        {
          event_type: 'api_usage',
          event_data: {
            provider,
            endpoint,
            cost,
            latency,
            success,
            timestamp: usage.timestamp,
          },
        },
      ]);
    } catch (error) {
      console.error('Failed to track usage in database:', error);
    }
  }

  /**
   * Get current month usage and costs
   */
  async getCurrentMonthUsage(): Promise<{
    totalCost: number;
    requestCount: number;
    byProvider: Record<string, { cost: number; requests: number }>;
    dailySpend: { date: string; cost: number }[];
  }> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    try {
      const { data: events, error } = await supabase
        .from('analytics_events')
        .select('event_data, created_at')
        .eq('event_type', 'api_usage')
        .gte('created_at', startOfMonth.toISOString());

      if (error) {
        console.error('Failed to fetch usage data:', error);
        return {
          totalCost: 0,
          requestCount: 0,
          byProvider: {},
          dailySpend: [],
        };
      }

      const usage = events?.reduce(
        (acc: any, event: any) => {
          const data = event.event_data as Record<string, unknown>;
          const provider = (data.provider as string) || 'unknown';
          const cost = (data.cost as number) || 0;

          acc.totalCost += cost;
          acc.requestCount += 1;

          if (!acc.byProvider[provider]) {
            acc.byProvider[provider] = { cost: 0, requests: 0 };
          }
          acc.byProvider[provider].cost += cost;
          acc.byProvider[provider].requests += 1;

          return acc;
        },
        {
          totalCost: 0,
          requestCount: 0,
          byProvider: {} as Record<string, { cost: number; requests: number }>,
          dailySpend: [] as { date: string; cost: number }[],
        },
      );

      // Calculate daily spend
      const dailySpendMap = events?.reduce(
        (acc: any, event: any) => {
          const date = event.created_at.split('T')[0];
          const cost =
            ((event.event_data as Record<string, unknown>).cost as number) || 0;
          acc[date] = (acc[date] || 0) + cost;
          return acc;
        },
        {} as Record<string, number>,
      );

      usage.dailySpend = Object.entries(dailySpendMap || {})
        .map(([date, cost]) => ({ date, cost }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return usage;
    } catch (error) {
      console.error('Error calculating monthly usage:', error);
      return { totalCost: 0, requestCount: 0, byProvider: {}, dailySpend: [] };
    }
  }

  /**
   * Check budget alerts
   */
  async checkBudgetAlerts(): Promise<BudgetAlert[]> {
    const usage = await this.getCurrentMonthUsage();
    const alerts: BudgetAlert[] = [];

    const budgetUsedPercentage =
      (usage.totalCost / this.config.monthlyBudget) * 100;
    const remainingBudget = this.config.monthlyBudget - usage.totalCost;

    // Calculate projected spend based on daily average
    const daysInMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0,
    ).getDate();
    const currentDay = new Date().getDate();
    const averageDailySpend = usage.totalCost / currentDay;
    const projectedSpend = averageDailySpend * daysInMonth;

    if (budgetUsedPercentage >= this.config.emergencyThreshold) {
      alerts.push({
        type: 'emergency',
        message: 'Emergency: Monthly budget almost exhausted',
        currentSpend: usage.totalCost,
        budgetRemaining: remainingBudget,
        projectedSpend,
      });
    } else if (budgetUsedPercentage >= this.config.warningThreshold) {
      alerts.push({
        type: 'warning',
        message: 'Warning: Approaching monthly budget limit',
        currentSpend: usage.totalCost,
        budgetRemaining: remainingBudget,
        projectedSpend,
      });
    }

    if (projectedSpend > this.config.monthlyBudget) {
      alerts.push({
        type: 'warning',
        message: 'Projected to exceed monthly budget',
        currentSpend: usage.totalCost,
        budgetRemaining: remainingBudget,
        projectedSpend,
      });
    }

    return alerts;
  }

  /**
   * Get cost-effective caching recommendations
   */
  async getCachingRecommendations(): Promise<CacheStrategy[]> {
    const usage = await this.getCurrentMonthUsage();
    const recommendations: CacheStrategy[] = [];

    // Analyze frequently used endpoints
    for (const [provider, stats] of Object.entries(usage.byProvider)) {
      if (stats.requests > 10 && stats.cost > 5) {
        recommendations.push({
          key: `${provider}-common-requests`,
          ttl: 3600, // 1 hour
          cost_savings: stats.cost * 0.3, // Estimate 30% savings
          hit_rate: 0.6, // Estimate 60% cache hit rate
        });
      }
    }

    return recommendations;
  }

  /**
   * Update budget configuration
   */
  updateBudgetConfig(config: Partial<CostConfig>): void {
    // Update the underlying service configuration
    this.updateConfig({
      monthlyBudget: config.monthlyBudget,
      warningThreshold: config.warningThreshold,
      emergencyThreshold: config.emergencyThreshold,
      costPerProvider: config.costPerProvider,
    });
  }

  /**
   * Get cost optimization insights
   */
  async getOptimizationInsights(): Promise<{
    recommendations: string[];
    potentialSavings: number;
    inefficiencies: string[];
    budgetHealth: 'good' | 'warning' | 'critical';
  }> {
    const usage = await this.getCurrentMonthUsage();
    const alerts = await this.checkBudgetAlerts();

    const recommendations: string[] = [];
    const inefficiencies: string[] = [];
    let potentialSavings = 0;

    // Analyze provider efficiency
    for (const [provider, stats] of Object.entries(usage.byProvider)) {
      const costPerRequest = stats.cost / stats.requests;

      if (provider === 'replicate' && costPerRequest > 0.1) {
        recommendations.push(
          'Consider using HuggingFace for simpler tasks instead of Replicate',
        );
        potentialSavings += stats.cost * 0.4;
      }

      if (provider === 'openai' && stats.requests > 100) {
        recommendations.push(
          'Implement caching for OpenAI requests to reduce costs',
        );
        potentialSavings += stats.cost * 0.25;
      }
    }

    // Check for client-side opportunities
    if (usage.totalCost > this.config.monthlyBudget * 0.5) {
      recommendations.push('Increase client-side processing for basic tasks');
      potentialSavings += usage.totalCost * 0.15;
    }

    const budgetHealth = alerts.some((a) => a.type === 'emergency')
      ? 'critical'
      : alerts.some((a) => a.type === 'warning')
        ? 'warning'
        : 'good';

    return {
      recommendations,
      potentialSavings,
      inefficiencies,
      budgetHealth,
    };
  }

  // Private helper methods

  private async analyzeStrategies(
    fileSize: number,
    complexity: number,
    quality: 'basic' | 'standard' | 'premium',
  ): Promise<OptimizedStrategy[]> {
    const strategies: OptimizedStrategy[] = [];

    // Client-side strategy
    strategies.push({
      provider: 'client',
      confidence: Math.max(0.4, 0.8 - complexity),
      estimatedCost: 0,
      estimatedTime: Math.min(10000, fileSize / 1000 + complexity * 5000),
      reasoning: 'Free client-side processing, good for basic tasks',
    });

    // HuggingFace strategy
    strategies.push({
      provider: 'huggingface',
      confidence: Math.min(0.9, 0.6 + complexity * 0.3),
      estimatedCost: this.config.costPerProvider.huggingface,
      estimatedTime: 8000 + complexity * 2000,
      reasoning: 'Cost-effective cloud processing with good accuracy',
    });

    // Replicate strategy (for premium quality)
    if (quality === 'premium') {
      strategies.push({
        provider: 'replicate',
        confidence: 0.95,
        estimatedCost: this.config.costPerProvider.replicate,
        estimatedTime: 15000 + complexity * 5000,
        reasoning: 'Premium quality with specialized models',
      });
    }

    return strategies.sort((a, b) => b.confidence - a.confidence);
  }
}

export const costOptimizer = CostOptimizer.createInstance();

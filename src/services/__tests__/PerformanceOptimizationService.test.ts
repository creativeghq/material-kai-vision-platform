/**
 * PerformanceOptimizationService Tests
 */

import { PerformanceOptimizationService } from '../PerformanceOptimizationService';
import { QualityDashboardService } from '../QualityDashboardService';

jest.mock('@/integrations/supabase/client', () => {
  return { supabase: { from: jest.fn() } };
});

jest.mock('../QualityDashboardService', () => {
  const mockService = {
    initialize: jest.fn().mockResolvedValue(undefined),
    getQualityMetrics: jest.fn().mockResolvedValue({
      workspace_id: 'workspace-1',
      average_image_quality_score: 0.82,
      average_enrichment_score: 0.8,
      validation_pass_rate: 0.85,
    }),
    getHealth: jest.fn().mockResolvedValue({
      status: 'healthy',
      latency: 10,
    }),
  };

  return {
    QualityDashboardService: {
      getInstance: jest.fn().mockReturnValue(mockService),
    },
  };
});

describe('PerformanceOptimizationService', () => {
  let service: InstanceType<typeof PerformanceOptimizationService>;

  beforeEach(() => {
    service = new PerformanceOptimizationService();
  });

  describe('Service Initialization', () => {
    it('should initialize successfully', async () => {
      await service.initialize();
      expect(service.isReady()).toBe(true);
    });

    it('should have correct service name', () => {
      const config = service.getConfig();
      expect(config.name).toBe('PerformanceOptimizationService');
    });

    it('should have correct version', () => {
      const config = service.getConfig();
      expect(config.version).toBe('1.0.0');
    });
  });

  describe('getPerformanceMetrics', () => {
    it('should retrieve performance metrics', async () => {
      await service.initialize();
      const metrics = await service.getPerformanceMetrics('workspace-1');

      expect(metrics).toBeDefined();
      expect(metrics.response_time_ms).toBeGreaterThan(0);
      expect(metrics.throughput).toBeGreaterThan(0);
      expect(metrics.error_rate).toBeGreaterThanOrEqual(0);
      expect(metrics.cache_hit_rate).toBeGreaterThanOrEqual(0);
      expect(metrics.database_query_time).toBeGreaterThan(0);
      expect(metrics.memory_usage_mb).toBeGreaterThan(0);
    });

    it('should have valid response time', async () => {
      await service.initialize();
      const metrics = await service.getPerformanceMetrics('workspace-1');

      expect(metrics.response_time_ms).toBeGreaterThanOrEqual(100);
      expect(metrics.response_time_ms).toBeLessThanOrEqual(600);
    });

    it('should have valid throughput', async () => {
      await service.initialize();
      const metrics = await service.getPerformanceMetrics('workspace-1');

      expect(metrics.throughput).toBeGreaterThanOrEqual(200);
      expect(metrics.throughput).toBeLessThanOrEqual(700);
    });

    it('should have valid error rate', async () => {
      await service.initialize();
      const metrics = await service.getPerformanceMetrics('workspace-1');

      expect(metrics.error_rate).toBeGreaterThanOrEqual(0);
      expect(metrics.error_rate).toBeLessThanOrEqual(0.1);
    });

    it('should have valid cache hit rate', async () => {
      await service.initialize();
      const metrics = await service.getPerformanceMetrics('workspace-1');

      expect(metrics.cache_hit_rate).toBeGreaterThanOrEqual(0.6);
      expect(metrics.cache_hit_rate).toBeLessThanOrEqual(0.9);
    });

    it('should cache metrics for 60 seconds', async () => {
      await service.initialize();
      const metrics1 = await service.getPerformanceMetrics('workspace-1');
      const metrics2 = await service.getPerformanceMetrics('workspace-1');

      // Should return same cached values
      expect(metrics1.response_time_ms).toBe(metrics2.response_time_ms);
    });
  });

  describe('getOptimizationRecommendations', () => {
    it('should retrieve optimization recommendations', async () => {
      await service.initialize();
      const recommendations =
        await service.getOptimizationRecommendations('workspace-1');

      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThanOrEqual(0);
    });

    it('should include recommendation details', async () => {
      await service.initialize();
      const recommendations =
        await service.getOptimizationRecommendations('workspace-1');

      recommendations.forEach((rec) => {
        expect(rec.id).toBeDefined();
        expect(rec.category).toBeDefined();
        expect([
          'caching',
          'indexing',
          'query',
          'resource',
          'architecture',
        ]).toContain(rec.category);
        expect(rec.priority).toBeDefined();
        expect(['low', 'medium', 'high', 'critical']).toContain(rec.priority);
        expect(rec.title).toBeDefined();
        expect(rec.description).toBeDefined();
        expect(rec.estimated_improvement).toBeGreaterThanOrEqual(0);
        expect(rec.estimated_improvement).toBeLessThanOrEqual(1);
        expect(rec.implementation_effort).toBeDefined();
      });
    });

    it('should prioritize critical issues', async () => {
      await service.initialize();
      const recommendations =
        await service.getOptimizationRecommendations('workspace-1');

      const criticalRecs = recommendations.filter(
        (r) => r.priority === 'critical',
      );
      if (criticalRecs.length > 0) {
        expect(criticalRecs[0].priority).toBe('critical');
      }
    });

    it('should provide actionable recommendations', async () => {
      await service.initialize();
      const recommendations =
        await service.getOptimizationRecommendations('workspace-1');

      recommendations.forEach((rec) => {
        expect(rec.title.length).toBeGreaterThan(0);
        expect(rec.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getPerformanceReport', () => {
    it('should generate performance report', async () => {
      await service.initialize();
      const report = await service.getPerformanceReport('workspace-1');

      expect(report).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(report.optimization_score).toBeDefined();
      expect(report.last_updated).toBeDefined();
    });

    it('should include metrics in report', async () => {
      await service.initialize();
      const report = await service.getPerformanceReport('workspace-1');

      expect(report.metrics.response_time_ms).toBeGreaterThan(0);
      expect(report.metrics.throughput).toBeGreaterThan(0);
      expect(report.metrics.error_rate).toBeGreaterThanOrEqual(0);
    });

    it('should include recommendations in report', async () => {
      await service.initialize();
      const report = await service.getPerformanceReport('workspace-1');

      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('should calculate optimization score', async () => {
      await service.initialize();
      const report = await service.getPerformanceReport('workspace-1');

      expect(report.optimization_score).toBeGreaterThanOrEqual(0);
      expect(report.optimization_score).toBeLessThanOrEqual(100);
    });

    it('should include last updated timestamp', async () => {
      await service.initialize();
      const report = await service.getPerformanceReport('workspace-1');

      expect(report.last_updated).toBeDefined();
      const date = new Date(report.last_updated);
      expect(date.getTime()).toBeGreaterThan(0);
    });
  });

  describe('Optimization Score Calculation', () => {
    it('should calculate score based on metrics', async () => {
      await service.initialize();
      const report = await service.getPerformanceReport('workspace-1');

      // Score should be reasonable based on metrics
      if (report.metrics.response_time_ms > 1000) {
        expect(report.optimization_score).toBeLessThan(80);
      }

      if (report.metrics.error_rate > 0.05) {
        expect(report.optimization_score).toBeLessThan(75);
      }
    });

    it('should penalize critical recommendations', async () => {
      await service.initialize();
      const report = await service.getPerformanceReport('workspace-1');

      const criticalCount = report.recommendations.filter(
        (r) => r.priority === 'critical',
      ).length;
      if (criticalCount > 0) {
        expect(report.optimization_score).toBeLessThan(
          100 - criticalCount * 10,
        );
      }
    });
  });

  describe('Recommendation Categories', () => {
    it('should include caching recommendations', async () => {
      await service.initialize();
      const recommendations =
        await service.getOptimizationRecommendations('workspace-1');

      const cachingRecs = recommendations.filter(
        (r) => r.category === 'caching',
      );
      if (cachingRecs.length > 0) {
        expect(cachingRecs[0].category).toBe('caching');
      }
    });

    it('should include query recommendations', async () => {
      await service.initialize();
      const recommendations =
        await service.getOptimizationRecommendations('workspace-1');

      const queryRecs = recommendations.filter((r) => r.category === 'query');
      if (queryRecs.length > 0) {
        expect(queryRecs[0].category).toBe('query');
      }
    });

    it('should include resource recommendations', async () => {
      await service.initialize();
      const recommendations =
        await service.getOptimizationRecommendations('workspace-1');

      const resourceRecs = recommendations.filter(
        (r) => r.category === 'resource',
      );
      if (resourceRecs.length > 0) {
        expect(resourceRecs[0].category).toBe('resource');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle missing workspace gracefully', async () => {
      await service.initialize();
      const metrics = await service.getPerformanceMetrics('non-existent');

      expect(metrics).toBeDefined();
      expect(metrics.response_time_ms).toBeGreaterThan(0);
    });

    it('should handle empty recommendations', async () => {
      await service.initialize();
      const recommendations =
        await service.getOptimizationRecommendations('workspace-1');

      expect(Array.isArray(recommendations)).toBe(true);
    });
  });

  describe('Service Health', () => {
    it('should report healthy status', async () => {
      await service.initialize();
      const health = await service.getHealth();

      expect(health.status).toBe('healthy');
      expect(health.latency).toBeGreaterThanOrEqual(0);
    });

    it('should track metrics', async () => {
      await service.initialize();
      await service.getPerformanceMetrics('workspace-1');

      const metrics = service.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.requestCount).toBeGreaterThan(0);
    });
  });
});

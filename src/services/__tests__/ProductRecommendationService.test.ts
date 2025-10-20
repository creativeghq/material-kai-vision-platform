/**
 * ProductRecommendationService Tests
 */

import { ProductRecommendationService } from '../ProductRecommendationService';
import { QualityDashboardService } from '../QualityDashboardService';

jest.mock('@/integrations/supabase/client', () => {
  const mockFrom = jest.fn((table: string) => {
    const chainable: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn(),
    };

    if (table === 'product_enrichments') {
      chainable.single.mockResolvedValue({
        data: {
          id: 'prod-1',
          product_name: 'Premium Material',
          product_category: 'flooring',
          enrichment_score: 0.88,
          metadata: { color: 'oak', finish: 'matte' },
          workspace_id: 'workspace-1',
        },
        error: null,
      });

      Object.defineProperty(chainable, Symbol.toStringTag, { value: 'Promise' });
      chainable.then = (onFulfilled: any) => {
        const result = {
          data: [
            {
              id: 'prod-1',
              product_name: 'Premium Material',
              product_category: 'flooring',
              enrichment_score: 0.88,
              metadata: { color: 'oak' },
              workspace_id: 'workspace-1',
            },
            {
              id: 'prod-2',
              product_name: 'Standard Material',
              product_category: 'walls',
              enrichment_score: 0.75,
              metadata: { color: 'white' },
              workspace_id: 'workspace-1',
            },
          ],
          error: null,
        };
        return Promise.resolve(result).then(onFulfilled);
      };
    }

    return chainable;
  });

  return { supabase: { from: mockFrom } };
});

jest.mock('../QualityDashboardService', () => {
  const mockService = {
    initialize: jest.fn().mockResolvedValue(undefined),
    getQualityMetrics: jest.fn().mockResolvedValue({
      workspace_id: 'workspace-1',
      average_image_quality_score: 0.82,
      average_enrichment_score: 0.80,
      validation_pass_rate: 0.85,
      total_images_validated: 100,
      total_products_enriched: 50,
      total_validations_run: 200,
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

describe('ProductRecommendationService', () => {
  let service: InstanceType<typeof ProductRecommendationService>;

  beforeEach(() => {
    service = new ProductRecommendationService();
  });

  describe('Service Initialization', () => {
    it('should initialize successfully', async () => {
      await service.initialize();
      expect(service.isReady()).toBe(true);
    });

    it('should have correct service name', () => {
      const config = service.getConfig();
      expect(config.name).toBe('ProductRecommendationService');
    });

    it('should have correct version', () => {
      const config = service.getConfig();
      expect(config.version).toBe('1.0.0');
    });
  });

  describe('getRecommendations', () => {
    it('should retrieve product recommendations', async () => {
      await service.initialize();
      const response = await service.getRecommendations({
        workspace_id: 'workspace-1',
        limit: 10,
        min_confidence: 0.7,
      });

      expect(response.recommendations).toBeDefined();
      expect(response.recommendations.length).toBeGreaterThan(0);
      expect(response.total_count).toBeGreaterThan(0);
      expect(response.generation_time_ms).toBeGreaterThan(0);
    });

    it('should calculate confidence scores correctly', async () => {
      await service.initialize();
      const response = await service.getRecommendations({
        workspace_id: 'workspace-1',
        limit: 10,
      });

      response.recommendations.forEach(rec => {
        expect(rec.confidence_score).toBeGreaterThanOrEqual(0);
        expect(rec.confidence_score).toBeLessThanOrEqual(1);
      });
    });

    it('should include quality metrics in recommendations', async () => {
      await service.initialize();
      const response = await service.getRecommendations({
        workspace_id: 'workspace-1',
      });

      response.recommendations.forEach(rec => {
        expect(rec.quality_metrics).toBeDefined();
        expect(rec.quality_metrics.image_quality).toBeDefined();
        expect(rec.quality_metrics.enrichment_quality).toBeDefined();
        expect(rec.quality_metrics.validation_score).toBeDefined();
      });
    });

    it('should respect limit parameter', async () => {
      await service.initialize();
      const response = await service.getRecommendations({
        workspace_id: 'workspace-1',
        limit: 5,
      });

      expect(response.recommendations.length).toBeLessThanOrEqual(5);
    });

    it('should filter by minimum confidence', async () => {
      await service.initialize();
      const response = await service.getRecommendations({
        workspace_id: 'workspace-1',
        min_confidence: 0.8,
      });

      response.recommendations.forEach(rec => {
        expect(rec.confidence_score).toBeGreaterThanOrEqual(0.8);
      });
    });
  });

  describe('getPersonalizedRecommendations', () => {
    it('should retrieve personalized recommendations', async () => {
      await service.initialize();
      const recommendations = await service.getPersonalizedRecommendations(
        'workspace-1',
        ['flooring', 'walls'],
        10,
      );

      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThanOrEqual(0);
    });

    it('should include reason for each recommendation', async () => {
      await service.initialize();
      const recommendations = await service.getPersonalizedRecommendations(
        'workspace-1',
        ['flooring'],
        5,
      );

      recommendations.forEach(rec => {
        expect(rec.reason).toBeDefined();
        expect(rec.reason.length).toBeGreaterThan(0);
      });
    });

    it('should respect limit parameter', async () => {
      await service.initialize();
      const recommendations = await service.getPersonalizedRecommendations(
        'workspace-1',
        ['flooring'],
        3,
      );

      expect(recommendations.length).toBeLessThanOrEqual(3);
    });
  });

  describe('getTrendingProducts', () => {
    it('should retrieve trending products', async () => {
      await service.initialize();
      const recommendations = await service.getTrendingProducts('workspace-1', 10);

      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThanOrEqual(0);
    });

    it('should include metadata in trending products', async () => {
      await service.initialize();
      const recommendations = await service.getTrendingProducts('workspace-1', 5);

      recommendations.forEach(rec => {
        expect(rec.metadata).toBeDefined();
        expect(typeof rec.metadata).toBe('object');
      });
    });

    it('should respect limit parameter', async () => {
      await service.initialize();
      const recommendations = await service.getTrendingProducts('workspace-1', 2);

      expect(recommendations.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing workspace gracefully', async () => {
      await service.initialize();
      const response = await service.getRecommendations({
        workspace_id: 'non-existent',
      });

      expect(response).toBeDefined();
      expect(response.recommendations).toBeDefined();
    });

    it('should handle empty results', async () => {
      await service.initialize();
      const response = await service.getRecommendations({
        workspace_id: 'workspace-1',
        limit: 0,
      });

      expect(response.total_count).toBeGreaterThanOrEqual(0);
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
      await service.getRecommendations({
        workspace_id: 'workspace-1',
      });

      const metrics = service.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.requestCount).toBeGreaterThan(0);
    });
  });
});


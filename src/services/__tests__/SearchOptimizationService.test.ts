/**
 * SearchOptimizationService Tests
 */

import { SearchOptimizationService } from '../SearchOptimizationService';
import { QualityDashboardService } from '../QualityDashboardService';

jest.mock('@/integrations/supabase/client', () => {
  const mockFrom = jest.fn((table: string) => {
    const chainable: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      textSearch: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn(),
    };

    if (table === 'document_chunks') {
      chainable.single.mockResolvedValue({
        data: {
          id: 'chunk-1',
          content: 'This is a sample document chunk about materials',
          title: 'Material Guide',
          workspace_id: 'workspace-1',
          metadata: { source: 'pdf-1' },
        },
        error: null,
      });

      Object.defineProperty(chainable, Symbol.toStringTag, { value: 'Promise' });
      chainable.then = (onFulfilled: any) => {
        const result = {
          data: [
            {
              id: 'chunk-1',
              content: 'This is a sample document chunk about materials and flooring',
              title: 'Material Guide',
              workspace_id: 'workspace-1',
              metadata: { source: 'pdf-1' },
            },
            {
              id: 'chunk-2',
              content: 'Another chunk about wall materials and installation',
              title: 'Installation Guide',
              workspace_id: 'workspace-1',
              metadata: { source: 'pdf-2' },
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

describe('SearchOptimizationService', () => {
  let service: InstanceType<typeof SearchOptimizationService>;

  beforeEach(() => {
    service = new SearchOptimizationService();
  });

  describe('Service Initialization', () => {
    it('should initialize successfully', async () => {
      await service.initialize();
      expect(service.isReady()).toBe(true);
    });

    it('should have correct service name', () => {
      const config = service.getConfig();
      expect(config.name).toBe('SearchOptimizationService');
    });

    it('should have correct version', () => {
      const config = service.getConfig();
      expect(config.version).toBe('1.0.0');
    });
  });

  describe('search', () => {
    it('should perform optimized search', async () => {
      await service.initialize();
      const response = await service.search({
        workspace_id: 'workspace-1',
        query: 'materials flooring',
        limit: 20,
      });

      expect(response.results).toBeDefined();
      expect(Array.isArray(response.results)).toBe(true);
      expect(response.total_count).toBeGreaterThanOrEqual(0);
      expect(response.search_time_ms).toBeGreaterThan(0);
    });

    it('should calculate relevance scores', async () => {
      await service.initialize();
      const response = await service.search({
        workspace_id: 'workspace-1',
        query: 'materials',
      });

      response.results.forEach(result => {
        expect(result.relevance_score).toBeGreaterThanOrEqual(0);
        expect(result.relevance_score).toBeLessThanOrEqual(1);
      });
    });

    it('should calculate quality scores', async () => {
      await service.initialize();
      const response = await service.search({
        workspace_id: 'workspace-1',
        query: 'materials',
      });

      response.results.forEach(result => {
        expect(result.quality_score).toBeGreaterThanOrEqual(0);
        expect(result.quality_score).toBeLessThanOrEqual(1);
      });
    });

    it('should calculate combined scores', async () => {
      await service.initialize();
      const response = await service.search({
        workspace_id: 'workspace-1',
        query: 'materials',
      });

      response.results.forEach(result => {
        expect(result.combined_score).toBeGreaterThanOrEqual(0);
        expect(result.combined_score).toBeLessThanOrEqual(1);
      });
    });

    it('should sort results by combined score', async () => {
      await service.initialize();
      const response = await service.search({
        workspace_id: 'workspace-1',
        query: 'materials',
      });

      for (let i = 1; i < response.results.length; i++) {
        expect(response.results[i - 1].combined_score).toBeGreaterThanOrEqual(
          response.results[i].combined_score,
        );
      }
    });

    it('should respect limit parameter', async () => {
      await service.initialize();
      const response = await service.search({
        workspace_id: 'workspace-1',
        query: 'materials',
        limit: 5,
      });

      expect(response.results.length).toBeLessThanOrEqual(5);
    });

    it('should calculate optimization metrics', async () => {
      await service.initialize();
      const response = await service.search({
        workspace_id: 'workspace-1',
        query: 'materials',
      });

      expect(response.optimization_metrics).toBeDefined();
      expect(response.optimization_metrics.average_relevance).toBeGreaterThanOrEqual(0);
      expect(response.optimization_metrics.average_quality).toBeGreaterThanOrEqual(0);
      expect(response.optimization_metrics.average_combined).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getSuggestions', () => {
    it('should get search suggestions', async () => {
      await service.initialize();
      const suggestions = await service.getSuggestions('workspace-1', 'material', 5);

      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeLessThanOrEqual(5);
    });

    it('should return unique suggestions', async () => {
      await service.initialize();
      const suggestions = await service.getSuggestions('workspace-1', 'material', 10);

      const uniqueSuggestions = new Set(suggestions);
      expect(uniqueSuggestions.size).toBe(suggestions.length);
    });

    it('should respect limit parameter', async () => {
      await service.initialize();
      const suggestions = await service.getSuggestions('workspace-1', 'material', 3);

      expect(suggestions.length).toBeLessThanOrEqual(3);
    });
  });

  describe('getRelatedResults', () => {
    it('should get related search results', async () => {
      await service.initialize();
      const results = await service.getRelatedResults('workspace-1', 'chunk-1', 5);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should get related results for chunk', async () => {
      await service.initialize();
      const results = await service.getRelatedResults('workspace-1', 'chunk-1', 10);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should include quality metrics in related results', async () => {
      await service.initialize();
      const results = await service.getRelatedResults('workspace-1', 'chunk-1', 5);

      results.forEach(result => {
        expect(result.quality_score).toBeDefined();
        expect(result.relevance_score).toBeDefined();
      });
    });

    it('should respect limit parameter', async () => {
      await service.initialize();
      const results = await service.getRelatedResults('workspace-1', 'chunk-1', 2);

      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Search Result Structure', () => {
    it('should include all required fields in search results', async () => {
      await service.initialize();
      const response = await service.search({
        workspace_id: 'workspace-1',
        query: 'materials',
      });

      response.results.forEach(result => {
        expect(result.id).toBeDefined();
        expect(result.title).toBeDefined();
        expect(result.content).toBeDefined();
        expect(result.relevance_score).toBeDefined();
        expect(result.quality_score).toBeDefined();
        expect(result.combined_score).toBeDefined();
        expect(result.metadata).toBeDefined();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle empty query gracefully', async () => {
      await service.initialize();
      const response = await service.search({
        workspace_id: 'workspace-1',
        query: '',
      });

      expect(response).toBeDefined();
      expect(response.results).toBeDefined();
    });

    it('should handle non-existent workspace', async () => {
      await service.initialize();
      const response = await service.search({
        workspace_id: 'non-existent',
        query: 'materials',
      });

      expect(response).toBeDefined();
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
      await service.search({
        workspace_id: 'workspace-1',
        query: 'materials',
      });

      const metrics = service.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.requestCount).toBeGreaterThan(0);
    });
  });
});


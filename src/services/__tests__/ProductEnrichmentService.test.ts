/**
 * Product Enrichment Service Tests
 */

import { ProductEnrichmentService } from '../ProductEnrichmentService';
import { ProductEnrichmentRequest } from '@/types/product-enrichment';

// Mock Supabase
jest.mock('@/integrations/supabase/client', () => {
  const mockFrom = jest.fn((table: string) => {
    const chainable: any = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      single: jest.fn(),
    };

    if (table === 'document_chunks') {
      chainable.single.mockResolvedValue({
        data: {
          id: 'chunk-1',
          content: 'Premium wireless headphones. Brand: Sony. Model: WH-1000XM5.',
          workspace_id: 'workspace-1',
        },
        error: null,
      });
    }

    if (table === 'product_enrichments') {
      chainable.single.mockResolvedValue({
        data: {
          id: 'enrichment-1',
          chunk_id: 'chunk-1',
          workspace_id: 'workspace-1',
          enrichment_status: 'enriched',
          product_name: 'Premium wireless headphones',
          product_category: 'electronics',
          metadata: { brand: 'Sony', model: 'WH-1000XM5' },
          specifications: [],
          related_products: [],
          enrichment_score: 0.85,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error: null,
      });
    }

    // Make chainable awaitable for batch queries
    Object.defineProperty(chainable, Symbol.toStringTag, { value: 'Promise' });
    chainable.then = (onFulfilled: any, onRejected?: any) => {
      let result: any;
      if (table === 'document_chunks') {
        result = {
          data: [
            {
              id: 'chunk-1',
              content: 'Premium wireless headphones. Brand: Sony. Model: WH-1000XM5.',
              workspace_id: 'workspace-1',
            },
          ],
          error: null,
        };
      } else {
        result = { data: [], error: null };
      }
      return Promise.resolve(result).then(onFulfilled, onRejected);
    };

    return chainable;
  });

  return {
    supabase: {
      from: mockFrom,
    },
  };
});

describe('ProductEnrichmentService', () => {
  let service: ProductEnrichmentService;

  beforeEach(async () => {
    service = new ProductEnrichmentService();
    await service.initialize();
  });

  describe('Service Initialization', () => {
    it('should initialize successfully', () => {
      expect(service.isReady()).toBe(true);
    });

    it('should have correct configuration', () => {
      const config = service.getConfig();
      expect(config.name).toBe('ProductEnrichmentService');
      expect(config.version).toBe('1.0.0');
      expect(config.enabled).toBe(true);
    });
  });

  describe('Chunk Enrichment', () => {
    it('should enrich a chunk with product data', async () => {
      const request: ProductEnrichmentRequest = {
        chunk_id: 'chunk-1',
        workspace_id: 'workspace-1',
        chunk_content: 'Premium wireless headphones. Brand: Sony. Model: WH-1000XM5.',
      };

      const response = await service.enrichChunk(request);

      expect(response).toBeDefined();
      expect(response.enrichment).toBeDefined();
      expect(response.enrichment.chunk_id).toBe('chunk-1');
      expect(response.enrichment.workspace_id).toBe('workspace-1');
    });

    it('should calculate enrichment score between 0 and 1', async () => {
      const request: ProductEnrichmentRequest = {
        chunk_id: 'chunk-1',
        workspace_id: 'workspace-1',
        chunk_content: 'Premium wireless headphones. Brand: Sony. Model: WH-1000XM5.',
      };

      const response = await service.enrichChunk(request);

      expect(response.enrichment.enrichment_score).toBeGreaterThanOrEqual(0);
      expect(response.enrichment.enrichment_score).toBeLessThanOrEqual(1);
    });

    it('should extract product name', async () => {
      const request: ProductEnrichmentRequest = {
        chunk_id: 'chunk-1',
        workspace_id: 'workspace-1',
        chunk_content: 'Premium wireless headphones. Brand: Sony. Model: WH-1000XM5.',
      };

      const response = await service.enrichChunk(request);

      expect(response.enrichment.product_name).toBeDefined();
      expect(typeof response.enrichment.product_name).toBe('string');
    });

    it('should extract product category', async () => {
      const request: ProductEnrichmentRequest = {
        chunk_id: 'chunk-1',
        workspace_id: 'workspace-1',
        chunk_content: 'Premium wireless headphones. Brand: Sony. Model: WH-1000XM5.',
      };

      const response = await service.enrichChunk(request);

      expect(response.enrichment.product_category).toBeDefined();
      expect(typeof response.enrichment.product_category).toBe('string');
    });

    it('should mark enriched chunks correctly', async () => {
      const request: ProductEnrichmentRequest = {
        chunk_id: 'chunk-1',
        workspace_id: 'workspace-1',
        chunk_content: 'Premium wireless headphones. Brand: Sony. Model: WH-1000XM5.',
      };

      const response = await service.enrichChunk(request);

      expect(['enriched', 'needs_review', 'failed']).toContain(response.enrichment.enrichment_status);
    });
  });

  describe('Batch Enrichment', () => {
    it('should enrich multiple chunks', async () => {
      const response = await service.enrichChunks({
        chunk_ids: ['chunk-1', 'chunk-1'],
        workspace_id: 'workspace-1',
      });

      expect(response).toBeDefined();
      expect(response.total).toBe(2);
      expect(response.results).toBeDefined();
      expect(Array.isArray(response.results)).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should retrieve enrichment statistics', async () => {
      const stats = await service.getEnrichmentStats('workspace-1');

      expect(stats).toBeDefined();
      expect(stats.total_enrichments).toBeGreaterThanOrEqual(0);
      expect(stats.enriched_count).toBeGreaterThanOrEqual(0);
    });

    it('should retrieve enrichments needing review', async () => {
      const enrichments = await service.getEnrichmentsNeedingReview('workspace-1');

      expect(Array.isArray(enrichments)).toBe(true);
    });
  });

  describe('Service Health', () => {
    it('should report service health', async () => {
      const health = await service.getHealth();

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(['healthy', 'unhealthy', 'degraded']).toContain(health.status);
    });

    it('should track metrics', () => {
      const metrics = service.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.serviceName).toBe('ProductEnrichmentService');
      expect(metrics.requestCount).toBeGreaterThanOrEqual(0);
      expect(metrics.errorCount).toBeGreaterThanOrEqual(0);
    });
  });
});


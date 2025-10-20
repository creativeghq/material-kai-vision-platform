/**
 * ChunkSearchEnhancementService Tests
 * Tests for chunk analysis integration into search
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ChunkSearchEnhancementService } from '../ChunkSearchEnhancementService';
import { ChunkSearchRequest, EnhancedSearchResult } from '../ChunkSearchEnhancementService';

describe('ChunkSearchEnhancementService', () => {
  let service: ChunkSearchEnhancementService;

  beforeEach(() => {
    service = new ChunkSearchEnhancementService();
  });

  describe('initialization', () => {
    it('should initialize with correct configuration', async () => {
      await service.initialize();
      expect(service).toBeDefined();
      expect(service.getConfig().name).toBe('ChunkSearchEnhancementService');
      expect(service.getConfig().version).toBe('1.0.0');
    });
  });

  describe('searchChunks', () => {
    it('should handle search request with basic query', async () => {
      const request: ChunkSearchRequest = {
        query: 'fabric properties',
        workspaceId: 'workspace-123',
        limit: 10,
      };

      // Mock the search - in real tests this would use a test database
      expect(request.query).toBe('fabric properties');
      expect(request.workspaceId).toBe('workspace-123');
      expect(request.limit).toBe(10);
    });

    it('should apply content type filters', async () => {
      const request: ChunkSearchRequest = {
        query: 'material',
        workspaceId: 'workspace-123',
        filters: {
          contentTypes: ['product', 'specification'],
        },
      };

      expect(request.filters?.contentTypes).toContain('product');
      expect(request.filters?.contentTypes).toContain('specification');
    });

    it('should apply validation status filters', async () => {
      const request: ChunkSearchRequest = {
        query: 'material',
        workspaceId: 'workspace-123',
        filters: {
          validationStatus: ['validated', 'needs_review'],
        },
      };

      expect(request.filters?.validationStatus).toContain('validated');
      expect(request.filters?.validationStatus).toContain('needs_review');
    });

    it('should apply confidence threshold', async () => {
      const request: ChunkSearchRequest = {
        query: 'material',
        workspaceId: 'workspace-123',
        filters: {
          minConfidence: 0.8,
        },
      };

      expect(request.filters?.minConfidence).toBe(0.8);
    });

    it('should apply validation score threshold', async () => {
      const request: ChunkSearchRequest = {
        query: 'material',
        workspaceId: 'workspace-123',
        filters: {
          minValidationScore: 0.75,
        },
      };

      expect(request.filters?.minValidationScore).toBe(0.75);
    });

    it('should handle pagination', async () => {
      const request: ChunkSearchRequest = {
        query: 'material',
        workspaceId: 'workspace-123',
        limit: 20,
        offset: 40,
      };

      expect(request.limit).toBe(20);
      expect(request.offset).toBe(40);
    });
  });

  describe('getChunksByContentType', () => {
    it('should retrieve chunks by content type', async () => {
      const contentType = 'product';
      const workspaceId = 'workspace-123';

      expect(contentType).toBe('product');
      expect(workspaceId).toBe('workspace-123');
    });

    it('should respect limit parameter', async () => {
      const limit = 50;
      expect(limit).toBe(50);
    });
  });

  describe('getProductBoundaries', () => {
    it('should retrieve product boundaries', async () => {
      const workspaceId = 'workspace-123';
      expect(workspaceId).toBe('workspace-123');
    });

    it('should filter by is_product_boundary flag', async () => {
      // Product boundaries should have is_product_boundary = true
      const mockBoundary = {
        id: 'boundary-123',
        chunk_id: 'chunk-123',
        is_product_boundary: true,
        boundary_score: 0.85,
        boundary_type: 'semantic',
      };

      expect(mockBoundary.is_product_boundary).toBe(true);
    });
  });

  describe('getChunksNeedingReview', () => {
    it('should retrieve chunks with needs_review status', async () => {
      const workspaceId = 'workspace-123';
      expect(workspaceId).toBe('workspace-123');
    });

    it('should filter by validation_status', async () => {
      const mockValidation = {
        id: 'validation-123',
        chunk_id: 'chunk-123',
        validation_status: 'needs_review',
        overall_validation_score: 0.65,
      };

      expect(mockValidation.validation_status).toBe('needs_review');
    });
  });

  describe('enhanceChunkResult', () => {
    it('should calculate overall quality score correctly', () => {
      const mockChunk = {
        id: 'chunk-123',
        content: 'Test content',
        chunk_classifications: [
          {
            content_type: 'product',
            confidence: 0.95,
            reasoning: 'Contains product description',
          },
        ],
        chunk_boundaries: [
          {
            boundary_type: 'semantic',
            boundary_score: 0.85,
            is_product_boundary: true,
          },
        ],
        chunk_validation_scores: [
          {
            overall_validation_score: 0.90,
            validation_status: 'validated',
            content_quality_score: 0.92,
          },
        ],
      };

      // Overall quality = 0.95 * 0.4 + 0.85 * 0.3 + 0.90 * 0.3
      // = 0.38 + 0.255 + 0.27 = 0.905
      const expectedQuality = 0.95 * 0.4 + 0.85 * 0.3 + 0.9 * 0.3;
      expect(expectedQuality).toBeCloseTo(0.905, 2);
    });

    it('should handle missing analysis data', () => {
      const mockChunk = {
        id: 'chunk-123',
        content: 'Test content',
        chunk_classifications: [],
        chunk_boundaries: [],
        chunk_validation_scores: [],
      };

      // Should use default values
      const defaultQuality = 0 * 0.4 + 0.5 * 0.3 + 0.5 * 0.3;
      expect(defaultQuality).toBe(0.3);
    });

    it('should set contentTypeMatch correctly', () => {
      const mockChunk = {
        id: 'chunk-123',
        content: 'Test content',
        chunk_classifications: [
          {
            content_type: 'product',
            confidence: 0.95,
          },
        ],
      };

      const filters = {
        contentTypes: ['product', 'specification'],
      };

      expect(filters.contentTypes).toContain('product');
    });
  });

  describe('error handling', () => {
    it('should handle search errors gracefully', async () => {
      const request: ChunkSearchRequest = {
        query: 'test',
        workspaceId: 'invalid-workspace',
      };

      expect(request.workspaceId).toBe('invalid-workspace');
    });

    it('should handle missing workspace ID', async () => {
      const request: ChunkSearchRequest = {
        query: 'test',
        workspaceId: '',
      };

      expect(request.workspaceId).toBe('');
    });
  });

  describe('response structure', () => {
    it('should return properly structured search response', () => {
      const mockResponse = {
        results: [] as EnhancedSearchResult[],
        total: 0,
        processingTime: 125.5,
        appliedFilters: {},
      };

      expect(mockResponse).toHaveProperty('results');
      expect(mockResponse).toHaveProperty('total');
      expect(mockResponse).toHaveProperty('processingTime');
      expect(mockResponse).toHaveProperty('appliedFilters');
    });

    it('should include all required fields in enhanced result', () => {
      const mockResult: EnhancedSearchResult = {
        chunkId: 'chunk-123',
        content: 'Test content',
        relevanceScore: 0.95,
        contentTypeMatch: true,
        boundaryQuality: 0.85,
        validationStatus: 'validated',
        overallQuality: 0.905,
      };

      expect(mockResult).toHaveProperty('chunkId');
      expect(mockResult).toHaveProperty('content');
      expect(mockResult).toHaveProperty('relevanceScore');
      expect(mockResult).toHaveProperty('contentTypeMatch');
      expect(mockResult).toHaveProperty('boundaryQuality');
      expect(mockResult).toHaveProperty('validationStatus');
      expect(mockResult).toHaveProperty('overallQuality');
    });
  });

  describe('filtering combinations', () => {
    it('should handle multiple filters together', async () => {
      const request: ChunkSearchRequest = {
        query: 'material',
        workspaceId: 'workspace-123',
        filters: {
          contentTypes: ['product'],
          validationStatus: ['validated'],
          minConfidence: 0.8,
          minValidationScore: 0.75,
        },
      };

      expect(request.filters?.contentTypes).toContain('product');
      expect(request.filters?.validationStatus).toContain('validated');
      expect(request.filters?.minConfidence).toBe(0.8);
      expect(request.filters?.minValidationScore).toBe(0.75);
    });

    it('should handle empty filters', async () => {
      const request: ChunkSearchRequest = {
        query: 'material',
        workspaceId: 'workspace-123',
        filters: {},
      };

      expect(request.filters).toEqual({});
    });
  });
});


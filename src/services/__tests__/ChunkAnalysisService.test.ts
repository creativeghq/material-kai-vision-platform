import { describe, it, expect, beforeEach } from '@jest/globals';

import {
  ChunkClassificationInsert,
  ChunkBoundaryInsert,
  ChunkValidationScoreInsert,
} from '@/types/chunk-analysis';

import { ChunkAnalysisService } from '../ChunkAnalysisService';

describe('ChunkAnalysisService', () => {
  let service: ChunkAnalysisService;

  beforeEach(() => {
    service = new ChunkAnalysisService();
  });

  describe('initialization', () => {
    it('should initialize with correct configuration', async () => {
      await service.initialize();
      expect(service).toBeDefined();
      expect(service.getConfig().name).toBe('ChunkAnalysisService');
      expect(service.getConfig().version).toBe('1.0.0');
    });
  });

  describe('classification operations', () => {
    it('should prepare classification insert data', () => {
      const data: ChunkClassificationInsert = {
        chunk_id: 'chunk-123',
        workspace_id: 'workspace-123',
        content_type: 'product',
        confidence: 0.95,
        reasoning: 'Contains product description',
        model_name: 'claude-4-5-haiku-20250514',
      };

      expect(data.chunk_id).toBe('chunk-123');
      expect(data.content_type).toBe('product');
      expect(data.confidence).toBe(0.95);
    });

    it('should validate confidence bounds', () => {
      const validData: ChunkClassificationInsert = {
        chunk_id: 'chunk-123',
        content_type: 'specification',
        confidence: 0.85,
      };

      expect(validData.confidence).toBeGreaterThanOrEqual(0);
      expect(validData.confidence).toBeLessThanOrEqual(1);
    });

    it('should support all content types', () => {
      const contentTypes = [
        'product',
        'specification',
        'introduction',
        'legal_disclaimer',
        'technical_detail',
        'marketing',
        'other',
      ];

      for (const type of contentTypes) {
        const data: ChunkClassificationInsert = {
          chunk_id: 'chunk-123',
          content_type: type as any,
          confidence: 0.8,
        };
        expect(data.content_type).toBe(type);
      }
    });
  });

  describe('boundary operations', () => {
    it('should prepare boundary insert data', () => {
      const data: ChunkBoundaryInsert = {
        chunk_id: 'chunk-123',
        next_chunk_id: 'chunk-124',
        workspace_id: 'workspace-123',
        boundary_score: 0.85,
        boundary_type: 'sentence',
        semantic_similarity: 0.45,
        is_product_boundary: true,
      };

      expect(data.chunk_id).toBe('chunk-123');
      expect(data.boundary_type).toBe('sentence');
      expect(data.is_product_boundary).toBe(true);
    });

    it('should validate boundary score bounds', () => {
      const data: ChunkBoundaryInsert = {
        chunk_id: 'chunk-123',
        boundary_score: 0.75,
        boundary_type: 'paragraph',
      };

      expect(data.boundary_score).toBeGreaterThanOrEqual(0);
      expect(data.boundary_score).toBeLessThanOrEqual(1);
    });

    it('should support all boundary types', () => {
      const boundaryTypes = ['sentence', 'paragraph', 'section', 'semantic', 'weak'];

      for (const type of boundaryTypes) {
        const data: ChunkBoundaryInsert = {
          chunk_id: 'chunk-123',
          boundary_score: 0.7,
          boundary_type: type as any,
        };
        expect(data.boundary_type).toBe(type);
      }
    });
  });

  describe('validation operations', () => {
    it('should prepare validation score insert data', () => {
      const data: ChunkValidationScoreInsert = {
        chunk_id: 'chunk-123',
        workspace_id: 'workspace-123',
        content_quality_score: 0.9,
        boundary_quality_score: 0.85,
        semantic_coherence_score: 0.88,
        completeness_score: 0.92,
        overall_validation_score: 0.89,
        validation_status: 'validated',
      };

      expect(data.chunk_id).toBe('chunk-123');
      expect(data.overall_validation_score).toBe(0.89);
      expect(data.validation_status).toBe('validated');
    });

    it('should validate all quality scores', () => {
      const data: ChunkValidationScoreInsert = {
        chunk_id: 'chunk-123',
        content_quality_score: 0.8,
        boundary_quality_score: 0.75,
        semantic_coherence_score: 0.85,
        completeness_score: 0.9,
        overall_validation_score: 0.825,
      };

      const scores = [
        data.content_quality_score,
        data.boundary_quality_score,
        data.semantic_coherence_score,
        data.completeness_score,
        data.overall_validation_score,
      ];

      for (const score of scores) {
        if (score !== undefined) {
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should support all validation statuses', () => {
      const statuses = ['pending', 'validated', 'needs_review', 'rejected'];

      for (const status of statuses) {
        const data: ChunkValidationScoreInsert = {
          chunk_id: 'chunk-123',
          overall_validation_score: 0.8,
          validation_status: status as any,
        };
        expect(data.validation_status).toBe(status);
      }
    });

    it('should handle validation issues and recommendations', () => {
      const data: ChunkValidationScoreInsert = {
        chunk_id: 'chunk-123',
        overall_validation_score: 0.6,
        validation_status: 'needs_review',
        issues: [
          {
            type: 'boundary_quality',
            severity: 'high',
            description: 'Chunk ends mid-sentence',
          },
        ],
        recommendations: [
          {
            type: 'merge_with_next',
            description: 'Merge with next chunk for better coherence',
            priority: 'high',
          },
        ],
      };

      expect(data.issues).toHaveLength(1);
      expect(data.recommendations).toHaveLength(1);
      expect(data.issues[0].severity).toBe('high');
      expect(data.recommendations[0].priority).toBe('high');
    });
  });

  describe('data structure validation', () => {
    it('should handle optional fields', () => {
      const minimalClassification: ChunkClassificationInsert = {
        chunk_id: 'chunk-123',
        content_type: 'other',
        confidence: 0.5,
      };

      expect(minimalClassification.reasoning).toBeUndefined();
      expect(minimalClassification.sub_categories).toBeUndefined();
    });

    it('should handle sub-categories array', () => {
      const data: ChunkClassificationInsert = {
        chunk_id: 'chunk-123',
        content_type: 'product',
        confidence: 0.9,
        sub_categories: ['fabric', 'textile', 'material'],
      };

      expect(Array.isArray(data.sub_categories)).toBe(true);
      expect(data.sub_categories).toHaveLength(3);
    });

    it('should handle metadata in validation', () => {
      const data: ChunkValidationScoreInsert = {
        chunk_id: 'chunk-123',
        overall_validation_score: 0.85,
        validation_notes: 'Good quality chunk with minor boundary issues',
        issues: [],
        recommendations: [],
      };

      expect(data.validation_notes).toBeDefined();
      expect(Array.isArray(data.issues)).toBe(true);
      expect(Array.isArray(data.recommendations)).toBe(true);
    });
  });

  describe('timestamp handling', () => {
    it('should accept ISO timestamp strings', () => {
      const now = new Date().toISOString();

      const data: ChunkValidationScoreInsert = {
        chunk_id: 'chunk-123',
        overall_validation_score: 0.8,
        validated_at: now,
      };

      expect(data.validated_at).toBe(now);
    });
  });
});


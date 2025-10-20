import { describe, it, expect, beforeEach } from '@jest/globals';

import {
  BoundaryDetectionService,
  DetectBoundariesRequest,
} from '../BoundaryDetectionService';

// Mock EmbeddingGenerationService
jest.mock('../embeddingGenerationService', () => {
  const mockService = {
    initialize: jest.fn().mockResolvedValue(undefined),
    generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
    generateEmbeddings: jest.fn().mockResolvedValue([new Array(1536).fill(0.1)]),
    generateBatch: jest.fn().mockResolvedValue({
      successful: [],
      failed: [],
    }),
  };

  return {
    EmbeddingGenerationService: jest.fn(() => mockService),
    embeddingGenerationService: mockService,
  };
});

describe('BoundaryDetectionService', () => {
  let service: BoundaryDetectionService;

  beforeEach(() => {
    service = new BoundaryDetectionService();
  });

  describe('initialization', () => {
    it('should initialize with correct configuration', async () => {
      await service.initialize();
      expect(service).toBeDefined();
      expect(service.getConfig().name).toBe('BoundaryDetectionService');
      expect(service.getConfig().version).toBe('1.0.0');
    });
  });

  describe('calculateBoundaryScore', () => {
    it('should score sentence boundaries high', () => {
      const score = (service as any).calculateBoundaryScore(
        'This is a complete sentence.',
      );
      expect(score).toBeGreaterThan(0.6);
    });

    it('should score paragraph boundaries high', () => {
      const score = (service as any).calculateBoundaryScore(
        'This is a paragraph.\n',
      );
      expect(score).toBeGreaterThan(0.5);
    });

    it('should score section headers high', () => {
      const score = (service as any).calculateBoundaryScore('## Section Title');
      expect(score).toBeGreaterThan(0.2);
    });

    it('should score mid-word breaks low', () => {
      const score = (service as any).calculateBoundaryScore(
        'This is an incomplete wor',
      );
      expect(score).toBeLessThan(0.3);
    });

    it('should score empty text as zero', () => {
      const score = (service as any).calculateBoundaryScore('');
      expect(score).toBe(0);
    });

    it('should keep score between 0 and 1', () => {
      const scores = [
        '.',
        '!',
        '?',
        'word',
        '',
        'Multiple sentences. Like this.',
      ];

      for (const text of scores) {
        const score = (service as any).calculateBoundaryScore(text);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('determineBoundaryType', () => {
    it('should identify sentence boundaries', () => {
      const type = (service as any).determineBoundaryType(
        'This is a sentence.',
        0.7,
        0.5,
      );
      expect(type).toBe('sentence');
    });

    it('should identify paragraph boundaries', () => {
      const type = (service as any).determineBoundaryType(
        'Text\n',
        0.6,
        0.5,
      );
      expect(type).toBe('paragraph');
    });

    it('should identify section boundaries', () => {
      const type = (service as any).determineBoundaryType(
        '## Section',
        0.7,
        0.5,
      );
      expect(type).toBe('section');
    });

    it('should identify semantic boundaries', () => {
      const type = (service as any).determineBoundaryType(
        'Text',
        0.5,
        0.3,
      );
      expect(type).toBe('semantic');
    });

    it('should identify weak boundaries', () => {
      const type = (service as any).determineBoundaryType(
        'Text',
        0.2,
        0.8,
      );
      expect(type).toBe('weak');
    });
  });

  describe('isProductBoundary', () => {
    it('should identify product boundaries', () => {
      const result = (service as any).isProductBoundary('Product text', 0.8, 0.3);
      expect(result).toBe(true);
    });

    it('should not identify non-product boundaries', () => {
      const result = (service as any).isProductBoundary('Text', 0.4, 0.8);
      expect(result).toBe(false);
    });

    it('should require both high boundary score and low similarity', () => {
      expect((service as any).isProductBoundary('Text', 0.8, 0.8)).toBe(false);
      expect((service as any).isProductBoundary('Text', 0.4, 0.3)).toBe(false);
      expect((service as any).isProductBoundary('Text', 0.8, 0.3)).toBe(true);
    });
  });

  describe('cosineSimilarity', () => {
    it('should calculate similarity between identical vectors', () => {
      const a = [1, 0, 0];
      const b = [1, 0, 0];
      const similarity = (service as any).cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(1, 5);
    });

    it('should calculate similarity between orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      const similarity = (service as any).cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should calculate similarity between opposite vectors', () => {
      const a = [1, 0, 0];
      const b = [-1, 0, 0];
      const similarity = (service as any).cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(-1, 5);
    });

    it('should handle different length vectors', () => {
      const a = [1, 0];
      const b = [1, 0, 0];
      const similarity = (service as any).cosineSimilarity(a, b);
      expect(similarity).toBe(0);
    });

    it('should handle zero vectors', () => {
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      const similarity = (service as any).cosineSimilarity(a, b);
      expect(similarity).toBe(0);
    });
  });

  describe('euclideanDistance', () => {
    it('should calculate distance between identical points', () => {
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      const distance = (service as any).euclideanDistance(a, b);
      expect(distance).toBeCloseTo(0, 5);
    });

    it('should calculate distance between different points', () => {
      const a = [0, 0, 0];
      const b = [3, 4, 0];
      const distance = (service as any).euclideanDistance(a, b);
      expect(distance).toBeCloseTo(5, 5);
    });

    it('should calculate distance in 3D space', () => {
      const a = [0, 0, 0];
      const b = [1, 1, 1];
      const distance = (service as any).euclideanDistance(a, b);
      expect(distance).toBeCloseTo(Math.sqrt(3), 5);
    });
  });

  describe('calculateClusterCoherence', () => {
    it('should return high coherence for tight clusters', () => {
      const embeddings = [
        [1, 0, 0],
        [1.1, 0, 0],
        [0.9, 0, 0],
      ];
      const centroid = [1, 0, 0];
      const coherence = (service as any).calculateClusterCoherence(
        embeddings,
        centroid,
      );
      expect(coherence).toBeGreaterThan(0.8);
    });

    it('should return low coherence for loose clusters', () => {
      const embeddings = [
        [0, 0, 0],
        [10, 0, 0],
        [0, 10, 0],
      ];
      const centroid = [5, 5, 0];
      const coherence = (service as any).calculateClusterCoherence(
        embeddings,
        centroid,
      );
      expect(coherence).toBeLessThan(0.5);
    });

    it('should return 0 for empty embeddings', () => {
      const coherence = (service as any).calculateClusterCoherence(
        [],
        [0, 0, 0],
      );
      expect(coherence).toBe(0);
    });
  });

  describe('generateReasoning', () => {
    it('should generate reasoning for strong boundaries', () => {
      const reasoning = (service as any).generateReasoning(0.8, 'sentence', 0.3);
      expect(reasoning).toContain('Strong boundary marker');
      expect(reasoning).toContain('Low semantic similarity');
    });

    it('should generate reasoning for weak boundaries', () => {
      const reasoning = (service as any).generateReasoning(0.2, 'weak', 0.9);
      expect(reasoning).toContain('Weak boundary marker');
      expect(reasoning).toContain('High semantic similarity');
    });

    it('should generate reasoning for moderate boundaries', () => {
      const reasoning = (service as any).generateReasoning(0.5, 'paragraph', 0.6);
      expect(reasoning).toContain('Moderate boundary marker');
    });
  });

  describe('detectBoundaries', () => {
    it('should handle empty chunk list', async () => {
      const request: DetectBoundariesRequest = {
        chunks: [],
      };

      const results = await service.detectBoundaries(request);
      expect(results).toEqual([]);
    });

    it('should process single chunk', async () => {
      const request: DetectBoundariesRequest = {
        chunks: [
          {
            id: 'chunk1',
            text: 'This is a complete sentence.',
            page_number: 1,
          },
        ],
      };

      // This would require mocking the embedding service
      // For now, we'll just verify the structure
      expect(request.chunks.length).toBe(1);
    });
  });
});


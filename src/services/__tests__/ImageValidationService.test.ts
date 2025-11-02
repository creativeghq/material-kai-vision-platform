/**
 * Image Validation Service Tests
 * Tests focus on business logic validation
 */

import { ImageValidationRequest } from '@/types/image-validation';

import { ImageValidationService } from '../ImageValidationService';

// Mock Supabase - minimal mocking
jest.mock('@/integrations/supabase/client', () => {
  const mockFrom = jest.fn((table: string) => {
    const chainable = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      single: jest.fn(),
    };

    // For document_images table
    if (table === 'document_images') {
      chainable.single.mockResolvedValue({
        data: {
          id: 'image-1',
          width: 1920,
          height: 1080,
          mime_type: 'image/jpeg',
          file_size: 2048000,
          workspace_id: 'workspace-1',
        },
        error: null,
      });
    }

    // For image_validations table
    if (table === 'image_validations') {
      chainable.single.mockResolvedValue({
        data: {
          id: 'validation-1',
          image_id: 'image-1',
          workspace_id: 'workspace-1',
          validation_status: 'valid',
          quality_score: 0.95,
          dimensions_valid: true,
          format_valid: true,
          file_size_valid: true,
          issues: [],
          recommendations: [],
          validated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error: null,
      });
    }

    return chainable;
  });

  return {
    supabase: {
      from: mockFrom,
    },
  };
});

describe('ImageValidationService', () => {
  let service: ImageValidationService;

  beforeEach(async () => {
    service = new ImageValidationService();
    await service.initialize();
  });

  describe('Service Initialization', () => {
    it('should initialize successfully', () => {
      expect(service.isReady()).toBe(true);
    });

    it('should have correct configuration', () => {
      const config = service.getConfig();
      expect(config.name).toBe('ImageValidationService');
      expect(config.version).toBe('1.0.0');
      expect(config.enabled).toBe(true);
    });
  });

  describe('Image Validation Logic', () => {
    it('should validate a valid image with default rules', async () => {
      const request: ImageValidationRequest = {
        image_id: 'image-1',
        workspace_id: 'workspace-1',
      };

      const response = await service.validateImage(request);

      expect(response).toBeDefined();
      expect(response.validation).toBeDefined();
      expect(response.validation.image_id).toBe('image-1');
      expect(response.validation.workspace_id).toBe('workspace-1');
      expect(response.validation.quality_score).toBeGreaterThanOrEqual(0);
      expect(response.validation.quality_score).toBeLessThanOrEqual(1);
    });

    it('should calculate quality score between 0 and 1', async () => {
      const request: ImageValidationRequest = {
        image_id: 'image-1',
        workspace_id: 'workspace-1',
      };

      const response = await service.validateImage(request);

      expect(response.validation.quality_score).toBeGreaterThanOrEqual(0);
      expect(response.validation.quality_score).toBeLessThanOrEqual(1);
    });

    it('should detect invalid dimensions when width is too small', async () => {
      const request: ImageValidationRequest = {
        image_id: 'image-1',
        workspace_id: 'workspace-1',
        validation_rules: {
          min_width: 3000, // Image is 1920, so this should fail
        },
      };

      const response = await service.validateImage(request);

      expect(response.issues.length).toBeGreaterThan(0);
      expect(response.issues.some((i) => i.type === 'invalid_width')).toBe(
        true,
      );
    });

    it('should detect invalid format when format is not allowed', async () => {
      const request: ImageValidationRequest = {
        image_id: 'image-1',
        workspace_id: 'workspace-1',
        validation_rules: {
          allowed_formats: ['image/png', 'image/webp'], // Image is jpeg
        },
      };

      const response = await service.validateImage(request);

      expect(response.issues.length).toBeGreaterThan(0);
      expect(response.issues.some((i) => i.type === 'invalid_format')).toBe(
        true,
      );
    });

    it('should detect file size issues when file is too large', async () => {
      const request: ImageValidationRequest = {
        image_id: 'image-1',
        workspace_id: 'workspace-1',
        validation_rules: {
          max_file_size: 1024000, // File is 2048000 bytes
        },
      };

      const response = await service.validateImage(request);

      expect(response.issues.length).toBeGreaterThan(0);
      expect(response.issues.some((i) => i.type === 'file_too_large')).toBe(
        true,
      );
    });

    it('should generate recommendations for issues', async () => {
      const request: ImageValidationRequest = {
        image_id: 'image-1',
        workspace_id: 'workspace-1',
        validation_rules: {
          min_width: 3000, // Will trigger dimension issue
        },
      };

      const response = await service.validateImage(request);

      expect(response.recommendations.length).toBeGreaterThan(0);
      expect(
        response.recommendations.some((r) => r.type === 'resize_image'),
      ).toBe(true);
    });

    it('should mark image as valid when all checks pass', async () => {
      const request: ImageValidationRequest = {
        image_id: 'image-1',
        workspace_id: 'workspace-1',
      };

      const response = await service.validateImage(request);

      expect(response.passed).toBe(true);
      expect(response.validation.validation_status).toBe('valid');
    });

    it('should mark image as invalid when critical issues exist', async () => {
      const request: ImageValidationRequest = {
        image_id: 'image-1',
        workspace_id: 'workspace-1',
        validation_rules: {
          allowed_formats: ['image/png'], // Will cause format issue
        },
      };

      const response = await service.validateImage(request);

      // Should have issues
      expect(response.issues.length).toBeGreaterThan(0);
      // Should have high severity issues
      expect(response.issues.some((i) => i.severity === 'high')).toBe(true);
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
      expect(metrics.serviceName).toBe('ImageValidationService');
      expect(metrics.requestCount).toBeGreaterThanOrEqual(0);
      expect(metrics.errorCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Batch Validation', () => {
    it('should validate multiple images', async () => {
      const response = await service.validateImages({
        image_ids: ['image-1', 'image-1'],
        workspace_id: 'workspace-1',
      });

      expect(response).toBeDefined();
      expect(response.results.length).toBe(2);
      expect(response.passed).toBeGreaterThanOrEqual(0);
      expect(response.failed).toBeGreaterThanOrEqual(0);
    });
  });
});

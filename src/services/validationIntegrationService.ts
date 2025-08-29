import { z } from 'zod';

import { ValidationError } from '../middleware/validationMiddleware.js';
import { sanitizeMarkdown } from '../utils/contentSanitizer.js';
import { ErrorReporter } from '../utils/errorReporting.js';
import {
  MivaaDocumentSchema,
  PartialMivaaDocumentSchema,
} from '../schemas/mivaaValidation.js';
import {
  TransformationConfigSchema,
  TransformationJobRequestSchema,
  PartialTransformationConfigSchema,
  validateTransformationConfig,
  validatePartialTransformationConfig,
  validateTransformationJobRequest,
} from '../schemas/transformationValidation.js';

// Type definitions for validation service
interface ValidationOptions {
  partial?: boolean;
  sanitize?: boolean;
  trackPerformance?: boolean;
}

interface PerformanceTrackingOptions {
  trackPerformance?: boolean;
}

// Use unknown for return types to avoid strict type checking issues
type ValidatedDocument = Record<string, unknown>;
type ValidatedConfig = Record<string, unknown>;
type ValidatedRequest = Record<string, unknown>;
type ValidatedPartialConfig = Record<string, unknown>;

interface ValidationWrapper<TArgs extends unknown[], TReturn> {
  inputValidator?: (input: unknown) => Promise<unknown>;
  outputValidator?: (output: TReturn) => Promise<TReturn>;
  errorHandler?: (error: unknown) => TReturn | never;
  trackPerformance?: boolean;
  methodName?: string;
}

interface PerformanceStats {
  count: number;
  average: number;
  min: number;
  max: number;
  p95: number;
}

/**
 * Integration service for adding validation to existing Phase 1 services
 * Provides validation wrappers and utilities for seamless integration
 */
export class ValidationIntegrationService {
  private static instance: ValidationIntegrationService;
  private performanceMetrics: Map<string, number[]> = new Map();

  private constructor() {}

  public static getInstance(): ValidationIntegrationService {
    if (!ValidationIntegrationService.instance) {
      ValidationIntegrationService.instance = new ValidationIntegrationService();
    }
    return ValidationIntegrationService.instance;
  }

  /**
   * Validate and sanitize MivaaDocument with performance tracking
   */
  public async validateMivaaDocument(
    document: unknown,
    options: ValidationOptions = {},
  ): Promise<ValidatedDocument> {
    const startTime = performance.now();

    try {
      // Choose schema based on partial flag
      const schema = options.partial ? PartialMivaaDocumentSchema : MivaaDocumentSchema;

      // Validate the document structure
      const validatedDocument = schema.parse(document);

      // Sanitize content if requested
      if (options.sanitize && validatedDocument.markdown) {
        validatedDocument.markdown = sanitizeMarkdown(validatedDocument.markdown);
      }

      // Track performance if requested
      if (options.trackPerformance) {
        const processingTime = performance.now() - startTime;
        this.recordPerformanceMetric('mivaa_document_validation', processingTime);
      }

      return validatedDocument;
    } catch (error) {
      const processingTime = performance.now() - startTime;

      if (error instanceof z.ZodError) {
        const errorReporter = new ErrorReporter('mivaa-document-validation');
        errorReporter.addZodErrors(error);
        const errorReport = errorReporter.generateReport();

        // Convert ErrorDetails to ValidationError format
        const mappedErrors = errorReport.errors.map(error => ({
          path: error.field || 'unknown',
          message: error.message,
          code: error.code,
          value: error.value,
        }));

        throw new ValidationError(
          `MivaaDocument validation failed: ${errorReport.summary.totalErrors} errors found`,
          mappedErrors,
          'MIVAA_DOCUMENT_VALIDATION',
        );
      }

      throw error;
    }
  }

  /**
   * Validate transformation configuration with performance tracking
   */
  public async validateTransformationConfig(
    config: unknown,
    options: PerformanceTrackingOptions = {},
  ): Promise<ValidatedConfig> {
    const startTime = performance.now();

    try {
      const validatedConfig = TransformationConfigSchema.parse(config);

      if (options.trackPerformance) {
        const processingTime = performance.now() - startTime;
        this.recordPerformanceMetric('transformation_config_validation', processingTime);
      }

      return validatedConfig;
    } catch (error) {
      const processingTime = performance.now() - startTime;

      if (error instanceof z.ZodError) {
        const errorReporter = new ErrorReporter('transformation-config-validation');
        errorReporter.addZodErrors(error);
        const errorReport = errorReporter.generateReport();

        // Convert ErrorDetails to ValidationError format
        const mappedErrors = errorReport.errors.map(error => ({
          path: error.field || 'unknown',
          message: error.message,
          code: error.code,
          value: error.value,
        }));

        throw new ValidationError(
          `TransformationConfig validation failed: ${errorReport.summary.totalErrors} errors found`,
          mappedErrors,
          'TRANSFORMATION_CONFIG_VALIDATION',
        );
      }

      throw error;
    }
  }

  /**
   * Validate transformation job request
   */
  public async validateTransformationJobRequest(
    request: unknown,
    options: PerformanceTrackingOptions = {},
  ): Promise<ValidatedRequest> {
    const startTime = performance.now();

    try {
      const validatedRequest = TransformationJobRequestSchema.parse(request);

      if (options.trackPerformance) {
        const processingTime = performance.now() - startTime;
        this.recordPerformanceMetric('transformation_job_request_validation', processingTime);
      }

      return validatedRequest;
    } catch (error) {
      const processingTime = performance.now() - startTime;

      if (error instanceof z.ZodError) {
        const errorReporter = new ErrorReporter('transformation-job-request-validation');
        errorReporter.addZodErrors(error);
        const errorReport = errorReporter.generateReport();

        // Convert ErrorDetails to ValidationError format
        const mappedErrors = errorReport.errors.map(error => ({
          path: error.field || 'unknown',
          message: error.message,
          code: error.code,
          value: error.value,
        }));

        throw new ValidationError(
          `TransformationJobRequest validation failed: ${errorReport.summary.totalErrors} errors found`,
          mappedErrors,
          'TRANSFORMATION_JOB_VALIDATION',
        );
      }

      throw error;
    }
  }

  /**
   * Validate partial transformation configuration
   */
  public async validatePartialTransformationConfig(
    config: unknown,
    options: PerformanceTrackingOptions = {},
  ): Promise<ValidatedPartialConfig> {
    const startTime = performance.now();

    try {
      const result = validatePartialTransformationConfig(config);

      if (!result.success) {
        const errorReporter = new ErrorReporter('partial-transformation-config-validation');
        // Convert validation errors to ErrorDetails format
        (result.errors || []).forEach(error => {
          errorReporter.addError({
            code: 'VAL_001',
            message: error.message,
            field: error.path,
          });
        });
        const errorReport = errorReporter.generateReport();

        // Convert ErrorDetails to ValidationError format
        const mappedErrors = errorReport.errors.map(error => ({
          path: error.field || 'unknown',
          message: error.message,
          code: error.code,
          value: error.value,
        }));

        throw new ValidationError(
          `PartialTransformationConfig validation failed: ${errorReport.summary.totalErrors} errors found`,
          mappedErrors,
          'PARTIAL_TRANSFORMATION_CONFIG_VALIDATION',
        );
      }

      if (options.trackPerformance) {
        const processingTime = performance.now() - startTime;
        this.recordPerformanceMetric('partial_transformation_config_validation', processingTime);
      }

      return result.data!;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * Create a validation wrapper for service methods
   */
  public createServiceValidationWrapper<TArgs extends unknown[], TReturn>(
    originalMethod: (...args: TArgs) => Promise<TReturn>,
    validationConfig: ValidationWrapper<TArgs, TReturn>,
  ): (...args: TArgs) => Promise<TReturn> {
    const wrapper = async (...args: TArgs): Promise<TReturn> => {
      const startTime = performance.now();
      const methodName = validationConfig.methodName || originalMethod.name;

      try {
        // Validate input if validator provided
        let validatedArgs = args;
        if (validationConfig.inputValidator && args.length > 0) {
          const validatedInput = await validationConfig.inputValidator(args[0]);
          validatedArgs = [validatedInput, ...args.slice(1)] as TArgs;
        }

        // Call original method
        const result = await originalMethod(...validatedArgs);

        // Validate output if validator provided
        let validatedResult = result;
        if (validationConfig.outputValidator) {
          validatedResult = await validationConfig.outputValidator(result);
        }

        // Track performance if requested
        if (validationConfig.trackPerformance) {
          const processingTime = performance.now() - startTime;
          this.recordPerformanceMetric(`${methodName}_validation`, processingTime);
        }

        return validatedResult;
      } catch (error) {
        // Handle validation errors
        if (validationConfig.errorHandler) {
          return validationConfig.errorHandler(error);
        }
        throw error;
      }
    };

    return wrapper;
  }

  /**
   * Record performance metrics for monitoring
   */
  private recordPerformanceMetric(operation: string, time: number): void {
    if (!this.performanceMetrics.has(operation)) {
      this.performanceMetrics.set(operation, []);
    }

    const metrics = this.performanceMetrics.get(operation)!;
    metrics.push(time);

    // Keep only last 100 measurements to prevent memory leaks
    if (metrics.length > 100) {
      metrics.shift();
    }
  }

  /**
   * Get performance statistics for validation operations
   */
  public getPerformanceStats(): Record<string, PerformanceStats> {
    const stats: Record<string, PerformanceStats> = {};

    for (const [operation, times] of this.performanceMetrics.entries()) {
      if (times.length === 0) continue;

      const sorted = [...times].sort((a, b) => a - b);
      const count = times.length;
      const sum = times.reduce((a, b) => a + b, 0);
      const average = sum / count;
      const min = sorted[0] || 0;
      const max = sorted[sorted.length - 1] || 0;
      const p95Index = Math.floor(count * 0.95);
      const p95 = sorted[p95Index] || max;

      stats[operation] = {
        count,
        average: Math.round(average * 100) / 100,
        min: Math.round(min * 100) / 100,
        max: Math.round(max * 100) / 100,
        p95: Math.round(p95 * 100) / 100,
      };
    }

    return stats;
  }

  /**
   * Check if validation performance meets requirements
   */
  public checkPerformanceRequirements(): {
    meetsRequirements: boolean;
    violations: string[];
    stats: Record<string, PerformanceStats>;
  } {
    const stats = this.getPerformanceStats();
    const violations: string[] = [];
    const maxAllowedTime = 50; // 50ms requirement from MDTM task

    for (const [operation, operationStats] of Object.entries(stats)) {
      if (operationStats.average > maxAllowedTime) {
        violations.push(
          `${operation}: average ${operationStats.average}ms exceeds ${maxAllowedTime}ms limit`,
        );
      }

      if (operationStats.p95 > maxAllowedTime * 2) {
        violations.push(
          `${operation}: p95 ${operationStats.p95}ms exceeds ${maxAllowedTime * 2}ms limit`,
        );
      }
    }

    return {
      meetsRequirements: violations.length === 0,
      violations,
      stats,
    };
  }

  /**
   * Reset performance metrics (useful for testing)
   */
  public resetPerformanceMetrics(): void {
    this.performanceMetrics.clear();
  }
}

// Export singleton instance
export const validationIntegration = ValidationIntegrationService.getInstance();

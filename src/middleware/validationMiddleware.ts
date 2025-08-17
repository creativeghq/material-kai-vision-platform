import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import {
  validateMivaaDocument,
  validatePartialMivaaDocument,
  MivaaDocumentSchema,
  PartialMivaaDocumentSchema,
} from '../schemas/mivaaValidation.js';
import {
  validateTransformationConfig,
  validatePartialTransformationConfig,
  validateTransformationJobRequest,
  TransformationConfigSchema,
  PartialTransformationConfigSchema,
  TransformationJobRequestSchema,
} from '../schemas/transformationValidation.js';

/**
 * Performance tracking for validation operations
 */
interface ValidationMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryBefore?: number;
  memoryAfter?: number;
}

/**
 * Enhanced validation error with detailed context
 */
export class ValidationError extends Error {
  public readonly statusCode: number;
  public readonly errors: Array<{
    path: string;
    message: string;
    code: string;
    value?: any;
  }>;
  public readonly validationType: string;
  public readonly timestamp: string;
  public readonly requestId: string | undefined;

  constructor(
    message: string,
    errors: Array<{ path: string; message: string; code: string; value?: any }>,
    validationType: string,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.errors = errors;
    this.validationType = validationType;
    this.timestamp = new Date().toISOString();
    this.requestId = requestId;
  }

  toJSON() {
    return {
      error: 'Validation Failed',
      message: this.message,
      validationType: this.validationType,
      timestamp: this.timestamp,
      requestId: this.requestId,
      details: this.errors,
      statusCode: this.statusCode,
    };
  }
}

/**
 * Configuration options for validation middleware
 */
interface ValidationOptions {
  allowPartial?: boolean;
  skipOnEmpty?: boolean;
  logPerformance?: boolean;
  maxValidationTime?: number; // milliseconds
  customErrorHandler?: (error: ValidationError, req: Request, res: Response, next: NextFunction) => void;
}

/**
 * Default validation options
 */
const DEFAULT_OPTIONS: ValidationOptions = {
  allowPartial: false,
  skipOnEmpty: false,
  logPerformance: true,
  maxValidationTime: 50, // 50ms as per requirements
};

/**
 * Performance monitoring utility
 */
function startPerformanceTracking(): ValidationMetrics {
  return {
    startTime: performance.now(),
    memoryBefore: process.memoryUsage().heapUsed,
  };
}

function endPerformanceTracking(metrics: ValidationMetrics): ValidationMetrics {
  metrics.endTime = performance.now();
  metrics.duration = metrics.endTime - metrics.startTime;
  metrics.memoryAfter = process.memoryUsage().heapUsed;
  return metrics;
}

/**
 * Log performance metrics if enabled
 */
function logPerformanceMetrics(
  validationType: string,
  metrics: ValidationMetrics,
  requestId?: string,
) {
  if (metrics.duration && metrics.duration > 25) { // Log if over half the limit
    console.warn(`[Validation Performance] ${validationType} took ${metrics.duration.toFixed(2)}ms`, {
      requestId,
      validationType,
      duration: metrics.duration,
      memoryDelta: metrics.memoryAfter && metrics.memoryBefore
        ? metrics.memoryAfter - metrics.memoryBefore
        : undefined,
    });
  }
}

/**
 * Generic validation middleware factory
 */
function createValidationMiddleware<T>(
  schema: z.ZodSchema<T>,
  validationType: string,
  options: ValidationOptions = {},
) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const metrics = startPerformanceTracking();

    try {
      // Skip validation if body is empty and skipOnEmpty is true
      if (opts.skipOnEmpty && (!req.body || Object.keys(req.body).length === 0)) {
        return next();
      }

      // Perform validation
      const result = schema.safeParse(req.body);

      // End performance tracking
      endPerformanceTracking(metrics);

      // Check performance threshold
      if (metrics.duration && metrics.duration > (opts.maxValidationTime || 50)) {
        console.warn(`[Validation Timeout] ${validationType} exceeded time limit`, {
          requestId,
          duration: metrics.duration,
          limit: opts.maxValidationTime,
        });
      }

      // Log performance if enabled
      if (opts.logPerformance) {
        logPerformanceMetrics(validationType, metrics, requestId);
      }

      if (!result.success) {
        const errors = result.error.errors.map((error: z.ZodIssue) => ({
          path: error.path.join('.'),
          message: error.message,
          code: error.code,
          value: error.path.length > 0 ? getNestedValue(req.body, error.path) : req.body,
        }));

        const validationError = new ValidationError(
          `${validationType} validation failed`,
          errors,
          validationType,
          requestId,
        );

        if (opts.customErrorHandler) {
          return opts.customErrorHandler(validationError, req, res, next);
        }

        return res.status(400).json(validationError.toJSON());
      }

      // Attach validated data to request
      req.validatedData = result.data;
      next();
    } catch (error) {
      endPerformanceTracking(metrics);

      console.error(`[Validation Error] Unexpected error in ${validationType}`, {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const validationError = new ValidationError(
        `Internal validation error for ${validationType}`,
        [{
          path: 'internal',
          message: 'An unexpected error occurred during validation',
          code: 'internal_error',
        }],
        validationType,
        requestId,
      );

      return res.status(500).json(validationError.toJSON());
    }
  };
}

/**
 * Utility function to get nested value from object
 */
function getNestedValue(obj: any, path: (string | number)[]): any {
  return path.reduce((current, key) => {
    return current && typeof current === 'object' ? current[key] : undefined;
  }, obj);
}

/**
 * Middleware for validating MivaaDocument data
 */
export const validateMivaaDocumentMiddleware = (options?: ValidationOptions) => {
  return createValidationMiddleware(
    MivaaDocumentSchema,
    'MivaaDocument',
    options,
  );
};

/**
 * Middleware for validating partial MivaaDocument updates
 */
export const validatePartialMivaaDocumentMiddleware = (options?: ValidationOptions) => {
  return createValidationMiddleware(
    PartialMivaaDocumentSchema,
    'PartialMivaaDocument',
    options,
  );
};

/**
 * Middleware for validating TransformationConfig data
 */
export const validateTransformationConfigMiddleware = (options?: ValidationOptions) => {
  return createValidationMiddleware(
    TransformationConfigSchema,
    'TransformationConfig',
    options,
  );
};

/**
 * Middleware for validating partial TransformationConfig updates
 */
export const validatePartialTransformationConfigMiddleware = (options?: ValidationOptions) => {
  return createValidationMiddleware(
    PartialTransformationConfigSchema,
    'PartialTransformationConfig',
    options,
  );
};

/**
 * Middleware for validating TransformationJobRequest data
 */
export const validateTransformationJobRequestMiddleware = (options?: ValidationOptions) => {
  return createValidationMiddleware(
    TransformationJobRequestSchema,
    'TransformationJobRequest',
    options,
  );
};

/**
 * Middleware for validating query parameters
 */
export const validateQueryParams = (schema: z.ZodSchema<any>, options?: ValidationOptions) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const metrics = startPerformanceTracking();

    try {
      const result = schema.safeParse(req.query);

      endPerformanceTracking(metrics);

      if (opts.logPerformance) {
        logPerformanceMetrics('QueryParams', metrics, requestId);
      }

      if (!result.success) {
        const errors = result.error.errors.map((error: z.ZodIssue) => ({
          path: `query.${error.path.join('.')}`,
          message: error.message,
          code: error.code,
          value: getNestedValue(req.query, error.path),
        }));

        const validationError = new ValidationError(
          'Query parameter validation failed',
          errors,
          'QueryParams',
          requestId,
        );

        return res.status(400).json(validationError.toJSON());
      }

      req.validatedQuery = result.data;
      next();
    } catch (error) {
      endPerformanceTracking(metrics);

      console.error('[Validation Error] Unexpected error in query validation', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });

      return res.status(500).json({
        error: 'Internal validation error',
        message: 'An unexpected error occurred during query parameter validation',
        requestId,
        timestamp: new Date().toISOString(),
      });
    }
  };
};

/**
 * Middleware for validating URL parameters
 */
export const validateUrlParams = (schema: z.ZodSchema<any>, options?: ValidationOptions) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const metrics = startPerformanceTracking();

    try {
      const result = schema.safeParse(req.params);

      endPerformanceTracking(metrics);

      if (opts.logPerformance) {
        logPerformanceMetrics('UrlParams', metrics, requestId);
      }

      if (!result.success) {
        const errors = result.error.errors.map((error: z.ZodIssue) => ({
          path: `params.${error.path.join('.')}`,
          message: error.message,
          code: error.code,
          value: getNestedValue(req.params, error.path),
        }));

        const validationError = new ValidationError(
          'URL parameter validation failed',
          errors,
          'UrlParams',
          requestId,
        );

        return res.status(400).json(validationError.toJSON());
      }

      req.validatedParams = result.data;
      next();
    } catch (error) {
      endPerformanceTracking(metrics);

      console.error('[Validation Error] Unexpected error in URL parameter validation', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });

      return res.status(500).json({
        error: 'Internal validation error',
        message: 'An unexpected error occurred during URL parameter validation',
        requestId,
        timestamp: new Date().toISOString(),
      });
    }
  };
};

/**
 * Global error handler for validation errors
 */
export const validationErrorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (error instanceof ValidationError) {
    return res.status(error.statusCode).json(error.toJSON());
  }

  // Handle Zod errors that might have escaped
  if (error instanceof z.ZodError) {
    const validationError = new ValidationError(
      'Validation failed',
      error.errors.map((err: z.ZodIssue) => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code,
      })),
      'Unknown',
      req.headers['x-request-id'] as string,
    );

    return res.status(400).json(validationError.toJSON());
  }

  next(error);
};

/**
 * Extend Express Request interface to include validated data
 */
declare global {
  namespace Express {
    interface Request {
      validatedData?: any;
      validatedQuery?: any;
      validatedParams?: any;
    }
  }
}

/**
 * Common validation schemas for URL parameters
 */
export const CommonParamSchemas = {
  id: z.object({
    id: z.string().min(1, 'ID is required'),
  }),

  documentId: z.object({
    documentId: z.string().min(1, 'Document ID is required'),
  }),

  configId: z.object({
    configId: z.string().min(1, 'Configuration ID is required'),
  }),

  jobId: z.object({
    jobId: z.string().min(1, 'Job ID is required'),
  }),
};

/**
 * Common validation schemas for query parameters
 */
export const CommonQuerySchemas = {
  pagination: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional(),
  }),

  search: z.object({
    q: z.string().optional(),
    filter: z.string().optional(),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).optional(),
  }),

  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
};

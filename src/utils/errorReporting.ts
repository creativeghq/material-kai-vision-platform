import { ZodError, ZodIssue } from 'zod';

/**
 * Error Reporting Utilities
 *
 * Provides comprehensive error reporting and formatting for validation errors,
 * including detailed messages, context information, and structured error responses.
 */

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Error categories for better classification
export enum ErrorCategory {
  VALIDATION = 'validation',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  NETWORK = 'network'
}

// Structured error details interface
export interface ErrorDetails {
  code: string;
  message: string;
  field?: string;
  value?: unknown;
  severity: ErrorSeverity;
  category: ErrorCategory;
  context?: Record<string, unknown>;
  suggestions?: string[];
  documentation?: string;
}

// Comprehensive error report interface
export interface ErrorReport {
  requestId: string;
  timestamp: string;
  endpoint?: string;
  method?: string;
  userAgent?: string;
  ip?: string;
  errors: ErrorDetails[];
  summary: {
    totalErrors: number;
    criticalErrors: number;
    highSeverityErrors: number;
    categories: Record<ErrorCategory, number>;
  };
  performance?: {
    validationTime: number;
    totalProcessingTime: number;
  };
}

// Error code mappings for consistent error identification
export const ERROR_CODES = {
  // Validation errors
  REQUIRED_FIELD_MISSING: 'VAL_001',
  INVALID_TYPE: 'VAL_002',
  INVALID_FORMAT: 'VAL_003',
  VALUE_OUT_OF_RANGE: 'VAL_004',
  INVALID_ENUM_VALUE: 'VAL_005',
  ARRAY_TOO_LONG: 'VAL_006',
  ARRAY_TOO_SHORT: 'VAL_007',
  STRING_TOO_LONG: 'VAL_008',
  STRING_TOO_SHORT: 'VAL_009',
  INVALID_EMAIL: 'VAL_010',
  INVALID_URL: 'VAL_011',
  INVALID_DATE: 'VAL_012',
  CUSTOM_VALIDATION_FAILED: 'VAL_013',

  // Security errors
  MALICIOUS_CONTENT_DETECTED: 'SEC_001',
  SCRIPT_TAG_DETECTED: 'SEC_002',
  DANGEROUS_URL_DETECTED: 'SEC_003',
  CONTENT_TOO_LARGE: 'SEC_004',
  SUSPICIOUS_FILENAME: 'SEC_005',

  // Business logic errors
  INVALID_DOCUMENT_STRUCTURE: 'BIZ_001',
  INCONSISTENT_TABLE_DATA: 'BIZ_002',
  MISSING_REQUIRED_METADATA: 'BIZ_003',
  INVALID_TRANSFORMATION_CONFIG: 'BIZ_004',

  // Performance errors
  PROCESSING_TIMEOUT: 'PERF_001',
  MEMORY_LIMIT_EXCEEDED: 'PERF_002',
  RATE_LIMIT_EXCEEDED: 'PERF_003',

  // System errors
  INTERNAL_SERVER_ERROR: 'SYS_001',
  DATABASE_ERROR: 'SYS_002',
  EXTERNAL_SERVICE_ERROR: 'SYS_003',
} as const;

// Error message templates with placeholders
const ERROR_MESSAGES: Record<string, string> = {
  [ERROR_CODES.REQUIRED_FIELD_MISSING]: 'Required field "{field}" is missing',
  [ERROR_CODES.INVALID_TYPE]: 'Field "{field}" must be of type {expectedType}, received {actualType}',
  [ERROR_CODES.INVALID_FORMAT]: 'Field "{field}" has invalid format. Expected: {expectedFormat}',
  [ERROR_CODES.VALUE_OUT_OF_RANGE]: 'Field "{field}" value {value} is out of range. Expected: {range}',
  [ERROR_CODES.INVALID_ENUM_VALUE]: 'Field "{field}" must be one of: {allowedValues}',
  [ERROR_CODES.ARRAY_TOO_LONG]: 'Array "{field}" exceeds maximum length of {maxLength}',
  [ERROR_CODES.ARRAY_TOO_SHORT]: 'Array "{field}" is below minimum length of {minLength}',
  [ERROR_CODES.STRING_TOO_LONG]: 'String "{field}" exceeds maximum length of {maxLength} characters',
  [ERROR_CODES.STRING_TOO_SHORT]: 'String "{field}" is below minimum length of {minLength} characters',
  [ERROR_CODES.INVALID_EMAIL]: 'Field "{field}" must be a valid email address',
  [ERROR_CODES.INVALID_URL]: 'Field "{field}" must be a valid URL',
  [ERROR_CODES.INVALID_DATE]: 'Field "{field}" must be a valid date',
  [ERROR_CODES.CUSTOM_VALIDATION_FAILED]: 'Custom validation failed for field "{field}": {details}',

  [ERROR_CODES.MALICIOUS_CONTENT_DETECTED]: 'Malicious content detected in field "{field}"',
  [ERROR_CODES.SCRIPT_TAG_DETECTED]: 'Script tags are not allowed in field "{field}"',
  [ERROR_CODES.DANGEROUS_URL_DETECTED]: 'Dangerous URL detected in field "{field}": {url}',
  [ERROR_CODES.CONTENT_TOO_LARGE]: 'Content in field "{field}" exceeds size limit of {maxSize}',
  [ERROR_CODES.SUSPICIOUS_FILENAME]: 'Suspicious filename detected: {filename}',

  [ERROR_CODES.INVALID_DOCUMENT_STRUCTURE]: 'Document structure is invalid: {details}',
  [ERROR_CODES.INCONSISTENT_TABLE_DATA]: 'Table data is inconsistent: {details}',
  [ERROR_CODES.MISSING_REQUIRED_METADATA]: 'Required metadata is missing: {fields}',
  [ERROR_CODES.INVALID_TRANSFORMATION_CONFIG]: 'Transformation configuration is invalid: {details}',

  [ERROR_CODES.PROCESSING_TIMEOUT]: 'Processing timeout exceeded: {timeout}ms',
  [ERROR_CODES.MEMORY_LIMIT_EXCEEDED]: 'Memory limit exceeded: {limit}MB',
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded: {limit} requests per {window}',

  [ERROR_CODES.INTERNAL_SERVER_ERROR]: 'Internal server error occurred',
  [ERROR_CODES.DATABASE_ERROR]: 'Database error: {details}',
  [ERROR_CODES.EXTERNAL_SERVICE_ERROR]: 'External service error: {service} - {details}',
};

// Suggestions for common error types
const ERROR_SUGGESTIONS: Record<string, string[]> = {
  [ERROR_CODES.REQUIRED_FIELD_MISSING]: [
    'Ensure all required fields are included in the request',
    'Check the API documentation for required field specifications',
  ],
  [ERROR_CODES.INVALID_TYPE]: [
    'Verify the data type matches the expected format',
    'Convert the value to the correct type before sending',
  ],
  [ERROR_CODES.INVALID_FORMAT]: [
    'Check the format specification in the API documentation',
    'Use the correct format pattern for this field',
  ],
  [ERROR_CODES.MALICIOUS_CONTENT_DETECTED]: [
    'Remove any script tags or malicious content',
    'Use plain text or safe HTML only',
    'Consider using markdown for formatting',
  ],
  [ERROR_CODES.SCRIPT_TAG_DETECTED]: [
    'Remove all <script> tags from the content',
    'Use alternative formatting methods',
    'Sanitize content before submission',
  ],
  [ERROR_CODES.CONTENT_TOO_LARGE]: [
    'Reduce the content size',
    'Split large content into smaller chunks',
    'Compress images or other media',
  ],
};

/**
 * Error reporting utility class
 */
export class ErrorReporter {
  private requestId: string;
  private startTime: number;
  private errors: ErrorDetails[] = [];
  private context: Record<string, unknown> = {};

  constructor(requestId: string, context?: Record<string, unknown>) {
    this.requestId = requestId;
    this.startTime = Date.now();
    this.context = context || {};
  }

  /**
   * Add an error to the report
   */
  addError(error: Partial<ErrorDetails> & { code: string; message: string }): void {
    const errorDetails: ErrorDetails = {
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.VALIDATION,
      suggestions: ERROR_SUGGESTIONS[error.code] || [],
      ...error,
    };

    this.errors.push(errorDetails);
  }

  /**
   * Add multiple errors from a Zod validation error
   */
  addZodErrors(zodError: ZodError, category: ErrorCategory = ErrorCategory.VALIDATION): void {
    zodError.issues.forEach(issue => {
      const errorDetails = this.convertZodIssueToErrorDetails(issue, category);
      this.errors.push(errorDetails);
    });
  }

  /**
   * Convert a Zod issue to ErrorDetails
   */
  private convertZodIssueToErrorDetails(issue: ZodIssue, category: ErrorCategory): ErrorDetails {
    const field = issue.path.join('.');
    let code: string;
    let severity: ErrorSeverity;
    let message: string;
    let receivedValue: unknown = undefined;

    // Use type assertion to access properties safely
    const issueAny = issue as Record<string, unknown>;

    switch (issue.code) {
      case 'invalid_type':
        code = ERROR_CODES.INVALID_TYPE;
        severity = ErrorSeverity.HIGH;
        receivedValue = issueAny.received;
        message = this.formatMessage(ERROR_MESSAGES[code] || 'Invalid type error', {
          field,
          expectedType: issueAny.expected || 'unknown',
          actualType: issueAny.received || 'unknown',
        });
        break;

      case 'too_small':
        severity = ErrorSeverity.MEDIUM;
        if (issueAny.type === 'array') {
          code = ERROR_CODES.ARRAY_TOO_SHORT;
          message = this.formatMessage(ERROR_MESSAGES[code] || 'Array too short error', {
            field,
            minLength: issueAny.minimum || 0,
          });
        } else if (issueAny.type === 'string') {
          code = ERROR_CODES.STRING_TOO_SHORT;
          message = this.formatMessage(ERROR_MESSAGES[code] || 'String too short error', {
            field,
            minLength: issueAny.minimum || 0,
          });
        } else {
          code = ERROR_CODES.VALUE_OUT_OF_RANGE;
          message = this.formatMessage(ERROR_MESSAGES[code] || 'Value out of range error', {
            field,
            value: issueAny.received || 'unknown',
            range: `>= ${issueAny.minimum || 0}`,
          });
          receivedValue = issueAny.received;
        }
        break;

      case 'too_big':
        severity = ErrorSeverity.MEDIUM;
        if (issueAny.type === 'array') {
          code = ERROR_CODES.ARRAY_TOO_LONG;
          message = this.formatMessage(ERROR_MESSAGES[code] || 'Array too long error', {
            field,
            maxLength: issueAny.maximum || 0,
          });
        } else if (issueAny.type === 'string') {
          code = ERROR_CODES.STRING_TOO_LONG;
          message = this.formatMessage(ERROR_MESSAGES[code] || 'String too long error', {
            field,
            maxLength: issueAny.maximum || 0,
          });
        } else {
          code = ERROR_CODES.VALUE_OUT_OF_RANGE;
          message = this.formatMessage(ERROR_MESSAGES[code] || 'Value out of range error', {
            field,
            value: issueAny.received || 'unknown',
            range: `<= ${issueAny.maximum || 0}`,
          });
          receivedValue = issueAny.received;
        }
        break;

      case 'custom':
        code = ERROR_CODES.CUSTOM_VALIDATION_FAILED;
        severity = ErrorSeverity.HIGH;
        message = this.formatMessage(ERROR_MESSAGES[code] || 'Custom validation failed', {
          field,
          details: issue.message,
        });
        break;

      default:
        // Handle other cases including invalid_string, invalid_enum_value, etc.
        code = ERROR_CODES.CUSTOM_VALIDATION_FAILED;
        severity = ErrorSeverity.MEDIUM;
        message = issue.message;
        receivedValue = issueAny.received;

        // Try to provide more specific error codes for common cases
        if (issue.message.includes('email')) {
          code = ERROR_CODES.INVALID_EMAIL;
        } else if (issue.message.includes('url')) {
          code = ERROR_CODES.INVALID_URL;
        } else if (issue.message.includes('enum')) {
          code = ERROR_CODES.INVALID_ENUM_VALUE;
        } else if (issue.message.includes('format')) {
          code = ERROR_CODES.INVALID_FORMAT;
        }
    }

    return {
      code,
      message,
      field,
      value: receivedValue,
      severity,
      category,
      suggestions: ERROR_SUGGESTIONS[code] || [],
      context: {
        zodIssue: issue,
      },
    };
  }

  /**
   * Format error message with placeholders
   */
  private formatMessage(template: string, params: Record<string, unknown>): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key]?.toString() || match;
    });
  }

  /**
   * Generate comprehensive error report
   */
  generateReport(additionalContext?: Record<string, unknown>): ErrorReport {
    const endTime = Date.now();
    const totalProcessingTime = endTime - this.startTime;

    // Calculate summary statistics
    const summary = {
      totalErrors: this.errors.length,
      criticalErrors: this.errors.filter(e => e.severity === ErrorSeverity.CRITICAL).length,
      highSeverityErrors: this.errors.filter(e => e.severity === ErrorSeverity.HIGH).length,
      categories: this.calculateCategoryStats(),
    };

    return {
      requestId: this.requestId,
      timestamp: new Date().toISOString(),
      ...additionalContext,
      errors: this.errors,
      summary,
      performance: {
        validationTime: totalProcessingTime,
        totalProcessingTime,
      },
    };
  }

  /**
   * Calculate error statistics by category
   */
  private calculateCategoryStats(): Record<ErrorCategory, number> {
    const stats = Object.values(ErrorCategory).reduce((acc, category) => {
      acc[category] = 0;
      return acc;
    }, {} as Record<ErrorCategory, number>);

    this.errors.forEach(error => {
      stats[error.category]++;
    });

    return stats;
  }

  /**
   * Check if there are any critical or high severity errors
   */
  hasCriticalErrors(): boolean {
    return this.errors.some(error =>
      error.severity === ErrorSeverity.CRITICAL ||
      error.severity === ErrorSeverity.HIGH,
    );
  }

  /**
   * Get errors by category
   */
  getErrorsByCategory(category: ErrorCategory): ErrorDetails[] {
    return this.errors.filter(error => error.category === category);
  }

  /**
   * Get errors by severity
   */
  getErrorsBySeverity(severity: ErrorSeverity): ErrorDetails[] {
    return this.errors.filter(error => error.severity === severity);
  }

  /**
   * Clear all errors
   */
  clearErrors(): void {
    this.errors = [];
  }

  /**
   * Get total error count
   */
  getErrorCount(): number {
    return this.errors.length;
  }
}

// Define the error response interface
interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    requestId: string;
    timestamp: string;
    details?: ErrorDetails[];
    summary?: ErrorReport['summary'];
  };
}

/**
 * Create a formatted error response for API endpoints
 */
export function createErrorResponse(
  errorReport: ErrorReport,
  includeDetails: boolean = true,
): ErrorResponse {
  const primaryError = errorReport.errors[0];
  const message = errorReport.errors.length === 1
    ? primaryError?.message || 'Validation failed'
    : `Validation failed with ${errorReport.errors.length} errors`;

  const response: ErrorResponse = {
    success: false,
    error: {
      message,
      code: primaryError?.code || 'VALIDATION_ERROR',
      requestId: errorReport.requestId,
      timestamp: errorReport.timestamp,
    },
  };

  if (includeDetails) {
    response.error.details = errorReport.errors;
    response.error.summary = errorReport.summary;
  }

  return response;
}

/**
 * Log error report to console with formatting
 */
export function logErrorReport(errorReport: ErrorReport): void {
  console.error('=== Validation Error Report ===');
  console.error(`Request ID: ${errorReport.requestId}`);
  console.error(`Timestamp: ${errorReport.timestamp}`);
  console.error(`Total Errors: ${errorReport.summary.totalErrors}`);
  console.error(`Critical Errors: ${errorReport.summary.criticalErrors}`);
  console.error(`High Severity Errors: ${errorReport.summary.highSeverityErrors}`);

  if (errorReport.performance) {
    console.error(`Processing Time: ${errorReport.performance.totalProcessingTime}ms`);
  }

  console.error('\n--- Error Details ---');
  errorReport.errors.forEach((error, index) => {
    console.error(`${index + 1}. [${error.severity.toUpperCase()}] ${error.code}: ${error.message}`);
    if (error.field) {
      console.error(`   Field: ${error.field}`);
    }
    if (error.suggestions && error.suggestions.length > 0) {
      console.error(`   Suggestions: ${error.suggestions.join(', ')}`);
    }
  });
  console.error('=== End Error Report ===\n');
}

/**
 * Error Handling System Exports
 * Centralized exports for the error handling framework
 */

// Core error classes
export {
  AppError,
  ValidationError,
  NetworkError,
  APIError,
  DatabaseError,
  ExternalServiceError,
  ConfigurationError,
  ErrorSeverity,
  ErrorCategory,
  type ErrorContext,
  type ErrorDetails,
} from './AppError';

// Utility functions for common error handling patterns
export * from './utils';

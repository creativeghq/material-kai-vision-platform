/**
 * Standardized Error Messages and User Feedback
 * 
 * This module provides consistent, user-friendly error messages
 * and feedback for different error scenarios across the platform.
 */

export enum ErrorCategory {
  VALIDATION = 'validation',
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  PROCESSING = 'processing',
  DATABASE = 'database',
  STORAGE = 'storage',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
}

export interface ErrorFeedback {
  title: string;
  message: string;
  details?: string;
  suggestion?: string;
  icon?: 'error' | 'warning' | 'info';
  retryable?: boolean;
}

/**
 * Get user-friendly error message based on error type
 */
export function getErrorFeedback(error: unknown): ErrorFeedback {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Network errors
  if (errorMessage.includes('timeout') || errorMessage.includes('504')) {
    return {
      title: 'Processing Timeout',
      message: 'The PDF processing took longer than expected.',
      details: 'This usually happens with very large or complex PDFs.',
      suggestion: 'Try uploading a smaller PDF or contact support for assistance with large documents.',
      icon: 'warning',
      retryable: true,
    };
  }

  if (errorMessage.includes('Network') || errorMessage.includes('fetch')) {
    return {
      title: 'Network Error',
      message: 'Unable to connect to the processing service.',
      details: 'Please check your internet connection and try again.',
      suggestion: 'Verify your connection and retry the operation.',
      icon: 'error',
      retryable: true,
    };
  }

  // Authentication errors
  if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('authentication')) {
    return {
      title: 'Authentication Failed',
      message: 'Your session has expired or authentication failed.',
      details: 'Please log in again to continue.',
      suggestion: 'Refresh the page and log in again.',
      icon: 'error',
      retryable: false,
    };
  }

  // Validation errors
  if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
    return {
      title: 'Invalid Input',
      message: 'The provided data is invalid or incomplete.',
      details: errorMessage,
      suggestion: 'Please check your input and try again.',
      icon: 'warning',
      retryable: false,
    };
  }

  // PDF-specific errors
  if (errorMessage.includes('PDF') || errorMessage.includes('pdf')) {
    if (errorMessage.includes('corrupted') || errorMessage.includes('invalid')) {
      return {
        title: 'Invalid PDF File',
        message: 'The PDF file appears to be corrupted or invalid.',
        details: 'The file may be damaged or not a valid PDF.',
        suggestion: 'Try opening the PDF in another application to verify it\'s valid.',
        icon: 'error',
        retryable: false,
      };
    }

    if (errorMessage.includes('password') || errorMessage.includes('encrypted')) {
      return {
        title: 'Password-Protected PDF',
        message: 'This PDF is password-protected and cannot be processed.',
        details: 'Please remove the password protection and try again.',
        suggestion: 'Remove the PDF password protection and re-upload.',
        icon: 'warning',
        retryable: false,
      };
    }

    if (errorMessage.includes('size') || errorMessage.includes('too large')) {
      return {
        title: 'File Too Large',
        message: 'The PDF file is too large to process.',
        details: 'Maximum file size is typically 100MB.',
        suggestion: 'Try splitting the PDF into smaller files.',
        icon: 'warning',
        retryable: false,
      };
    }
  }

  // Database errors
  if (errorMessage.includes('database') || errorMessage.includes('uuid')) {
    return {
      title: 'Database Error',
      message: 'Failed to save or retrieve data from the database.',
      details: 'This is a system error on our end.',
      suggestion: 'Please try again later or contact support.',
      icon: 'error',
      retryable: true,
    };
  }

  // Storage errors
  if (errorMessage.includes('storage') || errorMessage.includes('bucket')) {
    return {
      title: 'Storage Error',
      message: 'Failed to store or retrieve files.',
      details: 'There may be a temporary issue with file storage.',
      suggestion: 'Please try again later.',
      icon: 'error',
      retryable: true,
    };
  }

  // Generic error
  return {
    title: 'Processing Error',
    message: 'An unexpected error occurred during processing.',
    details: errorMessage,
    suggestion: 'Please try again or contact support if the problem persists.',
    icon: 'error',
    retryable: true,
  };
}

/**
 * Get success message based on context
 */
export function getSuccessFeedback(context: string): ErrorFeedback {
  const messages: Record<string, ErrorFeedback> = {
    'pdf-upload': {
      title: 'PDF Uploaded Successfully',
      message: 'Your PDF has been uploaded and is being processed.',
      details: 'You can track the progress below.',
      icon: 'info',
    },
    'pdf-processing': {
      title: 'PDF Processing Complete',
      message: 'Your PDF has been successfully processed and added to the knowledge base.',
      details: 'You can now search through the content.',
      icon: 'info',
    },
    'image-extraction': {
      title: 'Images Extracted',
      message: 'Images have been successfully extracted from the PDF.',
      details: 'View them in the gallery below.',
      icon: 'info',
    },
    'knowledge-storage': {
      title: 'Knowledge Base Updated',
      message: 'Content has been successfully added to the knowledge base.',
      details: 'It is now searchable and available for use.',
      icon: 'info',
    },
  };

  return messages[context] || {
    title: 'Success',
    message: 'Operation completed successfully.',
    icon: 'info',
  };
}

/**
 * Categorize error for better handling
 */
export function categorizeError(error: unknown): ErrorCategory {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (errorMessage.includes('timeout') || errorMessage.includes('504')) return ErrorCategory.TIMEOUT;
  if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) return ErrorCategory.AUTHENTICATION;
  if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) return ErrorCategory.AUTHORIZATION;
  if (errorMessage.includes('validation') || errorMessage.includes('invalid')) return ErrorCategory.VALIDATION;
  if (errorMessage.includes('Network') || errorMessage.includes('fetch')) return ErrorCategory.NETWORK;
  if (errorMessage.includes('database') || errorMessage.includes('uuid')) return ErrorCategory.DATABASE;
  if (errorMessage.includes('storage') || errorMessage.includes('bucket')) return ErrorCategory.STORAGE;

  return ErrorCategory.UNKNOWN;
}


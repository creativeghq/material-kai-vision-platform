/**
 * Standardized API Response Interface
 */

export interface StandardizedApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
    details?: any;
    retryable?: boolean;
  };
  metadata: {
    apiType: string;
    timestamp: string;
    requestId: string;
  };
}


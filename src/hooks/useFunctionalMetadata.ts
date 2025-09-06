import { useState, useEffect, useCallback, useRef } from 'react';
import { FunctionalMetadata } from '@/types/materials';
import { 
  FunctionalMetadataApiService,
  FunctionalMetadataExtractionRequest,
  FunctionalMetadataExtractionResult,
  createFunctionalMetadataApiService,
} from '@/services/functionalMetadataApiService';
import { MivaaIntegrationService } from '@/services/pdf/mivaaIntegrationService';

/**
 * State interface for functional metadata extraction
 */
export interface FunctionalMetadataState {
  /** Current functional metadata */
  functionalMetadata: FunctionalMetadata | null;
  /** Loading state for API calls */
  loading: boolean;
  /** Error message if extraction fails */
  error: string | null;
  /** Extraction summary from MIVAA response */
  extractionSummary: {
    categories_with_data: string[];
    key_properties_found: string[];
    suggested_applications: string[];
    overall_confidence: 'low' | 'medium' | 'high';
  } | null;
  /** Whether extraction is available for current document */
  available: boolean;
  /** Processing time for last extraction */
  processingTime: number;
}

/**
 * Hook options for functional metadata extraction
 */
export interface UseFunctionalMetadataOptions {
  /** Whether to auto-extract when documentId changes */
  autoExtract?: boolean;
  /** Confidence threshold for extraction (0-1) */
  confidenceThreshold?: number;
  /** Whether to include workspace context */
  workspaceAware?: boolean;
  /** Callback when extraction completes successfully */
  onExtractionComplete?: (metadata: FunctionalMetadata) => void;
  /** Callback when extraction fails */
  onExtractionError?: (error: string) => void;
}

/**
 * Custom hook for managing functional metadata extraction and state
 * 
 * Provides comprehensive state management for MIVAA functional metadata extraction
 * with proper loading states, error handling, and cleanup.
 */
export function useFunctionalMetadata(
  documentId: string | null,
  file: File | Buffer | null,
  mivaaService: MivaaIntegrationService,
  options: UseFunctionalMetadataOptions = {}
) {
  const {
    autoExtract = false,
    confidenceThreshold = 0.5,
    workspaceAware = true,
    onExtractionComplete,
    onExtractionError,
  } = options;

  // State management
  const [state, setState] = useState<FunctionalMetadataState>({
    functionalMetadata: null,
    loading: false,
    error: null,
    extractionSummary: null,
    available: false,
    processingTime: 0,
  });

  // Refs for cleanup and service instance
  const abortControllerRef = useRef<AbortController | null>(null);
  const apiServiceRef = useRef<FunctionalMetadataApiService | null>(null);

  // Initialize API service
  useEffect(() => {
    if (mivaaService) {
      apiServiceRef.current = createFunctionalMetadataApiService(mivaaService);
    }
    return () => {
      apiServiceRef.current = null;
    };
  }, [mivaaService]);

  // Cleanup function for aborting ongoing requests
  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Check availability when document changes
  useEffect(() => {
    if (!documentId || !apiServiceRef.current) {
      setState(prev => ({ ...prev, available: false }));
      return;
    }

    let isCancelled = false;

    const checkAvailability = async () => {
      try {
        const result = await apiServiceRef.current!.checkFunctionalMetadataAvailability(documentId);
        if (!isCancelled) {
          setState(prev => ({ 
            ...prev, 
            available: result.available,
            error: result.available ? null : result.reason || 'Service unavailable',
          }));
        }
      } catch (error) {
        if (!isCancelled) {
          setState(prev => ({ 
            ...prev, 
            available: false,
            error: error instanceof Error ? error.message : 'Availability check failed',
          }));
        }
      }
    };

    checkAvailability();

    return () => {
      isCancelled = true;
    };
  }, [documentId]);

  // Auto-extract when dependencies change
  useEffect(() => {
    if (autoExtract && documentId && file && state.available && !state.loading) {
      extractFunctionalMetadata();
    }
  }, [autoExtract, documentId, file, state.available]);

  /**
   * Extract functional metadata from the current document
   */
  const extractFunctionalMetadata = useCallback(async (): Promise<FunctionalMetadataExtractionResult | null> => {
    if (!documentId || !file || !apiServiceRef.current) {
      const error = 'Missing required parameters for extraction';
      setState(prev => ({ ...prev, error }));
      onExtractionError?.(error);
      return null;
    }

    // Cancel any ongoing request
    cleanup();

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    const currentController = abortControllerRef.current;

    setState(prev => ({ 
      ...prev, 
      loading: true, 
      error: null,
      processingTime: 0,
    }));

    try {
      const startTime = Date.now();

      const request: FunctionalMetadataExtractionRequest = {
        documentId,
        file,
        options: {
          extractionType: 'images',
          workspaceAware,
          includeFunctionalMetadata: true,
          confidenceThreshold,
        },
      };

      const result = await apiServiceRef.current.extractWithFunctionalMetadata(request);
      
      // Check if request was cancelled
      if (currentController.signal.aborted) {
        return null;
      }

      const processingTime = Date.now() - startTime;

      if (result.status === 'success' && result.data.functionalMetadata) {
        setState(prev => ({
          ...prev,
          functionalMetadata: result.data.functionalMetadata || null,
          extractionSummary: result.data.extractionSummary || null,
          loading: false,
          error: null,
          processingTime,
        }));

        onExtractionComplete?.(result.data.functionalMetadata);
        return result;
      } else {
        const errorMessage = result.errors?.[0] || 'Extraction failed without functional metadata';
        setState(prev => ({
          ...prev,
          loading: false,
          error: errorMessage,
          processingTime,
        }));

        onExtractionError?.(errorMessage);
        return result;
      }
    } catch (error) {
      // Check if error is due to cancellation
      if (currentController.signal.aborted) {
        return null;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown extraction error';
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
        processingTime: Date.now() - Date.now(), // fallback to 0
      }));

      onExtractionError?.(errorMessage);
      return null;
    }
  }, [documentId, file, workspaceAware, confidenceThreshold, cleanup, onExtractionComplete, onExtractionError]);

  /**
   * Extract only functional metadata without images (lightweight)
   */
  const extractFunctionalMetadataOnly = useCallback(async () => {
    if (!documentId || !file || !apiServiceRef.current) {
      const error = 'Missing required parameters for metadata-only extraction';
      setState(prev => ({ ...prev, error }));
      onExtractionError?.(error);
      return null;
    }

    // Cancel any ongoing request
    cleanup();

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const request: FunctionalMetadataExtractionRequest = {
        documentId,
        file,
        options: {
          extractionType: 'images',
          workspaceAware,
          includeFunctionalMetadata: true,
          confidenceThreshold,
        },
      };

      const result = await apiServiceRef.current.extractFunctionalMetadataOnly(request);

      setState(prev => ({
        ...prev,
        functionalMetadata: result.functionalMetadata || null,
        extractionSummary: result.extractionSummary || null,
        loading: false,
        error: result.errors?.[0] || null,
        processingTime: result.processingTime,
      }));

      if (result.functionalMetadata) {
        onExtractionComplete?.(result.functionalMetadata);
      } else if (result.errors?.[0]) {
        onExtractionError?.(result.errors[0]);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown metadata extraction error';
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
        processingTime: 0,
      }));

      onExtractionError?.(errorMessage);
      return null;
    }
  }, [documentId, file, workspaceAware, confidenceThreshold, cleanup, onExtractionComplete, onExtractionError]);

  /**
   * Clear current functional metadata and reset state
   */
  const clearFunctionalMetadata = useCallback(() => {
    cleanup();
    setState(prev => ({
      ...prev,
      functionalMetadata: null,
      extractionSummary: null,
      error: null,
      processingTime: 0,
    }));
  }, [cleanup]);

  /**
   * Retry last failed extraction
   */
  const retryExtraction = useCallback(async () => {
    if (state.error && !state.loading) {
      return await extractFunctionalMetadata();
    }
    return null;
  }, [state.error, state.loading, extractFunctionalMetadata]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Return hook interface
  return {
    // State
    ...state,
    
    // Actions
    extractFunctionalMetadata,
    extractFunctionalMetadataOnly,
    clearFunctionalMetadata,
    retryExtraction,
    
    // Utilities
    isExtracting: state.loading,
    hasError: !!state.error,
    hasMetadata: !!state.functionalMetadata,
    canExtract: !!documentId && !!file && state.available && !state.loading,
  };
}

/**
 * Lightweight hook for just checking functional metadata availability
 */
export function useFunctionalMetadataAvailability(
  documentId: string | null,
  mivaaService: MivaaIntegrationService
) {
  const [available, setAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId || !mivaaService) {
      setAvailable(false);
      setError(null);
      return;
    }

    let isCancelled = false;
    setChecking(true);

    const checkAvailability = async () => {
      try {
        const service = createFunctionalMetadataApiService(mivaaService);
        const result = await service.checkFunctionalMetadataAvailability(documentId);
        
        if (!isCancelled) {
          setAvailable(result.available);
          setError(result.available ? null : result.reason || 'Service unavailable');
          setChecking(false);
        }
      } catch (error) {
        if (!isCancelled) {
          setAvailable(false);
          setError(error instanceof Error ? error.message : 'Availability check failed');
          setChecking(false);
        }
      }
    };

    checkAvailability();

    return () => {
      isCancelled = true;
      setChecking(false);
    };
  }, [documentId, mivaaService]);

  return {
    available,
    checking,
    error,
  };
}

/**
 * Hook for managing functional metadata processing state across multiple documents
 */
export function useBatchFunctionalMetadata(
  mivaaService: MivaaIntegrationService,
  options: UseFunctionalMetadataOptions = {}
) {
  const [batchState, setBatchState] = useState<{
    processing: Map<string, FunctionalMetadataState>;
    completed: Map<string, FunctionalMetadata>;
    failed: Map<string, string>;
  }>({
    processing: new Map(),
    completed: new Map(),
    failed: new Map(),
  });

  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  /**
   * Process multiple documents for functional metadata extraction
   */
  const processBatch = useCallback(async (
    documents: Array<{ id: string; file: File | Buffer }>
  ) => {
    const apiService = createFunctionalMetadataApiService(mivaaService);
    
    // Initialize processing state for all documents
    setBatchState(prev => ({
      ...prev,
      processing: new Map(documents.map(doc => [doc.id, {
        functionalMetadata: null,
        loading: true,
        error: null,
        extractionSummary: null,
        available: true,
        processingTime: 0,
      }])),
    }));

    // Process each document
    const results = await Promise.allSettled(
      documents.map(async (doc) => {
        const controller = new AbortController();
        abortControllersRef.current.set(doc.id, controller);

        try {
          const request: FunctionalMetadataExtractionRequest = {
            documentId: doc.id,
            file: doc.file,
            options: {
              extractionType: 'images',
              workspaceAware: options.workspaceAware ?? true,
              includeFunctionalMetadata: true,
              confidenceThreshold: options.confidenceThreshold ?? 0.5,
            },
          };

          const result = await apiService.extractWithFunctionalMetadata(request);
          
          if (controller.signal.aborted) return null;

          if (result.status === 'success' && result.data.functionalMetadata) {
            setBatchState(prev => ({
              ...prev,
              completed: new Map(prev.completed).set(doc.id, result.data.functionalMetadata!),
              processing: new Map([...prev.processing].filter(([id]) => id !== doc.id)),
            }));

            return { id: doc.id, result };
          } else {
            const error = result.errors?.[0] || 'Extraction failed';
            setBatchState(prev => ({
              ...prev,
              failed: new Map(prev.failed).set(doc.id, error),
              processing: new Map([...prev.processing].filter(([id]) => id !== doc.id)),
            }));

            return { id: doc.id, error };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          setBatchState(prev => ({
            ...prev,
            failed: new Map(prev.failed).set(doc.id, errorMessage),
            processing: new Map([...prev.processing].filter(([id]) => id !== doc.id)),
          }));

          return { id: doc.id, error: errorMessage };
        } finally {
          abortControllersRef.current.delete(doc.id);
        }
      })
    );

    return results;
  }, [mivaaService, options.workspaceAware, options.confidenceThreshold]);

  /**
   * Cancel processing for a specific document
   */
  const cancelDocument = useCallback((documentId: string) => {
    const controller = abortControllersRef.current.get(documentId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(documentId);
      
      setBatchState(prev => ({
        ...prev,
        processing: new Map([...prev.processing].filter(([id]) => id !== documentId)),
      }));
    }
  }, []);

  /**
   * Cancel all ongoing processing
   */
  const cancelAll = useCallback(() => {
    abortControllersRef.current.forEach(controller => controller.abort());
    abortControllersRef.current.clear();
    
    setBatchState(prev => ({
      ...prev,
      processing: new Map(),
    }));
  }, []);

  /**
   * Clear all results and reset state
   */
  const clearAll = useCallback(() => {
    cancelAll();
    setBatchState({
      processing: new Map(),
      completed: new Map(),
      failed: new Map(),
    });
  }, [cancelAll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAll();
    };
  }, [cancelAll]);

  return {
    // State
    processing: Array.from(batchState.processing.entries()),
    completed: Array.from(batchState.completed.entries()),
    failed: Array.from(batchState.failed.entries()),
    
    // Computed state
    isProcessing: batchState.processing.size > 0,
    totalProcessing: batchState.processing.size,
    totalCompleted: batchState.completed.size,
    totalFailed: batchState.failed.size,
    
    // Actions
    processBatch,
    cancelDocument,
    cancelAll,
    clearAll,
    
    // Utilities
    getMetadata: (documentId: string) => batchState.completed.get(documentId) || null,
    getError: (documentId: string) => batchState.failed.get(documentId) || null,
    isDocumentProcessing: (documentId: string) => batchState.processing.has(documentId),
  };
}

/**
 * Hook for managing functional metadata cache
 */
export function useFunctionalMetadataCache() {
  const [cache, setCache] = useState<Map<string, {
    metadata: FunctionalMetadata;
    extractedAt: Date;
    ttl: number;
  }>>(new Map());

  /**
   * Get cached metadata if still valid
   */
  const getCached = useCallback((documentId: string, ttlMinutes: number = 30): FunctionalMetadata | null => {
    const cached = cache.get(documentId);
    if (!cached) return null;

    const now = new Date();
    const ageMinutes = (now.getTime() - cached.extractedAt.getTime()) / (1000 * 60);
    
    if (ageMinutes > ttlMinutes) {
      // Remove expired entry
      setCache(prev => {
        const newCache = new Map(prev);
        newCache.delete(documentId);
        return newCache;
      });
      return null;
    }

    return cached.metadata;
  }, [cache]);

  /**
   * Store metadata in cache
   */
  const setCached = useCallback((documentId: string, metadata: FunctionalMetadata, ttlMinutes: number = 30) => {
    setCache(prev => new Map(prev).set(documentId, {
      metadata,
      extractedAt: new Date(),
      ttl: ttlMinutes,
    }));
  }, []);

  /**
   * Clear cache entry
   */
  const clearCached = useCallback((documentId: string) => {
    setCache(prev => {
      const newCache = new Map(prev);
      newCache.delete(documentId);
      return newCache;
    });
  }, []);

  /**
   * Clear all cache entries
   */
  const clearAllCache = useCallback(() => {
    setCache(new Map());
  }, []);

  /**
   * Get cache statistics
   */
  const getCacheStats = useCallback(() => {
    const now = new Date();
    let validEntries = 0;
    let expiredEntries = 0;

    cache.forEach((entry) => {
      const ageMinutes = (now.getTime() - entry.extractedAt.getTime()) / (1000 * 60);
      if (ageMinutes > entry.ttl) {
        expiredEntries++;
      } else {
        validEntries++;
      }
    });

    return {
      totalEntries: cache.size,
      validEntries,
      expiredEntries,
    };
  }, [cache]);

  return {
    getCached,
    setCached,
    clearCached,
    clearAllCache,
    getCacheStats,
    cacheSize: cache.size,
  };
}
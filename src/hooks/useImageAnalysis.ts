import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  imageAnalysisService, 
  ImageAnalysisRequest, 
  ImageAnalysisResult 
} from '../services/imageAnalysis/ImageAnalysisService';
import { useToast } from './useToast';

export interface UseImageAnalysisOptions {
  autoStart?: boolean;
  onComplete?: (result: ImageAnalysisResult) => void;
  onError?: (error: string) => void;
  onProgress?: (progress: number) => void;
}

export interface UseImageAnalysisReturn {
  // State
  isAnalyzing: boolean;
  results: ImageAnalysisResult[];
  currentResult: ImageAnalysisResult | null;
  error: string | null;
  
  // Actions
  analyzeImage: (file: File, options?: Partial<ImageAnalysisRequest>) => Promise<string>;
  cancelAnalysis: (analysisId: string) => Promise<void>;
  clearResults: () => void;
  exportResult: (analysisId: string, format: 'json' | 'csv' | 'pdf') => Promise<void>;
  
  // Utilities
  getResultById: (analysisId: string) => ImageAnalysisResult | undefined;
  getActiveAnalyses: () => ImageAnalysisResult[];
  getCompletedAnalyses: () => ImageAnalysisResult[];
}

export function useImageAnalysis(options: UseImageAnalysisOptions = {}): UseImageAnalysisReturn {
  const { onComplete, onError, onProgress } = options;
  const { toast } = useToast();
  
  // State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<ImageAnalysisResult[]>([]);
  const [currentResult, setCurrentResult] = useState<ImageAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Refs for cleanup
  const unsubscribeRefs = useRef<Map<string, () => void>>(new Map());
  const globalUnsubscribeRef = useRef<(() => void) | null>(null);

  // Initialize and subscribe to global updates
  useEffect(() => {
    // Load existing results
    const existingResults = imageAnalysisService.getAllResults();
    setResults(existingResults);
    
    // Subscribe to all analysis updates
    const unsubscribe = imageAnalysisService.onAnyAnalysisUpdate((result) => {
      setResults(prev => {
        const index = prev.findIndex(r => r.id === result.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = result;
          return updated;
        } else {
          return [result, ...prev];
        }
      });
      
      // Update current result if it matches
      setCurrentResult(prev => prev?.id === result.id ? result : prev);
      
      // Handle callbacks
      if (result.status === 'completed' && onComplete) {
        onComplete(result);
      }
      
      if (result.status === 'failed' && onError) {
        onError(result.error || 'Analysis failed');
      }
      
      if (onProgress) {
        onProgress(result.progress);
      }
      
      // Update analyzing state
      setIsAnalyzing(() => {
        const hasActiveAnalyses = imageAnalysisService.getAllResults()
          .some(r => r.status === 'pending' || r.status === 'processing');
        return hasActiveAnalyses;
      });
    });
    
    globalUnsubscribeRef.current = unsubscribe;
    
    return () => {
      if (globalUnsubscribeRef.current) {
        globalUnsubscribeRef.current();
      }
      // Clean up individual subscriptions
      unsubscribeRefs.current.forEach(unsub => unsub());
      unsubscribeRefs.current.clear();
    };
  }, [onComplete, onError, onProgress]);

  // Analyze image
  const analyzeImage = useCallback(async (
    file: File, 
    options: Partial<ImageAnalysisRequest> = {}
  ): Promise<string> => {
    try {
      setError(null);
      setIsAnalyzing(true);
      
      const request: ImageAnalysisRequest = {
        id: '', // Will be set by service
        file,
        analysisType: options.analysisType || 'full_analysis',
        options: options.options || {},
      };
      
      const analysisId = await imageAnalysisService.analyzeImage(request);
      
      // Subscribe to this specific analysis
      const unsubscribe = imageAnalysisService.onAnalysisUpdate(analysisId, (result) => {
        setCurrentResult(result);
        
        if (result.status === 'completed') {
          toast({
            title: 'Analysis Complete',
            description: `Image analysis for "${file.name}" completed successfully.`,
            variant: 'default',
          });
        } else if (result.status === 'failed') {
          toast({
            title: 'Analysis Failed',
            description: result.error || 'Image analysis failed.',
            variant: 'destructive',
          });
        }
      });
      
      unsubscribeRefs.current.set(analysisId, unsubscribe);
      
      toast({
        title: 'Analysis Started',
        description: `Started analyzing "${file.name}".`,
      });
      
      return analysisId;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start analysis';
      setError(errorMessage);
      setIsAnalyzing(false);
      
      toast({
        title: 'Analysis Error',
        description: errorMessage,
        variant: 'destructive',
      });
      
      throw err;
    }
  }, [toast]);

  // Cancel analysis
  const cancelAnalysis = useCallback(async (analysisId: string): Promise<void> => {
    try {
      await imageAnalysisService.cancelAnalysis(analysisId);
      
      // Clean up subscription
      const unsubscribe = unsubscribeRefs.current.get(analysisId);
      if (unsubscribe) {
        unsubscribe();
        unsubscribeRefs.current.delete(analysisId);
      }
      
      // Clear current result if it matches
      setCurrentResult(prev => prev?.id === analysisId ? null : prev);
      
      toast({
        title: 'Analysis Cancelled',
        description: 'Image analysis has been cancelled.',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel analysis';
      setError(errorMessage);
      
      toast({
        title: 'Cancel Error',
        description: errorMessage,
        variant: 'destructive',
      });
      
      throw err;
    }
  }, [toast]);

  // Clear results
  const clearResults = useCallback(() => {
    setResults([]);
    setCurrentResult(null);
    setError(null);
    
    // Clean up subscriptions
    unsubscribeRefs.current.forEach(unsub => unsub());
    unsubscribeRefs.current.clear();
    
    // Clear old results from service
    imageAnalysisService.clearOldResults();
  }, []);

  // Export result
  const exportResult = useCallback(async (
    analysisId: string, 
    format: 'json' | 'csv' | 'pdf'
  ): Promise<void> => {
    try {
      const blob = await imageAnalysisService.exportResult(analysisId, format);
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `analysis-${analysisId}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: 'Export Complete',
        description: `Analysis result exported as ${format.toUpperCase()}.`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to export result';
      setError(errorMessage);
      
      toast({
        title: 'Export Error',
        description: errorMessage,
        variant: 'destructive',
      });
      
      throw err;
    }
  }, [toast]);

  // Utility functions
  const getResultById = useCallback((analysisId: string): ImageAnalysisResult | undefined => {
    return results.find(result => result.id === analysisId);
  }, [results]);

  const getActiveAnalyses = useCallback((): ImageAnalysisResult[] => {
    return results.filter(result => 
      result.status === 'pending' || result.status === 'processing'
    );
  }, [results]);

  const getCompletedAnalyses = useCallback((): ImageAnalysisResult[] => {
    return results.filter(result => 
      result.status === 'completed' || result.status === 'failed'
    );
  }, [results]);

  return {
    // State
    isAnalyzing,
    results,
    currentResult,
    error,
    
    // Actions
    analyzeImage,
    cancelAnalysis,
    clearResults,
    exportResult,
    
    // Utilities
    getResultById,
    getActiveAnalyses,
    getCompletedAnalyses,
  };
}

// Hook for managing multiple image analyses
export function useImageAnalysisBatch() {
  const [batchId, setBatchId] = useState<string>('');
  const [batchResults, setBatchResults] = useState<Map<string, ImageAnalysisResult>>(new Map());
  const [batchProgress, setBatchProgress] = useState({ completed: 0, total: 0 });
  
  const { analyzeImage, results } = useImageAnalysis();

  const analyzeBatch = useCallback(async (
    files: File[],
    options: Partial<ImageAnalysisRequest> = {}
  ): Promise<string[]> => {
    const newBatchId = `batch-${Date.now()}`;
    setBatchId(newBatchId);
    setBatchResults(new Map());
    setBatchProgress({ completed: 0, total: files.length });
    
    const analysisIds: string[] = [];
    
    for (const file of files) {
      try {
        const analysisId = await analyzeImage(file, options);
        analysisIds.push(analysisId);
      } catch (error) {
        console.error(`Failed to start analysis for ${file.name}:`, error);
      }
    }
    
    return analysisIds;
  }, [analyzeImage]);

  // Update batch progress when results change
  useEffect(() => {
    if (batchId) {
      const batchAnalyses = results.filter(result => 
        result.createdAt.getTime() >= parseInt(batchId.split('-')[1] || '0')
      );
      
      const newBatchResults = new Map<string, ImageAnalysisResult>();
      let completed = 0;
      
      batchAnalyses.forEach(result => {
        newBatchResults.set(result.id, result);
        if (result.status === 'completed' || result.status === 'failed') {
          completed++;
        }
      });
      
      setBatchResults(newBatchResults);
      setBatchProgress({ completed, total: batchAnalyses.length });
    }
  }, [results, batchId]);

  return {
    batchId,
    batchResults: Array.from(batchResults.values()),
    batchProgress,
    analyzeBatch,
    isBatchComplete: batchProgress.completed === batchProgress.total && batchProgress.total > 0,
  };
}

export default useImageAnalysis;
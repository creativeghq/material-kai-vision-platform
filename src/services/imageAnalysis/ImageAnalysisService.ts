/**
 * Image Analysis Service
 * Handles communication with the image analysis pipeline and manages analysis requests
 */

export interface ImageAnalysisRequest {
  id: string;
  file: File;
  analysisType: 'ocr' | 'object_detection' | 'classification' | 'full_analysis';
  options?: {
    language?: string;
    confidence_threshold?: number;
    extract_tables?: boolean;
    extract_forms?: boolean;
  };
}

export interface ImageAnalysisResult {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  results?: {
    ocr?: {
      text: string;
      confidence: number;
      blocks: TextBlock[];
      tables?: TableData[];
      forms?: FormData[];
    };
    objects?: DetectedObject[];
    classification?: ClassificationResult[];
    metadata?: ImageMetadata;
  };
  error?: string;
  processingTime?: number;
  createdAt: Date;
  completedAt?: Date;
}

export interface TextBlock {
  id: string;
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
  type: 'paragraph' | 'line' | 'word' | 'character';
}

export interface TableData {
  id: string;
  rows: TableRow[];
  boundingBox: BoundingBox;
  confidence: number;
}

export interface TableRow {
  cells: TableCell[];
}

export interface TableCell {
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
  rowSpan?: number;
  colSpan?: number;
}

export interface FormData {
  id: string;
  fields: FormField[];
  boundingBox: BoundingBox;
}

export interface FormField {
  name: string;
  value: string;
  confidence: number;
  boundingBox: BoundingBox;
  type: 'text' | 'checkbox' | 'radio' | 'select' | 'signature';
}

export interface DetectedObject {
  id: string;
  label: string;
  confidence: number;
  boundingBox: BoundingBox;
  attributes?: Record<string, any>;
}

export interface ClassificationResult {
  label: string;
  confidence: number;
  category: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  dpi?: number;
  colorSpace?: string;
  hasAlpha?: boolean;
}

class ImageAnalysisService {
  private baseUrl: string;
  private activeRequests: Map<string, ImageAnalysisRequest> = new Map();
  private results: Map<string, ImageAnalysisResult> = new Map();
  private eventListeners: Map<string, ((result: ImageAnalysisResult) => void)[]> = new Map();

  constructor(baseUrl: string = '/api/image-analysis') {
    this.baseUrl = baseUrl;
  }

  /**
   * Submit an image for analysis
   */
  async analyzeImage(request: ImageAnalysisRequest): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', request.file);
      formData.append('analysisType', request.analysisType);
      formData.append('options', JSON.stringify(request.options || {}));

      const response = await fetch(`${this.baseUrl}/analyze`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Analysis request failed: ${response.statusText}`);
      }

      const { analysisId } = await response.json();
      
      // Store the request
      this.activeRequests.set(analysisId, { ...request, id: analysisId });
      
      // Initialize result
      const initialResult: ImageAnalysisResult = {
        id: analysisId,
        status: 'pending',
        progress: 0,
        createdAt: new Date(),
      };
      
      this.results.set(analysisId, initialResult);
      this.notifyListeners(analysisId, initialResult);

      // Start polling for updates
      this.pollForUpdates(analysisId);

      return analysisId;
    } catch (error) {
      console.error('Failed to submit image analysis:', error);
      throw error;
    }
  }

  /**
   * Get analysis result by ID
   */
  getResult(analysisId: string): ImageAnalysisResult | undefined {
    return this.results.get(analysisId);
  }

  /**
   * Get all results
   */
  getAllResults(): ImageAnalysisResult[] {
    return Array.from(this.results.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Cancel an analysis request
   */
  async cancelAnalysis(analysisId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/cancel/${analysisId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Failed to cancel analysis: ${response.statusText}`);
      }

      // Update local state
      const result = this.results.get(analysisId);
      if (result) {
        const updatedResult = {
          ...result,
          status: 'failed' as const,
          error: 'Analysis cancelled by user',
        };
        this.results.set(analysisId, updatedResult);
        this.notifyListeners(analysisId, updatedResult);
      }

      this.activeRequests.delete(analysisId);
    } catch (error) {
      console.error('Failed to cancel analysis:', error);
      throw error;
    }
  }

  /**
   * Subscribe to analysis updates
   */
  onAnalysisUpdate(analysisId: string, callback: (result: ImageAnalysisResult) => void): () => void {
    if (!this.eventListeners.has(analysisId)) {
      this.eventListeners.set(analysisId, []);
    }
    
    this.eventListeners.get(analysisId)!.push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(analysisId);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Subscribe to all analysis updates
   */
  onAnyAnalysisUpdate(callback: (result: ImageAnalysisResult) => void): () => void {
    const unsubscribeFunctions: (() => void)[] = [];

    // Subscribe to existing results
    for (const analysisId of this.results.keys()) {
      unsubscribeFunctions.push(this.onAnalysisUpdate(analysisId, callback));
    }

    // Store callback for future results
    const globalKey = '__global__';
    if (!this.eventListeners.has(globalKey)) {
      this.eventListeners.set(globalKey, []);
    }
    this.eventListeners.get(globalKey)!.push(callback);

    // Return unsubscribe function
    return () => {
      unsubscribeFunctions.forEach(unsub => unsub());
      const listeners = this.eventListeners.get(globalKey);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Poll for analysis updates
   */
  private async pollForUpdates(analysisId: string): Promise<void> {
    const pollInterval = 1000; // 1 second
    const maxPolls = 300; // 5 minutes max
    let pollCount = 0;

    const poll = async () => {
      try {
        const response = await fetch(`${this.baseUrl}/status/${analysisId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to get analysis status: ${response.statusText}`);
        }

        const result: ImageAnalysisResult = await response.json();
        result.createdAt = new Date(result.createdAt);
        if (result.completedAt) {
          result.completedAt = new Date(result.completedAt);
        }

        this.results.set(analysisId, result);
        this.notifyListeners(analysisId, result);

        // Continue polling if still processing
        if (result.status === 'pending' || result.status === 'processing') {
          pollCount++;
          if (pollCount < maxPolls) {
            setTimeout(poll, pollInterval);
          } else {
            // Timeout
            const timeoutResult = {
              ...result,
              status: 'failed' as const,
              error: 'Analysis timeout',
            };
            this.results.set(analysisId, timeoutResult);
            this.notifyListeners(analysisId, timeoutResult);
          }
        } else {
          // Analysis completed or failed
          this.activeRequests.delete(analysisId);
        }
      } catch (error) {
        console.error('Failed to poll analysis status:', error);
        
        // Update with error
        const currentResult = this.results.get(analysisId);
        if (currentResult) {
          const errorResult = {
            ...currentResult,
            status: 'failed' as const,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
          this.results.set(analysisId, errorResult);
          this.notifyListeners(analysisId, errorResult);
        }
        
        this.activeRequests.delete(analysisId);
      }
    };

    // Start polling
    setTimeout(poll, pollInterval);
  }

  /**
   * Notify listeners of result updates
   */
  private notifyListeners(analysisId: string, result: ImageAnalysisResult): void {
    // Notify specific listeners
    const listeners = this.eventListeners.get(analysisId);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(result);
        } catch (error) {
          console.error('Error in analysis update callback:', error);
        }
      });
    }

    // Notify global listeners
    const globalListeners = this.eventListeners.get('__global__');
    if (globalListeners) {
      globalListeners.forEach(callback => {
        try {
          callback(result);
        } catch (error) {
          console.error('Error in global analysis update callback:', error);
        }
      });
    }
  }

  /**
   * Clear old results (keep last 100)
   */
  clearOldResults(): void {
    const results = this.getAllResults();
    if (results.length > 100) {
      const toRemove = results.slice(100);
      toRemove.forEach(result => {
        this.results.delete(result.id);
        this.eventListeners.delete(result.id);
      });
    }
  }

  /**
   * Export analysis result
   */
  async exportResult(analysisId: string, format: 'json' | 'csv' | 'pdf'): Promise<Blob> {
    try {
      const response = await fetch(`${this.baseUrl}/export/${analysisId}?format=${format}`);
      
      if (!response.ok) {
        throw new Error(`Failed to export result: ${response.statusText}`);
      }

      return await response.blob();
    } catch (error) {
      console.error('Failed to export analysis result:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const imageAnalysisService = new ImageAnalysisService();

export default ImageAnalysisService;
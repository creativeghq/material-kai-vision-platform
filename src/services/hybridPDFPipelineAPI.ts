import { supabase } from '@/integrations/supabase/client'

export interface ProcessingOptions {
  enableLayoutAnalysis?: boolean
  enableImageMapping?: boolean
  chunkingStrategy?: 'semantic' | 'fixed' | 'hybrid'
  maxChunkSize?: number
  overlapSize?: number
}

export interface ProcessingStatus {
  processingId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  currentStep: string
  startTime: string
  endTime?: string
  errorMessage?: string
  metadata?: Record<string, any>
}

export interface DocumentChunk {
  id: string
  documentId: string
  chunkIndex: number
  text: string
  htmlContent?: string
  chunkType: 'heading' | 'paragraph' | 'table' | 'list' | 'mixed' | 'image_caption'
  hierarchyLevel: number
  pageNumber: number
  bbox?: { x: number; y: number; width: number; height: number }
  parentChunkId?: string
  embedding?: number[]
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface DocumentImage {
  id: string
  documentId: string
  chunkId?: string
  imageUrl: string
  imageType: string
  caption?: string
  altText?: string
  bbox?: { x: number; y: number; width: number; height: number }
  pageNumber: number
  proximityScore: number
  confidence: number
  metadata: Record<string, any>
  createdAt: string
}

export interface LayoutAnalysis {
  id: string
  documentId: string
  pageNumber: number
  layoutElements: any[]
  readingOrder: string[]
  structureConfidence: number
  processingVersion: string
  analysisMetadata: Record<string, any>
  createdAt: string
}

export interface QualityMetrics {
  id: string
  documentId: string
  layoutPreservation: number
  chunkingQuality: number
  imageMappingAccuracy: number
  overallQuality: number
  statistics: Record<string, any>
  processingTimeMs: number
  createdAt: string
}

export interface ProcessingResults {
  documentId: string
  chunks: DocumentChunk[]
  images: DocumentImage[]
  layout: LayoutAnalysis[]
  quality: QualityMetrics | null
  summary: {
    totalChunks: number
    totalImages: number
    totalPages: number
    overallQuality: number
  }
}

export interface SearchResult {
  query: string
  results: (DocumentChunk & { similarity_score: number })[]
  total: number
}

class HybridPDFPipelineAPI {
  private baseUrl: string

  constructor() {
    this.baseUrl = `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/hybrid-pdf-pipeline`
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session?.access_token) {
      throw new Error('No authentication token available')
    }

    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    }
  }

  private async makeRequest<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const headers = await this.getAuthHeaders()
    
    const response = await fetch(`${this.baseUrl}/${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...options.headers
      }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Start processing a PDF document with the hybrid pipeline
   */
  async processDocument(
    documentId: string, 
    options: ProcessingOptions = {}
  ): Promise<{ processingId: string; status: string; message: string }> {
    return this.makeRequest('process', {
      method: 'POST',
      body: JSON.stringify({ documentId, options })
    })
  }

  /**
   * Get the current processing status
   */
  async getProcessingStatus(processingId: string): Promise<ProcessingStatus> {
    return this.makeRequest(`status?processingId=${encodeURIComponent(processingId)}`)
  }

  /**
   * Get processing results for a document
   */
  async getProcessingResults(documentId: string): Promise<ProcessingResults> {
    return this.makeRequest(`results?documentId=${encodeURIComponent(documentId)}`)
  }

  /**
   * Search through document chunks using semantic similarity
   */
  async searchChunks(
    query: string,
    options: {
      documentId?: string
      limit?: number
      threshold?: number
    } = {}
  ): Promise<SearchResult> {
    return this.makeRequest('search', {
      method: 'POST',
      body: JSON.stringify({
        query,
        documentId: options.documentId,
        limit: options.limit || 10,
        threshold: options.threshold || 0.7
      })
    })
  }

  /**
   * Poll processing status until completion
   */
  async waitForProcessing(
    processingId: string,
    onProgress?: (status: ProcessingStatus) => void,
    pollInterval: number = 2000
  ): Promise<ProcessingStatus> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const status = await this.getProcessingStatus(processingId)
          
          if (onProgress) {
            onProgress(status)
          }

          if (status.status === 'completed') {
            resolve(status)
          } else if (status.status === 'failed') {
            reject(new Error(status.errorMessage || 'Processing failed'))
          } else {
            // Continue polling
            setTimeout(poll, pollInterval)
          }
        } catch (error) {
          reject(error)
        }
      }

      poll()
    })
  }

  /**
   * Process document and wait for completion
   */
  async processDocumentAndWait(
    documentId: string,
    options: ProcessingOptions = {},
    onProgress?: (status: ProcessingStatus) => void
  ): Promise<ProcessingResults> {
    // Start processing
    const { processingId } = await this.processDocument(documentId, options)
    
    // Wait for completion
    await this.waitForProcessing(processingId, onProgress)
    
    // Get results
    return this.getProcessingResults(documentId)
  }

  /**
   * Get chunks for a specific document
   */
  async getDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
    const results = await this.getProcessingResults(documentId)
    return results.chunks
  }

  /**
   * Get images for a specific document
   */
  async getDocumentImages(documentId: string): Promise<DocumentImage[]> {
    const results = await this.getProcessingResults(documentId)
    return results.images
  }

  /**
   * Get quality metrics for a document
   */
  async getQualityMetrics(documentId: string): Promise<QualityMetrics | null> {
    const results = await this.getProcessingResults(documentId)
    return results.quality
  }

  /**
   * Search within a specific document
   */
  async searchInDocument(
    documentId: string,
    query: string,
    options: { limit?: number; threshold?: number } = {}
  ): Promise<SearchResult> {
    return this.searchChunks(query, {
      documentId,
      ...options
    })
  }

  /**
   * Get document processing history
   */
  async getProcessingHistory(documentId: string): Promise<ProcessingStatus[]> {
    // This would require a separate endpoint to get processing history
    // For now, we'll return the current status if available
    try {
      const results = await this.getProcessingResults(documentId)
      if (results.chunks.length > 0) {
        return [{
          processingId: 'unknown',
          status: 'completed',
          progress: 100,
          currentStep: 'Processing completed',
          startTime: results.chunks[0].createdAt,
          endTime: results.chunks[0].createdAt
        }]
      }
    } catch (error) {
      console.warn('Could not fetch processing history:', error)
    }
    
    return []
  }
}

// Export singleton instance
export const hybridPDFPipelineAPI = new HybridPDFPipelineAPI()

// Export class for testing or custom instances
export { HybridPDFPipelineAPI }

// Utility functions
export const formatProcessingStatus = (status: ProcessingStatus): string => {
  switch (status.status) {
    case 'pending':
      return 'Waiting to start...'
    case 'processing':
      return `${status.currentStep} (${status.progress}%)`
    case 'completed':
      return 'Processing completed successfully'
    case 'failed':
      return `Failed: ${status.errorMessage || 'Unknown error'}`
    default:
      return 'Unknown status'
  }
}

export const getQualityColor = (quality: number): string => {
  if (quality >= 0.8) return 'green'
  if (quality >= 0.6) return 'yellow'
  return 'red'
}

export const getQualityLabel = (quality: number): string => {
  if (quality >= 0.9) return 'Excellent'
  if (quality >= 0.8) return 'Good'
  if (quality >= 0.6) return 'Fair'
  if (quality >= 0.4) return 'Poor'
  return 'Very Poor'
}
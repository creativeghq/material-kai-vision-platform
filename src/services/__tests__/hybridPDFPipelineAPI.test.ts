/**
 * @jest-environment jsdom
 */

import { hybridPDFPipelineAPI, HybridPDFPipelineAPI } from '../hybridPDFPipelineAPI';

// Mock fetch globally
global.fetch = jest.fn();

// Mock Supabase client
jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'mock-token'
          }
        }
      })
    }
  }
}));

describe('HybridPDFPipelineAPI', () => {
  let api: HybridPDFPipelineAPI;
  const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    api = new HybridPDFPipelineAPI();
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processDocument', () => {
    it('should start document processing successfully', async () => {
      const mockResponse = {
        processingId: 'proc_123',
        status: 'pending',
        message: 'Document processing started'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await api.processDocument('doc-123', {
        enableLayoutAnalysis: true,
        enableImageMapping: true,
        chunkingStrategy: 'hybrid',
        maxChunkSize: 1000,
        overlapSize: 100
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/process'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-token',
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining('doc-123')
        })
      );
    });

    it('should handle processing errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: 'Invalid document ID' })
      } as Response);

      await expect(api.processDocument('invalid-doc')).rejects.toThrow('Invalid document ID');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(api.processDocument('doc-123')).rejects.toThrow('Network error');
    });
  });

  describe('getProcessingStatus', () => {
    it('should retrieve processing status successfully', async () => {
      const mockStatus = {
        processingId: 'proc_123',
        status: 'processing',
        progress: 50,
        currentStep: 'Creating chunks',
        startTime: '2025-01-13T16:00:00Z'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatus
      } as Response);

      const result = await api.getProcessingStatus('proc_123');

      expect(result).toEqual(mockStatus);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/status?processingId=proc_123'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-token'
          })
        })
      );
    });

    it('should handle status not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Processing status not found' })
      } as Response);

      await expect(api.getProcessingStatus('invalid-proc')).rejects.toThrow('Processing status not found');
    });
  });

  describe('getProcessingResults', () => {
    it('should retrieve processing results successfully', async () => {
      const mockResults = {
        documentId: 'doc-123',
        chunks: [
          {
            id: 'chunk-1',
            documentId: 'doc-123',
            chunkIndex: 0,
            text: 'Sample text',
            chunkType: 'paragraph',
            hierarchyLevel: 1,
            pageNumber: 1,
            metadata: {},
            createdAt: '2025-01-13T16:00:00Z',
            updatedAt: '2025-01-13T16:00:00Z'
          }
        ],
        images: [],
        layout: [],
        quality: {
          id: 'quality-1',
          documentId: 'doc-123',
          layoutPreservation: 0.9,
          chunkingQuality: 0.85,
          imageMappingAccuracy: 1.0,
          overallQuality: 0.88,
          statistics: { totalChunks: 1, totalImages: 0 },
          processingTimeMs: 5000,
          createdAt: '2025-01-13T16:00:00Z'
        },
        summary: {
          totalChunks: 1,
          totalImages: 0,
          totalPages: 1,
          overallQuality: 0.88
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResults
      } as Response);

      const result = await api.getProcessingResults('doc-123');

      expect(result).toEqual(mockResults);
      expect(result.chunks).toHaveLength(1);
      expect(result.summary.totalChunks).toBe(1);
    });
  });

  describe('searchChunks', () => {
    it('should search chunks successfully', async () => {
      const mockSearchResults = {
        query: 'test query',
        results: [
          {
            id: 'chunk-1',
            documentId: 'doc-123',
            chunkIndex: 0,
            text: 'This is a test document with relevant content',
            chunkType: 'paragraph',
            hierarchyLevel: 1,
            pageNumber: 1,
            metadata: {},
            createdAt: '2025-01-13T16:00:00Z',
            updatedAt: '2025-01-13T16:00:00Z',
            similarity_score: 0.85
          }
        ],
        total: 1
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResults
      } as Response);

      const result = await api.searchChunks('test query', {
        limit: 10,
        threshold: 0.7
      });

      expect(result).toEqual(mockSearchResults);
      expect(result.results[0].similarity_score).toBe(0.85);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/search'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('test query')
        })
      );
    });

    it('should handle search with document filter', async () => {
      const mockSearchResults = {
        query: 'specific query',
        results: [],
        total: 0
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResults
      } as Response);

      await api.searchChunks('specific query', {
        documentId: 'doc-123',
        limit: 5,
        threshold: 0.8
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/search'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"documentId":"doc-123"')
        })
      );
    });
  });

  describe('waitForProcessing', () => {
    it('should poll until completion', async () => {
      const processingId = 'proc_123';
      let callCount = 0;

      mockFetch.mockImplementation(async () => {
        callCount++;
        const status = callCount < 3 ? 'processing' : 'completed';
        const progress = callCount < 3 ? callCount * 30 : 100;

        return {
          ok: true,
          json: async () => ({
            processingId,
            status,
            progress,
            currentStep: status === 'completed' ? 'Processing completed' : 'Processing...',
            startTime: '2025-01-13T16:00:00Z'
          })
        } as Response;
      });

      const progressUpdates: any[] = [];
      const result = await api.waitForProcessing(
        processingId,
        (status) => progressUpdates.push(status),
        100 // Short poll interval for testing
      );

      expect(result.status).toBe('completed');
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it('should handle processing failure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          processingId: 'proc_123',
          status: 'failed',
          progress: 0,
          currentStep: 'Processing failed',
          errorMessage: 'Document parsing error',
          startTime: '2025-01-13T16:00:00Z'
        })
      } as Response);

      await expect(api.waitForProcessing('proc_123', undefined, 100))
        .rejects.toThrow('Document parsing error');
    });
  });

  describe('processDocumentAndWait', () => {
    it('should process document and wait for completion', async () => {
      // Mock process start
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          processingId: 'proc_123',
          status: 'pending',
          message: 'Processing started'
        })
      } as Response);

      // Mock status polling (completed immediately)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          processingId: 'proc_123',
          status: 'completed',
          progress: 100,
          currentStep: 'Processing completed',
          startTime: '2025-01-13T16:00:00Z'
        })
      } as Response);

      // Mock results retrieval
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          documentId: 'doc-123',
          chunks: [],
          images: [],
          layout: [],
          quality: null,
          summary: { totalChunks: 0, totalImages: 0, totalPages: 0, overallQuality: 0 }
        })
      } as Response);

      const result = await api.processDocumentAndWait('doc-123');

      expect(result.documentId).toBe('doc-123');
      expect(mockFetch).toHaveBeenCalledTimes(3); // process + status + results
    });
  });

  describe('utility functions', () => {
    it('should handle authentication errors', async () => {
      // Mock auth failure
      const { supabase } = require('@/integrations/supabase/client');
      supabase.auth.getSession.mockResolvedValueOnce({
        data: { session: null }
      });

      await expect(api.processDocument('doc-123')).rejects.toThrow('No authentication token available');
    });
  });
});

describe('Utility Functions', () => {
  const { formatProcessingStatus, getQualityColor, getQualityLabel } = require('../hybridPDFPipelineAPI');

  describe('formatProcessingStatus', () => {
    it('should format pending status', () => {
      const status = {
        processingId: 'proc_123',
        status: 'pending' as const,
        progress: 0,
        currentStep: 'Waiting',
        startTime: '2025-01-13T16:00:00Z'
      };

      expect(formatProcessingStatus(status)).toBe('Waiting to start...');
    });

    it('should format processing status with progress', () => {
      const status = {
        processingId: 'proc_123',
        status: 'processing' as const,
        progress: 75,
        currentStep: 'Creating chunks',
        startTime: '2025-01-13T16:00:00Z'
      };

      expect(formatProcessingStatus(status)).toBe('Creating chunks (75%)');
    });

    it('should format completed status', () => {
      const status = {
        processingId: 'proc_123',
        status: 'completed' as const,
        progress: 100,
        currentStep: 'Done',
        startTime: '2025-01-13T16:00:00Z'
      };

      expect(formatProcessingStatus(status)).toBe('Processing completed successfully');
    });

    it('should format failed status', () => {
      const status = {
        processingId: 'proc_123',
        status: 'failed' as const,
        progress: 0,
        currentStep: 'Failed',
        errorMessage: 'Parse error',
        startTime: '2025-01-13T16:00:00Z'
      };

      expect(formatProcessingStatus(status)).toBe('Failed: Parse error');
    });
  });

  describe('getQualityColor', () => {
    it('should return green for high quality', () => {
      expect(getQualityColor(0.9)).toBe('green');
      expect(getQualityColor(0.8)).toBe('green');
    });

    it('should return yellow for medium quality', () => {
      expect(getQualityColor(0.7)).toBe('yellow');
      expect(getQualityColor(0.6)).toBe('yellow');
    });

    it('should return red for low quality', () => {
      expect(getQualityColor(0.5)).toBe('red');
      expect(getQualityColor(0.3)).toBe('red');
    });
  });

  describe('getQualityLabel', () => {
    it('should return correct labels for quality ranges', () => {
      expect(getQualityLabel(0.95)).toBe('Excellent');
      expect(getQualityLabel(0.85)).toBe('Good');
      expect(getQualityLabel(0.7)).toBe('Fair');
      expect(getQualityLabel(0.5)).toBe('Poor');
      expect(getQualityLabel(0.3)).toBe('Very Poor');
    });
  });
});
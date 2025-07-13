import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hybridPDFPipeline } from '../hybridPDFPipeline';
import { htmlDOMAnalyzer } from '../htmlDOMAnalyzer';
import { layoutAwareChunker } from '../layoutAwareChunker';
import { imageTextMapper } from '../imageTextMapper';

// Mock dependencies
vi.mock('../htmlDOMAnalyzer');
vi.mock('../layoutAwareChunker');
vi.mock('../imageTextMapper');
vi.mock('@/integrations/supabase/client');

const mockHtmlDOMAnalyzer = vi.mocked(htmlDOMAnalyzer);
const mockLayoutAwareChunker = vi.mocked(layoutAwareChunker);
const mockImageTextMapper = vi.mocked(imageTextMapper);

describe('HybridPDFPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('processDocument', () => {
    const mockDocumentId = 'test-doc-id';
    const mockHtmlContent = '<html><body><h1>Test Document</h1><p>Test content</p></body></html>';
    const mockOptions = {
      enableLayoutAnalysis: true,
      enableImageMapping: true,
      chunkingStrategy: 'hybrid' as const,
      maxChunkSize: 1000,
      overlapSize: 100
    };

    const mockLayoutAnalysis = {
      success: true,
      documentStructure: {
        title: 'Test Document',
        headings: [{ level: 1, text: 'Test Document', elementId: 'h1-1' }],
        paragraphs: [{ text: 'Test content', elementId: 'p-1' }],
        images: [],
        tables: [],
        lists: [],
        readingOrder: ['h1-1', 'p-1'],
        totalElements: 2,
        metadata: {
          processingDate: new Date().toISOString(),
          confidence: 0.9,
          version: '1.0.0'
        }
      },
      layoutElements: [
        {
          id: 'h1-1',
          type: 'heading',
          level: 1,
          text: 'Test Document',
          bbox: { x: 0, y: 0, width: 100, height: 20 },
          styles: {},
          children: []
        },
        {
          id: 'p-1',
          type: 'paragraph',
          text: 'Test content',
          bbox: { x: 0, y: 25, width: 100, height: 15 },
          styles: {},
          children: []
        }
      ]
    };

    const mockChunks = [
      {
        id: 'chunk-1',
        text: 'Test Document',
        htmlContent: '<h1>Test Document</h1>',
        chunkType: 'heading' as const,
        hierarchyLevel: 1,
        pageNumber: 1,
        bbox: { x: 0, y: 0, width: 100, height: 20 },
        elementIds: ['h1-1'],
        metadata: {
          wordCount: 2,
          semanticTags: ['title'],
          confidence: 0.95
        }
      },
      {
        id: 'chunk-2',
        text: 'Test content',
        htmlContent: '<p>Test content</p>',
        chunkType: 'paragraph' as const,
        hierarchyLevel: 2,
        pageNumber: 1,
        bbox: { x: 0, y: 25, width: 100, height: 15 },
        elementIds: ['p-1'],
        metadata: {
          wordCount: 2,
          semanticTags: ['content'],
          confidence: 0.9
        }
      }
    ];

    const mockImageMappings = [];

    beforeEach(() => {
      mockHtmlDOMAnalyzer.analyzeDocument.mockResolvedValue(mockLayoutAnalysis);
      mockLayoutAwareChunker.createChunks.mockResolvedValue(mockChunks);
      mockImageTextMapper.mapImagesToText.mockResolvedValue(mockImageMappings);
    });

    it('should successfully process a document with all features enabled', async () => {
      const result = await hybridPDFPipeline.processDocument(
        mockDocumentId,
        mockHtmlContent,
        mockOptions
      );

      expect(result.success).toBe(true);
      expect(result.documentId).toBe(mockDocumentId);
      expect(result.chunks).toHaveLength(2);
      expect(result.images).toHaveLength(0);
      expect(result.layoutAnalysis).toBeDefined();
      expect(result.qualityMetrics).toBeDefined();

      // Verify service calls
      expect(mockHtmlDOMAnalyzer.analyzeDocument).toHaveBeenCalledWith(
        mockHtmlContent,
        expect.objectContaining({
          preserveLayout: true,
          extractImages: true
        })
      );

      expect(mockLayoutAwareChunker.createChunks).toHaveBeenCalledWith(
        mockLayoutAnalysis.layoutElements,
        expect.objectContaining({
          strategy: 'hybrid',
          maxChunkSize: 1000,
          overlapSize: 100
        })
      );

      expect(mockImageTextMapper.mapImagesToText).toHaveBeenCalledWith(
        [],
        mockChunks,
        expect.any(Object)
      );
    });

    it('should handle layout analysis disabled', async () => {
      const optionsWithoutLayout = {
        ...mockOptions,
        enableLayoutAnalysis: false
      };

      const result = await hybridPDFPipeline.processDocument(
        mockDocumentId,
        mockHtmlContent,
        optionsWithoutLayout
      );

      expect(result.success).toBe(true);
      expect(mockHtmlDOMAnalyzer.analyzeDocument).toHaveBeenCalledWith(
        mockHtmlContent,
        expect.objectContaining({
          preserveLayout: false
        })
      );
    });

    it('should handle image mapping disabled', async () => {
      const optionsWithoutImages = {
        ...mockOptions,
        enableImageMapping: false
      };

      const result = await hybridPDFPipeline.processDocument(
        mockDocumentId,
        mockHtmlContent,
        optionsWithoutImages
      );

      expect(result.success).toBe(true);
      expect(mockHtmlDOMAnalyzer.analyzeDocument).toHaveBeenCalledWith(
        mockHtmlContent,
        expect.objectContaining({
          extractImages: false
        })
      );
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Analysis failed');
      mockHtmlDOMAnalyzer.analyzeDocument.mockRejectedValue(error);

      const result = await hybridPDFPipeline.processDocument(
        mockDocumentId,
        mockHtmlContent,
        mockOptions
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Analysis failed');
      expect(result.chunks).toHaveLength(0);
    });

    it('should calculate quality metrics correctly', async () => {
      const result = await hybridPDFPipeline.processDocument(
        mockDocumentId,
        mockHtmlContent,
        mockOptions
      );

      expect(result.qualityMetrics).toEqual({
        layoutPreservation: expect.any(Number),
        chunkingQuality: expect.any(Number),
        imageMappingAccuracy: expect.any(Number),
        overallQuality: expect.any(Number),
        statistics: expect.objectContaining({
          totalChunks: 2,
          totalImages: 0,
          totalElements: 2,
          avgChunkSize: expect.any(Number),
          processingTimeMs: expect.any(Number)
        })
      });

      expect(result.qualityMetrics.layoutPreservation).toBeGreaterThan(0);
      expect(result.qualityMetrics.layoutPreservation).toBeLessThanOrEqual(1);
    });
  });

  describe('getProcessingStatus', () => {
    it('should return processing status', async () => {
      const processingId = 'test-processing-id';
      
      // Mock the status retrieval
      const mockStatus = {
        processingId,
        status: 'processing' as const,
        progress: 50,
        currentStep: 'Creating chunks',
        startTime: new Date().toISOString()
      };

      // This would typically come from a database query
      const result = await hybridPDFPipeline.getProcessingStatus(processingId);
      
      // For now, we'll test the structure
      expect(result).toHaveProperty('processingId');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('progress');
    });
  });

  describe('searchDocuments', () => {
    it('should search documents using semantic similarity', async () => {
      const query = 'test query';
      const options = {
        limit: 10,
        threshold: 0.7,
        documentId: 'test-doc-id'
      };

      const result = await hybridPDFPipeline.searchDocuments(query, options);
      
      expect(result).toHaveProperty('query', query);
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.results)).toBe(true);
    });
  });
});
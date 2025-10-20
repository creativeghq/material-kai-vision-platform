import { BaseService, ServiceConfig } from '../base/BaseService';
import { ProcessingPipelineResult } from '../../types/rag';

import { DocumentProcessingPipeline } from './documentProcessingPipeline';

/**
 * Configuration interface for Mivaa PDF Integration Service
 */
export interface MivaaIntegrationConfig extends ServiceConfig {
  mivaaBaseUrl: string;
  mivaaApiKey?: string;
  defaultTimeout: number;
  maxRetries: number;
  batchSize: number;
  supportedFormats: string[];
  workspaceConfig: {
    enabled: boolean;
    contextWindow: number;
    chunkSize: number;
  };
}

/**
 * Standard document metadata interface
 */
export interface DocumentMetadata {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
  processedAt?: Date;
  source: 'upload' | 'url' | 'workspace';
  workspace?: {
    projectId?: string;
    userId?: string;
    tags?: string[];
  };
}

/**
 * PDF extraction request interface
 */
export interface PdfExtractionRequest {
  documentId: string;
  file: File | Buffer;
  options: {
    extractionType: 'markdown' | 'tables' | 'images' | 'all';
    pageRange?: {
      start?: number;
      end?: number;
    };
    outputFormat?: 'json' | 'zip';
    workspaceAware?: boolean;
  };
  metadata?: Partial<DocumentMetadata>;
}

/**
 * Standardized extraction result interface
 */
export interface ExtractionResult {
  documentId: string;
  status: 'success' | 'partial' | 'failed';
  extractionType: string;
  data: {
    markdown?: string;
    tables?: TableData[];
    images?: ImageData[];
    metadata?: DocumentMetadata;
  };
  processingTime: number;
  errors?: string[];
  warnings?: string[];
}

/**
 * Table data structure
 */
export interface TableData {
  id: string;
  pageNumber: number;
  csvData: string;
  rowCount: number;
  columnCount: number;
  headers?: string[];
}

/**
 * Image data structure
 */
export interface ImageData {
  id: string;
  pageNumber: number;
  imageBuffer: Buffer;
  format: string;
  width: number;
  height: number;
  metadata?: Record<string, unknown>;
}

// RagDocument interface moved to src/types/rag.ts for unified usage across the application

// ProcessingPipelineResult interface moved to src/types/rag.ts for unified usage across the application

/**
 * Mivaa API response interfaces
 */
interface MivaaMarkdownResponse {
  markdown: string;
  metadata?: {
    page_count: number;
    processing_time: number;
  };
}

interface MivaaTablesResponse {
  tables: Array<{
    page_number: number;
    csv_data: string;
    table_index: number;
  }>;
  metadata?: {
    total_tables: number;
    processing_time: number;
  };
}

interface MivaaImagesResponse {
  images: Array<{
    page_number: number;
    image_data: string; // base64 encoded
    format: string;
    width: number;
    height: number;
    image_index: number;
  }>;
  metadata?: {
    total_images: number;
    processing_time: number;
  };
}

// MivaaMetadata type removed - using undefined for metadata field instead

/**
 * Mivaa PDF Integration Service
 *
 * Provides a consolidated TypeScript bridge between the Mivaa PDF extractor service
 * and the RAG systems, with workspace-aware processing capabilities.
 * Combines both HTTP client functionality and high-level service operations.
 */
export class MivaaIntegrationService extends BaseService<MivaaIntegrationConfig> {
  private documentProcessor: DocumentProcessingPipeline;

  constructor(config: MivaaIntegrationConfig) {
    super(config);
    this.documentProcessor = new DocumentProcessingPipeline(config);
  }

  /**
   * Initialize the service and its dependencies
   */
  protected async doInitialize(): Promise<void> {
    await this.documentProcessor.initialize();

    // Verify Mivaa service connectivity
    const healthCheck = await this.healthCheck();
    if (!healthCheck.isHealthy) {
      throw new Error(`Mivaa service is not available: ${healthCheck.error}`);
    }
  }

  /**
   * Health check implementation
   */
  protected async doHealthCheck(): Promise<void> {
    const mivaaHealth = await this.healthCheck();
    if (!mivaaHealth.isHealthy) {
      throw new Error(`Mivaa service health check failed: ${mivaaHealth.error}`);
    }
  }

  /**
   * Check if Mivaa service is healthy and responsive via gateway
   */
  async healthCheck(): Promise<{ isHealthy: boolean; error?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.defaultTimeout);

      // Use the gateway health endpoint instead of direct MIVAA call
      const response = await fetch('/api/mivaa/health', {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { isHealthy: true };
      } else {
        return {
          isHealthy: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }
    } catch (error) {
      return {
        isHealthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Extract markdown content from PDF
   */
  async extractMarkdown(request: PdfExtractionRequest): Promise<MivaaMarkdownResponse> {
    const response = await this.makeRequest('/extract/markdown', {
      method: 'POST',
      body: JSON.stringify({
        file_path: request.documentId, // Use documentId as file path
        options: request.options,
      }),
    });

    if (!response.ok) {
      throw new Error(`Markdown extraction failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Extract tables from PDF
   */
  async extractTables(request: PdfExtractionRequest): Promise<MivaaTablesResponse> {
    const response = await this.makeRequest('/extract/tables', {
      method: 'POST',
      body: JSON.stringify({
        file_path: request.documentId, // Use documentId as file path
        options: request.options,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tables extraction failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Extract images from PDF
   */
  async extractImages(request: PdfExtractionRequest): Promise<MivaaImagesResponse> {
    const response = await this.makeRequest('/extract/images', {
      method: 'POST',
      body: JSON.stringify({
        file_path: request.documentId, // Use documentId as file path
        options: request.options,
      }),
    });

    if (!response.ok) {
      throw new Error(`Images extraction failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Extract all content types from PDF
   */
  async extractAll(request: PdfExtractionRequest): Promise<{
    markdown: MivaaMarkdownResponse;
    tables: MivaaTablesResponse;
    images: MivaaImagesResponse;
  }> {
    const [markdown, tables, images] = await Promise.all([
      this.extractMarkdown(request),
      this.extractTables(request),
      this.extractImages(request),
    ]);

    return { markdown, tables, images };
  }

  /**
   * Make HTTP request to MIVAA service through gateway with retry logic
   */
  private async makeRequest(endpoint: string, options: RequestInit, retries = 3): Promise<Response> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout



        // Determine the action based on endpoint
        let action = 'extract_text';
        if (endpoint.includes('markdown')) action = 'pdf_extract_markdown';
        else if (endpoint.includes('tables')) action = 'pdf_extract_tables';
        else if (endpoint.includes('images')) action = 'pdf_extract_images';
        else if (endpoint.includes('process')) action = 'pdf_process_document';

        const response = await this.callMivaaGatewayDirect(action, options.body ? JSON.parse(options.body as string) : {});

        clearTimeout(timeoutId);

        if (response.success) {
          // Convert direct response to Response-like object for compatibility
          return {
            ok: true,
            status: 200,
            json: async () => response.data,
            text: async () => JSON.stringify(response.data),
          } as Response;
        } else {
          throw new Error(`MIVAA request failed: ${response.error?.message || 'Unknown error'}`);
        }
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Extract content from PDF using Mivaa service
   */
  async extractContent(request: PdfExtractionRequest): Promise<{
    success: boolean;
    data: unknown;
    errors?: string[];
    warnings?: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let extractedData: ExtractionResult['data'] = {};

    try {
      switch (request.options.extractionType) {
        case 'markdown': {
          const response = await this.extractMarkdown(request);
          extractedData = { markdown: response.markdown, metadata: undefined };
          break;
        }
        case 'tables': {
          const response = await this.extractTables(request);
          extractedData = {
            tables: response.tables.map(table => ({
              id: `table_${table.table_index}`,
              pageNumber: table.page_number,
              csvData: table.csv_data,
              rowCount: 0, // TODO: Calculate from CSV data
              columnCount: 0, // TODO: Calculate from CSV data
              headers: [], // TODO: Extract from CSV data
            })),
            metadata: undefined,
          };
          break;
        }
        case 'images': {
          const response = await this.extractImages(request);
          extractedData = {
            images: response.images.map(image => ({
              id: `image_${image.page_number}`,
              pageNumber: image.page_number,
              base64Data: image.image_data,
              format: image.format,
              width: image.width,
              height: image.height,
              description: '', // TODO: Add image description
              imageBuffer: Buffer.from(image.image_data, 'base64'), // Convert base64 to Buffer
            })),
            metadata: undefined,
          };
          break;
        }
        case 'all': {
          const response = await this.extractAll(request);
          extractedData = {
            markdown: response.markdown.markdown,
            tables: response.tables.tables.map(table => ({
              id: `table_${table.table_index}`,
              pageNumber: table.page_number,
              csvData: table.csv_data,
              rowCount: 0,
              columnCount: 0,
              headers: [],
            })),
            images: response.images.images.map(image => ({
              id: `image_${image.page_number}`,
              pageNumber: image.page_number,
              base64Data: image.image_data,
              format: image.format,
              width: image.width,
              height: image.height,
              description: '',
              imageBuffer: Buffer.from(image.image_data, 'base64'), // Convert base64 to Buffer
            })),
            metadata: undefined,
          };
          break;
        }
        default:
          throw new Error(`Unsupported extraction type: ${request.options.extractionType}`);
      }

      return {
        success: true,
        data: extractedData,
        ...(errors.length > 0 && { errors }),
        ...(warnings.length > 0 && { warnings }),
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown extraction error');
      return {
        success: false,
        data: {},
        errors,
      };
    }
  }

  /**
   * Extract content from PDF document
   */
  public async extractFromPdf(request: PdfExtractionRequest): Promise<ExtractionResult> {
    return this.executeOperation(async () => {
      const startTime = Date.now();

      // Validate request
      this.validateExtractionRequest(request);

      // Extract content using consolidated service
      const extractionResult = await this.extractContent(request);

      // Process and standardize the result
      const standardizedResult: ExtractionResult = {
        documentId: request.documentId,
        status: extractionResult.success ? 'success' : 'failed',
        extractionType: request.options.extractionType,
        data: extractionResult.data as {
          markdown?: string;
          tables?: TableData[];
          images?: ImageData[];
          metadata?: DocumentMetadata;
        },
        processingTime: Date.now() - startTime,
        ...(extractionResult.errors && { errors: extractionResult.errors }),
        ...(extractionResult.warnings && { warnings: extractionResult.warnings }),
      };

      return standardizedResult;
    }, 'extractFromPdf');
  }

  /**
   * Process document through the complete pipeline for RAG integration
   */
  public async processForRag(request: PdfExtractionRequest): Promise<ProcessingPipelineResult> {
    return this.executeOperation(async () => {
      // First extract content
      const extractionResult = await this.extractFromPdf(request);

      if (extractionResult.status === 'failed') {
        throw new Error(`PDF extraction failed: ${extractionResult.errors?.join(', ')}`);
      }

      // Process through RAG pipeline
      const pipelineResult = await this.documentProcessor.processForRag(
        extractionResult,
        request.options.workspaceAware || false,
      );

      return pipelineResult;
    }, 'processForRag');
  }

  /**
   * Batch process multiple documents
   */
  public async batchProcess(requests: PdfExtractionRequest[]): Promise<ProcessingPipelineResult[]> {
    return this.executeOperation(async () => {
      const results: ProcessingPipelineResult[] = [];
      const batchSize = this.config.batchSize || 5;

      // Process in batches to avoid overwhelming the service
      for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize);
        const batchPromises = batch.map(request => this.processForRag(request));
        const batchResults = await Promise.allSettled(batchPromises);

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            // Create error result for failed processing
            results.push({
              documentId: batch[index]?.documentId || `unknown-${index}`,
              ragDocuments: [],
              summary: {
                totalChunks: 0,
                textChunks: 0,
                tableChunks: 0,
                imageChunks: 0,
                processingTime: 0,
              },
              errors: [result.reason?.message || 'Unknown error'],
            });
          }
        });
      }

      return results;
    }, 'batchProcess');
  }

  /**
   * Get processing status for a document
   */
  public async getProcessingStatus(documentId: string): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress?: number;
    estimatedTimeRemaining?: number;
  }> {
    return this.executeOperation(async () => {
      // Get processing status from MIVAA service
      const response = await this.makeRequest(`/status/${documentId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    }, 'getProcessingStatus');
  }

  /**
   * Validate extraction request
   */
  private validateExtractionRequest(request: PdfExtractionRequest): void {
    if (!request.documentId) {
      throw new Error('Document ID is required');
    }

    if (!request.file) {
      throw new Error('File is required');
    }

    if (!request.options.extractionType) {
      throw new Error('Extraction type is required');
    }

    const validTypes = ['markdown', 'tables', 'images', 'all'];
    if (!validTypes.includes(request.options.extractionType)) {
      throw new Error(`Invalid extraction type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Validate page range if provided
    if (request.options.pageRange) {
      const { start, end } = request.options.pageRange;
      if (start && end && start > end) {
        throw new Error('Invalid page range: start page cannot be greater than end page');
      }
    }
  }

  /**
   * Call MIVAA Gateway directly using fetch to avoid CORS issues
   */
  private async callMivaaGatewayDirect(action: string, payload: any): Promise<any> {
    const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
    const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration not found');
    }

    const url = `${supabaseUrl}/functions/v1/mivaa-gateway`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          payload,
        }),
      });

      if (!response.ok) {
        throw new Error(`MIVAA gateway request failed: HTTP ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Check for application-level errors
      if (!data.success && data.error) {
        throw new Error(`MIVAA gateway request failed: ${data.error.message || 'Unknown error'}`);
      }

      return data;
    } catch (error) {
      console.error('Direct MIVAA gateway call failed:', error);
      throw error;
    }
  }
}


// Export default configuration
export const defaultMivaaConfig: MivaaIntegrationConfig = {
  name: 'mivaa-pdf-integration',
  version: '1.0.0',
  environment: 'development',
  enabled: true,
  timeout: 30000,
  retries: 3,
  mivaaBaseUrl: 'http://localhost:8000',
  defaultTimeout: 30000,
  maxRetries: 3,
  batchSize: 5,
  supportedFormats: ['pdf'],
  workspaceConfig: {
    enabled: true,
    contextWindow: 4000,
    chunkSize: 1000,
  },
  rateLimit: {
    requestsPerMinute: 60,
    burstLimit: 10,
  },
  healthCheck: {
    enabled: true,
    interval: 30000,
    timeout: 5000,
  },
};

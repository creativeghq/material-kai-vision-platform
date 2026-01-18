/**
 * MIVAA to RAG Transformer Types
 *
 * Stub file providing type definitions for MIVAA-to-RAG transformation.
 * These types are used by the RagDocument interface in types/rag.ts.
 *
 * NOTE: This file exists only to prevent TypeScript compilation errors.
 * The actual transformation is handled by the MIVAA API backend.
 */

/**
 * Processed table data for RAG documents
 */
export interface ProcessedTableData {
  id: string;
  pageNumber: number;
  headers: string[];
  rows: string[][];
  rowCount: number;
  columnCount: number;
  structuredText: string;
  metadata?: Record<string, any>;
}

/**
 * Processed image data for RAG documents
 */
export interface ProcessedImageData {
  id: string;
  pageNumber: number;
  format: string;
  width: number;
  height: number;
  url?: string;
  description?: string;
  classification?: 'material' | 'non-material' | 'unknown';
  embeddings?: {
    visual?: number[];
    clip?: number[];
  };
  metadata?: Record<string, any>;
}

/**
 * Document structure information
 */
export interface DocumentStructure {
  title?: string;
  sections: Array<{
    id: string;
    title?: string;
    level: number;
    startPage: number;
    endPage?: number;
    content?: string;
  }>;
  tableOfContents?: Array<{
    title: string;
    page: number;
    level: number;
  }>;
  pageCount: number;
}

/**
 * Quality metrics for processed documents
 */
export interface QualityMetrics {
  extractionQuality: number;
  transformationQuality: number;
  textReadability?: number;
  imageQuality?: number;
  tableAccuracy?: number;
  overallScore: number;
  issues?: string[];
}

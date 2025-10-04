/**
 * Unified RAG (Retrieval-Augmented Generation) Type Definitions
 * 
 * This file contains the single source of truth for all RAG-related interfaces
 * across the Material Kai Vision Platform. All services should import from here.
 */

import { DocumentChunk } from '../services/documentChunkingService';
import { ProcessedTableData, ProcessedImageData, DocumentStructure, QualityMetrics } from '../services/mivaaToRagTransformer';

/**
 * RAG-compatible document structure - Unified interface for all RAG operations
 * This is the single source of truth for RAG documents across the entire application
 */
export interface RagDocument {
  id: string;
  title: string;
  content: string;
  chunks: DocumentChunk[];
  metadata: RagMetadata;
  workspace: string;
  embeddings?: {
    document: number[];
    chunks: Array<{
      chunkId: string;
      embedding: number[];
    }>;
  };
  // Additional vector field for compatibility with simple RAG operations
  vector?: number[];
  // Optional fields for flexibility
  tables?: ProcessedTableData[];
  images?: ProcessedImageData[];
  structure?: DocumentStructure;
  quality?: QualityMetrics;
}

/**
 * RAG metadata structure - Unified metadata for all RAG operations
 */
export interface RagMetadata {
  source: string;
  sourceType: 'mivaa-pdf' | 'upload' | 'url' | 'workspace';
  originalFilename: string;
  extractedAt: Date;
  transformedAt: Date;
  workspaceId: string;
  documentId: string;
  version: string;
  language: string;
  author?: string;
  subject?: string;
  pages: number;
  processingStats: {
    totalChunks: number;
    totalTables: number;
    totalImages: number;
    averageChunkSize: number;
    extractionQuality: number;
    transformationQuality: number;
  };
  tags: string[];
  categories: string[];
  // Additional fields for compatibility with simple RAG operations
  type?: 'text' | 'table' | 'image';
  pageNumber?: number;
  chunkIndex?: number;
  workspace?: {
    projectId?: string;
    userId?: string;
    tags?: string[];
  };
}

/**
 * RAG search request interface
 */
export interface RAGSearchRequest {
  query: string;
  search_type?: 'material' | 'knowledge' | 'hybrid';
  embedding_types?: string[];
  match_threshold?: number;
  match_count?: number;
  include_context?: boolean;
}

/**
 * RAG search result interface
 */
export interface RAGSearchResult {
  result_type: string;
  id: string;
  similarity_score: number;
  title: string;
  content: string;
  metadata: unknown;
}

/**
 * RAG response interface
 */
export interface RAGResponse {
  results: RAGSearchResult[];
  context?: string;
  query_embedding?: number[];
  search_params: RAGSearchRequest;
  processing_time_ms: number;
}

/**
 * Processing pipeline result for RAG documents
 */
export interface ProcessingPipelineResult {
  documentId: string;
  ragDocuments: RagDocument[];
  summary: {
    totalChunks: number;
    textChunks: number;
    tableChunks: number;
    imageChunks: number;
    processingTime: number;
  };
  errors?: string[];
}

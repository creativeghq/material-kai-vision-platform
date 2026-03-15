export interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: unknown;
  created_at: string;
  workspace_id?: string;
}

export interface DocumentImage {
  id: string;
  document_id: string;
  chunk_id?: string;
  image_url: string;
  image_type?: string;
  caption?: string;
  alt_text?: string;
  bbox?: unknown;
  page_number?: number;
  proximity_score?: number;
  confidence?: number;
  metadata?: unknown;
  created_at: string;
  ocr_extracted_text?: string;
  ocr_confidence_score?: number;
  image_analysis_results?: unknown;
  visual_features?: unknown;
  processing_status?: string;
  multimodal_metadata?: unknown;
  contextual_name?: string;
  nearest_heading?: string;
  heading_level?: number;
  heading_distance?: number;
  related_chunks_count?: number;
  extracted_metadata?: unknown;
  material_properties?: unknown;
  quality_score?: number;
}

export interface Embedding {
  id: string;
  chunk_id: string;
  workspace_id?: string;
  embedding: number[];
  model_name?: string;
  dimensions?: number;
  created_at: string;
  embedding_type?: string; // 'text', 'image', 'hybrid'
  generation_timestamp?: string;
  metadata?: unknown;
}

export interface ImageChunkRelationship {
  id: string;
  image_id: string;
  chunk_id: string;
  similarity_score: number;
  relationship_type: 'primary' | 'related' | 'context';
  created_at: string;
}

export interface KnowledgeBaseStats {
  totalChunks: number;
  totalImages: number;
  totalEmbeddings: number;
  totalDocuments: number;
  avgChunkSize: number;
  avgConfidence: number;
}

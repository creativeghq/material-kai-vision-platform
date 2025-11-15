/**
 * Knowledge Base Service
 * 
 * Handles all API calls to the Knowledge Base endpoints via MIVAA Gateway
 */

import { supabase } from '@/integrations/supabase/client';

export interface KBDocument {
  id: string;
  workspace_id: string;
  title: string;
  content: string;
  content_markdown?: string;
  summary?: string;
  category_id?: string;
  seo_keywords?: string[];
  status: 'draft' | 'published' | 'archived';
  visibility: 'public' | 'private' | 'workspace';
  metadata?: Record<string, any>;
  text_embedding?: number[];
  embedding_status?: 'pending' | 'success' | 'failed';
  embedding_generated_at?: string;
  embedding_model?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  view_count: number;
}

export interface KBCategory {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  parent_category_id?: string;
  color?: string;
  icon?: string;
  sort_order: number;
  created_at: string;
  document_count?: number;
}

export interface KBAttachment {
  id: string;
  workspace_id: string;
  document_id: string;
  product_id: string;
  relationship_type: 'primary' | 'supplementary' | 'related' | 'certification' | 'specification';
  relevance_score: number;
  created_at: string;
  product_name?: string;
}

export interface KBSearchRequest {
  workspace_id: string;
  query: string;
  search_type?: 'semantic' | 'full_text' | 'hybrid';
  category_id?: string;
  limit?: number;
  offset?: number;
}

export interface KBSearchResult {
  success: boolean;
  results: KBDocument[];
  total_count: number;
  search_time_ms: number;
  search_type: string;
}

export class KnowledgeBaseService {
  private static instance: KnowledgeBaseService;

  private constructor() {}

  public static getInstance(): KnowledgeBaseService {
    if (!KnowledgeBaseService.instance) {
      KnowledgeBaseService.instance = new KnowledgeBaseService();
    }
    return KnowledgeBaseService.instance;
  }

  /**
   * Call MIVAA Gateway
   */
  private async callGateway(action: string, payload: any): Promise<any> {
    const { data, error } = await supabase.functions.invoke('mivaa-gateway', {
      body: { action, payload },
    });

    if (error) {
      throw new Error(error.message || 'Gateway request failed');
    }

    if (!data.success) {
      throw new Error(data.error?.message || 'Request failed');
    }

    return data.data || data;
  }

  /**
   * Create a new document
   */
  async createDocument(doc: Partial<KBDocument>): Promise<KBDocument> {
    return this.callGateway('kb_create_document', doc);
  }

  /**
   * Get document by ID
   */
  async getDocument(docId: string, workspaceId: string): Promise<KBDocument> {
    return this.callGateway('kb_get_document', { doc_id: docId, workspace_id: workspaceId });
  }

  /**
   * Update document
   */
  async updateDocument(docId: string, updates: Partial<KBDocument>): Promise<KBDocument> {
    return this.callGateway('kb_update_document', { doc_id: docId, ...updates });
  }

  /**
   * Delete document
   */
  async deleteDocument(docId: string, workspaceId: string): Promise<void> {
    return this.callGateway('kb_delete_document', { doc_id: docId, workspace_id: workspaceId });
  }

  /**
   * Create document from PDF
   */
  async createFromPDF(file: File, workspaceId: string, title: string, categoryId?: string): Promise<KBDocument> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('workspace_id', workspaceId);
    formData.append('title', title);
    if (categoryId) formData.append('category_id', categoryId);

    return this.callGateway('kb_create_from_pdf', formData);
  }

  /**
   * Search documents
   */
  async search(request: KBSearchRequest): Promise<KBSearchResult> {
    return this.callGateway('kb_search', request);
  }

  /**
   * Create category
   */
  async createCategory(category: Partial<KBCategory>): Promise<KBCategory> {
    return this.callGateway('kb_create_category', category);
  }

  /**
   * List categories
   */
  async listCategories(workspaceId: string): Promise<{ success: boolean; categories: KBCategory[] }> {
    return this.callGateway('kb_list_categories', { workspace_id: workspaceId });
  }

  /**
   * Create attachment (link document to product)
   */
  async createAttachment(attachment: Partial<KBAttachment>): Promise<KBAttachment> {
    return this.callGateway('kb_create_attachment', attachment);
  }

  /**
   * Get document attachments
   */
  async getDocumentAttachments(docId: string, workspaceId: string): Promise<{ success: boolean; attachments: KBAttachment[] }> {
    return this.callGateway('kb_get_doc_attachments', { doc_id: docId, workspace_id: workspaceId });
  }

  /**
   * Get product documents
   */
  async getProductDocuments(productId: string, workspaceId: string): Promise<{ success: boolean; documents: KBDocument[] }> {
    return this.callGateway('kb_get_product_docs', { product_id: productId, workspace_id: workspaceId });
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ success: boolean; status: string }> {
    return this.callGateway('kb_health', {});
  }
}


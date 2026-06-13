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
  visibility: 'public' | 'private';
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
  price_doc_type?: 'price_list' | 'discount_rule' | 'contract_terms' | 'promotion' | 'supplier_cost_list' | null;
  // Per-doc lock override: null = follow category (agent-readable ⇒ locked),
  // true = force-locked, false = force-unlocked. See kb_is_doc_protected().
  is_locked?: boolean | null;
  // Per-doc agent allow-list. null / empty = all agents may read it in agent KB
  // search; non-empty = only the listed agent ids (kai, interior-designer, demo).
  allowed_agents?: string[] | null;
}

export interface KBCategory {
  id: string;
  workspace_id: string;
  name: string;
  slug?: string | null;
  description?: string;
  parent_category_id?: string;
  color?: string;
  icon?: string;
  sort_order: number;
  created_at: string;
  document_count?: number;
  access_level: 'admin' | 'agent' | 'public';
  trigger_keyword?: string | null;
  // When true, every doc in this category is locked (protected from deletion).
  is_locked?: boolean;
}

export type PriceDocType =
  | 'price_list'
  | 'discount_rule'
  | 'contract_terms'
  | 'promotion'
  | 'supplier_cost_list';

export const PRICE_DOC_TYPE_LABELS: Record<PriceDocType, string> = {
  price_list: 'Price list (customer-facing / retail)',
  discount_rule: 'Discount rule',
  contract_terms: 'Contract terms',
  promotion: 'Promotion',
  supplier_cost_list: 'Supplier cost list (procurement)',
};

export interface ParseSupplierCostListOutcome {
  sku: string;
  cost: number;
  currency: string;
  matched: boolean;
  updated: boolean;
  product_id: string | null;
  reason: string | null;
}

export interface ParseSupplierCostListResult {
  ok: boolean;
  kb_doc_id: string;
  dry_run: boolean;
  parsed_rows: number;
  matched: number;
  updated: number;
  unmatched: number;
  errors: string[];
  rows: ParseSupplierCostListOutcome[];
}

/**
 * Parses a kb_docs row with price_doc_type='supplier_cost_list' and materializes
 * the SKU → cost rows it contains onto products.cost. Admin/owner only.
 */
export async function parseSupplierCostListDoc(
  kbDocId: string,
  options: { dryRun?: boolean } = {},
): Promise<ParseSupplierCostListResult> {
  const { data, error } = await supabase.functions.invoke('parse-supplier-cost-list', {
    body: { kb_doc_id: kbDocId, dry_run: options.dryRun === true },
  });
  if (error) throw error;
  return data as ParseSupplierCostListResult;
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
   * Call MIVAA Gateway with FormData (for file uploads)
   * FormData must be sent directly to a dedicated file upload endpoint,
   * not wrapped in JSON.
   */
  private async callGatewayWithFile(
    file: File,
    metadata: Record<string, string>,
  ): Promise<any> {
    // Path convention (post-2026-05-23 bucket consolidation): KB raw PDFs live
    // under `{user_id}/...` in `pdf-documents`. The orphan-cleanup cron's grace
    // logic is user-scoped, so the path matters.
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }
    const fileName = `${user.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('pdf-documents')
      .upload(fileName, file);

    if (uploadError) {
      throw new Error(`File upload failed: ${uploadError.message}`);
    }

    // pdf-documents is private — mint a signed URL for MIVAA to download from.
    const { data: signed, error: signError } = await supabase.storage
      .from('pdf-documents')
      .createSignedUrl(fileName, 3600);
    if (signError || !signed?.signedUrl) {
      throw new Error(`Failed to sign upload URL: ${signError?.message ?? 'unknown error'}`);
    }

    // Now call gateway with file_url instead of FormData
    return this.callGateway('kb_create_from_pdf', {
      file_url: signed.signedUrl,
      ...metadata,
    });
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
   * Uploads file to Supabase storage first, then sends file_url to gateway
   */
  async createFromPDF(
    file: File,
    workspaceId: string,
    title: string,
    categoryId?: string,
  ): Promise<KBDocument> {
    const metadata: Record<string, string> = {
      workspace_id: workspaceId,
      title: title,
    };
    if (categoryId) {
      metadata.category_id = categoryId;
    }

    return this.callGatewayWithFile(file, metadata);
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


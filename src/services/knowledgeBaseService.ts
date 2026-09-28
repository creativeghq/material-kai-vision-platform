/**
 * Knowledge Base Service
 *
 * Handles all API calls to the Knowledge Base endpoints via MIVAA Gateway
 */

import { supabase } from '@/integrations/supabase/client';
import { edgeError, edgeErrorMessage } from '@/utils/edgeError';
import { MIVAA_API_URL } from '@/config/mivaa';

/** A single authored FAQ entry, rendered at the bottom of an article and
 *  emitted as schema.org FAQPage structured data. Stored on metadata.faq. */
export interface KBFaqItem {
  question: string;
  answer: string;
}

export interface KBPdfExtraction {
  markdown: string;
  page_count: number;
  pages_read: number;
  truncated: boolean;
}

export interface KBDocument {
  id: string;
  workspace_id: string;
  title: string;
  /** URL slug for the SEO-friendly route /knowledge-base/:slug */
  slug?: string | null;
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
  if (error) throw await edgeError(error);
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
  /** 'hybrid' was removed 2026-09-05: the endpoint never fused the two passes and now refuses it with 400. */
  search_type?: 'semantic' | 'full_text';
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
      throw new Error(await edgeErrorMessage(error, 'Gateway request failed'));
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

  /** PDF text as markdown (tables kept as tables) for the editor to review. Writes nothing. */
  async extractPdfText(file: File, workspaceId: string): Promise<KBPdfExtraction> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated. Please sign in.');
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`${MIVAA_API_URL}/api/kb/documents/extract-pdf`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'X-Workspace-Id': workspaceId },
      body: form,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.detail === 'string' ? body.detail : `PDF extraction failed (${response.status})`);
    }
    return response.json();
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


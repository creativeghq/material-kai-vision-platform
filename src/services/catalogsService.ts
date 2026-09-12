import { supabase } from '@/integrations/supabase/client';
import { EmailSendError } from '@/modules/email/services/emailService';
import { unwrapEmailSendError } from '@/modules/email/lib/emailSenderGate';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import { catalogPublicPath, catalogPublicUrl, normalizeWorkspaceHandle } from '@/config/catalogPublicUrl';

export type CatalogStatus = 'draft' | 'generating' | 'ready' | 'published' | 'archived' | 'failed';

/**
 * Who may read the published page.
 *  - `allowlist` known contacts only: a workspace member, a CRM contact or company, or an
 *    explicit grant. Everyone else is refused. The default, and what every catalog had.
 *  - `any_email` the form stays, but a stranger is captured as a lead instead of refused.
 *  - `open`     no form. Anyone with the link reads it.
 */
export type CatalogAccessMode = 'allowlist' | 'any_email' | 'open';

export interface CatalogMaterial {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  image_source: string | null;
  image_source_ref: string | null;
  price: number | null;
  currency: string | null;
  price_source: string | null;
  price_source_ref: string | null;
  specs: Record<string, any>;
  provenance?: Record<string, any>;
}

export interface CatalogSection {
  id: string;
  title: string;
  intro: string | null;
  materials: CatalogMaterial[];
}

export interface PresentationCatalog {
  id: string;
  owner_user_id: string;
  workspace_id: string | null;
  template_id: string | null;
  slug: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  source_pdf_ids: string[];
  cover_data: Record<string, any>;
  body_data: { sections: CatalogSection[] };
  back_cover_data: Record<string, any>;
  status: CatalogStatus;
  status_message: string | null;
  pdf_storage_path: string | null;
  pdf_url: string | null;
  pdf_generated_at: string | null;
  /** Set by the storage-retention sweep when the PDF file was purged (rebuilds on open). */
  files_purged_at?: string | null;
  page_count: number | null;
  published_at: string | null;
  unpublished_at: string | null;
  view_count: number;
  unique_email_count: number;
  created_at: string;
  updated_at: string;
  /** Its workspace's public handle — the first segment of the public URL. Joined, not stored. */
  public_handle?: string | null;
  access_mode: CatalogAccessMode;
}

export interface CatalogTemplate {
  id: string;
  /** null = operator global template (inherited by tenants); else the owning workspace. */
  workspace_id: string | null;
  name: string;
  description: string | null;
  cover_image_path: string;
  content_background_path: string | null;
  back_cover_image_path: string;
  accent_color_hex: string | null;
  is_default: boolean;
  is_active: boolean;
}

export interface CatalogSourcePdf {
  id: string;
  uploaded_by: string;
  workspace_id: string | null;
  original_filename: string;
  storage_path: string;
  page_count: number | null;
  file_size_bytes: number | null;
  manufacturer_name: string | null;
  manufacturer_url: string | null;
  notes: string | null;
  status: 'uploaded' | 'processing' | 'ready' | 'failed';
  status_message: string | null;
  created_at: string;
}

export interface CatalogEmailGrant {
  id: string;
  catalog_id: string;
  email: string;
  note: string | null;
  granted_by: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface CatalogAccessLogRow {
  id: string;
  catalog_id: string;
  email: string;
  matched_kind: string;
  granted_access: boolean;
  ip_address: string | null;
  created_at: string;
}

export interface CatalogOperationsSummary {
  id: string;
  title: string;
  slug: string | null;
  status: CatalogStatus;
  owner_user_id: string;
  published_at: string | null;
  unpublished_at: string | null;
  view_count: number;
  unique_email_count: number;
  created_at: string;
  updated_at: string;
  gate_attempts: number;
  gate_grants: number;
  gate_denials: number;
  page_views: number;
  pdf_downloads: number;
  last_event_at: string | null;
  public_handle: string | null;
}

export interface CatalogViewEventRow {
  id: string;
  catalog_id: string;
  catalog_title?: string | null;
  catalog_slug?: string | null;
  event_type: 'page_view' | 'pdf_download' | 'pdf_view';
  email: string | null;
  matched_user_id: string | null;
  matched_kind: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export type CatalogEmailSendStatus = 'queued' | 'sent' | 'failed' | 'skipped';

export interface CatalogEmailSendRow {
  id: string;
  catalog_id: string;
  send_batch_id: string;
  recipient_email: string;
  recipient_member_kind: string | null;
  recipient_user_id: string | null;
  recipient_crm_contact_id: string | null;
  recipient_crm_company_id: string | null;
  source_category_ids: string[];
  source_category_slugs: string[];
  subject: string;
  status: CatalogEmailSendStatus;
  status_message: string | null;
  sent_at: string | null;
  first_opened_at: string | null;
  first_downloaded_at: string | null;
  sent_by: string | null;
  created_at: string;
}

export interface CatalogSendBatchSummary {
  send_batch_id: string;
  catalog_id: string;
  sent_count: number;
  failed_count: number;
  total_count: number;
  first_sent_at: string | null;
  last_sent_at: string | null;
  subject: string | null;
  source_category_slugs: string[];
}

export interface PreviewSendResponse {
  success: boolean;
  recipients_count: number;
  recipients: Array<{
    email: string;
    member_kind: string | null;
    user_id: string | null;
    crm_contact_id: string | null;
    crm_company_id: string | null;
    display_name: string | null;
    category_ids: string[];
    category_slugs: string[];
  }>;
}

export interface DispatchSendResponse {
  success: boolean;
  send_batch_id: string;
  recipients_count: number;
  sent_count: number;
  failed_count: number;
}

/**
 * PostgREST returns an embedded `workspaces: { public_handle }`. Flattened on the way in so no
 * consumer has to know the row was assembled from a join.
 */
function flattenHandle(row: any): any {
  if (!row) return row;
  const { workspaces, ...rest } = row;
  return { ...rest, public_handle: workspaces?.public_handle ?? null };
}

class CatalogsService {
  async list(): Promise<PresentationCatalog[]> {
    const { data, error } = await supabase
      .from('presentation_catalogs')
      // The workspace handle is half of the public address, so it travels WITH the row. Fetching
      // it per catalog at each of the four render sites is how three of them ended up without it.
      .select('*, workspaces(public_handle)')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(flattenHandle) as PresentationCatalog[];
  }

  async get(catalogId: string): Promise<PresentationCatalog | null> {
    const { data, error } = await supabase
      .from('presentation_catalogs')
      .select('*, workspaces(public_handle)')
      .eq('id', catalogId)
      .maybeSingle();
    if (error) throw error;
    return data ? (flattenHandle(data) as PresentationCatalog) : null;
  }

  async create(input: {
    title: string;
    subtitle?: string;
    description?: string;
    template_id?: string;
    cover_client_name?: string;
  }): Promise<PresentationCatalog> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    let templateId = input.template_id;
    if (!templateId) {
      // Prefer this workspace's own default template, else the operator's global one
      // (RLS scopes the visible set to global + own; own sorts first via workspace_id desc).
      const { data: tpl } = await supabase
        .from('catalog_templates')
        .select('id')
        .eq('is_default', true)
        .eq('is_active', true)
        .order('workspace_id', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      templateId = tpl?.id;
    }

    const { data, error } = await supabase
      .from('presentation_catalogs')
      .insert({
        owner_user_id: user.id,
        template_id: templateId,
        title: input.title,
        subtitle: input.subtitle ?? null,
        description: input.description ?? null,
        cover_data: {
          title: input.title,
          subtitle: input.subtitle ?? null,
          client_name: input.cover_client_name ?? null,
          date: new Date().toISOString(),
        },
        body_data: { sections: [] },
        back_cover_data: {},
        status: 'draft' as CatalogStatus,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as PresentationCatalog;
  }

  async update(catalogId: string, patch: Partial<PresentationCatalog>): Promise<PresentationCatalog> {
    const { data, error } = await supabase
      .from('presentation_catalogs')
      .update(patch)
      .eq('id', catalogId)
      .select('*')
      .single();
    if (error) throw error;
    return data as PresentationCatalog;
  }

  /** Publish with a GLOBALLY-unique slug. The slug unique index spans all workspaces, but RLS hides
   *  other tenants' rows so a client-side pre-check can't detect a collision — retry on the unique
   *  violation (23505) with a numeric suffix instead (mirrors the agent path's ensureUniqueSlug). */
  async publish(catalogId: string, baseSlug: string): Promise<PresentationCatalog> {
    const base = baseSlug || 'catalog';
    let slug = base;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        return await this.update(catalogId, { slug, status: 'published', published_at: new Date().toISOString() } as any);
      } catch (err: any) {
        if (err?.code === '23505' && attempt < 5) { slug = `${base}-${Math.floor(1000 + Math.random() * 9000)}`; continue; }
        throw err;
      }
    }
    throw new Error('Could not find a free catalog URL — try a different title.');
  }

  async remove(catalogId: string): Promise<void> {
    const cat = await this.get(catalogId);
    if (cat?.pdf_storage_path) {
      await supabase.storage.from('pdf-documents').remove([cat.pdf_storage_path]).then(({ error }) => {
        if (error) console.warn('catalog PDF cleanup failed:', error);
      });
    }
    const { error } = await supabase
      .from('presentation_catalogs')
      .delete()
      .eq('id', catalogId);
    if (error) throw error;
  }

  async generatePdf(catalogId: string, regenerate = false): Promise<{ pdf_url: string; page_count: number }> {
    const { data, error } = await supabase.functions.invoke('generate-catalog-pdf', {
      body: { catalog_id: catalogId, regenerate },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'PDF generation failed');
    return { pdf_url: data.pdf_url, page_count: data.page_count ?? 1 };
  }

  async refreshPdfUrl(catalogId: string): Promise<string | null> {
    let cat = await this.get(catalogId);
    // Purged by the storage-retention sweep → rebuild on demand (credit-free).
    if (!cat?.pdf_storage_path && cat?.files_purged_at) {
      try { await this.generatePdf(catalogId, true); } catch { /* fall through to null */ }
      cat = await this.get(catalogId);
    }
    if (!cat?.pdf_storage_path) return null;
    const { data } = await supabase.storage
      .from('pdf-documents')
      .createSignedUrl(cat.pdf_storage_path, 60 * 60 * 24);
    return data?.signedUrl ?? null;
  }

  async listTemplates(): Promise<CatalogTemplate[]> {
    // RLS scopes to this workspace's own templates + the operator's global ones.
    // Own-workspace templates first, then the global default, then by name.
    const { data, error } = await supabase
      .from('catalog_templates')
      .select('*')
      .eq('is_active', true)
      .order('workspace_id', { ascending: false, nullsFirst: false })
      .order('is_default', { ascending: false })
      .order('name');
    if (error) throw error;
    return (data || []) as CatalogTemplate[];
  }

  async uploadSourcePdf(file: File, opts?: { manufacturer_name?: string; manufacturer_url?: string; notes?: string }): Promise<CatalogSourcePdf> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const id = crypto.randomUUID();
    const path = `catalog-source/${user.id}/${id}.pdf`;

    const { error: upErr } = await supabase.storage
      .from('pdf-documents')
      .upload(path, file, { contentType: 'application/pdf', upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data, error } = await supabase
      .from('catalog_source_pdfs')
      .insert({
        id,
        uploaded_by: user.id,
        // Stamp the active workspace so the source PDF is workspace-scoped (the
        // catalog-extract ownership check binds on this; historically left null,
        // which forced a fallback to uploaded_by).
        workspace_id: getActiveWorkspaceId(user.id) ?? null,
        original_filename: file.name,
        storage_path: path,
        file_size_bytes: file.size,
        manufacturer_name: opts?.manufacturer_name ?? null,
        manufacturer_url: opts?.manufacturer_url ?? null,
        notes: opts?.notes ?? null,
        status: 'uploaded',
      })
      .select('*')
      .single();
    if (error) {
      await supabase.storage.from('pdf-documents').remove([path]).catch(() => {});
      throw error;
    }
    return data as CatalogSourcePdf;
  }

  async listSourcePdfs(): Promise<CatalogSourcePdf[]> {
    const { data, error } = await supabase
      .from('catalog_source_pdfs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as CatalogSourcePdf[];
  }

  /**
   * Attach one or more uploaded source PDFs to a catalog (dedup-merged into
   * `source_pdf_ids`). Same write the agent's `attach_catalog_pdfs` tool makes,
   * so the inline-upload admin path and the agent path converge on one shape.
   */
  async attachSourcePdfs(catalogId: string, sourcePdfIds: string[]): Promise<PresentationCatalog> {
    const cat = await this.get(catalogId);
    if (!cat) throw new Error('Catalog not found');
    const merged = Array.from(new Set([...(cat.source_pdf_ids || []), ...sourcePdfIds]));
    return this.update(catalogId, { source_pdf_ids: merged } as any);
  }

  async detachSourcePdf(catalogId: string, sourcePdfId: string): Promise<PresentationCatalog> {
    const cat = await this.get(catalogId);
    if (!cat) throw new Error('Catalog not found');
    const next = (cat.source_pdf_ids || []).filter((id) => id !== sourcePdfId);
    return this.update(catalogId, { source_pdf_ids: next } as any);
  }

  /**
   * Upload a PDF and immediately attach it to a catalog in one step — the inline
   * "upload a temporary catalog" path. The source PDF is NOT digested into the
   * platform product DB; it only feeds on-demand Vision extraction/translation.
   */
  async uploadAndAttachSourcePdf(
    catalogId: string,
    file: File,
    opts?: { manufacturer_name?: string; manufacturer_url?: string; notes?: string },
  ): Promise<{ source: CatalogSourcePdf; catalog: PresentationCatalog }> {
    const source = await this.uploadSourcePdf(file, opts);
    const catalog = await this.attachSourcePdfs(catalogId, [source.id]);
    return { source, catalog };
  }

  /** Free-form Vision extraction over a catalog's attached source PDFs. Mirrors the agent's extract_from_catalog_pdfs tool. */
  async extractFromPdfs(input: {
    catalogId: string;
    query: string;
    maxResults?: number;
    autoAdd?: boolean;
  }): Promise<{ success: boolean; candidates: any[]; error?: string }> {
    const cat = await this.get(input.catalogId);
    if (!cat) throw new Error('Catalog not found');
    if (!cat.source_pdf_ids || cat.source_pdf_ids.length === 0) {
      throw new Error('No source PDFs attached. Upload or attach one first.');
    }
    const { data, error } = await supabase.functions.invoke('catalog-extract-from-pdfs', {
      body: {
        catalog_id: input.catalogId,
        source_pdf_ids: cat.source_pdf_ids,
        query: input.query,
        max_results: input.maxResults ?? 12,
      },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'Extraction failed');
    return data as { success: boolean; candidates: any[] };
  }

  /** Whole-PDF → catalog body translation. Mirrors the agent's translate_pdf_to_catalog tool. */
  async translatePdf(input: {
    sourcePdfId: string;
    targetCatalogId: string;
    preserveOriginalLayout?: boolean;
  }): Promise<any> {
    const { data, error } = await supabase.functions.invoke('catalog-translate-pdf', {
      body: {
        source_pdf_id: input.sourcePdfId,
        target_catalog_id: input.targetCatalogId,
        preserve_original_layout: input.preserveOriginalLayout ?? false,
      },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'Translation failed');
    return data;
  }

  async deleteSourcePdf(sourcePdfId: string): Promise<void> {
    const { data: row } = await supabase
      .from('catalog_source_pdfs')
      .select('storage_path')
      .eq('id', sourcePdfId)
      .maybeSingle();
    if (row?.storage_path) {
      await supabase.storage.from('pdf-documents').remove([row.storage_path]).catch(() => {});
    }
    const { error } = await supabase
      .from('catalog_source_pdfs')
      .delete()
      .eq('id', sourcePdfId);
    if (error) throw error;
  }

  async listEmailGrants(catalogId: string): Promise<CatalogEmailGrant[]> {
    const { data, error } = await supabase
      .from('catalog_email_grants')
      .select('*')
      .eq('catalog_id', catalogId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as CatalogEmailGrant[];
  }

  async addEmailGrant(catalogId: string, email: string, note?: string, expiresAt?: string): Promise<CatalogEmailGrant> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('catalog_email_grants')
      .insert({
        catalog_id: catalogId,
        email: email.toLowerCase().trim(),
        note: note ?? null,
        granted_by: user?.id ?? null,
        expires_at: expiresAt ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as CatalogEmailGrant;
  }

  async revokeEmailGrant(grantId: string): Promise<void> {
    const { error } = await supabase
      .from('catalog_email_grants')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', grantId);
    if (error) throw error;
  }

  async listAccessLog(catalogId: string, limit = 50): Promise<CatalogAccessLogRow[]> {
    const { data, error } = await supabase
      .from('catalog_access_log')
      .select('id, catalog_id, email, matched_kind, granted_access, ip_address, created_at')
      .eq('catalog_id', catalogId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []) as CatalogAccessLogRow[];
  }

  async approveExtractionCandidates(catalogId: string, sectionTitle: string, candidates: Array<{
    name: string;
    description?: string | null;
    image_url?: string | null;
    price?: number | null;
    currency?: string | null;
    specs?: Record<string, any>;
    specs_raw?: Record<string, string[]>;
    source_pdf_id?: string | null;
    page_no?: number | null;
  }>): Promise<PresentationCatalog> {
    const cat = await this.get(catalogId);
    if (!cat) throw new Error('Catalog not found');

    const sections = Array.isArray(cat.body_data?.sections) ? [...cat.body_data.sections] : [];
    let section = sections.find((s) => s.title.toLowerCase() === sectionTitle.toLowerCase());
    if (!section) {
      section = { id: crypto.randomUUID(), title: sectionTitle, intro: null, materials: [] };
      sections.push(section);
    }

    for (const c of candidates) {
      section.materials.push({
        id: crypto.randomUUID(),
        name: c.name,
        description: c.description ?? null,
        image_url: c.image_url ?? null,
        image_source: c.image_url ? 'extracted_from_pdf' : null,
        image_source_ref: c.source_pdf_id ? `${c.source_pdf_id}#${c.page_no ?? ''}` : null,
        price: c.price ?? null,
        currency: c.currency ?? null,
        price_source: c.price != null ? 'manual' : null,
        price_source_ref: null,
        specs: c.specs ?? {},
        ...(c.specs_raw ? { specs_raw: c.specs_raw } : {}),
        provenance: {
          source_pdf_id: c.source_pdf_id ?? null,
          page_no: c.page_no ?? null,
          approved_at: new Date().toISOString(),
        },
      });
    }

    return this.update(catalogId, { body_data: { sections } } as any);
  }

  /**
   * Every body edit goes through ONE of the five `catalog_*_node` RPCs, each of which patches the
   * node inside `body_data` in a single statement.
   *
   * These used to read the whole document, edit it in TypeScript and write it back. That is a lost
   * update the moment two edits overlap — and the builder now saves on every blur while the KAI
   * agent writes the same document from the other side.
   */
  private async applyBodyRpc(fn: string, args: Record<string, unknown>): Promise<CatalogSection[]> {
    const { data, error } = await supabase.rpc(fn as any, args as any);
    if (error) throw error;
    return (data || []) as CatalogSection[];
  }

  async setMaterialImage(catalogId: string, sectionId: string, materialId: string, image: { url: string; source: 'db' | 'web'; metadata?: Record<string, any> }): Promise<PresentationCatalog> {
    const cat = await this.get(catalogId);
    if (!cat) throw new Error('Catalog not found');
    const sections = Array.isArray(cat.body_data?.sections) ? [...cat.body_data.sections] : [];
    const section = sections.find((s) => s.id === sectionId);
    if (!section) throw new Error('Section not found');
    const material = section.materials.find((m) => m.id === materialId);
    if (!material) throw new Error('Material not found');
    material.image_url = image.url;
    material.image_source = image.source === 'db' ? 'catalog_product' : 'web_search_approved';
    material.image_source_ref = image.metadata?.product_id || image.metadata?.source_url || null;
    return this.update(catalogId, { body_data: { sections } } as any);
  }

  async removeMaterial(catalogId: string, sectionId: string, materialId: string): Promise<CatalogSection[]> {
    return this.applyBodyRpc('catalog_remove_node', {
      p_catalog_id: catalogId, p_section_id: sectionId, p_material_id: materialId,
    });
  }

  async removeSection(catalogId: string, sectionId: string): Promise<CatalogSection[]> {
    return this.applyBodyRpc('catalog_remove_node', {
      p_catalog_id: catalogId, p_section_id: sectionId, p_material_id: null,
    });
  }

  async updateSection(catalogId: string, sectionId: string, patch: { title?: string; intro?: string | null }): Promise<CatalogSection[]> {
    return this.applyBodyRpc('catalog_update_node', {
      p_catalog_id: catalogId, p_section_id: sectionId, p_material_id: null, p_patch: patch,
    });
  }

  /** The fields a person may type. Image and price PROVENANCE are the server's and are refused there. */
  async updateMaterial(
    catalogId: string,
    sectionId: string,
    materialId: string,
    patch: { name?: string; description?: string | null; price?: number | null; currency?: string | null; sku?: string | null },
  ): Promise<CatalogSection[]> {
    return this.applyBodyRpc('catalog_update_node', {
      p_catalog_id: catalogId, p_section_id: sectionId, p_material_id: materialId, p_patch: patch,
    });
  }

  async addSection(catalogId: string, title: string): Promise<CatalogSection[]> {
    return this.applyBodyRpc('catalog_add_section', { p_catalog_id: catalogId, p_title: title });
  }

  async addMaterial(catalogId: string, sectionId: string, name: string): Promise<CatalogSection[]> {
    return this.applyBodyRpc('catalog_add_material', {
      p_catalog_id: catalogId, p_section_id: sectionId, p_name: name,
    });
  }

  /** One place up (-1) or down (+1). At the edge of its travel this is a no-op, not an error. */
  async moveNode(catalogId: string, sectionId: string, materialId: string | null, delta: -1 | 1): Promise<CatalogSection[]> {
    return this.applyBodyRpc('catalog_move_node', {
      p_catalog_id: catalogId, p_section_id: sectionId, p_material_id: materialId, p_delta: delta,
    });
  }

  // ── The public link ────────────────────────────────────────────────

  /** The workspace handle that is the first segment of every public catalog URL it owns. */
  async publicHandle(workspaceId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('workspaces')
      .select('public_handle')
      .eq('id', workspaceId)
      .maybeSingle();
    if (error) throw error;
    return (data as any)?.public_handle ?? null;
  }

  /** Widening access is an admin act, so it goes through an RPC rather than a column patch. */
  async setAccessMode(catalogId: string, mode: CatalogAccessMode): Promise<CatalogAccessMode> {
    const { data, error } = await supabase.rpc('set_catalog_access_mode' as any, {
      p_catalog_id: catalogId, p_mode: mode,
    } as any);
    if (error) throw error;
    return data as unknown as CatalogAccessMode;
  }

  async setPublicHandle(workspaceId: string, handle: string): Promise<string> {
    const { data, error } = await supabase.rpc('set_workspace_public_handle' as any, {
      p_workspace_id: workspaceId, p_handle: normalizeWorkspaceHandle(handle),
    } as any);
    if (error) throw error;
    return data as unknown as string;
  }

  publicPathFor(handle: string | null, slug: string | null): string | null {
    return catalogPublicPath(handle, slug);
  }

  publicUrlFor(handle: string | null, slug: string | null): string | null {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return catalogPublicUrl(origin, handle, slug);
  }

  // ── Operations / analytics ─────────────────────────────────────────

  async listOperationsSummary(): Promise<CatalogOperationsSummary[]> {
    const { data, error } = await supabase
      .from('catalog_operations_summary')
      .select('*')
      .order('last_event_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return (data || []) as CatalogOperationsSummary[];
  }

  async listViewEvents(opts: {
    catalogId?: string;
    eventType?: 'page_view' | 'pdf_download' | 'pdf_view' | 'all';
    emailContains?: string;
    sinceIso?: string;
    limit?: number;
  } = {}): Promise<CatalogViewEventRow[]> {
    let q = supabase
      .from('catalog_view_events')
      .select('id, catalog_id, event_type, email, matched_user_id, matched_kind, ip_address, user_agent, created_at, presentation_catalogs!catalog_view_events_catalog_id_fkey(title, slug)')
      .order('created_at', { ascending: false })
      .limit(opts.limit ?? 100);
    if (opts.catalogId) q = q.eq('catalog_id', opts.catalogId);
    if (opts.eventType && opts.eventType !== 'all') q = q.eq('event_type', opts.eventType);
    if (opts.emailContains) q = q.ilike('email', `%${opts.emailContains.toLowerCase()}%`);
    if (opts.sinceIso) q = q.gte('created_at', opts.sinceIso);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      catalog_id: row.catalog_id,
      catalog_title: row.presentation_catalogs?.title ?? null,
      catalog_slug: row.presentation_catalogs?.slug ?? null,
      event_type: row.event_type,
      email: row.email,
      matched_user_id: row.matched_user_id,
      matched_kind: row.matched_kind,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      created_at: row.created_at,
    }));
  }

  async listAccessLogCrossCatalog(opts: {
    catalogId?: string;
    grantedOnly?: boolean;
    emailContains?: string;
    sinceIso?: string;
    limit?: number;
  } = {}): Promise<Array<CatalogAccessLogRow & { catalog_title?: string | null; catalog_slug?: string | null; matched_user_id: string | null }>> {
    let q = supabase
      .from('catalog_access_log')
      .select('id, catalog_id, email, matched_kind, granted_access, ip_address, matched_user_id, created_at, presentation_catalogs!catalog_access_log_catalog_id_fkey(title, slug)')
      .order('created_at', { ascending: false })
      .limit(opts.limit ?? 100);
    if (opts.catalogId) q = q.eq('catalog_id', opts.catalogId);
    if (opts.grantedOnly) q = q.eq('granted_access', true);
    if (opts.emailContains) q = q.ilike('email', `%${opts.emailContains.toLowerCase()}%`);
    if (opts.sinceIso) q = q.gte('created_at', opts.sinceIso);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      catalog_id: row.catalog_id,
      catalog_title: row.presentation_catalogs?.title ?? null,
      catalog_slug: row.presentation_catalogs?.slug ?? null,
      email: row.email,
      matched_kind: row.matched_kind,
      granted_access: row.granted_access,
      ip_address: row.ip_address,
      matched_user_id: row.matched_user_id,
      created_at: row.created_at,
    }));
  }

  // ── Send to customers ───────────────────────────────────────────────

  async previewSend(catalogId: string, categoryIds: string[]): Promise<PreviewSendResponse> {
    const { data, error } = await supabase.functions.invoke('catalog-send-to-customers', {
      body: { action: 'preview', catalog_id: catalogId, category_ids: categoryIds },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'Preview failed');
    return data as PreviewSendResponse;
  }

  async dispatchSend(input: {
    catalogId: string;
    categoryIds: string[];
    subject?: string;
    messageBody?: string;
    ensureGrants?: boolean;
  }): Promise<DispatchSendResponse> {
    const { data, error } = await supabase.functions.invoke('catalog-send-to-customers', {
      body: {
        action: 'send',
        catalog_id: input.catalogId,
        category_ids: input.categoryIds,
        subject: input.subject,
        message_body: input.messageBody,
        ensure_grants: input.ensureGrants ?? true,
      },
    });
    // Typed error so UI can open the Connect-email gate on `workspace_sender_required`.
    if (error) { const { code, message } = await unwrapEmailSendError(error); throw new EmailSendError(message, (code as any) ?? 'unknown'); }
    if (!data?.success) throw new Error(data?.error || 'Send failed');
    return data as DispatchSendResponse;
  }

  async listSendBatches(catalogId: string, limit = 50): Promise<CatalogSendBatchSummary[]> {
    const { data, error } = await supabase
      .from('catalog_email_sends')
      .select('send_batch_id, catalog_id, status, subject, sent_at, created_at, source_category_slugs')
      .eq('catalog_id', catalogId)
      .order('created_at', { ascending: false })
      .limit(limit * 50);
    if (error) throw error;

    const map = new Map<string, CatalogSendBatchSummary>();
    for (const row of (data || []) as any[]) {
      let bucket = map.get(row.send_batch_id);
      if (!bucket) {
        bucket = {
          send_batch_id: row.send_batch_id,
          catalog_id: row.catalog_id,
          sent_count: 0,
          failed_count: 0,
          total_count: 0,
          first_sent_at: null,
          last_sent_at: null,
          subject: row.subject ?? null,
          source_category_slugs: row.source_category_slugs ?? [],
        };
        map.set(row.send_batch_id, bucket);
      }
      bucket.total_count++;
      if (row.status === 'sent') bucket.sent_count++;
      if (row.status === 'failed') bucket.failed_count++;
      if (row.sent_at) {
        if (!bucket.first_sent_at || row.sent_at < bucket.first_sent_at) bucket.first_sent_at = row.sent_at;
        if (!bucket.last_sent_at || row.sent_at > bucket.last_sent_at) bucket.last_sent_at = row.sent_at;
      }
    }
    return [...map.values()].sort((a, b) =>
      (b.last_sent_at || b.first_sent_at || '').localeCompare(a.last_sent_at || a.first_sent_at || ''),
    ).slice(0, limit);
  }

  async listSendRecipients(catalogId: string, sendBatchId: string): Promise<CatalogEmailSendRow[]> {
    const { data, error } = await supabase
      .from('catalog_email_sends')
      .select('*')
      .eq('catalog_id', catalogId)
      .eq('send_batch_id', sendBatchId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []) as CatalogEmailSendRow[];
  }

  async getUserProfilesByIds(userIds: string[]): Promise<Record<string, { full_name: string | null; email: string | null; avatar_url: string | null }>> {
    if (userIds.length === 0) return {};
    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id, full_name, email, avatar_url')
      .in('user_id', userIds);
    if (error) return {};
    const out: Record<string, { full_name: string | null; email: string | null; avatar_url: string | null }> = {};
    for (const row of (data || []) as any[]) {
      out[row.user_id] = { full_name: row.full_name ?? null, email: row.email ?? null, avatar_url: row.avatar_url ?? null };
    }
    return out;
  }
}

export const catalogsService = new CatalogsService();

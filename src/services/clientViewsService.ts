import { supabase } from '@/integrations/supabase/client';

/**
 * Client Views — project-scoped deliverables that bundle selected presentation
 * sheets (across the project's moodboards) into a shareable PDF + online HTML
 * view. Mirrors QuotePDFService + the sheet-share pattern: the PDF is rendered
 * by the `generate-client-view-pdf` edge function into pdf-documents, and the
 * online version is a revocable share token served by `client-view-public-share`.
 */

export interface ClientViewCover {
  title?: string;
  subtitle?: string;
  client_name?: string;
  cover_image_url?: string;
  date?: string;
}

export interface ClientView {
  id: string;
  project_id: string;
  created_by: string | null;
  title: string;
  sheet_ids: string[];
  cover: ClientViewCover;
  embed_vr: boolean;
  embed_lighting: boolean;
  embed_ffe: boolean;
  feedback_enabled: boolean;
  vr_world_id: string | null;
  quote_id: string | null;
  pdf_storage_path: string | null;
  pdf_generation_status: 'draft' | 'generating' | 'completed' | 'failed';
  pdf_generated_at: string | null;
  /** Set by the storage-retention sweep when the PDF file was purged (rebuilds on open). */
  files_purged_at?: string | null;
  page_count: number | null;
  error_message: string | null;
  public_share_token: string | null;
  public_share_enabled: boolean;
  share_expires_at: string | null;
  share_view_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateClientViewInput {
  project_id: string;
  title: string;
  sheet_ids?: string[];
  cover?: ClientViewCover;
  embed_vr?: boolean;
  embed_lighting?: boolean;
  embed_ffe?: boolean;
  feedback_enabled?: boolean;
  vr_world_id?: string | null;
  quote_id?: string | null;
}

export interface UpdateClientViewInput {
  title?: string;
  sheet_ids?: string[];
  cover?: ClientViewCover;
  embed_vr?: boolean;
  embed_lighting?: boolean;
  embed_ffe?: boolean;
  feedback_enabled?: boolean;
  vr_world_id?: string | null;
  quote_id?: string | null;
}

export interface ClientViewFeedback {
  id: string;
  client_view_id: string;
  sheet_id: string | null;
  author_name: string | null;
  session_id: string | null;
  kind: 'comment' | 'approval' | 'change_request';
  status: 'approved' | 'changes_requested' | null;
  body: string | null;
  created_at: string;
}

class ClientViewsService {
  async listForProject(projectId: string): Promise<ClientView[]> {
    const { data, error } = await supabase
      .from('project_client_views')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as ClientView[];
  }

  async get(id: string): Promise<ClientView | null> {
    const { data, error } = await supabase
      .from('project_client_views')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as ClientView) ?? null;
  }

  async create(input: CreateClientViewInput): Promise<ClientView> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('project_client_views')
      .insert({
        project_id: input.project_id,
        title: input.title,
        sheet_ids: input.sheet_ids ?? [],
        cover: input.cover ?? {},
        embed_vr: input.embed_vr ?? true,
        embed_lighting: input.embed_lighting ?? true,
        embed_ffe: input.embed_ffe ?? true,
        feedback_enabled: input.feedback_enabled ?? true,
        vr_world_id: input.vr_world_id ?? null,
        quote_id: input.quote_id ?? null,
        created_by: user.id,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as ClientView;
  }

  async update(id: string, patch: UpdateClientViewInput): Promise<ClientView> {
    const { data, error } = await supabase
      .from('project_client_views')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as ClientView;
  }

  async remove(id: string): Promise<void> {
    // This remove() IS the storage cleanup (there is no AFTER DELETE trigger).
    // If it fails, the deleted row drops out of build_storage_reference_set and
    // storage-orphan-cleanup-cron reaps the PDF (pdf-documents, 72h grace).
    const { data: row } = await supabase
      .from('project_client_views')
      .select('pdf_storage_path')
      .eq('id', id)
      .maybeSingle();
    if (row?.pdf_storage_path) {
      await supabase.storage.from('pdf-documents').remove([row.pdf_storage_path])
        .then(({ error }) => { if (error) console.warn('Client view PDF cleanup failed (orphan-cleanup cron will reap it):', error); });
    }
    const { error } = await supabase.from('project_client_views').delete().eq('id', id);
    if (error) throw error;
  }

  /** Render (or re-render) the deck PDF. Folded into the shared sheet PDF
   *  renderer — pass client_view_id instead of sheet_id. */
  async generatePdf(id: string, regenerate = true): Promise<{ pdf_url: string; pdf_storage_path: string; page_count: number }> {
    const { data, error } = await supabase.functions.invoke('generate-moodboard-sheet-pdf', {
      body: { client_view_id: id, regenerate },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'PDF generation failed');
    return { pdf_url: data.pdf_url, pdf_storage_path: data.pdf_storage_path, page_count: data.page_count ?? 1 };
  }

  /** Fresh 1-hour signed URL for the stored deck PDF. Rebuilds on demand
   *  (credit-free) if the storage-retention sweep has purged the file. */
  async refreshPdfUrl(id: string): Promise<string | null> {
    let view = await this.get(id);
    if (!view?.pdf_storage_path && view?.files_purged_at) {
      try { await this.generatePdf(id, true); } catch { /* fall through to null */ }
      view = await this.get(id);
    }
    if (!view?.pdf_storage_path) return null;
    const { data, error } = await supabase.storage
      .from('pdf-documents')
      .createSignedUrl(view.pdf_storage_path, 60 * 60);
    if (error || !data) return null;
    return data.signedUrl;
  }

  /** Issue (or rotate) a public share token and enable sharing. */
  async share(id: string, expiresInDays = 30): Promise<{ url: string; token: string; expires_at: string }> {
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + expiresInDays * 86400_000).toISOString();
    const { error } = await supabase
      .from('project_client_views')
      .update({ public_share_token: token, public_share_enabled: true, share_expires_at: expiresAt, share_view_count: 0 })
      .eq('id', id);
    if (error) throw error;
    return { url: `${window.location.origin}/cv/${token}`, token, expires_at: expiresAt };
  }

  async revokeShare(id: string): Promise<void> {
    const { error } = await supabase
      .from('project_client_views')
      .update({ public_share_enabled: false })
      .eq('id', id);
    if (error) throw error;
  }

  /** Completed 3D worlds the current user can embed (for the VR picker). */
  async listVrWorlds(): Promise<{ id: string; display_name: string | null; thumbnail_url: string | null }[]> {
    const { data, error } = await supabase
      .from('vr_worlds')
      .select('id, display_name, thumbnail_url, status, created_at')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return [];
    return (data || []).map((w: any) => ({ id: w.id, display_name: w.display_name, thumbnail_url: w.thumbnail_url }));
  }

  async listFeedback(id: string): Promise<ClientViewFeedback[]> {
    const { data, error } = await supabase
      .from('client_view_feedback')
      .select('*')
      .eq('client_view_id', id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as ClientViewFeedback[];
  }
}

export const clientViewsService = new ClientViewsService();

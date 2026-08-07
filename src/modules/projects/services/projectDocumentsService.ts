/**
 * Project drawing / document register with revisions — WS6 (#285).
 *
 * Files live in the PRIVATE `pdf-documents` bucket. Bucket + object path are stored and a signed
 * URL is minted per read; a signed URL is never persisted, because it expires and re-deriving it
 * is free (pipeline convention 7). Every revision — current and superseded — is registered in
 * `build_storage_reference_set()`, so history survives the orphan cron.
 *
 * "Exactly one current revision" is enforced by a partial unique index plus a BEFORE trigger that
 * demotes the previous one, not by this service remembering to do it in the right order.
 */
import { supabase } from '@/integrations/supabase/client';

const DOC_BUCKET = 'pdf-documents';
/** Signed URLs are short-lived on purpose — long enough to open, not to share around. */
const SIGNED_URL_TTL_SECONDS = 60 * 10;

export interface ProjectDocument {
  id: string;
  project_id: string;
  title: string;
  discipline: string | null;
  client_visible: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDocumentRevision {
  id: string;
  document_id: string;
  rev_label: string;
  storage_bucket: string;
  storage_object_path: string;
  notes: string | null;
  uploaded_by: string | null;
  is_current: boolean;
  created_at: string;
}

export interface ProjectDocumentWithRevisions extends ProjectDocument {
  revisions: ProjectDocumentRevision[];
  current: ProjectDocumentRevision | null;
}

export const projectDocumentsService = {
  async list(projectId: string): Promise<ProjectDocumentWithRevisions[]> {
    const { data, error } = await (supabase as any)
      .from('project_documents')
      .select('*, revisions:project_document_revisions(*)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data || []) as any[]).map((d) => {
      const revisions = ((d.revisions || []) as ProjectDocumentRevision[])
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return {
        ...d,
        revisions,
        current: revisions.find((r) => r.is_current) ?? null,
      } as ProjectDocumentWithRevisions;
    });
  },

  async createDocument(
    projectId: string,
    input: { title: string; discipline?: string | null; client_visible?: boolean },
  ): Promise<ProjectDocument> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any)
      .from('project_documents')
      .insert({
        project_id: projectId,
        title: input.title,
        discipline: input.discipline ?? null,
        client_visible: input.client_visible ?? false,
        created_by: user?.id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as ProjectDocument;
  },

  async setClientVisible(documentId: string, visible: boolean): Promise<void> {
    const { error } = await (supabase as any)
      .from('project_documents').update({ client_visible: visible }).eq('id', documentId);
    if (error) throw error;
  },

  /**
   * Upload a new revision. It becomes current and the DB demotes the previous one.
   * The blob is uploaded first: a revision row pointing at a file that failed to upload would be
   * a broken register entry, whereas an orphaned blob is reclaimed by the nightly cron.
   */
  async uploadRevision(
    documentId: string, projectId: string, revLabel: string, file: File, notes?: string | null,
  ): Promise<ProjectDocumentRevision> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
    const safeRev = revLabel.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `project-docs/${projectId}/${documentId}/${safeRev}-${Date.now()}.${ext}`;

    const { data: up, error: upErr } = await supabase.storage
      .from(DOC_BUCKET).upload(path, file, { upsert: false });
    if (upErr || !up) throw upErr ?? new Error('Upload failed');

    const { data, error } = await (supabase as any)
      .from('project_document_revisions')
      .insert({
        document_id: documentId,
        rev_label: revLabel,
        storage_bucket: DOC_BUCKET,
        storage_object_path: up.path,
        notes: notes ?? null,
        uploaded_by: user.id,
        is_current: true,
      })
      .select()
      .single();
    if (error) throw error;
    return data as ProjectDocumentRevision;
  },

  /** Promote an older revision back to current (the DB demotes whichever was current). */
  async makeCurrent(revisionId: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('project_document_revisions').update({ is_current: true }).eq('id', revisionId);
    if (error) throw error;
  },

  /** A fresh signed URL for a revision. Minted on every read — never stored. */
  async downloadUrl(rev: Pick<ProjectDocumentRevision, 'storage_bucket' | 'storage_object_path'>): Promise<string> {
    const { data, error } = await supabase.storage
      .from(rev.storage_bucket)
      .createSignedUrl(rev.storage_object_path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) throw error ?? new Error('Could not sign URL');
    return data.signedUrl;
  },

  async deleteDocument(id: string): Promise<void> {
    const { error } = await (supabase as any).from('project_documents').delete().eq('id', id);
    if (error) throw error;
  },
};

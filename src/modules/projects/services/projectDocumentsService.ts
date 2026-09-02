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
import type { DocumentKind, DrawingPurpose } from '../drawingVocabulary';

const DOC_BUCKET = 'pdf-documents';
/** Signed URLs are short-lived on purpose — long enough to open, not to share around. */
const SIGNED_URL_TTL_SECONDS = 60 * 10;

export interface ProjectDocument {
  id: string;
  project_id: string;
  title: string;
  /**
   * The number printed on the sheet (A-101, M-201). The register keys on THIS, not on the title:
   * two sheets can both be called "Ground Floor Plan" and only one can be A-101. Unique per
   * project when set, case- and whitespace-insensitively, enforced by a partial unique index.
   */
  drawing_number: string | null;
  kind: DocumentKind;
  discipline: string | null;
  scale: string | null;
  sheet_size: string | null;
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
  /**
   * The date PRINTED on the sheet, which is not `created_at`. A drawing issued on the 3rd and
   * uploaded on the 11th is eight days late, and only one of those two dates can show it.
   */
  issued_at: string | null;
  /** Why it was issued — decides whether anyone may build from this sheet. */
  purpose: DrawingPurpose | null;
  /** Both stamped by the DB when something replaces this revision. Never written by a client. */
  superseded_at: string | null;
  superseded_by: string | null;
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
    input: {
      title: string;
      drawing_number?: string | null;
      kind?: DocumentKind;
      discipline?: string | null;
      scale?: string | null;
      sheet_size?: string | null;
      client_visible?: boolean;
    },
  ): Promise<ProjectDocument> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any)
      .from('project_documents')
      .insert({
        project_id: projectId,
        title: input.title,
        // Blank is stored as NULL: the unique index skips nulls, so two unnumbered documents
        // coexist while two empty strings would collide with each other.
        drawing_number: input.drawing_number?.trim() || null,
        kind: input.kind ?? 'drawing',
        discipline: input.discipline ?? null,
        scale: input.scale?.trim() || null,
        sheet_size: input.sheet_size?.trim() || null,
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
    documentId: string,
    projectId: string,
    revLabel: string,
    file: File,
    meta?: { notes?: string | null; issued_at?: string | null; purpose?: DrawingPurpose | null },
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
        notes: meta?.notes ?? null,
        // Never defaulted to today. An issue date nobody could read must stay blank, or the
        // register shows a late drawing as issued on time.
        issued_at: meta?.issued_at ?? null,
        purpose: meta?.purpose ?? null,
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

  /** Edit the register fields on an existing entry. Storage and revisions are untouched. */
  async updateDocument(
    id: string,
    patch: {
      title?: string;
      drawing_number?: string | null;
      kind?: DocumentKind;
      discipline?: string | null;
      scale?: string | null;
      sheet_size?: string | null;
    },
  ): Promise<void> {
    const next: Record<string, unknown> = {};
    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (!title) throw new Error('Give the document a title.');
      next.title = title;
    }
    // Blank clears the number rather than storing '' — see the note in createDocument.
    if (patch.drawing_number !== undefined) next.drawing_number = patch.drawing_number?.trim() || null;
    if (patch.kind !== undefined) next.kind = patch.kind;
    if (patch.discipline !== undefined) next.discipline = patch.discipline || null;
    if (patch.scale !== undefined) next.scale = patch.scale?.trim() || null;
    if (patch.sheet_size !== undefined) next.sheet_size = patch.sheet_size?.trim() || null;
    if (Object.keys(next).length === 0) return;

    const { error } = await (supabase as any).from('project_documents').update(next).eq('id', id);
    if (error) {
      // The only error an operator can cause here, and a raw 23505 tells them nothing.
      if ((error as { code?: string }).code === '23505') {
        throw new Error('Another document in this project already uses that drawing number.');
      }
      throw error;
    }
  },

  /**
   * Read a sheet's title block into register fields. Returns them; writes NOTHING.
   *
   * Prefill-then-confirm on purpose: a scanner that also created register entries would file a
   * whole drawing set off a model's reading, and a wrong drawing number stays invisible until
   * somebody builds from the wrong sheet. The operator confirms and `createDocument` does the write.
   */
  async scanTitleBlock(projectId: string, file: File): Promise<{
    status: 'read' | 'unreadable';
    fields: {
      drawing_number: string | null;
      title: string | null;
      revision: string | null;
      discipline: string | null;
      purpose: DrawingPurpose | null;
      scale: string | null;
      sheet_size: string | null;
      issued_at: string | null;
      issuer: string | null;
      notes: string | null;
    };
    /** What the sheet said that the controlled lists could not accept, so the UI can show it. */
    unmapped: Record<string, string>;
    confidence: number | null;
  }> {
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Could not read that file.'));
      reader.readAsDataURL(file);
    });

    const { data, error } = await supabase.functions.invoke('scan-drawing-title-block', {
      body: { project_id: projectId, data_base64: dataBase64, content_type: file.type },
    });
    if (error) throw new Error(error.message || 'The title-block reader could not be reached.');
    if (!data?.success) throw new Error(data?.error || 'The title block could not be read.');
    return data;
  },

  async deleteDocument(id: string): Promise<void> {
    const { error } = await (supabase as any).from('project_documents').delete().eq('id', id);
    if (error) throw error;
  },
};

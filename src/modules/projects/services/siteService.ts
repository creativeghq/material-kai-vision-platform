/**
 * Snags (punch list) + site visit log — WS4 (#285).
 *
 * Photos are stored as OBJECT PATHS on an array column, never as URLs (pipeline convention 7 —
 * persisted URLs expire, re-deriving is free). Both arrays are registered in
 * `build_storage_reference_set()`, so `storage-orphan-cleanup-cron` leaves the blobs alone.
 * Deleting a snag drops its paths out of that set and the cron reclaims them — cleanup is GC-based,
 * not trigger-based (docs/storage-buckets.md).
 *
 * They live in the PRIVATE bucket. They used to go to `generation-images` and be rendered through
 * `getPublicUrl()` — a defect photo of the inside of a client's home, and the dated site log that
 * is "internal only and has no collaborator read policy at all", served to anyone holding the URL
 * with no session at all (#358 PQ-9). Same treatment as real-estate `property-media`: private
 * bucket, signed URL minted per read. Routing is path-based, so the feature identity is the
 * top-level `project-site/` folder, not the bucket name (docs/storage-buckets.md).
 */
import { supabase } from '@/integrations/supabase/client';
import { emitProjectLifecycle } from '@/modules/projects/services/projectsService';

const SITE_PHOTO_BUCKET = 'pdf-documents';
const SITE_PHOTO_PREFIX = 'project-site';
/** Signed-URL lifetime for a rendered photo. Matches property-media's 1h. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;
/** Upload guards. The bucket accepts far more than this surface should send. */
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export type SnagStatus = 'open' | 'in_progress' | 'fixed' | 'verified' | 'wont_fix';
// One source (#391). Re-exported so existing imports keep working.
export { SNAG_SEVERITIES, isSnagSeverity } from '../snagVocabulary';
export type { SnagSeverity } from '../snagVocabulary';

// Only the TYPE is used inside this file; `SNAG_SEVERITIES` is re-exported above for
// consumers and does not need a local binding.
import type { SnagSeverity } from '../snagVocabulary';

export const SNAG_STATUSES: SnagStatus[] = ['open', 'in_progress', 'fixed', 'verified', 'wont_fix'];

/** Statuses that mean the snag no longer needs work. Kept here so the UI cannot disagree with SQL. */
export const SNAG_CLOSED_STATUSES: SnagStatus[] = ['fixed', 'verified', 'wont_fix'];

export interface ProjectSnag {
  id: string;
  project_id: string;
  room_id: string | null;
  title: string;
  description: string | null;
  status: SnagStatus;
  severity: SnagSeverity;
  assignee_id: string | null;
  photo_paths: string[];
  client_visible: boolean;
  due_date: string | null;
  /**
   * Which trade owns the defect — the same code the money is booked to.
   *
   * It is NOT a second place cost is counted, and nothing derives money from it. A snag carries no
   * figure of its own; the money arrives when somebody books time or a bill against the SAME code,
   * which is exactly what makes "what has rework cost us on plastering" answerable from
   * `get_project_cost_by_code` rather than from a number typed on a defect.
   */
  cost_code_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface ProjectSiteLog {
  id: string;
  project_id: string;
  log_date: string;
  notes: string | null;
  photo_paths: string[];
  author_id: string | null;
  attendance: string | null;
  weather: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewSnag {
  project_id: string;
  room_id?: string | null;
  title: string;
  description?: string | null;
  severity?: SnagSeverity;
  assignee_id?: string | null;
  client_visible?: boolean;
  due_date?: string | null;
  cost_code_id?: string | null;
}

export interface NewSiteLog {
  project_id: string;
  log_date: string;
  notes?: string | null;
  attendance?: string | null;
  weather?: string | null;
}

async function uploadPhotos(prefix: string, files: File[]): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const paths: string[] = [];
  for (const file of files) {
    // Validated before the upload, not after: a 300 MB video named .jpg is a storage bill and a
    // render nobody asked for (#358 PQ-9). The message names the file — with a multi-select the
    // operator otherwise cannot tell which one was rejected.
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      throw new Error(`"${file.name}" is a ${file.type || 'unknown'} file — site photos must be JPEG, PNG, WebP or HEIC.`);
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new Error(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_PHOTO_BYTES / 1024 / 1024} MB.`);
    }
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${SITE_PHOTO_PREFIX}/${prefix}/${user.id}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    const { data, error } = await supabase.storage.from(SITE_PHOTO_BUCKET).upload(path, file, { upsert: false });
    if (error || !data) throw error ?? new Error('Upload failed');
    paths.push(data.path);
  }
  return paths;
}

export const siteService = {
  /**
   * Short-lived signed URLs for stored photo paths, keyed by path. Derived on read; never
   * persisted. A path that cannot be signed is simply absent from the map — the caller renders a
   * placeholder rather than a broken image.
   */
  async photoUrls(paths: string[]): Promise<Record<string, string>> {
    const unique = [...new Set(paths.filter(Boolean))];
    if (unique.length === 0) return {};
    const { data, error } = await supabase.storage
      .from(SITE_PHOTO_BUCKET)
      .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
    if (error) {
      console.error('[siteService] could not sign site photo URLs:', error);
      return {};
    }
    const out: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
    }
    return out;
  },

  // ---------- snags ----------

  async listSnags(projectId: string): Promise<ProjectSnag[]> {
    const { data, error } = await (supabase as any)
      .from('project_snags')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as ProjectSnag[];
  },

  /**
   * Turn a dictated site walk into the records it described. Returns a PROPOSAL; writes nothing.
   *
   * One walk normally produces a diary entry AND several defects — "quiet day, plasterers in, and
   * the ensuite tile is cracked" is one sentence and three records. They come back separately
   * because they are assigned and closed separately, and the person confirms them before anything
   * is created: a transcription mishears, and a defect written straight to the list off a
   * mishearing is a job somebody gets sent to do.
   */
  async structureDictation(projectId: string, transcript: string): Promise<{
    log: { notes: string; weather: string | null; attendance: string | null } | null;
    snags: Array<{
      title: string;
      description: string | null;
      severity: SnagSeverity | null;
      room_id: string | null;
      /** A room the dictation named that no room on this project matched. */
      room_unmatched: string | null;
    }>;
    /** Heard but not placed — the person reads this and fixes it. */
    unclear: string | null;
    /** Defects that arrived with no usable title, named rather than silently discarded. */
    dropped: string[];
  }> {
    const { data, error } = await supabase.functions.invoke('structure-site-note', {
      body: { project_id: projectId, transcript },
    });
    if (error) throw new Error(error.message || 'The dictation could not be read.');
    if (!data?.success) throw new Error(data?.error || 'The dictation could not be turned into records.');
    return data;
  },

  async createSnag(input: NewSnag, photos: File[] = []): Promise<ProjectSnag> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const photo_paths = photos.length ? await uploadPhotos(`project-snags/${input.project_id}`, photos) : [];
    const { data, error } = await (supabase as any)
      .from('project_snags')
      .insert({
        project_id: input.project_id,
        room_id: input.room_id ?? null,
        title: input.title,
        description: input.description ?? null,
        severity: input.severity ?? 'medium',
        assignee_id: input.assignee_id ?? null,
        client_visible: input.client_visible ?? false,
        due_date: input.due_date ?? null,
        cost_code_id: input.cost_code_id ?? null,
        photo_paths,
        created_by: user.id,
      })
      .select()
      .single();
    if (error) throw error;

    const snag = data as ProjectSnag;
    // A defect was found on site (#378 Phase 4). Severity rides along so a flow can escalate the
    // serious ones without firing on every snag — filtering in the flow beats a second trigger.
    void emitProjectLifecycle(snag.project_id, 'project_snag_raised',
      (name) => ({
        title: `Snag raised: ${snag.title}`,
        body: `A ${snag.severity ?? 'medium'} snag was raised on ${name}: ${snag.title}`,
      }),
      { snag_id: snag.id, severity: snag.severity, room_id: snag.room_id });

    return snag;
  },

  async updateSnag(
    id: string,
    patch: Partial<Pick<ProjectSnag, 'title' | 'description' | 'status' | 'severity' | 'assignee_id' | 'client_visible' | 'due_date' | 'room_id'>>,
  ): Promise<ProjectSnag> {
    const { data, error } = await (supabase as any)
      .from('project_snags').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data as ProjectSnag;
  },

  /** Append photos to an existing snag. */
  async addSnagPhotos(snag: ProjectSnag, files: File[]): Promise<ProjectSnag> {
    const added = await uploadPhotos(`project-snags/${snag.project_id}`, files);
    const { data, error } = await (supabase as any)
      .from('project_snags')
      .update({ photo_paths: [...snag.photo_paths, ...added] })
      .eq('id', snag.id).select().single();
    if (error) throw error;
    return data as ProjectSnag;
  },

  async deleteSnag(id: string): Promise<void> {
    const { error } = await (supabase as any).from('project_snags').delete().eq('id', id);
    if (error) throw error;
  },

  // ---------- site log ----------

  async listSiteLogs(projectId: string): Promise<ProjectSiteLog[]> {
    const { data, error } = await (supabase as any)
      .from('project_site_logs')
      .select('*')
      .eq('project_id', projectId)
      .order('log_date', { ascending: false });
    if (error) throw error;
    return (data || []) as ProjectSiteLog[];
  },

  async createSiteLog(input: NewSiteLog, photos: File[] = []): Promise<ProjectSiteLog> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const photo_paths = photos.length ? await uploadPhotos(`project-site-logs/${input.project_id}`, photos) : [];
    const { data, error } = await (supabase as any)
      .from('project_site_logs')
      .insert({
        project_id: input.project_id,
        log_date: input.log_date,
        notes: input.notes ?? null,
        attendance: input.attendance ?? null,
        weather: input.weather ?? null,
        photo_paths,
        author_id: user.id,
      })
      .select()
      .single();
    if (error) throw error;
    return data as ProjectSiteLog;
  },

  async deleteSiteLog(id: string): Promise<void> {
    const { error } = await (supabase as any).from('project_site_logs').delete().eq('id', id);
    if (error) throw error;
  },
};

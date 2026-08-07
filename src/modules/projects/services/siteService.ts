/**
 * Snags (punch list) + site visit log — WS4 (#285).
 *
 * Photos are stored as `generation-images` OBJECT PATHS on an array column, never as URLs
 * (pipeline convention 7 — persisted URLs expire, re-deriving is free). Both arrays are registered
 * in `build_storage_reference_set()`, so `storage-orphan-cleanup-cron` leaves the blobs alone.
 * Deleting a snag drops its paths out of that set and the cron reclaims them — cleanup is GC-based,
 * not trigger-based (docs/storage-buckets.md).
 */
import { supabase } from '@/integrations/supabase/client';

const SITE_PHOTO_BUCKET = 'generation-images';

export type SnagStatus = 'open' | 'in_progress' | 'fixed' | 'verified' | 'wont_fix';
export type SnagSeverity = 'low' | 'medium' | 'high' | 'critical';

export const SNAG_STATUSES: SnagStatus[] = ['open', 'in_progress', 'fixed', 'verified', 'wont_fix'];
export const SNAG_SEVERITIES: SnagSeverity[] = ['low', 'medium', 'high', 'critical'];

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
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `u/${user.id}/${prefix}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    const { data, error } = await supabase.storage.from(SITE_PHOTO_BUCKET).upload(path, file, { upsert: false });
    if (error || !data) throw error ?? new Error('Upload failed');
    paths.push(data.path);
  }
  return paths;
}

export const siteService = {
  /** Public URL for a stored photo path. Derived on read; never persisted. */
  photoUrl(path: string): string {
    return supabase.storage.from(SITE_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
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
        photo_paths,
        created_by: user.id,
      })
      .select()
      .single();
    if (error) throw error;
    return data as ProjectSnag;
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

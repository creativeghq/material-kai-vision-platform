import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import { supabase } from '@/integrations/supabase/client';
import { parseEdgeError } from '@/utils/edgeError';
import { sanitizeAppearance, sanitizeGuide, type GuideAppearance, type InstallationGuideData } from '@/lib/installation/guideSchema';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const GUIDE_BUCKET = 'pdf-documents';
export const MAX_GUIDE_PAGES = 60;
export const MAX_GUIDE_PDF_BYTES = 60 * 1024 * 1024;
const PAGE_LONG_SIDE_PX = 1400;
const PAGE_QUALITY = 0.82;

export type GuideStatus = 'draft' | 'extracting' | 'review' | 'published' | 'failed';

export interface InstallationGuideRow {
  id: string;
  workspace_id: string;
  title: string;
  status: GuideStatus;
  page_count: number;
  page_aspect: number;
  guide: InstallationGuideData | null;
  error: string | null;
  extracted_at: string | null;
  published_at: string | null;
  public_share_token: string | null;
  appearance: GuideAppearance | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = 'id, workspace_id, title, status, page_count, page_aspect, guide, error, extracted_at, published_at, public_share_token, appearance, created_at, updated_at';

const folder = (row: Pick<InstallationGuideRow, 'workspace_id' | 'id'>) => `installation-guides/${row.workspace_id}/${row.id}`;
export const guidePagePath = (row: Pick<InstallationGuideRow, 'workspace_id' | 'id'>, page: number) =>
  `${folder(row)}/pages/p${String(page).padStart(3, '0')}.webp`;

function normalise(row: Record<string, unknown>): InstallationGuideRow {
  const r = row as unknown as InstallationGuideRow;
  return {
    ...r,
    page_aspect: Number(r.page_aspect) || 1.414,
    guide: r.guide ? sanitizeGuide(r.guide, r.page_count) : null,
    appearance: r.guide && r.appearance ? sanitizeAppearance(r.appearance, (r.guide.parts ?? []).map((p: { id: string }) => p.id)) : null,
  };
}

export interface UploadProgress {
  phase: 'creating' | 'uploading' | 'rendering' | 'reading';
  done: number;
  total: number;
}

async function renderPage(doc: pdfjsLib.PDFDocumentProxy, n: number): Promise<{ blob: Blob; aspect: number }> {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = PAGE_LONG_SIDE_PX / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the manual pages.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', PAGE_QUALITY));
  page.cleanup();
  if (!blob) throw new Error(`Page ${n} could not be converted.`);
  return { blob, aspect: viewport.height / viewport.width };
}

export const installationGuideService = {
  async list(workspaceId: string): Promise<InstallationGuideRow[]> {
    const { data, error } = await supabase
      .from('installation_guides')
      .select(COLUMNS)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => normalise(r as Record<string, unknown>));
  },

  async get(id: string): Promise<InstallationGuideRow | null> {
    const { data, error } = await supabase.from('installation_guides').select(COLUMNS).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? normalise(data as Record<string, unknown>) : null;
  },

  async setPublicShare(id: string, enabled: boolean): Promise<string | null> {
    const { data, error } = await supabase.rpc('set_installation_guide_public_share', { p_guide_id: id, p_enabled: enabled });
    if (error) throw new Error(error.message);
    return data ?? null;
  },

  async openPublic(token: string): Promise<{ row: InstallationGuideRow; pageUrls: string[]; photoUrl: string | null }> {
    const { data, error } = await supabase.functions.invoke('installation-guide-public', { body: { token } });
    if (error || !data?.guide) throw new Error('This link is not valid any more.');
    const row: Record<string, unknown> = {
      id: token, workspace_id: '', title: String(data.title ?? ''), status: 'published',
      page_count: Number(data.page_count) || 0, page_aspect: Number(data.page_aspect) || 1.414,
      guide: data.guide, appearance: data.appearance ?? null, error: null, extracted_at: null, published_at: null, public_share_token: token,
      created_at: '', updated_at: '',
    };
    return { row: normalise(row), pageUrls: Array.isArray(data.page_urls) ? data.page_urls.map(String) : [], photoUrl: typeof data.photo_url === 'string' ? data.photo_url : null };
  },

  async pageUrls(row: InstallationGuideRow): Promise<string[]> {
    if (row.page_count < 1) return [];
    const paths = Array.from({ length: row.page_count }, (_, i) => guidePagePath(row, i + 1));
    const { data, error } = await supabase.storage.from(GUIDE_BUCKET).createSignedUrls(paths, 60 * 60 * 6);
    if (error) throw new Error(error.message);
    return paths.map((p) => data?.find((d) => d.path === p)?.signedUrl ?? '');
  },

  async create(workspaceId: string, file: File, onProgress: (p: UploadProgress) => void): Promise<InstallationGuideRow> {
    if (file.size > MAX_GUIDE_PDF_BYTES) throw new Error('That PDF is larger than 60 MB.');
    const buffer = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    if (doc.numPages > MAX_GUIDE_PAGES) {
      await doc.destroy();
      throw new Error(`That manual has ${doc.numPages} pages; up to ${MAX_GUIDE_PAGES} can be read.`);
    }

    onProgress({ phase: 'creating', done: 0, total: doc.numPages });
    const title = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 200) || 'Installation guide';
    const { data: created, error: createError } = await supabase
      .from('installation_guides')
      .insert({ workspace_id: workspaceId, title, status: 'draft' })
      .select(COLUMNS)
      .single();
    if (createError || !created) throw new Error(createError?.message ?? 'The guide could not be created.');
    const row = normalise(created as Record<string, unknown>);

    try {
      onProgress({ phase: 'uploading', done: 0, total: doc.numPages });
      const sourcePath = `${folder(row)}/source.pdf`;
      const { error: srcError } = await supabase.storage.from(GUIDE_BUCKET)
        .upload(sourcePath, file, { contentType: 'application/pdf' });
      if (srcError) throw new Error(srcError.message);

      let aspect = 1.414;
      for (let n = 1; n <= doc.numPages; n++) {
        onProgress({ phase: 'rendering', done: n - 1, total: doc.numPages });
        const page = await renderPage(doc, n);
        if (n === 1) aspect = page.aspect;
        const { error: upError } = await supabase.storage.from(GUIDE_BUCKET)
          .upload(guidePagePath(row, n), page.blob, { contentType: 'image/webp' });
        if (upError) throw new Error(`Page ${n}: ${upError.message}`);
      }

      const { data: updated, error: updError } = await supabase
        .from('installation_guides')
        .update({ page_count: doc.numPages, page_aspect: Math.round(aspect * 1000) / 1000, source_storage_path: sourcePath })
        .eq('id', row.id)
        .select(COLUMNS)
        .single();
      if (updError || !updated) throw new Error(updError?.message ?? 'The guide could not be saved.');
      return normalise(updated as Record<string, unknown>);
    } catch (err) {
      const reason = err instanceof Error ? err.message.slice(0, 500) : 'Upload failed.';
      const { error: markError } = await supabase.from('installation_guides')
        .update({ status: 'failed', error: reason })
        .eq('id', row.id);
      if (markError) throw new Error(`${reason} (and the guide could not be marked failed: ${markError.message})`);
      throw err;
    } finally {
      await doc.destroy();
    }
  },

  async findProductPhotos(row: InstallationGuideRow): Promise<Array<{ thumb: string; full: string; title: string | null }>> {
    const query = `${row.guide?.title || row.title} product photo`.slice(0, 140);
    const { data, error } = await supabase.functions.invoke('catalog-image-search', {
      body: { query, workspace_id: row.workspace_id, max_candidates: 8, search_db_first: false },
    });
    if (error) throw new Error((await parseEdgeError(error, 'Photo search failed.')).message);
    const list = (data?.candidates ?? []) as Array<{ thumb_url?: string; full_url?: string; title?: string | null }>;
    return list.filter((c) => c.full_url).map((c) => ({ thumb: c.thumb_url || c.full_url!, full: c.full_url!, title: c.title ?? null }));
  },

  async readAppearance(id: string, source: { image_url?: string; page_url?: string; fallback_url?: string }): Promise<GuideAppearance> {
    const { data, error } = await supabase.functions.invoke('installation-guide-appearance', { body: { guide_id: id, ...source } });
    if (error) throw new Error((await parseEdgeError(error, 'The finishes could not be read.')).message);
    if (!data?.success || !data.appearance) throw new Error(data?.error ?? 'The finishes could not be read.');
    return data.appearance as GuideAppearance;
  },

  async saveAppearance(id: string, appearance: GuideAppearance | null): Promise<void> {
    const { error } = await supabase.from('installation_guides').update({ appearance: appearance as never }).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async productPhotoUrl(row: InstallationGuideRow): Promise<string | null> {
    const path = row.appearance?.image_path;
    if (!path) return null;
    const { data } = await supabase.storage.from(GUIDE_BUCKET).createSignedUrl(path, 60 * 60 * 6);
    return data?.signedUrl ?? null;
  },

  async read(id: string): Promise<void> {
    const { error } = await supabase.functions.invoke('installation-guide-extract', { body: { guide_id: id } });
    if (error) {
      const parsed = await parseEdgeError(error, 'The manual could not be sent for reading.');
      throw new Error(parsed.message);
    }
  },

  async save(id: string, patch: { title?: string; guide?: InstallationGuideData; status?: Exclude<GuideStatus, 'extracting'> }): Promise<InstallationGuideRow> {
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title.trim().slice(0, 200) || 'Installation guide';
    if (patch.guide !== undefined) body.guide = patch.guide;
    if (patch.status !== undefined) {
      body.status = patch.status;
      if (patch.status === 'published') body.published_at = new Date().toISOString();
    }
    const { data, error } = await supabase.from('installation_guides').update(body).eq('id', id).select(COLUMNS).single();
    if (error || !data) throw new Error(error?.message ?? 'The guide could not be saved.');
    return normalise(data as Record<string, unknown>);
  },

  async remove(row: InstallationGuideRow): Promise<void> {
    const paths = [`${folder(row)}/source.pdf`, ...Array.from({ length: row.page_count }, (_, i) => guidePagePath(row, i + 1))];
    await supabase.storage.from(GUIDE_BUCKET).remove(paths);
    const { error } = await supabase.from('installation_guides').delete().eq('id', row.id);
    if (error) throw new Error(error.message);
  },
};

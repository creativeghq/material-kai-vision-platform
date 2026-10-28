import { supabase } from '@/integrations/supabase/client';
import { MIVAA_API_URL } from '@/config/mivaa';

export type EditionChangeKind = 'added' | 'removed' | 'changed' | 'unchanged';

export interface EditionSummary {
  documentId: string;
  filename: string;
  label: string | null;
  supersedesFilename: string | null;
  counts: Record<EditionChangeKind, number>;
  proposed: number;
}

export interface NeedsNewSource {
  id: string;
  name: string;
  discontinuedOn: string | null;
}

interface DocRow {
  id: string;
  filename: string;
  edition_label: string | null;
  supersedes_document_id: string | null;
}
interface ChangeRow {
  new_document_id: string;
  change_kind: EditionChangeKind;
  status: string;
}

const loose = supabase as unknown as { from: (t: string) => any };

export async function listEditions(workspaceId: string): Promise<EditionSummary[]> {
  const { data: docs, error } = await loose
    .from('documents')
    .select('id, filename, edition_label, supersedes_document_id')
    .eq('workspace_id', workspaceId)
    .not('supersedes_document_id', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const editions = (docs ?? []) as DocRow[];
  if (editions.length === 0) return [];

  const oldIds = editions.map((d) => d.supersedes_document_id as string);
  const { data: olds } = await loose.from('documents').select('id, filename').in('id', oldIds);
  const oldName = new Map(((olds ?? []) as Array<{ id: string; filename: string }>).map((o) => [o.id, o.filename]));

  const { data: changes, error: cErr } = await loose
    .from('catalog_edition_changes')
    .select('new_document_id, change_kind, status')
    .eq('workspace_id', workspaceId)
    .in('new_document_id', editions.map((d) => d.id));
  if (cErr) throw new Error(cErr.message);

  return editions.map((d) => {
    const counts: Record<EditionChangeKind, number> = { added: 0, removed: 0, changed: 0, unchanged: 0 };
    let proposed = 0;
    for (const c of ((changes ?? []) as ChangeRow[]).filter((r) => r.new_document_id === d.id)) {
      counts[c.change_kind] += 1;
      if (c.status === 'proposed' && c.change_kind !== 'unchanged') proposed += 1;
    }
    return {
      documentId: d.id,
      filename: d.filename,
      label: d.edition_label,
      supersedesFilename: oldName.get(d.supersedes_document_id as string) ?? null,
      counts,
      proposed,
    };
  });
}

export async function listNeedsNewSource(workspaceId: string): Promise<NeedsNewSource[]> {
  const { data, error } = await loose
    .from('products')
    .select('id, name, discontinued_by_supplier_on')
    .eq('workspace_id', workspaceId)
    .eq('metadata->>needs_new_source', 'true')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; name: string; discontinued_by_supplier_on: string | null }>).map((p) => ({
    id: p.id,
    name: p.name,
    discontinuedOn: p.discontinued_by_supplier_on,
  }));
}

export async function applyEdition(documentId: string): Promise<{
  published: number;
  retired: number;
  needs_replacement: number;
  updated: number;
  kept: number;
}> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${MIVAA_API_URL}/api/rag/documents/${encodeURIComponent(documentId)}/edition/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(typeof detail?.detail === 'string' ? detail.detail : `HTTP ${res.status}`);
  }
  return res.json();
}

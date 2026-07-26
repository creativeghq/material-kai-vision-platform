// Docs module (#254) — client for workspace_docs. All calls are RLS-gated: any member reads;
// the doc creator or workspace owner edits/deletes (members otherwise propose — follow-up).
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { flowEventService } from '@/services/flows/flowEventService';

export type WorkspaceDoc = Database['public']['Tables']['workspace_docs']['Row'];

export interface DocInput {
  title: string;
  content_markdown: string;
  tags: string[];
  category: string | null;
  status: string; // 'published' | 'draft'
}

export interface WorkspaceDocWithAuthor extends WorkspaceDoc {
  /** Display name behind `created_by`, resolved on read so the list can filter by author. */
  author_name?: string | null;
}

export async function listDocs(workspaceId: string): Promise<WorkspaceDocWithAuthor[]> {
  const { data, error } = await supabase
    .from('workspace_docs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  const docs = data ?? [];

  // `created_by` is a bare uuid; resolve it to a name in one batched lookup so the docs list
  // can offer an author picker rather than only a "mine vs theirs" toggle.
  const authorIds = [...new Set(docs.map((d) => d.created_by).filter(Boolean))] as string[];
  if (authorIds.length === 0) return docs;

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('user_id, full_name, email')
    .in('user_id', authorIds);

  const nameById = new Map<string, string>();
  for (const p of profiles ?? []) {
    const label = (p as any).full_name || (p as any).email;
    if (label) nameById.set((p as any).user_id, label);
  }
  // An unresolved author simply gets no option — never drop the doc itself.
  return docs.map((d) => ({ ...d, author_name: d.created_by ? nameById.get(d.created_by) ?? null : null }));
}

/** Flows — a workspace doc reached the 'published' state (fire-and-forget). Fans out one event per
 *  workspace owner/admin with a per-recipient `user_id`, so the seeded default create_notification flow
 *  actually delivers (a bare event with no user_id is dropped by that action) — mirrors the correctly
 *  wired doc_suggestion_submitted path. workspace_id is carried too so custom tenant flows match. */
function emitDocumentPublished(doc: WorkspaceDoc, workspaceId: string) {
  flowEventService.emitToWorkspaceRoles(workspaceId, ['owner', 'admin'], 'document_published', (uid) => ({
    type: 'document_published',
    workspace_id: workspaceId,
    user_id: uid,
    doc_id: (doc as any).id,
    doc_title: (doc as any).title,
    category: (doc as any).category ?? null,
    tags: (doc as any).tags ?? [],
    title: `Document published: ${(doc as any).title}`,
    body: `"${(doc as any).title}" was published in your workspace docs.`,
    action_url: `/docs?doc=${(doc as any).id}`,
  }));
}

export async function createDoc(workspaceId: string, userId: string, input: DocInput): Promise<WorkspaceDoc> {
  const { data, error } = await supabase
    .from('workspace_docs')
    .insert({ ...input, workspace_id: workspaceId, created_by: userId, updated_by: userId })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  const doc = data as WorkspaceDoc;
  if (input.status === 'published') emitDocumentPublished(doc, workspaceId);
  return doc;
}

export async function updateDoc(id: string, userId: string, input: DocInput): Promise<WorkspaceDoc> {
  // Detect the draft→published transition so the flow fires once, not on every re-save.
  let priorStatus: string | null = null;
  if (input.status === 'published') {
    const { data: prev } = await supabase.from('workspace_docs').select('status').eq('id', id).maybeSingle();
    priorStatus = (prev as any)?.status ?? null;
  }
  const { data, error } = await supabase
    .from('workspace_docs')
    .update({ ...input, updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  const doc = data as WorkspaceDoc;
  if (input.status === 'published' && priorStatus !== 'published') {
    emitDocumentPublished(doc, (doc as any).workspace_id);
  }
  return doc;
}

export async function deleteDoc(id: string): Promise<void> {
  const { error } = await supabase.from('workspace_docs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Suggestions (members propose edits; doc creator / workspace owner reviews) ──

export type DocSuggestion = Database['public']['Tables']['workspace_doc_suggestions']['Row'];

export async function listPendingSuggestions(docId: string): Promise<DocSuggestion[]> {
  const { data, error } = await supabase
    .from('workspace_doc_suggestions')
    .select('*')
    .eq('doc_id', docId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createSuggestion(
  workspaceId: string,
  docId: string,
  userId: string,
  proposedContentMarkdown: string,
  rationale: string,
): Promise<void> {
  const { error } = await supabase.from('workspace_doc_suggestions').insert({
    workspace_id: workspaceId,
    doc_id: docId,
    proposer_user_id: userId,
    proposed_content_markdown: proposedContentMarkdown,
    rationale: rationale || null,
  });
  if (error) throw new Error(error.message);
  // Flows — a member proposed an edit; the doc owner can automate a review notification.
  let docTitle: string | null = null;
  let docOwnerId: string | null = null;
  try {
    const { data: d } = await supabase.from('workspace_docs').select('title, created_by').eq('id', docId).maybeSingle();
    docTitle = (d as any)?.title ?? null;
    docOwnerId = (d as any)?.created_by ?? null;
  } catch { /* best-effort */ }
  // Notify the doc owner (create_notification needs a concrete user_id; skip if the
  // owner is the proposer or unknown).
  if (docOwnerId && docOwnerId !== userId) {
    flowEventService.emit('doc_suggestion_submitted', {
      user_id: docOwnerId,
      type: 'doc_suggestion_submitted',
      workspace_id: workspaceId,
      doc_id: docId,
      doc_title: docTitle,
      proposer_user_id: userId,
      rationale: rationale || null,
      title: `Edit proposed${docTitle ? `: ${docTitle}` : ''}`,
      body: `A member proposed an edit${docTitle ? ` to "${docTitle}"` : ''}.`,
      action_url: `/docs?doc=${docId}`,
    });
  }
}

export async function reviewSuggestion(id: string, action: 'accept' | 'reject'): Promise<void> {
  const { error } = await supabase.rpc('review_doc_suggestion', { p_suggestion_id: id, p_action: action });
  if (error) throw new Error(error.message);
}

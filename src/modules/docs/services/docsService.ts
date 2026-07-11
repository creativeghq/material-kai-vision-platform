// Docs module (#254) — client for workspace_docs. All calls are RLS-gated: any member reads;
// the doc creator or workspace owner edits/deletes (members otherwise propose — follow-up).
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

// editor_json added 2026-07-11 (Yoopta block-JSON source of truth); the generated
// Row type is regenerated out-of-band, so widen it here until then.
export type WorkspaceDoc = Database['public']['Tables']['workspace_docs']['Row'] & {
  editor_json: unknown | null;
};

export interface DocInput {
  title: string;
  content_markdown: string;      // generated markdown projection (agent FTS + read view)
  editor_json?: unknown | null;  // Yoopta block-JSON = editor source of truth
  tags: string[];
  category: string | null;
  status: string; // 'published' | 'draft'
}

export async function listDocs(workspaceId: string): Promise<WorkspaceDoc[]> {
  const { data, error } = await supabase
    .from('workspace_docs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createDoc(workspaceId: string, userId: string, input: DocInput): Promise<WorkspaceDoc> {
  const { data, error } = await supabase
    .from('workspace_docs')
    .insert({ ...input, workspace_id: workspaceId, created_by: userId, updated_by: userId } as never)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as WorkspaceDoc;
}

export async function updateDoc(id: string, userId: string, input: DocInput): Promise<WorkspaceDoc> {
  const { data, error } = await supabase
    .from('workspace_docs')
    .update({ ...input, updated_by: userId, updated_at: new Date().toISOString() } as never)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as WorkspaceDoc;
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
}

export async function reviewSuggestion(id: string, action: 'accept' | 'reject'): Promise<void> {
  const { error } = await supabase.rpc('review_doc_suggestion', { p_suggestion_id: id, p_action: action });
  if (error) throw new Error(error.message);
}

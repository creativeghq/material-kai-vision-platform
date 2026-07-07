// Docs module (#254) — client for workspace_docs. All calls are RLS-gated: any member reads;
// the doc creator or workspace owner edits/deletes (members otherwise propose — follow-up).
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type WorkspaceDoc = Database['public']['Tables']['workspace_docs']['Row'];

export interface DocInput {
  title: string;
  content_markdown: string;
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
    .insert({ ...input, workspace_id: workspaceId, created_by: userId, updated_by: userId })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateDoc(id: string, userId: string, input: DocInput): Promise<WorkspaceDoc> {
  const { data, error } = await supabase
    .from('workspace_docs')
    .update({ ...input, updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteDoc(id: string): Promise<void> {
  const { error } = await supabase.from('workspace_docs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

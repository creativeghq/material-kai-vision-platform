/** Whose credits server-initiated work on a document debits: its creator, else the first owner. */
export async function resolveBillingUser(
  supabase: any,
  workspaceId: string,
  documentId: string,
  table: 'invoices' | 'credit_notes' | 'delivery_notes' = 'invoices',
): Promise<string | null> {
  const { data: doc } = await supabase.from(table).select('created_by').eq('id', documentId).maybeSingle();
  if (doc?.created_by) return doc.created_by as string;
  const { data: owner } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .eq('role', 'owner')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!owner?.user_id) console.warn('[billing-user] no billing user for workspace', workspaceId);
  return (owner?.user_id as string | undefined) ?? null;
}

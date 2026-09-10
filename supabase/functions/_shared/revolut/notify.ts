/** Who hears about bank-feed events (#315). */

// deno-lint-ignore-file no-explicit-any

/** Roles that should hear about unreconciled money, most→least appropriate. */
const RECIPIENT_ROLE_PRIORITY = ['owner', 'admin', 'accountant'];

/**
 * The user id to address workspace finance notifications to, or null when the workspace
 * genuinely has no active member (callers log that — it must never pass silently).
 */
export async function financeNotifyRecipient(service: any, workspaceId: string): Promise<string | null> {
  const { data } = await service
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .limit(50);
  const members = (data ?? []) as Array<{ user_id: string; role: string }>;
  if (members.length === 0) return null;

  for (const role of RECIPIENT_ROLE_PRIORITY) {
    const hit = members.find((m) => m.role === role);
    if (hit) return hit.user_id;
  }
  return members[0].user_id;
}

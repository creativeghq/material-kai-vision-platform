/**
 * Who hears about bank-feed events (#315).
 *
 * Every Revolut notification used to be addressed to the member whose role is literally
 * `owner`. A workspace run by an `admin` (or one whose owner row is inactive) therefore
 * produced NO notification at all and no trace of the miss: the emit never happened, so
 * `ops.flow_sends_skipped_no_recipient` — which watches sends, not non-sends — stayed
 * quiet. That is the silent-zero shape this platform keeps getting bitten by.
 *
 * The fallback ladder is deliberate: owner → admin → accountant → any active member.
 * Money reaching a slightly-too-senior inbox is recoverable; money reaching nobody is not.
 */

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

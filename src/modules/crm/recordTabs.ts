/**
 * `?tab=` deep-link resolution for the CRM record pages (company + contact).
 *
 * A tab value is part of the platform's URL surface, not an internal identifier: reminder emails,
 * `user_notifications.action_url` rows and the cron that writes them all carry one, and those links
 * outlive any rename. So renaming a tab means keeping its old value working, not rewriting history.
 *
 * `equipment` → `warranties`: the installed-base tab was renamed 2026-08-12. Links already sent —
 * and `asset-service-reminders-cron`, until it is redeployed — still say `equipment`.
 */
const TAB_ALIASES: Record<string, string> = {
  equipment: 'warranties',
};

/** Resolve a raw `?tab=` value to the tab this page actually renders. */
export function resolveRecordTab(raw: string | null | undefined, fallback = 'activity'): string {
  const v = (raw ?? '').trim();
  if (!v) return fallback;
  return TAB_ALIASES[v] ?? v;
}

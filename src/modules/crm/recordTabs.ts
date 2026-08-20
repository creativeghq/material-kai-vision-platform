/**
 * `?tab=` deep-link resolution for the CRM record pages (company + contact).
 *
 * A tab value is part of the platform's URL surface, not an internal identifier: reminder emails,
 * `user_notifications.action_url` rows and the cron that writes them all carry one, and those links
 * outlive any rename. So renaming a tab means keeping its old value working, not rewriting history.
 *
 * `equipment` → `warranties`: the installed-base tab was renamed 2026-08-12. Links already sent —
 * and `asset-service-reminders-cron`, until it is redeployed — still say `equipment`.
 *
 * `projects` / `warranties` / `property` → `work` (#376): those three tabs answered one question
 * — "what is going on with this client?" — in three places, and were merged into Work. Every one
 * of them is a live URL: `asset-service-reminders-cron` writes `?tab=warranties` into
 * `user_notifications.action_url`, and rows already stored keep saying it. Dropping the key would
 * not 404; it would open the record with NO pane selected and a blank body, which is why this map
 * exists rather than a rename.
 *
 * `equipment` therefore hops twice — equipment → warranties → work — so the resolution is applied
 * until it reaches a fixed point rather than once.
 */
const TAB_ALIASES: Record<string, string> = {
  equipment:  'warranties',
  warranties: 'work',
  projects:   'work',
  property:   'work',
};

/**
 * Resolve a raw `?tab=` value to the tab this page actually renders.
 *
 * Follows the alias chain to a fixed point, because a tab can be renamed twice — `equipment` was
 * renamed to `warranties` and `warranties` then merged into `work`, so a link sent before the
 * first rename has two hops to make. Bounded, so a mistaken cycle in the map cannot hang the page.
 */
export function resolveRecordTab(raw: string | null | undefined, fallback = 'activity'): string {
  let v = (raw ?? '').trim();
  if (!v) return fallback;
  for (let hops = 0; hops < 8 && TAB_ALIASES[v]; hops++) v = TAB_ALIASES[v];
  return v;
}

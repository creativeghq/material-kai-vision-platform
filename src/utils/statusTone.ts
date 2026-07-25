/**
 * Text-color classes for rendering a status / type / direction as a PLAIN COLORED WORD in a
 * table or list row. House style: NO Badge/pill backgrounds in tables or list rows — they read
 * as tags and break the row. Pair with a humanized label for the text.
 *
 * This is the platform-wide canonical helper (every module imports it) so tone is consistent.
 * Non-table chips (KPI cards, tab counters, filter chips, standalone headers) may still use Badge.
 */

/** Good / neutral / bad tone for an arbitrary status word. */
export function statusTone(value?: string | null): string {
  const s = String(value ?? '').toLowerCase();
  if (['paid', 'approved', 'issued', 'cleared', 'accepted', 'active', 'fulfilled', 'completed', 'settled', 'confirmed', 'received', 'done', 'sent', 'published', 'live', 'connected', 'enabled', 'success', 'succeeded', 'signed', 'won', 'match', 'passed', 'verified', 'healthy', 'merged', 'reviewed', 'granted', 'shipped', 'delivered', 'categorized', 'ready', 'posted', 'reconciled', 'resolved'].includes(s))
    return 'text-emerald-600 dark:text-emerald-400';
  if (['overdue', 'rejected', 'bounced', 'disputed', 'failed', 'cancelled', 'canceled', 'void', 'error', 'blocked', 'expired', 'disabled', 'inactive', 'lost', 'mismatch', 'suspended', 'unpaid', 'declined', 'denied', 'revoked', 'retired', 'disconnected', 'missing', 'out_of_stock'].includes(s))
    return 'text-red-500 dark:text-red-400';
  if (['partially_paid', 'partial', 'pending', 'draft', 'paused', 'processing', 'partially_fulfilled', 'new', 'planned', 'on_hold', 'scheduled', 'queued', 'in_progress', 'in_review', 'review', 'warning', 'awaiting', 'tangential', 'snoozed', 'ordered', 'due', 'open', 'stale', 'unverified', 'skipped', 'low'].includes(s))
    return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground';
}

/** Money direction — in/received = positive (emerald), out/paid = negative (red). */
export function directionTone(direction?: string | null): string {
  return direction === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
}

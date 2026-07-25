/**
 * Text-color classes for rendering a finance status / direction as a PLAIN COLORED WORD in a
 * table row — the house style is no Badge/pill backgrounds in tables (they read as tags and
 * break the row). Pair with `humanizeLabel(value)` for the text. See the design rule in memory.
 */

/** Good / neutral / bad tone for an arbitrary status word. */
export function statusTone(value?: string | null): string {
  const s = String(value ?? '').toLowerCase();
  if (['paid', 'approved', 'issued', 'cleared', 'accepted', 'active', 'fulfilled', 'completed', 'settled', 'confirmed', 'received', 'done', 'sent'].includes(s))
    return 'text-emerald-600 dark:text-emerald-400';
  if (['overdue', 'rejected', 'bounced', 'disputed', 'failed', 'cancelled', 'canceled', 'void', 'error', 'blocked'].includes(s))
    return 'text-red-500 dark:text-red-400';
  if (['partially_paid', 'partial', 'pending', 'draft', 'paused', 'processing', 'partially_fulfilled', 'new', 'planned', 'on_hold'].includes(s))
    return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground';
}

/** Money direction — in/received = positive (emerald), out/paid = negative (red). */
export function directionTone(direction?: string | null): string {
  return direction === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
}

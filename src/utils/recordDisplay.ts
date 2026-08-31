/**
 * How a stored value reads on screen — the two conversions every record surface needs.
 *
 * Both lived inside `AgentResultCard` and were about to be copied into the record peek dialog,
 * which is how the platform ended up with three different `escapeHtml`s and eleven date
 * formatters. One module, imported twice, so a status word cannot be amber in a table and grey in
 * the dialog you opened FROM that table.
 */

/** `quote_approved` → `Quote approved`. A stored enum is a value, not prose. */
export function labelizeValue(value: string): string {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export type StatusBadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/**
 * Status-ish words → the semantic badge tints. Anything unknown stays neutral rather than
 * guessing: a word coloured green because it looked positive is a claim the data did not make.
 */
const STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
  active: 'success', live: 'success', published: 'success', completed: 'success', done: 'success',
  paid: 'success', approved: 'success', sent: 'success', verified: 'success', enabled: 'success',
  accepted: 'success', signed: 'success', confirmed: 'success', settled: 'success', won: 'success',
  pending: 'warning', draft: 'warning', processing: 'warning', queued: 'warning', partial: 'warning',
  partially_paid: 'warning', received: 'warning', open: 'warning', overdue: 'error',
  failed: 'error', error: 'error', cancelled: 'error', canceled: 'error', rejected: 'error',
  lost: 'error', expired: 'error', unpaid: 'error',
  paused: 'neutral', archived: 'neutral', inactive: 'neutral', disabled: 'neutral',
};

export function statusBadgeVariant(value: string): StatusBadgeVariant {
  return STATUS_VARIANT[String(value).toLowerCase()] ?? 'neutral';
}

/** Keys whose value is a status word rather than a fact — rendered as a tag, not as text. */
export const STATUS_KEYS = new Set([
  'status', 'state', 'stage', 'tier', 'severity', 'ring', 'payment_status', 'fiscal_status',
  'listing_status', 'lead_status', 'supplier_status',
]);

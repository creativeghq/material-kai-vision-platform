/** The page-watch value-sets, written ONCE (#391). */

/**
 * `page_watch_changes_status_check`.
 *
 * `same` and `error` are both legitimate outcomes and mean opposite things — the page was
 * fetched and had not changed, versus the fetch failed. Keeping `error` in the vocabulary
 * rather than treating a failure as `same` is what stops a dead URL reporting "no change"
 * forever, which is a documented behaviour of the upstream monitoring API.
 */
export const PAGE_WATCH_STATUSES = ['same', 'new', 'changed', 'removed', 'error'] as const;
export type PageWatchChangeStatus = (typeof PAGE_WATCH_STATUSES)[number];

/**
 * `page_watch_changes_judge_confidence_check`.
 *
 * The column is NULLABLE and the constraint reads `judge_confidence IS NULL OR ...`, so
 * "no judgement was made" is legitimate and is NOT a member. A consumer that wants to
 * display it adds that at the UI layer; putting it here would make the set disagree with
 * the constraint.
 */
export const JUDGE_CONFIDENCES = ['high', 'medium', 'low'] as const;
export type JudgeConfidence = (typeof JUDGE_CONFIDENCES)[number];

export function isPageWatchStatus(v: unknown): v is PageWatchChangeStatus {
  return typeof v === 'string' && (PAGE_WATCH_STATUSES as readonly string[]).includes(v);
}
export function isJudgeConfidence(v: unknown): v is JudgeConfidence {
  return typeof v === 'string' && (JUDGE_CONFIDENCES as readonly string[]).includes(v);
}

/** `page_watches_category_check` — what KIND of page is being watched. */
export const PAGE_WATCH_CATEGORIES = [
  'supplier_terms', 'regulatory', 'partner_docs', 'competitor', 'other',
] as const;
export type PageWatchCategory = (typeof PAGE_WATCH_CATEGORIES)[number];

export function isPageWatchCategory(v: unknown): v is PageWatchCategory {
  return typeof v === 'string' && (PAGE_WATCH_CATEGORIES as readonly string[]).includes(v);
}

/**
 * Page watches — client for the `page-watches` edge function (issue #331).
 *
 * Every call goes through the edge function rather than hitting the tables
 * directly, because creating or removing a watch has a REMOTE half: a Firecrawl
 * monitor that must be created, updated and deleted in step with the row. A
 * direct table write from here would leave an orphan monitor billing us on its
 * schedule with no row left pointing at it.
 *
 * Reads could bypass it (RLS covers them), but they go through the same door so
 * there is one place where "what a watch looks like to the UI" is decided.
 */

import { supabase } from '@/integrations/supabase/client';

export type PageWatchCategory =
  | 'supplier_terms'
  | 'regulatory'
  | 'partner_docs'
  | 'competitor'
  | 'other';

// One source (#391). Re-exported so existing imports keep working.
export { PAGE_WATCH_STATUSES, JUDGE_CONFIDENCES, isPageWatchStatus, isJudgeConfidence } from './pageWatch/pageWatchVocabulary';
export type { PageWatchChangeStatus, JudgeConfidence } from './pageWatch/pageWatchVocabulary';

// Also imported: a re-export does not bind the name locally.
import type { PageWatchChangeStatus } from './pageWatch/pageWatchVocabulary';

export interface PageWatch {
  id: string;
  workspace_id: string;
  created_by: string | null;
  name: string;
  url: string;
  category: PageWatchCategory;
  subject_kind: 'platform_supplier' | 'crm_company' | null;
  subject_id: string | null;
  goal: string | null;
  schedule_text: string;
  timezone: string;
  firecrawl_monitor_id: string | null;
  is_active: boolean;
  last_check_at: string | null;
  last_check_status: string | null;
  cache_status: 'pending' | 'ok' | 'failed';
  last_error: string | null;
  created_at: string;
  updated_at: string;
  /** Added by the `list` action; not a column. */
  unacknowledged_changes?: number;
}

export interface PageWatchChange {
  id: string;
  page_watch_id: string;
  workspace_id: string;
  firecrawl_check_id: string | null;
  url: string;
  status: PageWatchChangeStatus;
  /** Firecrawl's judge verdict. Advisory — it annotates a change, never hides one. */
  is_meaningful: boolean | null;
  judge_confidence: 'high' | 'medium' | 'low' | null;
  judge_reason: string | null;
  diff_text: string | null;
  diff_json: unknown;
  error: string | null;
  detected_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

/**
 * The cadences a watch may run on.
 *
 * Not free text. Firecrawl's natural-language schedule parser accepts "every day
 * at 09:00" and rejects "every Monday at 08:00" — which was the second example in
 * this form's own placeholder until 2026-08-16, so following our own hint saved a
 * watch that Firecrawl had refused to schedule. The edge function maps each of
 * these to a cron expression; both copies are pinned equal by
 * tests/unit/pageWatchWebhook.test.ts.
 */
export const PAGE_WATCH_SCHEDULES = [
  'every hour',
  'every 6 hours',
  'every day at 09:00',
  'every Monday at 09:00',
  'the 1st of every month at 09:00',
] as const;

export type PageWatchSchedule = typeof PAGE_WATCH_SCHEDULES[number];

export const PAGE_WATCH_CATEGORY_LABELS: Record<PageWatchCategory, string> = {
  supplier_terms: 'Supplier terms',
  regulatory: 'Regulatory',
  partner_docs: 'Partner API docs',
  competitor: 'Competitor',
  other: 'Other',
};

async function call<T>(action: string, workspaceId: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('page-watches', {
    body: { action, workspace_id: workspaceId, ...payload },
  });
  if (error) {
    // The function returns a JSON body on 4xx/5xx; surface that rather than the
    // opaque "Edge Function returned a non-2xx status code".
    const detail = (error as { context?: { body?: unknown } })?.context?.body;
    throw new Error(typeof detail === 'string' && detail ? detail : error.message);
  }
  if (data && data.success === false) throw new Error(data.error || 'Request failed');
  return (data?.data ?? data) as T;
}

export const pageWatchService = {
  list: (workspaceId: string) => call<PageWatch[]>('list', workspaceId),

  changes: (workspaceId: string, watchId: string, limit = 50) =>
    call<PageWatchChange[]>('changes', workspaceId, { id: watchId, limit }),

  create: (
    workspaceId: string,
    input: {
      name: string;
      url: string;
      category?: PageWatchCategory;
      goal?: string;
      schedule_text?: string;
      timezone?: string;
      subject_kind?: 'platform_supplier' | 'crm_company';
      subject_id?: string;
    },
  ) => call<PageWatch>('create', workspaceId, input),

  update: (
    workspaceId: string,
    id: string,
    patch: Partial<Pick<PageWatch, 'name' | 'goal' | 'schedule_text' | 'timezone' | 'is_active' | 'category'>>,
  ) => call<PageWatch>('update', workspaceId, { id, ...patch }),

  remove: (workspaceId: string, id: string) => call<{ id: string }>('remove', workspaceId, { id }),

  /** Force a check now. Costs a Firecrawl credit — debited before the call. */
  run: (workspaceId: string, id: string) => call<{ started: boolean }>('run', workspaceId, { id }),

  acknowledge: (workspaceId: string, changeId: string) =>
    call<{ id: string }>('acknowledge', workspaceId, { change_id: changeId }),
};

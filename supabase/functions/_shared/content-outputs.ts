/** The ai_content_outputs ledger: one row per generated output, read by admin_agent_work_quality. */
import type { DbClient } from './supabase-client.ts';
import type { CopyRules, CopyWarning } from './copy-check.ts';

export interface ContentOutputRow {
  workspace_id: string | null;
  user_id: string | null;
  producer: string;
  channel?: string | null;
  subject_table?: string | null;
  subject_id?: string | null;
  variant_index?: number | null;
  model?: string | null;
  rules: CopyRules['status'] | 'not_checked';
  warnings?: CopyWarning[];
  avoid_hits?: number;
  char_count?: number | null;
  score?: number | null;
}

/** Telemetry: a failed write is logged and never fails the generation it describes. */
export async function recordContentOutputs(db: DbClient, rows: ContentOutputRow[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await db.from('ai_content_outputs').insert(rows.map((r) => ({
    workspace_id: r.workspace_id,
    user_id: r.user_id,
    producer: r.producer,
    channel: r.channel ?? null,
    subject_table: r.subject_table ?? null,
    subject_id: r.subject_id ?? null,
    variant_index: r.variant_index ?? null,
    model: r.model ?? null,
    check_status: r.rules,
    warning_codes: [...new Set((r.warnings ?? []).map((w) => w.code))],
    avoid_hits: r.avoid_hits ?? 0,
    char_count: r.char_count ?? null,
    score: r.score ?? null,
  })));
  if (error) console.error('[content-outputs] could not record outputs:', error.message);
}

/** Marks the outputs drafted for one subject as sent out. `edited` = what went out matches none of them. */
export async function markContentOutcome(
  db: DbClient,
  subject: { table: string; id: string },
  outcome: 'published' | 'sent' | 'discarded',
  edited: boolean | null,
): Promise<void> {
  const { error } = await db.from('ai_content_outputs')
    .update({ outcome, edited_before_outcome: edited, outcome_at: new Date().toISOString() })
    .eq('subject_table', subject.table).eq('subject_id', subject.id).eq('outcome', 'draft');
  if (error) console.error('[content-outputs] could not record the outcome:', error.message);
}

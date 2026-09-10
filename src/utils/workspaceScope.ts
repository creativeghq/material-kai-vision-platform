/** Two ids that are each individually valid, never checked against each other. */
import { supabase } from '@/integrations/supabase/client';

export interface ScopedRef {
  /** Table holding the row, e.g. 'crm_companies'. Must carry a `workspace_id` column. */
  table: string;
  /** Row id. `null`/`undefined` refs are skipped — nothing to disagree with. */
  id: string | null | undefined;
  /** What to call it in the error, e.g. 'client company'. */
  label: string;
}

/**
 * Throws unless every supplied ref belongs to `workspaceId`.
 *
 * A ref whose row cannot be read is treated as a MISMATCH, not as a pass: an unresolved verdict
 * that defaults to "fine" is a check that switches itself off exactly when it matters.
 */
export async function assertSameWorkspace(
  workspaceId: string | null | undefined,
  refs: ScopedRef[],
): Promise<void> {
  const present = refs.filter((r) => !!r.id);
  if (present.length === 0) return;
  if (!workspaceId) {
    throw new Error(
      `Cannot attach a ${present.map((r) => r.label).join(' / ')} before this record belongs to a workspace.`,
    );
  }

  for (const ref of present) {
    const { data, error } = await (supabase as never as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { workspace_id: string | null } | null; error: unknown }> };
        };
      };
    }).from(ref.table).select('workspace_id').eq('id', ref.id as string).maybeSingle();

    if (error || !data) {
      throw new Error(`That ${ref.label} could not be verified — it may belong to another workspace.`);
    }
    if (data.workspace_id !== workspaceId) {
      throw new Error(`That ${ref.label} belongs to a different workspace.`);
    }
  }
}

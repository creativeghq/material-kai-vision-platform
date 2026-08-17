/**
 * Two ids that are each individually valid, never checked against each other.
 *
 * This is a confirmed defect class on this platform, found four times in three modules: `CRM-5`
 * (#353), `RE-4` (#356) and twice in projects (`PQ-4`, #358) — a picker that can bind a record to
 * a CRM party from a DIFFERENT workspace, and a service that stores the pair without proving they
 * belong together. Nothing raises: both rows exist, both are readable by a multi-workspace user,
 * and RLS is satisfied because the caller genuinely is a member of both tenants.
 *
 * `assertSameWorkspace` is the shared check. It is a CLIENT-side check and gives the operator a
 * sentence they can act on; the enforcement is the matching DB trigger
 * (`_assert_project_client_same_workspace`), which is what actually stops a hand-made request.
 * Use both: the trigger so it cannot happen, this so it does not look like a server error when a
 * picker offers something it should not have.
 */
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

/**
 * "Both of these belong to the same tenant" — the check that was missing in two modules at once
 * (#356 `RE-4`, #353 `CRM-5`).
 */
import { HttpError } from './api-logger.ts';

// deno-lint-ignore no-explicit-any
type Sb = any;

/**
 * Throw unless `id` names a row of `table` inside `workspaceId`.
 *
 * 404, not 403: a caller who may not reference the row must not learn it exists, exactly as the
 * property loaders in real-estate-api already do. `null`/`undefined`/`''` pass — an optional FK
 * that was not supplied is not a violation, and forcing every caller to branch first is how the
 * check ends up skipped.
 */
export async function assertSameWorkspace(
  supabase: Sb,
  table: string,
  id: string | null | undefined,
  workspaceId: string,
  label = 'referenced record',
): Promise<void> {
  if (id === null || id === undefined || id === '') return;
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('id', String(id))
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw new HttpError(400, error.message);
  if (!data) throw new HttpError(404, `${label} not found`);
}

/** `assertSameWorkspace` for several ids against the same table, in parallel. */
export async function assertAllSameWorkspace(
  supabase: Sb,
  table: string,
  ids: Array<string | null | undefined>,
  workspaceId: string,
  label = 'referenced record',
): Promise<void> {
  await Promise.all(ids.map((id) => assertSameWorkspace(supabase, table, id, workspaceId, label)));
}

// Shared workspace-scoping for the CRM API handlers.
// All crm-api handlers run under the SERVICE ROLE (RLS bypassed), and authenticate()
// only proves the caller holds an admin/factory role in SOME workspace — it is an
// admission gate, NOT per-row authorization. Without explicit scoping any workspace
// admin/factory user can list/modify/delete every other tenant's CRM rows (IDOR).
// This mirrors the `is_workspace_member` RLS on crm_companies / crm_contacts: a user
// sees CRM rows across the workspaces they are an ACTIVE member of. Global platform
// operators (secret key, or global role admin/super_admin) act across all workspaces.

import type { DbClient } from '../../_shared/supabase-client.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthResult } from '../../_shared/auth.ts';

export interface CrmScope {
  /** Secret-key or global admin/super_admin — unrestricted across all workspaces. */
  isGlobalOperator: boolean;
  /**
   * The caller's own active-membership workspace ids. For a non-global caller this is
   * the full set they may read/write. For a global-by-role operator it is still populated
   * (their "home" workspaces) so creates can default to one — a global operator reads
   * across all tenants but a new row must still belong to a single, concrete workspace
   * (crm_companies/crm_contacts.workspace_id is NOT NULL). Empty for secret-key callers,
   * which have no user context and must pass workspace_id explicitly on create.
   */
  workspaceIds: string[];
  /** The authenticated caller's user id (null for secret-key/no-user context). Used to
   *  stamp linked_by / created_by from the JWT rather than a client-supplied field. */
  callerUserId: string | null;
}

/** Is a crm_contacts / crm_companies row reachable by the caller's workspace scope? The SINGLE
 *  implementation behind the per-handler contactInScope/companyInScope wrappers (was copy-pasted). */
export async function rowInScope(
  supabase: DbClient,
  table: 'crm_contacts' | 'crm_companies',
  id: string,
  scope: CrmScope,
): Promise<boolean> {
  if (scope.isGlobalOperator) {
    const { data } = await supabase.from(table).select('id').eq('id', id).maybeSingle();
    return !!data;
  }
  if (scope.workspaceIds.length === 0) return false;
  const { data } = await supabase.from(table).select('id').eq('id', id).in('workspace_id', scope.workspaceIds).maybeSingle();
  return !!data;
}

/** UUID guard shared by the handlers. */
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function getCrmScope(
  adminClient: DbClient,
  auth: AuthResult,
): Promise<CrmScope> {
  // Server-to-server secret key → full admin access (no user context).
  if (auth.level === 'secret') {
    return { isGlobalOperator: true, workspaceIds: [], callerUserId: null };
  }

  const userId = auth.userId;
  if (!userId) return { isGlobalOperator: false, workspaceIds: [], callerUserId: null };

  const [{ data: prof }, { data: mems }] = await Promise.all([
    adminClient
      .from('user_profiles')
      .select('roles!user_profiles_role_id_fkey(name)')
      .eq('user_id', userId)
      .maybeSingle(),
    adminClient
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .eq('status', 'active'),
  ]);

  // filter(Boolean): a NULL/empty workspace_id would poison any `.in('workspace_id', …)`
  // query downstream (Postgres rejects '' as a uuid → 22P02 "invalid input syntax").
  const workspaceIds = (mems ?? [])
    .map((m: { workspace_id: string }) => m.workspace_id)
    .filter(Boolean);

  const globalRole = (prof as { roles?: { name?: string } } | null)?.roles?.name;
  if (globalRole && ['admin', 'super_admin'].includes(globalRole)) {
    // Global read/write across all tenants, but keep the operator's own memberships so a
    // create with no explicit workspace_id can default to their home workspace.
    return { isGlobalOperator: true, workspaceIds, callerUserId: userId };
  }

  return { isGlobalOperator: false, workspaceIds, callerUserId: userId };
}

/** True when `workspaceId` is reachable by the scope. */
export function scopeAllows(scope: CrmScope, workspaceId: string | null | undefined): boolean {
  if (scope.isGlobalOperator) return true;
  return !!workspaceId && scope.workspaceIds.includes(workspaceId);
}

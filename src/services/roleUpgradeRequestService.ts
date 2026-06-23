import { supabase } from '@/integrations/supabase/client';

export type RoleUpgradeRequestedRole = 'supplier' | 'architect';
export type RoleUpgradeStatus = 'pending' | 'approved' | 'rejected';

export interface RoleUpgradeRequest {
  id: string;
  user_id: string;
  requested_role_id: string;
  requested_role_name: RoleUpgradeRequestedRole;
  justification: string | null;
  status: RoleUpgradeStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  /** VAT validation snapshot taken at submission time. NULL = could not validate (non-EU or VIES unreachable). */
  vat_validated: boolean | null;
  vat_validated_at: string | null;
  vat_validated_name: string | null;
  vat_validation_source: string | null;
}

interface RawRow {
  id: string;
  user_id: string;
  requested_role_id: string;
  justification: string | null;
  status: RoleUpgradeStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  vat_validated: boolean | null;
  vat_validated_at: string | null;
  vat_validated_name: string | null;
  vat_validation_source: string | null;
  // joined
  roles: { name: string } | null;
}

function rowToRequest(row: RawRow): RoleUpgradeRequest {
  return {
    id: row.id,
    user_id: row.user_id,
    requested_role_id: row.requested_role_id,
    requested_role_name: (row.roles?.name as RoleUpgradeRequestedRole) ?? 'supplier',
    justification: row.justification,
    status: row.status,
    admin_note: row.admin_note,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    vat_validated: row.vat_validated,
    vat_validated_at: row.vat_validated_at,
    vat_validated_name: row.vat_validated_name,
    vat_validation_source: row.vat_validation_source,
  };
}

/** Submit a new application. The edge function enforces the business-entity gate and notifies admins. */
export async function submitRoleUpgradeRequest(args: {
  requestedRole: RoleUpgradeRequestedRole;
  justification?: string;
}): Promise<{ success: true; request_id: string } | { success: false; error: string; message?: string }> {
  const { data, error } = await supabase.functions.invoke('role-upgrade-requests', {
    body: { action: 'submit', requested_role: args.requestedRole, justification: args.justification ?? '' },
  });
  if (error) return { success: false, error: error.message };
  if (data?.success) return { success: true, request_id: data.request_id };
  return { success: false, error: data?.error || 'submit_failed', message: data?.message };
}

/** Read the caller's own requests, newest first. RLS limits this to own rows (or all rows if admin). */
export async function listMyRoleUpgradeRequests(userId: string): Promise<RoleUpgradeRequest[]> {
  const { data } = await supabase
    .from('role_upgrade_requests')
    .select('id, user_id, requested_role_id, justification, status, admin_note, reviewed_by, reviewed_at, created_at, updated_at, vat_validated, vat_validated_at, vat_validated_name, vat_validation_source, roles:requested_role_id(name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return ((data ?? []) as unknown as RawRow[]).map(rowToRequest);
}

/** Admin: list every request for a target user. */
export async function listRoleUpgradeRequestsForUser(targetUserId: string): Promise<RoleUpgradeRequest[]> {
  return listMyRoleUpgradeRequests(targetUserId);
}

/** Admin: list pending requests across the platform. */
export async function listPendingRoleUpgradeRequests(): Promise<RoleUpgradeRequest[]> {
  const { data } = await supabase
    .from('role_upgrade_requests')
    .select('id, user_id, requested_role_id, justification, status, admin_note, reviewed_by, reviewed_at, created_at, updated_at, vat_validated, vat_validated_at, vat_validated_name, vat_validation_source, roles:requested_role_id(name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  return ((data ?? []) as unknown as RawRow[]).map(rowToRequest);
}

export async function approveRoleUpgradeRequest(args: { requestId: string; adminNote?: string }) {
  return supabase.functions.invoke('role-upgrade-requests', {
    body: { action: 'approve', request_id: args.requestId, admin_note: args.adminNote ?? '' },
  });
}

export async function rejectRoleUpgradeRequest(args: { requestId: string; adminNote?: string }) {
  return supabase.functions.invoke('role-upgrade-requests', {
    body: { action: 'reject', request_id: args.requestId, admin_note: args.adminNote ?? '' },
  });
}

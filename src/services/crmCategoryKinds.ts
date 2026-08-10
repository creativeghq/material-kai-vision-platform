/**
 * The CRM category vocabulary and the one rule that governs who may write membership.
 *
 * Split out of `crmCategoriesService` so it carries no Supabase client: the rule below is
 * consumed by pickers and pinned by a unit test, neither of which should need a live client
 * (importing one throws at module load without env). The service re-exports everything here,
 * so existing `from '@/services/crmCategoriesService'` imports are unaffected.
 */

/** `role` (workspace_members.role) and `employment` (hr_employees) are AUTO kinds: their members
 *  are derived by crm_resync_auto_category_members, never typed by hand. */
export type CrmCategoryKind =
  | 'professional_type' | 'role' | 'employment'
  | 'manual' | 'industry' | 'lead_status' | 'lead_source';

export type CrmCategoryMemberKind = 'platform_user' | 'crm_contact' | 'crm_company';

/** The kinds `crm_resync_auto_category_members` owns. Never offer these for hand assignment. */
export const AUTO_CATEGORY_KINDS: readonly CrmCategoryKind[] = ['role', 'employment'];

/**
 * May a member be added to this kind of category by hand?
 *
 * No for the AUTO kinds: the resync derives their membership from `workspace_members.role` /
 * `hr_employees` and only ever deletes rows it wrote itself (`source='auto'`), so a manual row
 * is permanent — a category that says "Sales Managers" while holding someone who isn't one.
 */
export function isHandAssignableKind(kind: CrmCategoryKind): boolean {
  return !AUTO_CATEGORY_KINDS.includes(kind);
}

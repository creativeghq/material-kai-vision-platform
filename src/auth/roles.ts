/**
 * Single source of truth for the GLOBAL ACCOUNT TIER names + role checks.
 *
 * This is `public.roles` — what kind of account someone has platform-wide (operator, supplier,
 * architect…), set by a platform operator. It is NOT where team membership lives: "runs HR", "on the
 * warehouse team", "sales manager" are per-workspace facts and belong to `workspace_members.role`,
 * catalogued in `./workspaceRoles.ts` and assigned from Profile → Team. Adding a functional role
 * here would make it true in every workspace the user belongs to.
 *
 * Rule: ALL role literals + role checks must come from this file.
 * Never write `role === 'admin'` again — use `isAdmin(role)`.
 *
 * Mirrors the values in `public.roles` — after 2026-07-31 that is exactly `admin`, `supplier`,
 * `architect` and `user`: the two tiers `role_upgrade_requests` accepts, plus the operator flag and
 * the baseline. `sales` and `finance` used to sit here and were removed; they are workspace roles
 * (`accountant`, `sales`, `sales_manager`) and only ever meant something within one workspace.
 *
 * Both `admin` and `super_admin` are recognised as platform admins; `workspace_members.role` can
 * also hold `owner`, treated equivalently for admin checks. `OWNER`, `FACTORY` and `DEALER` below
 * are not rows in `public.roles` — they are legacy/workspace values kept so old data resolves.
 */

export const ROLES = {
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin', // legacy — merged into ADMIN (2026-06); kept for old data
  OWNER: 'owner',
  SUPPLIER: 'supplier',
  ARCHITECT: 'architect',
  USER: 'user',
  // legacy account roles, merged into SUPPLIER (2026-06); kept so old rows resolve
  FACTORY: 'factory',
  DEALER: 'dealer',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

/**
 * Roles that can administer the platform (toggle modules, run admin pages, …).
 * Typed as `readonly string[]` — directly usable with Supabase `.in('role', …)`
 * without further casting.
 */
export const ADMIN_ROLES: readonly string[] = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.OWNER];

/** Workspace-level roles that count as "factory or above" (factory analytics, etc.). */
export const FACTORY_OR_ADMIN_ROLES: readonly string[] = [
  ROLES.FACTORY,
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
  ROLES.OWNER,
];

export function isAdmin(role: string | null | undefined): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

export function isFactoryOrAdmin(role: string | null | undefined): boolean {
  return !!role && FACTORY_OR_ADMIN_ROLES.includes(role);
}

/**
 * Single source of truth for platform role names + role checks.
 *
 * Rule: ALL role literals + role checks must come from this file.
 * Never write `role === 'admin'` again — use `isAdmin(role)`.
 *
 * Mirrors the values in `public.roles`. Both `admin` and `super_admin`
 * are recognised as platform admins; workspace_members.role can also
 * hold `owner`, treated equivalently for admin checks.
 */

export const ROLES = {
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin', // legacy — merged into ADMIN (2026-06); kept for old data
  OWNER: 'owner',
  SUPPLIER: 'supplier',
  ARCHITECT: 'architect',
  FINANCE: 'finance',
  SALES: 'sales',
  SALES_MANAGER: 'sales_manager',
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

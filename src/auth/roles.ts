/**
 * Single source of truth for platform role names + role checks.
 *
 * Why this file exists: before this, `'admin'` was a raw string literal
 * scattered across hooks, guards, services, and RLS comments. Some
 * call-sites accepted `'owner'`, others `'super_admin'`, others both.
 * That drift makes it impossible to add a new role (e.g.
 * `quote_manager` for the Quotes module) without finding and updating
 * 10+ unrelated files.
 *
 * Rule: ALL role literals + role checks must come from this file.
 * Never write `role === 'admin'` again — use `isAdmin(role)`.
 *
 * Mirrors the seed values in `public.roles`:
 *   admin, manager, factory, dealer, user, super_admin (legacy),
 *   owner (legacy alias for the workspace tier).
 */

export const ROLES = {
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
  OWNER: 'owner',
  MANAGER: 'manager',
  FACTORY: 'factory',
  DEALER: 'dealer',
  USER: 'user',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

/** Roles that can administer the platform (toggle modules, run admin pages, …). */
export const ADMIN_ROLES: ReadonlyArray<Role> = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.OWNER];

/** Workspace-level roles that count as "factory or above" (factory analytics, etc.). */
export const FACTORY_OR_ADMIN_ROLES: ReadonlyArray<Role> = [
  ROLES.FACTORY,
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
  ROLES.OWNER,
];

export function isAdmin(role: string | null | undefined): boolean {
  if (!role) return false;
  return (ADMIN_ROLES as ReadonlyArray<string>).includes(role);
}

export function isFactoryOrAdmin(role: string | null | undefined): boolean {
  if (!role) return false;
  return (FACTORY_OR_ADMIN_ROLES as ReadonlyArray<string>).includes(role);
}

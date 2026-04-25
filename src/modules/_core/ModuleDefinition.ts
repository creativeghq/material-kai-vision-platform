import type { LazyExoticComponent, ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface ModuleNavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  location: 'sidebar' | 'admin-dashboard';
  adminCategory?: string;
  adminDescription?: string;
  adminCount?: string;
}

export interface ModuleRoute {
  path: string;
  component: LazyExoticComponent<ComponentType<unknown>>;
  requireAdmin?: boolean;
}

export interface ModuleManifest {
  slug: string;
  name: string;
  description: string;
  category: string;
  priceTier: 'free' | 'pro' | 'enterprise';
  icon: string;
  version: string;
}

/**
 * Lazy subscription to a notification-bus event.
 * Wired up at module-registry init when the module is enabled.
 */
export interface ModuleSubscriber {
  /** Event name (matches keys of `NotificationEvents`). */
  event: string;
  /** Lazy import → returns the listener fn that gets attached to the bus. */
  listener: () => Promise<(payload: unknown) => void | Promise<void>>;
}

/**
 * A component the module wants rendered in the platform-wide Header
 * action row (right-aligned cluster next to the avatar). Auto-mounted
 * when the module is enabled, removed when disabled.
 */
export interface ModuleHeaderAction {
  /** Stable id used as React key. Must be unique per module. */
  id: string;
  /** Lazy-loaded component. Mounted with no props — read its own state internally. */
  component: LazyExoticComponent<ComponentType<unknown>>;
}

export interface ModuleDefinition {
  manifest: ModuleManifest;
  routes: ModuleRoute[];
  navItems: ModuleNavItem[];
  /**
   * Optional: notification-bus subscriptions this module wants registered
   * when it's enabled. Auto-attached + auto-detached by the registry on
   * module toggle. Set to `undefined` for modules that don't subscribe.
   */
  subscribers?: ModuleSubscriber[];
  /**
   * Optional: components contributed to the platform Header action row.
   * Used by the In-App Notifications module to inject the bell-icon panel,
   * but available to any module that needs a global header surface.
   */
  headerActions?: ModuleHeaderAction[];
}

export interface ModuleRow {
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  price_tier: string | null;
  icon: string | null;
  version: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

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

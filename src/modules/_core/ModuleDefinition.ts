import type { LazyExoticComponent, ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface ModuleNavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /**
   * Where this nav item surfaces:
   * - `'admin-dashboard'` → a card on `/admin` (operator surface).
   * - `'workspace'` → the tenant **App Launcher** (#251). Shown only when the
   *   module is globally enabled AND entitled to the active workspace. This is how optional
   *   modules (HR, Docs, Real Estate, …) appear WITHOUT cluttering the top nav.
   * - `'sidebar'` → legacy/unused; kept for back-compat.
   */
  location: 'sidebar' | 'admin-dashboard' | 'workspace';
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
  /**
   * Slug of the module this one extends (a sub-module / add-on). When set, admin/tenant
   * surfaces group this module UNDER its parent instead of as a standalone tile — e.g.
   * `payments-stripe`/`payments-viva` → `payments`, `real-estate-*` → `real-estate`.
   * Presentation only; there is no DB parent/child column and entitlement is per-slug.
   */
  parent?: string;
  /**
   * Capabilities the module provides — used by other modules to detect what's
   * available and route work to the right place. Add new capability flags here
   * as new module integration patterns emerge; the provider-registry pattern
   * (see `useInvoiceProvider`, `useActivePaymentProviders`) reads from this set.
   *
   * `invoicing` — this module handles invoice creation end-to-end (typically
   *   an ERP integration like Xero, QuickBooks). When true and the
   *   module is enabled, the built-in Payments invoicer defers to it.
   *   **Single-winner**: only one provider wins at a time (alphabetical sort
   *   on ties; see `resolveInvoiceProvider`).
   *
   * `payments` — this module accepts payments from customers (Stripe today;
   *   future PayPal / Adyen / bank-transfer / Viva; ERPs that bring native
   *   payment processing). **Multi-provider**: every enabled module with this
   *   flag is listed on the parent Payments module's Providers tab; admins
   *   may operate multiple simultaneously.
   */
  provides?: {
    invoicing?: boolean;
    payments?: boolean;
  };
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

/**
 * Extra tab on the module's auto-generated Settings page
 * (`/admin/modules/<slug>/settings`). The Keys tab (SecretsManagerCard) is
 * always present; modules with feature-level settings (PDF templates, sender
 * config, billing defaults, etc.) contribute panels here so admins find
 * every knob for the module in one place.
 *
 * The panel component is mounted with `embedded` prop set to `true` so it
 * can suppress its own PageHeader / outer padding — accept the prop in your
 * component signature: `({ embedded }: { embedded?: boolean })`.
 */
export interface ModuleSettingsPanel {
  /** Stable id used as the Tabs value + React key. Must be unique per module. */
  id: string;
  /** Display label on the tab. */
  label: string;
  /** Optional Lucide icon shown before the label. */
  icon?: LucideIcon;
  /** Lazy-loaded panel component. Receives `embedded: true` when mounted. */
  component: LazyExoticComponent<ComponentType<{ embedded?: boolean }>>;
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
  /**
   * Optional: extra tabs the module contributes to its auto-generated
   * `/admin/modules/<slug>/settings` page. The "Keys" tab (API credentials
   * via SecretsManagerCard) is always rendered; these append after it.
   *
   * Each panel component should accept `{ embedded?: boolean }` and suppress
   * its own PageHeader / outer padding when `embedded === true`.
   */
  settingsPanels?: ModuleSettingsPanel[];
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

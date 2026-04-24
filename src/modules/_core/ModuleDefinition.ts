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

export interface ModuleDefinition {
  manifest: ModuleManifest;
  routes: ModuleRoute[];
  navItems: ModuleNavItem[];
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

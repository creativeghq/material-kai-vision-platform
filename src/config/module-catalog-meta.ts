// Shared presentation metadata for a module slug — icon, Hub grouping, and a human description.
//
// The `modules` table carries catalog columns (summary/description/icon) but they're sparsely
// filled and `icon` is a bare string. The curated sources of truth for how a module LOOKS in the
// product are already in the codebase: SIDEBAR_NAV_ITEMS (icon + hub + description for every app)
// and each module's manifest. This resolver layers them so the top-bar App Launcher and
// Profile → Modules render the same icon/copy for the same module, with the DB as an override.
import type { LucideIcon } from 'lucide-react';
import {
  Bell, BookOpen, BookText, Boxes, Briefcase, Building2, Contact, CreditCard, FileSignature,
  FileText, FolderKanban, Inbox, Mail, Megaphone, MessageSquare, Package, Search, Share2, Star,
  TrendingUp, Users, Wallet, Workflow,
} from 'lucide-react';
import { SIDEBAR_NAV_ITEMS, HUBS, type HubId, type Hub } from '@/config/nav-items';
import { registeredModules } from '@/modules/_core';

/** Lucide names referenced by `modules.icon`, resolved explicitly so the bundle stays tree-shaken. */
const DB_ICONS: Record<string, LucideIcon> = {
  bell: Bell, bookopen: BookOpen, booktext: BookText, briefcase: Briefcase, building2: Building2,
  contact: Contact, creditcard: CreditCard, filesignature: FileSignature, filetext: FileText,
  folderkanban: FolderKanban, inbox: Inbox, mail: Mail, megaphone: Megaphone,
  messagesquare: MessageSquare, package: Package, search: Search, share2: Share2,
  shoppingcart: Boxes, star: Star, trendingup: TrendingUp, users: Users, wallet: Wallet,
  warehouse: Package, workflow: Workflow,
};

/** slug → the nav item that surfaces it (first wins; several apps can share a module slug). */
const NAV_BY_SLUG = new Map(
  SIDEBAR_NAV_ITEMS.filter((i) => i.moduleSlug).map((i) => [i.moduleSlug as string, i] as const),
);

export interface ModuleMeta {
  icon: LucideIcon;
  /** Hub this module belongs to, or null when it has no launcher app (support/integration modules). */
  hub: Hub | null;
  /** Best available one-liner. Empty string when nothing is known — never invented. */
  description: string;
  /** In-app route when the module surfaces an app, else undefined. */
  path?: string;
}

/**
 * Resolve how a module should be presented. `row` is the optional `modules` catalog row —
 * its `summary` wins over the nav/manifest copy, and its `icon` is the last-resort icon.
 */
export function resolveModuleMeta(
  slug: string,
  row?: { summary?: string | null; description?: string | null; icon?: string | null },
): ModuleMeta {
  const nav = NAV_BY_SLUG.get(slug);
  const manifest = registeredModules.find((m) => m.manifest.slug === slug)?.manifest;
  const dbIcon = row?.icon ? DB_ICONS[row.icon.toLowerCase()] : undefined;

  return {
    icon: nav?.icon ?? dbIcon ?? Package,
    hub: (nav?.hub ? HUBS.find((h) => h.id === nav.hub) : undefined) ?? null,
    description: row?.summary || nav?.description || manifest?.description || row?.description || '',
    path: nav?.path,
  };
}

/** Hub order for grouped rendering, with the catch-all bucket last. */
export function hubOrder(hubId: HubId | null): number {
  if (!hubId) return HUBS.length;
  const idx = HUBS.findIndex((h) => h.id === hubId);
  return idx === -1 ? HUBS.length : idx;
}

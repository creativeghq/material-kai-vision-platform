/**
 * The record kinds the platform can find and open, and the gates that must hold before it offers
 * to. Pure config — no Supabase client, no network — because two different things need it:
 *
 *   • `globalSearchService` (the ⌘K palette's data layer), which also does the RPC round trip;
 *   • `config/recordLinks.ts`, which turns an id in an agent tool payload into somewhere to go.
 *
 * It used to live entirely inside the service, so the second consumer would have pulled the
 * Supabase client into a config module — and with it a module-load `throw` in every test and every
 * surface that only wanted to know where a company opens.
 *
 * `globalSearchService` re-exports everything here, so nothing that already imported these names
 * had to move.
 *
 * @see tests/unit/globalSearchKinds.test.ts — holds the catalogue honest.
 */
import {
  BookOpen,
  Building2,
  Contact,
  DraftingCompass,
  FileText,
  FolderKanban,
  Handshake,
  Home,
  Inbox,
  Layers,
  Mail,
  MessageSquare,
  Package,
  Palette,
  Receipt,
  ShoppingCart,
  User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { PRODUCT_BROWSE_ANY, type Capability } from '@/auth/capabilities';

export type GlobalSearchKind =
  | 'person'
  | 'company'
  | 'contact'
  | 'deal'
  | 'product'
  | 'project'
  | 'moodboard'
  | 'quote'
  | 'order'
  | 'invoice'
  | 'property'
  | 'catalog'
  | 'blueprint'
  | 'template'
  | 'email_template'
  | 'conversation'
  | 'inbox_thread';

export interface GlobalSearchHit {
  kind: GlobalSearchKind;
  id: string;
  title: string;
  subtitle: string | null;
  /** Short status/relationship tag rendered beside the row ("Team", "Supplier", "draft"). */
  badge: string | null;
  /** 0 = exact title match, 1 = prefix, 2 = contains. Drives group order. */
  matchRank: number;
  /** Product thumbnail, resolved separately — see `attachProductImages`. */
  imageUrl?: string | null;
}

/** The two role facts the destination routes actually branch on. */
export interface SearchRouteContext {
  isPlatformOperator: boolean;
  isWorkspaceManager: boolean;
}

export interface GlobalSearchKindSpec {
  kind: GlobalSearchKind;
  /** Group heading in the palette. */
  label: string;
  icon: LucideIcon;
  /**
   * Visible when the persona holds ANY of these. Omitted = no capability gate.
   *
   * This MUST match the guard on whatever `route` returns. Offering a result that opens onto a
   * permission wall is the same broken process as sending a person search to the catalogue — the
   * user still ends up somewhere they did not ask to be.
   */
  requireAnyCapability?: readonly Capability[];
  /** Paid-module gate. Same slug vocabulary as `nav-items.ts`. */
  moduleSlug?: string;
  /**
   * Owner/admin of the ACTIVE workspace — the `requireWorkspaceAdmin` rung on a module route,
   * which is not a capability (it is standing in one workspace, `workspace_members.role`).
   */
  requireWorkspaceManager?: boolean;
  /** Where a hit of this kind opens. */
  route: (hit: GlobalSearchHit, ctx: SearchRouteContext) => string;
}

/**
 * Every kind the palette can return. Array order is the TIE-BREAK for group order only —
 * `groupHits` floats the best match to the top, because the first row in the palette is the one
 * Enter opens.
 */
export const GLOBAL_SEARCH_KINDS: readonly GlobalSearchKindSpec[] = [
  {
    kind: 'person',
    label: 'People',
    icon: User,
    // No capability gate on purpose: `search_workspace_people` self-guards server-side (your
    // teammates if you are a workspace member, any account if you are a platform operator), and
    // both destinations below are reachable by anyone signed in.
    route: (hit, ctx) =>
      ctx.isPlatformOperator ? `/admin/crm/users/${hit.id}` : `/u/${hit.id}`,
  },
  {
    kind: 'company',
    label: 'Companies',
    icon: Building2,
    requireAnyCapability: ['crm.view'],
    moduleSlug: 'crm',
    route: (hit) => `/crm/companies/${hit.id}`,
  },
  {
    kind: 'contact',
    label: 'Contacts',
    icon: Contact,
    requireAnyCapability: ['crm.view'],
    moduleSlug: 'crm',
    route: (hit) => `/crm/contacts/${hit.id}`,
  },
  {
    kind: 'deal',
    label: 'Deals',
    icon: Handshake,
    requireAnyCapability: ['crm.view'],
    moduleSlug: 'deals',
    route: (hit) => `/crm/deals/${hit.id}`,
  },
  {
    kind: 'product',
    label: 'Products',
    icon: Package,
    requireAnyCapability: PRODUCT_BROWSE_ANY,
    route: (hit) => `/discover?product=${hit.id}`,
  },
  {
    kind: 'project',
    label: 'Projects',
    icon: FolderKanban,
    // Mirrors the nav item: entitlement only, no capability — `/projects/:id` is wrapped in
    // EntitlementGuard and nothing else.
    moduleSlug: 'projects',
    route: (hit) => `/projects/${hit.id}`,
  },
  {
    kind: 'moodboard',
    label: 'Moodboards',
    icon: Palette,
    // `/moodboard/:id` carries AuthGuard and nothing else, and so does the nav item. RLS scopes
    // the rows to your own boards plus any on a project you collaborate on.
    route: (hit) => `/moodboard/${hit.id}`,
  },
  {
    kind: 'quote',
    label: 'Quotes',
    icon: FileText,
    requireAnyCapability: ['quotes.use'],
    moduleSlug: 'quotes',
    // `/quotes/manage/:id` carries requireWorkspaceAdmin, so anyone else must get the customer
    // view of the same quote rather than "Not your settings to change".
    route: (hit, ctx) =>
      ctx.isWorkspaceManager ? `/quotes/manage/${hit.id}` : `/quotes/${hit.id}`,
  },
  {
    kind: 'order',
    label: 'Orders',
    icon: ShoppingCart,
    requireAnyCapability: ['finance.manage'],
    moduleSlug: 'sales-finance',
    route: (hit) => `/finance/orders/${hit.id}`,
  },
  {
    kind: 'invoice',
    label: 'Invoices',
    icon: Receipt,
    requireAnyCapability: ['finance.manage'],
    moduleSlug: 'sales-finance',
    route: (hit) => `/finance/invoices/${hit.id}`,
  },
  {
    kind: 'property',
    label: 'Properties',
    icon: Home,
    requireAnyCapability: ['realestate.view'],
    moduleSlug: 'real-estate',
    route: (hit) => `/properties/${hit.id}`,
  },
  {
    kind: 'catalog',
    label: 'Catalogs',
    icon: BookOpen,
    // `/catalogs/:id` is EntitlementGuard('presentation-catalogs') + WorkspaceAdminGuard.
    moduleSlug: 'presentation-catalogs',
    requireWorkspaceManager: true,
    route: (hit) => `/catalogs/${hit.id}`,
  },
  {
    kind: 'blueprint',
    label: 'Blueprints',
    icon: DraftingCompass,
    // AuthGuard only, like its nav item. Platform starters are openable by every workspace.
    route: (hit) => `/blueprints/${hit.id}`,
  },
  {
    kind: 'template',
    label: 'Templates',
    icon: Layers,
    // Deliberately ungated, matching the nav item: every persona that can create a record can
    // reuse one.
    route: (hit) => `/templates/${hit.id}`,
  },
  {
    kind: 'email_template',
    label: 'Email templates',
    icon: Mail,
    // `/emails/templates/:id/edit` is EntitlementGuard('email') + WorkspaceAdminGuard.
    moduleSlug: 'email',
    requireWorkspaceManager: true,
    route: (hit) => `/emails/templates/${hit.id}/edit`,
  },
  {
    kind: 'conversation',
    label: 'Agent chats',
    icon: MessageSquare,
    // `/agent-hub` is AuthGuard only, and AgentHub already reads `?conversation=`. RLS scopes
    // the rows to your own chats.
    route: (hit) => `/agent-hub?conversation=${hit.id}`,
  },
  {
    kind: 'inbox_thread',
    label: 'Inbox',
    icon: Inbox,
    requireAnyCapability: ['inbox.use'],
    moduleSlug: 'inbox',
    // InboxPage already seeds its open thread from `?thread=`.
    route: (hit) => `/inbox?thread=${hit.id}`,
  },
];

export const SPEC_BY_KIND = new Map<GlobalSearchKind, GlobalSearchKindSpec>(
  GLOBAL_SEARCH_KINDS.map((spec) => [spec.kind, spec]),
);

const CATALOGUE_ORDER = new Map<GlobalSearchKind, number>(
  GLOBAL_SEARCH_KINDS.map((spec, i) => [spec.kind, i]),
);

export interface KindGateContext {
  can: (capability: Capability) => boolean;
  isModuleAvailable: (slug: string) => boolean;
  isWorkspaceManager: boolean;
}

/**
 * The kinds this persona has a surface for. The same gates the route builder applies, for the
 * same reason: a result nobody can open is worse than no result.
 */
export function allowedSearchKinds(ctx: KindGateContext): GlobalSearchKind[] {
  return GLOBAL_SEARCH_KINDS.filter((spec) => {
    if (spec.requireAnyCapability?.length && !spec.requireAnyCapability.some(ctx.can)) return false;
    if (spec.moduleSlug && !ctx.isModuleAvailable(spec.moduleSlug)) return false;
    if (spec.requireWorkspaceManager && !ctx.isWorkspaceManager) return false;
    return true;
  }).map((spec) => spec.kind);
}

export interface GlobalSearchGroup {
  spec: GlobalSearchKindSpec;
  hits: GlobalSearchHit[];
}

function bestRank(hits: GlobalSearchHit[]): number {
  return hits.reduce((best, hit) => Math.min(best, hit.matchRank), Number.POSITIVE_INFINITY);
}

/**
 * Group hits by kind, best match first.
 *
 * Group order is not cosmetic: the palette's first row is what Enter opens, so ordering by match
 * quality is what makes Enter land on the thing the user typed. Catalogue order breaks ties, so
 * equally-good matches never shuffle between keystrokes.
 */
export function groupHits(hits: readonly GlobalSearchHit[]): GlobalSearchGroup[] {
  const byKind = new Map<GlobalSearchKind, GlobalSearchHit[]>();
  for (const hit of hits) {
    const existing = byKind.get(hit.kind);
    if (existing) existing.push(hit);
    else byKind.set(hit.kind, [hit]);
  }

  const groups: GlobalSearchGroup[] = [];
  for (const [kind, kindHits] of byKind) {
    const spec = SPEC_BY_KIND.get(kind);
    if (spec) groups.push({ spec, hits: kindHits });
  }

  return groups.sort(
    (a, b) =>
      bestRank(a.hits) - bestRank(b.hits) ||
      (CATALOGUE_ORDER.get(a.spec.kind) ?? 99) - (CATALOGUE_ORDER.get(b.spec.kind) ?? 99),
  );
}

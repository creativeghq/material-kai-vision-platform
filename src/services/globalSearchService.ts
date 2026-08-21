/**
 * The top-bar search palette's data layer — "find me anything in this workspace".
 *
 * Before this, the palette searched exactly two things: product NAMES and nav-item LABELS. So a
 * query that was neither — a person, a customer, an order number — matched nothing, and the only
 * item left standing in the palette was the "Smart search materials" action. cmdk highlights the
 * first item, so Enter ran it: type a colleague's name, land on the product catalogue. The
 * conversion was silent and there was no general search anywhere to fall back to (`/search` and
 * `/search-hub` both redirect to the product smart search).
 *
 * Everything now comes from ONE round trip — `public.global_search`, a SECURITY INVOKER function,
 * so each table's existing RLS stays the tenancy boundary and the palette can never surface a row
 * the caller could not already fetch. `kinds` narrows what is asked for; it is a filter for the
 * persona's surfaces, never an authorization gate.
 *
 * @see tests/unit/globalSearchKinds.test.ts — holds the catalogue honest.
 */
import {
  Building2,
  Contact,
  FileText,
  FolderKanban,
  Handshake,
  Home,
  Package,
  Receipt,
  ShoppingCart,
  User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { PRODUCT_BROWSE_ANY, type Capability } from '@/auth/capabilities';

export type GlobalSearchKind =
  | 'person'
  | 'company'
  | 'contact'
  | 'deal'
  | 'product'
  | 'project'
  | 'quote'
  | 'order'
  | 'invoice'
  | 'property';

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
];

const SPEC_BY_KIND = new Map<GlobalSearchKind, GlobalSearchKindSpec>(
  GLOBAL_SEARCH_KINDS.map((spec) => [spec.kind, spec]),
);

const CATALOGUE_ORDER = new Map<GlobalSearchKind, number>(
  GLOBAL_SEARCH_KINDS.map((spec, i) => [spec.kind, i]),
);

export interface KindGateContext {
  can: (capability: Capability) => boolean;
  isModuleAvailable: (slug: string) => boolean;
}

/**
 * The kinds this persona has a surface for. Same two gates `filterNavItems` applies, for the same
 * reason: a result nobody can open is worse than no result.
 */
export function allowedSearchKinds(ctx: KindGateContext): GlobalSearchKind[] {
  return GLOBAL_SEARCH_KINDS.filter((spec) => {
    if (spec.requireAnyCapability?.length && !spec.requireAnyCapability.some(ctx.can)) return false;
    if (spec.moduleSlug && !ctx.isModuleAvailable(spec.moduleSlug)) return false;
    return true;
  }).map((spec) => spec.kind);
}

/** Shortest query the server will act on — mirrors the length guard inside `global_search`. */
export const MIN_QUERY_LENGTH = 2;

export async function globalSearch(
  workspaceId: string | null,
  query: string,
  kinds: readonly GlobalSearchKind[],
  perKind = 5,
): Promise<GlobalSearchHit[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH || kinds.length === 0) return [];

  // Not in the generated types yet (`types:generate` needs an access token this checkout lacks).
  const { data, error } = await (supabase as any).rpc('global_search', {
    p_workspace_id: workspaceId,
    p_query: q,
    p_kinds: kinds,
    p_per_kind: perKind,
  });
  if (error) throw error;

  return ((data ?? []) as any[])
    .filter((row) => SPEC_BY_KIND.has(row?.kind))
    .map((row) => ({
      kind: row.kind as GlobalSearchKind,
      id: String(row.id),
      title: row.title || 'Untitled',
      subtitle: row.subtitle ?? null,
      badge: row.badge ?? null,
      matchRank: typeof row.match_rank === 'number' ? row.match_rank : 2,
    }));
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

/**
 * Resolve thumbnails for product hits — the one kind the palette showed an image for before this
 * became a general search, and worth a second query to keep. Failure is silent: a missing
 * thumbnail falls back to the kind icon, which is not worth losing the whole palette over.
 */
export async function attachProductImages(hits: GlobalSearchHit[]): Promise<GlobalSearchHit[]> {
  const ids = hits.filter((hit) => hit.kind === 'product').map((hit) => hit.id);
  if (ids.length === 0) return hits;

  try {
    const { getProductImageUrl, PRODUCT_IMAGE_SELECT } = await import('@/utils/productMetadata');
    const { data } = await supabase
      .from('products')
      .select(`id, metadata, ${PRODUCT_IMAGE_SELECT}`)
      .in('id', ids);

    const byId = new Map<string, string | null>(
      ((data ?? []) as any[]).map((row) => [String(row.id), getProductImageUrl(row)]),
    );
    return hits.map((hit) =>
      hit.kind === 'product' ? { ...hit, imageUrl: byId.get(hit.id) ?? null } : hit,
    );
  } catch {
    return hits;
  }
}

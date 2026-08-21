/**
 * Everything booked against one CRM party — company or person — behind one section rail.
 *
 * It replaces the Projects tab and absorbs Warranties and (on a contact) Property, because those
 * were three tabs answering one question badly: "what is going on with this client?". A project,
 * the moodboard that won it, the quote that came out of it, the order that fulfilled it and the
 * warranty that followed are one story, and the record page told it in five places.
 *
 * WHY A RAIL AND NOT A STACK
 * --------------------------
 * The first cut stacked every group vertically. For a brand-new client that reads fine — for an
 * active one it is twelve card headers and several hundred rows in a single scroll, which is a
 * worse answer than the five tabs it replaced. `HubSideNav` is the platform's archetype for
 * exactly this (see CLAUDE.md: build the archetype, do not re-derive it per page): the rail
 * carries the counts, one section renders at a time, and it collapses to full width below `lg`.
 *
 * ONE QUERY, DERIVED IN SQL
 * -------------------------
 * `get_party_work(kind, id)` returns the whole union already typed and sorted. The alternative —
 * a card per entity with its own fetch, its own loading state and its own idea of what "status"
 * means — is what produced the scattering in the first place, and it is how a thirteenth entity
 * type ends up half-wired. Adding one is one UNION branch in the function; it appears here
 * automatically, needing only a label and a route below.
 *
 * The function deliberately does NOT return a url. Routes move — `/admin/finance` never existed
 * and six call sites linked to it anyway — so the mapping lives here in the client where
 * `deepLinkTargets.test.ts` can see it, not baked into a database function nothing checks.
 *
 * WHAT IS A `panel` AND WHAT IS A `kind`
 * --------------------------------------
 * A `kind` is a derived, read-only list straight out of the union. A `panel` is a real management
 * surface the pages already own (Projects, Equipment, the property buyer profile) — passed in as
 * a slot so this component never has to know their prop shapes, and so it stays importable
 * without dragging the projects and real-estate modules in behind it. A panel's kind is excluded
 * from the derived side via `excludeKinds`, or the same rows would be listed twice.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  FolderKanban, Palette, Home, KeyRound, Handshake, Tag, FileText, ShoppingCart,
  Receipt, FileSignature, Wrench, Loader2, Briefcase, type LucideIcon,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { HubEmptyState, HubSideNav, type HubNavGroup } from '@/components/core/hub';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';
import { statusTone } from '@/utils/statusTone';
import { humanizeLabel } from '@/utils/humanize';
import { FINANCE_BASE } from '@/modules/finance/routes';

/** One row of `get_party_work`. */
export interface PartyWorkRow {
  kind: string;
  id: string;
  parent_id: string | null;
  title: string | null;
  status: string | null;
  occurred_at: string | null;
  amount: number | null;
  currency: string | null;
  role: string | null;
}

/** A management surface the host page owns, mounted as its own section in the rail. */
export interface PartyWorkPanel {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Rail grouping. Defaults to the same buckets the derived kinds use. */
  group?: string;
  node: React.ReactNode;
}

const GROUP_DELIVERY   = 'Delivery';
const GROUP_COMMERCIAL = 'Commercial';
const GROUP_PROPERTY   = 'Property';
const GROUP_AFTER      = 'After sale';

/**
 * How each derived kind is presented, where it sits in the rail, and where a row opens.
 *
 * `href` takes the row so a SATELLITE can open its parent: a tenancy's own id is not a route, and
 * linking `/properties/<tenancy_id>` would render the catch-all NotFound rather than fail loudly.
 */
const KINDS: Record<string, {
  label: string; icon: LucideIcon; group: string; href?: (r: PartyWorkRow) => string | null;
}> = {
  moodboard:      { label: 'Moodboards',      icon: Palette,       group: GROUP_DELIVERY,   href: (r) => `/moodboard/${r.id}` },
  deal:           { label: 'Deals',           icon: Briefcase,     group: GROUP_COMMERCIAL, href: (r) => `/crm/deals/${r.id}` },
  quote:          { label: 'Quotes',          icon: FileText,      group: GROUP_COMMERCIAL, href: (r) => `/quotes/manage/${r.id}` },
  order:          { label: 'Orders',          icon: ShoppingCart,  group: GROUP_COMMERCIAL, href: (r) => `${FINANCE_BASE}/orders/${r.id}` },
  invoice:        { label: 'Invoices',        icon: Receipt,       group: GROUP_COMMERCIAL, href: (r) => `${FINANCE_BASE}/invoices/${r.id}` },
  contract:       { label: 'Contracts',       icon: FileSignature, group: GROUP_COMMERCIAL, href: () => '/contracts' },
  property:       { label: 'Listings',        icon: Home,          group: GROUP_PROPERTY,   href: (r) => `/properties/${r.id}` },
  tenancy:        { label: 'Tenancies',       icon: KeyRound,      group: GROUP_PROPERTY,   href: (r) => (r.parent_id ? `/properties/${r.parent_id}` : null) },
  property_sale:  { label: 'Property sales',  icon: Handshake,     group: GROUP_PROPERTY,   href: (r) => (r.parent_id ? `/properties/${r.parent_id}` : null) },
  property_offer: { label: 'Property offers', icon: Tag,           group: GROUP_PROPERTY,   href: (r) => (r.parent_id ? `/properties/${r.parent_id}` : null) },
  project:        { label: 'Projects',        icon: FolderKanban,  group: GROUP_DELIVERY,   href: (r) => `/projects/${r.id}` },
  asset:          { label: 'Equipment',       icon: Wrench,        group: GROUP_AFTER },
};

/** Rail order. Anything the function returns that is not named here is appended, never dropped. */
const KIND_ORDER = [
  'project', 'moodboard', 'deal', 'quote', 'order', 'invoice', 'contract',
  'property', 'tenancy', 'property_sale', 'property_offer', 'asset',
];
const GROUP_ORDER = [GROUP_DELIVERY, GROUP_COMMERCIAL, GROUP_PROPERTY, GROUP_AFTER];

/**
 * A rail entry. `panel` renders a surface the host page owns; `kind` renders a derived list.
 * Discriminated so the content pane cannot accidentally treat one as the other.
 */
type Section =
  | { sort: 'panel'; id: string; label: string; icon: LucideIcon; group: string; node: React.ReactNode; count?: undefined }
  | { sort: 'kind';  id: string; label: string; icon: LucideIcon; group: string; kind: string; count: number };

interface Props {
  partyKind: 'company' | 'contact';
  partyId: string;
  /** Management surfaces owned by the host page — see the header note on panels vs kinds. */
  panels?: PartyWorkPanel[];
  /** Derived kinds a `panel` already covers, so the same rows are not listed twice. */
  excludeKinds?: string[];
  refreshKey?: number;
}

export const PartyWorkTab: React.FC<Props> = ({
  partyKind, partyId, panels, excludeKinds, refreshKey = 0,
}) => {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<PartyWorkRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Cast: `get_party_work` post-dates the last types.ts generation, and regenerating is
        // blocked locally (no Supabase access token) — hand-editing types.ts is worse.
        const { data, error } = await (supabase as any).rpc('get_party_work', {
          p_party_kind: partyKind,
          p_party_id: partyId,
        });
        if (error) throw error;
        if (!cancelled) setRows((data ?? []) as PartyWorkRow[]);
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          toast({ title: 'Failed to load work', description: (e as Error).message, variant: 'destructive' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [partyKind, partyId, refreshKey, toast]);

  const excluded = React.useMemo(() => new Set(excludeKinds ?? []), [excludeKinds]);

  const byKind = React.useMemo(() => {
    const by = new Map<string, PartyWorkRow[]>();
    for (const r of rows) {
      if (excluded.has(r.kind)) continue;
      if (!by.has(r.kind)) by.set(r.kind, []);
      by.get(r.kind)!.push(r);
    }
    return by;
  }, [rows, excluded]);

  /**
   * The rail. A PANEL is always listed — it carries a create action, so hiding it when empty
   * would hide the only way to fill it. A derived KIND is listed only when it has rows, because
   * a brand-new client would otherwise open on a rail of twelve zeroes.
   */
  const sections = React.useMemo<Section[]>(() => {
    const derived: Section[] = [
      ...KIND_ORDER.filter((k) => byKind.has(k)),
      ...[...byKind.keys()].filter((k) => !KIND_ORDER.includes(k)).sort(),
    ].map((kind) => {
      // A kind the function returns but this file has not been taught yet still gets a section,
      // under a humanized name and with no link. Better a plain list than a group that silently
      // disappears — that is the failure mode this whole tab exists to stop repeating.
      const meta = KINDS[kind] ?? { label: humanizeLabel(kind), icon: FolderKanban, group: GROUP_DELIVERY };
      return {
        sort: 'kind', id: `kind:${kind}`, kind,
        label: meta.label, icon: meta.icon, group: meta.group,
        count: byKind.get(kind)!.length,
      };
    });
    const panelSections: Section[] = (panels ?? []).map((p) => ({
      sort: 'panel', id: `panel:${p.id}`, label: p.label, icon: p.icon,
      group: p.group ?? GROUP_DELIVERY, node: p.node,
    }));
    return [...panelSections, ...derived];
  }, [byKind, panels]);

  const groups = React.useMemo<HubNavGroup[]>(() => {
    const known = GROUP_ORDER.filter((g) => sections.some((s) => s.group === g));
    const extra = [...new Set(sections.map((s) => s.group))].filter((g) => !GROUP_ORDER.includes(g)).sort();
    return [...known, ...extra].map((label) => ({
      label,
      items: sections
        .filter((s) => s.group === label)
        .map((s) => ({ id: s.id, label: s.label, icon: s.icon, count: s.count })),
    }));
  }, [sections]);

  // Default to the first section that actually has something in it, so an active client opens on
  // content rather than on whichever panel happens to sort first.
  const activeId = selected && sections.some((s) => s.id === selected)
    ? selected
    : (sections.find((s) => (s.count ?? 0) > 0)?.id ?? sections[0]?.id ?? null);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (sections.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <HubEmptyState
            icon={FolderKanban}
            title="Nothing booked against this record yet"
            description={`Projects, moodboards, quotes, orders, invoices, property and equipment for this ${partyKind === 'company' ? 'company' : 'person'} all collect here as they happen.`}
          />
        </CardContent>
      </Card>
    );
  }

  const active = sections.find((s) => s.id === activeId);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <HubSideNav
        groups={groups}
        activeId={activeId ?? undefined}
        onSelect={setSelected}
        aria-label="Work sections"
      />
      <div className="min-w-0 flex-1">
        {active?.sort === 'panel'
          ? active.node
          : active
            ? <KindList kind={active.kind} label={active.label} rows={byKind.get(active.kind) ?? []} />
            : null}
      </div>
    </div>
  );
};

/** One derived section: a flat, scannable list. The detail lives on the record it links to. */
const KindList: React.FC<{ kind: string; label: string; rows: PartyWorkRow[] }> = ({ kind, label, rows }) => {
  const meta = KINDS[kind] ?? { label: humanizeLabel(kind), icon: FolderKanban, group: GROUP_DELIVERY };
  const Icon = meta.icon;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {label}
          <Badge variant="secondary">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-hairline">
          {rows.map((r) => {
            const href = meta.href?.(r) ?? null;
            const body = (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.title || '—'}</span>
                    {r.role && r.role !== 'party' && (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.role}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.occurred_at ? formatDate(r.occurred_at) : '—'}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {r.amount != null && (
                    <span className="tabular-nums text-sm">{formatMoney(r.amount, r.currency ?? 'EUR')}</span>
                  )}
                  {r.status && (
                    <span className={`text-xs capitalize ${statusTone(r.status)}`}>{humanizeLabel(r.status)}</span>
                  )}
                </div>
              </div>
            );
            return (
              <li key={`${r.kind}:${r.id}`}>
                {href ? <Link to={href} className="block hover:bg-muted/40">{body}</Link> : body}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
};

export default PartyWorkTab;

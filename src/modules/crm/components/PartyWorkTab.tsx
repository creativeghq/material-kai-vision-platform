/**
 * Everything booked against one CRM party — company or person — on one tab.
 *
 * It replaces the Projects tab and absorbs Warranties and (on a contact) Property, because those
 * were three tabs answering one question badly: "what is going on with this client?". A project,
 * the moodboard that won it, the quote that came out of it, the order that fulfilled it and the
 * warranty that followed are one story, and the record page told it in five places.
 *
 * ONE QUERY, DERIVED IN SQL
 * -------------------------
 * `get_party_work(kind, id)` returns the whole union already typed and sorted. The alternative —
 * a card per entity with its own fetch, its own loading state and its own idea of what "status"
 * means — is what produced the scattering in the first place, and it is how a thirteenth entity
 * type ends up half-wired. Adding one here is one UNION branch in the function; it appears in
 * this tab automatically, needing only a label and a route below.
 *
 * The function deliberately does NOT return a url. Routes move — `/admin/finance` never existed
 * and six call sites linked to it anyway — so the mapping lives here in the client where
 * `deepLinkTargets.test.ts` can see it, not baked into a database function nothing checks.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  FolderKanban, Palette, Home, KeyRound, Handshake, Tag, FileText, ShoppingCart,
  Receipt, FileSignature, Wrench, Loader2, Briefcase, type LucideIcon,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub';
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

/**
 * How each kind is presented and where it opens.
 *
 * `href` takes the row so a SATELLITE can open its parent: a tenancy's own id is not a route, and
 * linking `/properties/<tenancy_id>` would render the catch-all NotFound rather than fail loudly.
 */
const KINDS: Record<string, { label: string; plural: string; icon: LucideIcon; href?: (r: PartyWorkRow) => string | null }> = {
  project:        { label: 'Project',   plural: 'Projects',        icon: FolderKanban,   href: (r) => `/projects/${r.id}` },
  moodboard:      { label: 'Moodboard', plural: 'Moodboards',      icon: Palette,        href: (r) => `/moodboard/${r.id}` },
  property:       { label: 'Property',  plural: 'Properties',      icon: Home,           href: (r) => `/properties/${r.id}` },
  tenancy:        { label: 'Tenancy',   plural: 'Tenancies',       icon: KeyRound,       href: (r) => (r.parent_id ? `/properties/${r.parent_id}` : null) },
  property_sale:  { label: 'Sale',      plural: 'Property sales',  icon: Handshake,      href: (r) => (r.parent_id ? `/properties/${r.parent_id}` : null) },
  property_offer: { label: 'Offer',     plural: 'Property offers', icon: Tag,            href: (r) => (r.parent_id ? `/properties/${r.parent_id}` : null) },
  quote:          { label: 'Quote',     plural: 'Quotes',          icon: FileText,       href: (r) => `/quotes/manage/${r.id}` },
  order:          { label: 'Order',     plural: 'Orders',          icon: ShoppingCart,   href: (r) => `${FINANCE_BASE}/orders/${r.id}` },
  invoice:        { label: 'Invoice',   plural: 'Invoices',        icon: Receipt,        href: (r) => `${FINANCE_BASE}/invoices/${r.id}` },
  contract:       { label: 'Contract',  plural: 'Contracts',       icon: FileSignature,  href: () => '/contracts' },
  deal:           { label: 'Deal',      plural: 'Deals',           icon: Briefcase,      href: (r) => `/crm/deals/${r.id}` },
  // Installed base has no page of its own — the asset IS the record, shown here in place.
  asset:          { label: 'Equipment', plural: 'Equipment',       icon: Wrench },
};

/** Order the groups read in: work first, then money, then what was left behind. */
const GROUP_ORDER = [
  'project', 'moodboard', 'deal', 'quote', 'order', 'invoice', 'contract',
  'property', 'tenancy', 'property_sale', 'property_offer', 'asset',
];

interface Props {
  partyKind: 'company' | 'contact';
  partyId: string;
  /** Opens the party's own create-project dialog — the one action worth offering from empty. */
  onNewProject?: () => void;
  /**
   * Kinds this roll-up must NOT list because a full management panel for them is mounted directly
   * below it. Warranties is the case: the roll-up can only show equipment, while `WarrantiesTab`
   * registers and edits it — listing both would put the same rows on screen twice and leave the
   * reader guessing which one is authoritative.
   */
  excludeKinds?: string[];
  refreshKey?: number;
}

export const PartyWorkTab: React.FC<Props> = ({ partyKind, partyId, onNewProject, excludeKinds, refreshKey = 0 }) => {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<PartyWorkRow[]>([]);
  const [loading, setLoading] = React.useState(true);

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

  const grouped = React.useMemo(() => {
    const by = new Map<string, PartyWorkRow[]>();
    for (const r of rows) {
      if (excluded.has(r.kind)) continue;
      if (!by.has(r.kind)) by.set(r.kind, []);
      by.get(r.kind)!.push(r);
    }
    // GROUP_ORDER first, then anything the function returned that this file has no entry for.
    // A new UNION branch therefore SHOWS UP unlabelled rather than vanishing silently, which is
    // the whole failure mode this tab exists to avoid repeating.
    const known = GROUP_ORDER.filter((k) => by.has(k));
    const extra = [...by.keys()].filter((k) => !GROUP_ORDER.includes(k)).sort();
    return [...known, ...extra].map((k) => [k, by.get(k)!] as const);
  }, [rows, excluded]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Emptiness is judged AFTER exclusions: a party whose only rows are equipment is not "empty"
  // here, it just has nothing this roll-up is responsible for — the panel below shows the rest.
  if (grouped.length === 0) {
    if (rows.length > 0) return null;
    return (
      <Card>
        <CardContent className="p-0">
          <HubEmptyState
            icon={FolderKanban}
            title="Nothing booked against this record yet"
            description={`Projects, moodboards, quotes, orders, invoices, property and equipment for this ${partyKind === 'company' ? 'company' : 'person'} all collect here as they happen.`}
            action={onNewProject ? (
              <Button size="sm" onClick={onNewProject}>Start a project</Button>
            ) : undefined}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(([kind, items]) => {
        // A kind the function returns but this file has not been taught yet still renders, under
        // a humanized name and with no link. Better a plain list than a group that disappears.
        const meta = KINDS[kind] ?? { label: humanizeLabel(kind), plural: humanizeLabel(kind), icon: FolderKanban };
        const Icon = meta.icon;
        return (
          <Card key={kind}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {meta.plural}
                <Badge variant="secondary">{items.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-hairline">
                {items.map((r) => {
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
                      {href
                        ? <Link to={href} className="block hover:bg-muted/40">{body}</Link>
                        : body}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default PartyWorkTab;

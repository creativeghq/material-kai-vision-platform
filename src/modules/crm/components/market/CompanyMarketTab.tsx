import React, { useEffect, useMemo, useState } from 'react';
import { formatMoney, formatNumber } from '@/utils/decimal';
import { Link } from 'react-router-dom';
import {
  Users, Sparkles, Loader2, ExternalLink, Wallet, Inbox, ArrowRight, Building2, Search,
  Package, BarChart3, MapPin, Gauge, LineChart, Bell, BellOff, Star, Layers, Tags,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { financeService } from '@/modules/finance/services/financeService';
import { findCompetitors, type CompetitorOrg } from '@/services/companyEnrichService';
import { marketCheck, trackProduct, untrackProduct, type MarketStats } from '@/services/priceMonitoringApi';
import { productDetailService } from '@/services/productDetailService';
import { BrandAmbassadorsPanel } from '@/components/features/profile/BrandAmbassadorsPanel';
import { invoicedTotal } from '@/modules/finance/utils/inboundProvenance';

/** The seed identity the Market tab reads off the company row. */
export interface CompanyMarketSeed {
  name: string;
  industry?: string | null;
  kad_codes?: string[] | null;
  city?: string | null;
  country?: string | null;
  vat_number?: string | null;
  website?: string | null;
}

interface CompanyMarketTabProps {
  workspaceId: string | null;
  companyId: string;
  company: CompanyMarketSeed;
}

const eur = (n: number) => formatMoney(n || 0, 'EUR');

const hostOf = (url?: string | null): string | null => {
  if (!url) return null;
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || null;
};

/**
 * "Market" tab — competitive & market intelligence for one company, built from data we
 * already hold. Increment 1a: Competitors (same-ΚΑΔ CRM matches + Apollo/web-search discovery)
 * and the Financial snapshot (per-company billed/owed/paid + unbooked myDATA invoices). Product
 * price intel + re-scoped market-position analytics land in 1b.
 */
export const CompanyMarketTab: React.FC<CompanyMarketTabProps> = ({ workspaceId, companyId, company }) => {
  const pass = { workspaceId, companyId, company };
  // Sub-tabs rather than one scroll: the four questions here are asked one at a time, and three of
  // them cost money or a round-trip to answer. Mirrors the Details tab's section nav.
  return (
    <Tabs defaultValue="demand" orientation="vertical" className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <TabsList className="section-rail h-auto w-full shrink-0 flex-row justify-start gap-1 bg-transparent p-0 lg:w-52 lg:flex-col lg:flex-nowrap">
        <TabsTrigger value="demand" className="w-full justify-start data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><BarChart3 className="h-4 w-4 mr-2" />Demand</TabsTrigger>
        <TabsTrigger value="pricing" className="w-full justify-start data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Gauge className="h-4 w-4 mr-2" />Pricing</TabsTrigger>
        <TabsTrigger value="competitors" className="w-full justify-start data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Users className="h-4 w-4 mr-2" />Competitors</TabsTrigger>
        <TabsTrigger value="financial" className="w-full justify-start data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Wallet className="h-4 w-4 mr-2" />Financial</TabsTrigger>
      </TabsList>

      <div className="min-w-0 w-full flex-1 space-y-4">
        <TabsContent value="demand" className="mt-0 space-y-4">
          <DemandTab {...pass} />
        </TabsContent>
        <TabsContent value="pricing" className="mt-0"><ProductPriceIntelCard {...pass} /></TabsContent>
        <TabsContent value="competitors" className="mt-0"><CompetitorsCard {...pass} /></TabsContent>
        <TabsContent value="financial" className="mt-0"><FinancialSnapshotCard {...pass} /></TabsContent>
      </div>
    </Tabs>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Competitors
// ─────────────────────────────────────────────────────────────────────────────

interface CrmMatch {
  id: string;
  name: string;
  industry: string | null;
  city: string | null;
  country: string | null;
  is_customer: boolean | null;
  is_supplier: boolean | null;
}

const CompetitorsCard: React.FC<CompanyMarketTabProps> = ({ workspaceId, companyId, company }) => {
  const { toast } = useToast();
  const kadCodes = (company.kad_codes ?? []).filter(Boolean);

  const [crmMatches, setCrmMatches] = useState<CrmMatch[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);

  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<CompetitorOrg[] | null>(null);
  const [discoverSource, setDiscoverSource] = useState<string | null>(null);
  const [discoverSkipped, setDiscoverSkipped] = useState<string[]>([]);

  useEffect(() => {
    if (kadCodes.length === 0) { setCrmMatches([]); return; }
    let cancelled = false;
    (async () => {
      setCrmLoading(true);
      let q = supabase
        .from('crm_companies')
        .select('id, name, industry, city, country, is_customer, is_supplier')
        .overlaps('kad_codes', kadCodes)
        .neq('id', companyId)
        .order('name')
        .limit(25);
      if (workspaceId) q = q.eq('workspace_id', workspaceId);
      const { data, error } = await q;
      if (cancelled) return;
      if (error) { setCrmMatches([]); } else { setCrmMatches((data as CrmMatch[]) ?? []); }
      setCrmLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, workspaceId, kadCodes.join('|')]);

  const runDiscovery = async () => {
    setDiscovering(true);
    const res = await findCompetitors({
      name: company.name,
      industry: company.industry ?? undefined,
      kadCodes,
      city: company.city ?? undefined,
      country: company.country ?? undefined,
      excludeDomains: [hostOf(company.website)].filter(Boolean) as string[],
      limit: 12,
      workspaceId: workspaceId ?? undefined,
    });
    setDiscovering(false);
    if (!res.ok) {
      toast({ title: 'Competitor search failed', description: res.message || res.error, variant: 'destructive' });
      return;
    }
    setDiscovered(res.competitors);
    setDiscoverSource(res.source);
    setDiscoverSkipped(res.skipped ?? []);
    if (res.competitors.length === 0) {
      toast({ title: 'No competitors found', description: 'Try enriching the company industry/ΚΑΔ first.' });
    }
  };

  const canDiscover = !!(company.name || company.industry || kadCodes.length);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Competitors</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Businesses in the same market — matched from your CRM by activity code (ΚΑΔ) and by what they do, plus live discovery.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={runDiscovery} disabled={discovering || !canDiscover}>
            {discovering ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            Discover competitors
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Same-ΚΑΔ CRM matches */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            In your CRM {kadCodes.length > 0 && <span className="text-muted-foreground/70">· sharing ΚΑΔ {kadCodes.slice(0, 4).join(', ')}{kadCodes.length > 4 ? '…' : ''}</span>}
          </p>
          {kadCodes.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No activity codes (ΚΑΔ) on this company yet — run the ΑΑΔΕ / ΓΕΜΗ import on the Details tab to enable same-industry matching.
            </p>
          ) : crmLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Matching…</div>
          ) : crmMatches.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No other CRM company shares these activity codes.</p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {crmMatches.map((m) => (
                <Link
                  key={m.id}
                  to={`/crm/companies/${m.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[m.industry, [m.city, m.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {m.is_supplier ? 'Supplier' : m.is_customer ? 'Customer' : 'Company'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Discovered competitors */}
        {discovered !== null && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" />Discovered
              {discoverSource && discoverSource !== 'none' && (
                <span className="text-muted-foreground/70">· via {discoverSource === 'apollo' ? 'Apollo' : discoverSource === 'gemini' ? 'Gemini (Google Search)' : 'web search'}</span>
              )}
            </p>
            {discovered.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nothing found.</p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {discovered.map((c, i) => (
                  <div key={`${c.domain || c.name}-${i}`} className="flex items-start justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[c.industry, [c.city, c.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || (c.description ?? '—')}
                      </p>
                      {c.description && (c.industry || c.city) && (
                        <p className="text-xs text-muted-foreground/80 truncate">{c.description}</p>
                      )}
                    </div>
                    {c.website && (
                      <a
                        href={c.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline shrink-0 flex items-center gap-1"
                      >
                        {hostOf(c.website)}<ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Always report the sources that returned nothing. */}
            {discoverSkipped.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-2">Not available: {discoverSkipped.join(', ')}.</p>
            )}
          </div>
        )}

        <LookalikesPanel companyId={companyId} />
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Lookalikes — "who else in our CRM does what this company does" (#289)
// ─────────────────────────────────────────────────────────────────────────────

interface Lookalike {
  id: string;
  name: string;
  industry: string | null;
  city: string | null;
  country: string | null;
  is_customer: boolean | null;
  is_supplier: boolean | null;
  similarity: number;
  /** Standard deviations above this seed's own mean similarity to the workspace. */
  z: number | null;
}

/**
 * Deliberately NOT a percentage. Measured over this workspace's 861 company pairs, the
 * median pair — two businesses with nothing in common — scores 0.645 cosine, and the floor
 * is 0.324. "65% similar" would be a valid, confident, meaningless number that an operator
 * would act on. Only position within the seed's own neighbourhood carries information, so
 * that is what we render.
 */
const strengthLabel = (z: number | null): string =>
  z == null ? 'Related' : z >= 2.5 ? 'Very close' : z >= 1.5 ? 'Close' : 'Related';

/**
 * The fourth competitor signal, and the only one ranked BY WHAT A COMPANY DOES rather
 * than by a code it shares or a name a model recalled: cosine over the Voyage embedding
 * of each company's own registry prose, activities and catalogue.
 *
 * Costs nothing to ask — the seed's vector is already stored, so no query is embedded
 * and no provider is called on render. `crm_company_lookalikes` runs with invoker rights,
 * so RLS confines both the seed and the candidates to the caller's own workspace.
 */
const LookalikesPanel: React.FC<{ companyId: string }> = ({ companyId }) => {
  // Four outcomes that would all render as "no rows" are kept apart, or the panel states
  // a fact about their CRM that is really a fact about our pipeline: the query broke; the
  // seed has no vector yet; the seed had nothing worth embedding; nobody resembles them.
  const [rows, setRows] = useState<Lookalike[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);
  /** How many OTHER companies were actually available to rank against. */
  const [population, setPopulation] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRows(null); setFailed(false); setSeedStatus(null); setPopulation(0);
      // RPC is not in the generated types (no Supabase access token on this machine) → cast.
      const { data, error } = await (supabase.rpc as any)('crm_company_lookalikes', {
        p_company_id: companyId, p_limit: 8,
      });
      if (cancelled) return;
      if (error) { setFailed(true); return; }
      const payload = (data ?? {}) as { seed_status?: string; population?: number; matches?: Lookalike[] };
      setSeedStatus(payload.seed_status ?? 'unknown');
      setPopulation(payload.population ?? 0);
      setRows(payload.matches ?? []);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5" />Similar in your CRM
        <span className="text-muted-foreground/70">· ranked by what they do, not by ΚΑΔ</span>
      </p>
      {failed ? (
        <p className="text-sm text-destructive">Similarity search failed — this ranking is missing, not empty.</p>
      ) : rows === null ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Ranking…</div>
      ) : seedStatus === 'skipped' ? (
        <p className="text-sm text-muted-foreground italic">
          There is nothing on this company to compare yet — add an industry, activity codes (ΚΑΔ) or a
          description on the Details tab and it will be profiled automatically.
        </p>
      ) : seedStatus !== 'success' ? (
        <p className="text-sm text-muted-foreground italic">
          This company has not been profiled yet — it is queued, and similar companies appear once it has been.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          {population === 0
            ? 'No other company in your CRM has been profiled yet, so there is nothing to compare against.'
            : `Nothing in your CRM stands out as similar — ${population} other ${population === 1 ? 'company was' : 'companies were'} compared.`}
        </p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {rows.map((r) => (
            <Link
              key={r.id}
              to={`/crm/companies/${r.id}`}
              className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/40 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[r.industry, [r.city, r.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm">{strengthLabel(r.z)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {r.is_supplier ? 'Supplier' : r.is_customer ? 'Customer' : 'Company'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Financial snapshot + unbooked myDATA
// ─────────────────────────────────────────────────────────────────────────────

const FinancialSnapshotCard: React.FC<CompanyMarketTabProps> = ({ workspaceId, companyId, company }) => {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<{ billedTotal: number; paidTotal: number; outstandingTotal: number } | null>(null);
  /**
   * Unbooked myDATA documents, TOTALLED PER CURRENCY (#353 CRM-19).
   *
   * This was a single `total: number` reduced across every row and then rendered through
   * `eur()`, which hardcodes EUR. `inbound_documents` carries a `currency` column, so a USD
   * invoice was not merely added to euros — it was added AND relabelled, producing a figure that
   * is true of nothing and says so with a currency symbol. Same defect `PipelineBoard` had
   * before `get_deal_stage_totals` split it by (stage, currency).
   */
  const [unbooked, setUnbooked] = useState<{ count: number; totals: Array<{ currency: string; total: number }> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Booked AP totals from the finance rollup view (converted supplier_bills only).
      const acct = await financeService.getSupplierAccount({ companyId }).catch(() => null);

      // Unbooked myDATA received docs: matched to this company by issuer VAT, not yet a bill.
      let unb: { count: number; totals: Array<{ currency: string; total: number }> } | null = null;
      const vatDigits = (company.vat_number ?? '').replace(/[^0-9]/g, '');
      if (vatDigits.length >= 8) {
        const vatForms = Array.from(new Set([company.vat_number, vatDigits].filter(Boolean))) as string[];
        let q = supabase
          .from('inbound_documents')
          // doc_type and total_net come too: on a reverse-charged purchase the amount owed is
          // the net, and summing AADE's gross overstated every foreign supplier by their VAT.
          .select('total_gross, total_net, doc_type, currency', { count: 'exact' })
          .in('issuer_vat', vatForms)
          .is('created_supplier_bill_id', null)
          .neq('status', 'dismissed');
        if (workspaceId) q = q.eq('workspace_id', workspaceId);
        const { data, count, error } = await q;
        if (!error) {
          // `invoicedTotal` stays the one derivation of "what this document is worth" — on a
          // reverse-charged purchase that is the NET, and summing AADE's gross overstated every
          // foreign supplier by their VAT. Grouping is the only thing added here.
          const byCurrency = new Map<string, number>();
          for (const r of (data ?? []) as any[]) {
            const cur = (r.currency || 'EUR').toUpperCase();
            byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + invoicedTotal(r));
          }
          const totals = [...byCurrency.entries()]
            .map(([currency, total]) => ({ currency, total }))
            .filter((t) => t.total > 0)
            .sort((a, b) => b.total - a.total);
          unb = { count: count ?? (data?.length ?? 0), totals };
        }
      }

      if (cancelled) return;
      setAccount(acct ? { billedTotal: acct.billedTotal, paidTotal: acct.paidTotal, outstandingTotal: acct.outstandingTotal } : null);
      setUnbooked(unb);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId, workspaceId, company.vat_number]);

  const hasBooked = account && (account.billedTotal || account.paidTotal || account.outstandingTotal);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" />Financial Relationship</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              What this supplier has billed you, what you've paid, and what's outstanding — plus invoices sitting in your myDATA inbox.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to={`/finance?tab=parties&party=company:${companyId}`}>
              Open ledger <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <>
            {hasBooked ? (
              <div className="grid grid-cols-3 gap-3">
                <StatCell label="Billed to us" value={eur(account!.billedTotal)} />
                <StatCell label="Paid to them" value={eur(account!.paidTotal)} />
                <StatCell label="We owe" value={eur(account!.outstandingTotal)} accent={account!.outstandingTotal > 0} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No booked supplier bills for this company yet. Bills counted here come from converted myDATA documents or manually-entered supplier bills.
              </p>
            )}

            {unbooked && unbooked.count > 0 && (
              <Link
                // Carry the VAT so the inbox lands narrowed to THIS company — the callout counts
                // this company's documents, so the destination must show the same set.
                to={`/finance?tab=doc_expenses${company.vat_number ? `&issuer_vat=${encodeURIComponent(company.vat_number.replace(/\D/g, ''))}` : ''}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5 hover:bg-amber-500/[0.1] transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Inbox className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="text-sm">
                    <span className="font-medium">{unbooked.count}</span> invoice{unbooked.count === 1 ? '' : 's'} from this company in your myDATA inbox, not yet booked
                    {unbooked.totals.map((t) => (
                      <span key={t.currency} className="text-muted-foreground"> · {formatMoney(t.total, t.currency)}</span>
                    ))}
                  </span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            )}

            {company.vat_number ? null : (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />Add a VAT number to match this company against myDATA received documents.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Market position analytics (re-scoped Factory Analytics via brand_company_id)
// ─────────────────────────────────────────────────────────────────────────────

interface EngagedProduct { product_id: string; saves: number; quotes: number }

interface MarketAnalytics {
  product_count: number;
  /** Event-stream counts, keyed by event_type. Views only — saves/quotes come from the records. */
  totals: Record<string, number>;
  /** Moodboard rows in the window. The record, not the telemetry. */
  saves: number;
  /** Quote lines in the window. The record, not the telemetry. */
  quotes: number;
  /** The same two counts across the whole workspace — "vs your other suppliers". */
  benchmark: { saves: number; quotes: number };
  geo: Array<{ country: string | null; city: string | null; count: number }>;
  top_products: Array<{ product_id: string; name: string | null; saves: number; quotes: number; count: number }>;
  category_mix: Array<{ category: string; products: number; saves: number; quotes: number }>;
  quote_pipeline: Array<{ status: string; count: number }>;
  ratings: { avg: number | null; count: number; dist: Array<{ rating: number; count: number }> };
  product_engagement: EngagedProduct[];
  product_engagement_truncated: boolean;
}

const WINDOW_DAYS = 90;

/** saves → quotes, as a percentage. Null when there is nothing to divide by. */
const convRate = (saves: number, quotes: number): string | null =>
  saves > 0 ? `${Math.round((quotes / saves) * 100)}%` : null;

const useMarketAnalytics = (companyId: string) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MarketAnalytics | null>(null);
  // A failed RPC must stay distinguishable from an empty result. Collapse the two and the
  // empty state says "No catalog products are linked to this company yet", presenting a broken
  // query as a FACT ABOUT THEIR DATA — the failure mode most likely to be acted on incorrectly
  // (someone goes and re-links a factory that was never unlinked).
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // RPC is not in the generated types yet → cast the call.
      const { data: res, error } = await (supabase.rpc as any)(
        'company_market_analytics', { p_company_id: companyId, p_days: WINDOW_DAYS });
      if (cancelled) return;
      setLoadError(!!error);
      setData(error ? null : (res as unknown as MarketAnalytics));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return { loading, data, loadError };
};

const NoLink: React.FC = () => (
  <p className="text-sm text-muted-foreground italic">
    No catalog products are linked to this company yet (via the Factory link on the Details tab), so
    there is no engagement to report.
  </p>
);

const LoadFailed: React.FC = () => (
  <p className="text-sm text-destructive italic">
    Could not load market analytics. This is a query failure, not a statement about your
    data — try again, and report it if it persists.
  </p>
);

/**
 * Both Demand cards read the same RPC result, so it is fetched ONCE here and passed down. Calling
 * the hook in each card would issue two identical round-trips per visit to the tab.
 */
const DemandTab: React.FC<CompanyMarketTabProps> = ({ companyId, workspaceId, company }) => {
  const stats = useMarketAnalytics(companyId);
  return (
    <>
      <MarketPositionCard stats={stats} />
      {/* Advocacy is demand too, and the loudest kind: a professional who has put this brand on
          their own public profile. The same component a claimed supplier sees in its portal. */}
      <BrandAmbassadorsPanel mode="company" workspaceId={workspaceId} companyId={companyId} />
      <AttributeExplorerCard stats={stats} companyId={companyId} workspaceId={workspaceId} company={company} />
    </>
  );
};

type MarketStatsResult = ReturnType<typeof useMarketAnalytics>;

const MarketPositionCard: React.FC<{ stats: MarketStatsResult }> = ({ stats }) => {
  const { loading, data, loadError } = stats;

  const views = data?.totals?.product_view ?? 0;
  const embedViews = data?.totals?.embed_view ?? 0;
  const saves = data?.saves ?? 0;
  const quotes = data?.quotes ?? 0;
  const ours = convRate(saves, quotes);
  const theirs = convRate(data?.benchmark?.saves ?? 0, data?.benchmark?.quotes ?? 0);
  const hasSignal = !!data && data.product_count > 0
    && (views || embedViews || saves || quotes || data.geo.length || data.ratings.count);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />Demand</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            How our users engage with this supplier's catalog products, over the last {WINDOW_DAYS} days.
            Saves and quote adds are counted from the moodboard and quote records themselves; views come
            from the engagement event stream.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : loadError ? (
          <LoadFailed />
        ) : !hasSignal ? (
          (!data || data.product_count === 0)
            ? <NoLink />
            : <p className="text-sm text-muted-foreground italic">No user engagement recorded for this company's products in the last {WINDOW_DAYS} days.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCell label="Products" value={String(data!.product_count)} />
              <StatCell label="Views" value={formatNumber(views)} />
              <StatCell label="Saves" value={formatNumber(saves)} />
              <StatCell label="Quote adds" value={formatNumber(quotes)} />
            </div>

            {(ours || embedViews > 0) && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
                {ours && (
                  <span>
                    Save → quote: <span className="text-foreground font-medium">{ours}</span>
                    {theirs && <span> · workspace average {theirs}</span>}
                  </span>
                )}
                {embedViews > 0 && (
                  <span>Embedded 3D widget views: <span className="text-foreground font-medium">{formatNumber(embedViews)}</span></span>
                )}
              </div>
            )}

            {data!.geo.length > 0 && (
              <Panel icon={MapPin} title="Where demand comes from">
                {data!.geo.map((g, i) => (
                  <Row key={i} left={[g.city, g.country].filter(Boolean).join(', ') || 'Unknown'} right={formatNumber(g.count)} />
                ))}
              </Panel>
            )}

            {data!.top_products.length > 0 && (
              <Panel icon={LineChart} title="Most-engaged products">
                {data!.top_products.map((p) => (
                  <Row
                    key={p.product_id}
                    left={p.name || p.product_id}
                    right={`${formatNumber(p.saves)} saved · ${formatNumber(p.quotes)} quoted`}
                  />
                ))}
              </Panel>
            )}

            {data!.category_mix.length > 0 && (
              <Panel icon={Layers} title="Category mix">
                {data!.category_mix.map((c) => (
                  <Row
                    key={c.category}
                    left={c.category}
                    right={`${formatNumber(c.products)} product${c.products === 1 ? '' : 's'} · ${formatNumber(c.saves + c.quotes)} engagements`}
                  />
                ))}
              </Panel>
            )}

            {data!.quote_pipeline.length > 0 && (
              <Panel icon={Package} title="Quote pipeline">
                {data!.quote_pipeline.map((q) => (
                  <Row key={q.status} left={q.status} right={formatNumber(q.count)} />
                ))}
              </Panel>
            )}

            {data!.ratings.count > 0 && (
              <Panel
                icon={Star}
                title={`Reviews — ${data!.ratings.avg ?? '—'} average across ${formatNumber(data!.ratings.count)} (all time)`}
              >
                {data!.ratings.dist.map((d) => (
                  <Row key={d.rating} left={`${d.rating}★`} right={formatNumber(d.count)} />
                ))}
              </Panel>
            )}

            <p className="text-[11px] text-muted-foreground">
              Follower, hire-request and profile-view metrics are not shown — those belong to a platform supplier account, which a CRM company record doesn't have.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Attribute explorer — engagement rolled up by any metadata key on the catalog
// ─────────────────────────────────────────────────────────────────────────────

/** Keys that describe the row rather than the material, so they make useless rollup buckets. */
const SKIP_ATTRIBUTE_KEYS = new Set([
  'factory_name', 'created_at', 'updated_at', 'id', 'image_url', 'url', 'description',
]);

const AttributeExplorerCard: React.FC<CompanyMarketTabProps & { stats: MarketStatsResult }> = ({ workspaceId, stats }) => {
  const { loading: statsLoading, data, loadError } = stats;
  const [products, setProducts] = useState<Array<{ id: string; metadata: Record<string, unknown> }>>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [attributeKey, setAttributeKey] = useState<string>('');

  const engagedIds = useMemo(
    () => (data?.product_engagement ?? []).map((e) => e.product_id),
    [data],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProductsLoading(true);
      // Fetch exactly the ENGAGED products, not "the first 500 of this brand". The rollup discards
      // products with no engagement anyway, and `.limit(500)` with no ORDER BY picked an arbitrary
      // 500 while the footnote claimed they were the most-engaged — a cap that silently changed the
      // answer. This set is already ordered and capped by the RPC, which reports its own truncation.
      // Chunked because 500 uuids in one `in()` makes a URL long enough for a gateway to reject.
      if (engagedIds.length === 0) { setProducts([]); setProductsLoading(false); return; }
      const chunks: string[][] = [];
      for (let i = 0; i < engagedIds.length; i += 100) chunks.push(engagedIds.slice(i, i + 100));
      const rows: Array<{ id: string; metadata: Record<string, unknown> }> = [];
      for (const chunk of chunks) {
        let q = supabase.from('products').select('id, metadata').in('id', chunk);
        if (workspaceId) q = q.eq('workspace_id', workspaceId);
        const { data: got, error } = await q;
        if (cancelled) return;
        if (error) {
          console.error('[CompanyMarketTab] attribute explorer product load failed:', error.message);
          break;
        }
        rows.push(...(got ?? []).map((r: any) => ({ id: r.id, metadata: (r.metadata ?? {}) as Record<string, unknown> })));
      }
      if (cancelled) return;
      setProducts(rows);
      setProductsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [engagedIds, workspaceId]);

  const availableKeys = useMemo(() => {
    const keys = new Set<string>();
    products.forEach(({ metadata }) => Object.keys(metadata).forEach((k) => { if (!SKIP_ATTRIBUTE_KEYS.has(k)) keys.add(k); }));
    return Array.from(keys).sort();
  }, [products]);

  useEffect(() => {
    if (!attributeKey && availableKeys.length > 0) setAttributeKey(availableKeys[0]);
  }, [availableKeys, attributeKey]);

  const rows = useMemo(() => {
    if (!attributeKey || !data) return [];
    const engagement = new Map(data.product_engagement.map((e) => [e.product_id, e]));
    const byValue = new Map<string, { saves: number; quotes: number }>();
    products.forEach(({ id, metadata }) => {
      const raw = metadata?.[attributeKey];
      if (raw == null || raw === '') return;
      const e = engagement.get(id);
      const values: string[] = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      values.forEach((v) => {
        const key = v.slice(0, 40);
        const entry = byValue.get(key) ?? { saves: 0, quotes: 0 };
        entry.saves += e?.saves ?? 0;
        entry.quotes += e?.quotes ?? 0;
        byValue.set(key, entry);
      });
    });
    return Array.from(byValue.entries())
      .map(([value, d]) => ({ value, ...d }))
      .filter((r) => r.saves + r.quotes > 0)
      .sort((a, b) => (b.saves + b.quotes) - (a.saves + a.quotes))
      .slice(0, 20);
  }, [attributeKey, products, data]);

  const loading = statsLoading || productsLoading;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2"><Tags className="h-4 w-4 text-primary" />Attribute explorer</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Which material attributes buyers actually engage with, rolled up from this supplier's catalog metadata.
            </p>
          </div>
          {availableKeys.length > 0 && (
            <Select value={attributeKey} onValueChange={setAttributeKey}>
              <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="Select attribute…" /></SelectTrigger>
              <SelectContent>
                {availableKeys.map((k) => <SelectItem key={k} value={k} className="text-xs">{k}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : loadError ? (
          <LoadFailed />
        ) : !data || data.product_count === 0 ? (
          <NoLink />
        ) : engagedIds.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No engagement recorded on this supplier's products in the last {WINDOW_DAYS} days, so
            there is nothing to roll up by attribute yet.
          </p>
        ) : availableKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">The engaged products carry no metadata attributes to explore.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No engagement recorded against “{attributeKey}” in the last {WINDOW_DAYS} days.
          </p>
        ) : (
          <>
            <div className="divide-y divide-border rounded-lg border border-border">
              {rows.map((r) => (
                <Row key={r.value} left={r.value} right={`${formatNumber(r.saves)} saved · ${formatNumber(r.quotes)} quoted`} />
              ))}
            </div>
            {data?.product_engagement_truncated && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Rolled up over this supplier's 500 most-engaged products. More were engaged in the
                period, so the long tail is not represented here.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Product price intelligence — our cost vs live market spread + monitor toggle
// ─────────────────────────────────────────────────────────────────────────────

interface ProductRow {
  id: string;
  name: string;
  cost: number | null;
  cost_currency: string | null;
}

const money = (n: number | null | undefined, currency?: string | null) => formatMoney(n, currency ?? 'EUR');

const ProductPriceIntelCard: React.FC<CompanyMarketTabProps> = ({ companyId, workspaceId }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());
  const [market, setMarket] = useState<Record<string, { loading?: boolean; stats?: MarketStats | null }>>({});
  const [busyMonitor, setBusyMonitor] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // workspaceId was passed in and dropped on the floor, so this listed products across
      // every tenant that RLS happened to expose — unlike the sibling cards, which scope.
      // The error was discarded too, so a failure rendered as an empty catalogue.
      let pq = supabase
        .from('products')
        // `cost` / `cost_currency` come from get_product_costs below — not selectable here (#358).
        .select('id, name')
        .eq('brand_company_id', companyId);
      if (workspaceId) pq = pq.eq('workspace_id', workspaceId);
      const { data, error } = await pq.order('name').limit(60);
      if (error) console.error('[CompanyMarketTab] product load failed:', error.message);
      const base = (error ? [] : (data as ProductRow[])) ?? [];
      // The cost basis is sell-side-gated at the database (#358). A product whose workspace the
      // caller is not sell-side in comes back without one — cost unknown, rendered as a dash,
      // never as zero.
      const costs = base.length ? await productDetailService.costs(base.map((r) => r.id)) : new Map();
      const rows = base.map((r) => ({
        ...r,
        cost: costs.get(r.id)?.cost ?? null,
        cost_currency: costs.get(r.id)?.cost_currency ?? null,
      }));
      if (cancelled) return;
      setProducts(rows);
      if (rows.length) {
        const { data: tq } = await supabase
          .from('tracked_queries')
          .select('product_id')
          .in('product_id', rows.map((r) => r.id))
          .is('api_key_id', null)
          .eq('mode', 'discovery');
        if (!cancelled) setEnrolled(new Set((tq ?? []).map((r: any) => r.product_id).filter(Boolean)));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const checkMarket = async (p: ProductRow) => {
    setMarket((m) => ({ ...m, [p.id]: { loading: true } }));
    try {
      const res = await marketCheck({ productId: p.id, productName: p.name });
      setMarket((m) => ({ ...m, [p.id]: { stats: res.stats } }));
    } catch (e: any) {
      setMarket((m) => { const n = { ...m }; delete n[p.id]; return n; });
      toast({ title: 'Market check failed', description: e?.message || 'Could not scan the market.', variant: 'destructive' });
    }
  };

  const toggleMonitor = async (p: ProductRow) => {
    setBusyMonitor((s) => new Set(s).add(p.id));
    try {
      if (enrolled.has(p.id)) {
        await untrackProduct(p.id);
        setEnrolled((s) => { const n = new Set(s); n.delete(p.id); return n; });
        toast({ title: 'Monitoring stopped', description: p.name });
      } else {
        await trackProduct(p.id);
        setEnrolled((s) => new Set(s).add(p.id));
        toast({ title: 'Monitoring started', description: `${p.name} — retailer prices will refresh on the daily cadence.` });
      }
    } catch (e: any) {
      toast({ title: 'Could not update monitoring', description: e?.message, variant: 'destructive' });
    } finally {
      setBusyMonitor((s) => { const n = new Set(s); n.delete(p.id); return n; });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><Package className="h-4 w-4 text-primary" />Product price intelligence</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            This supplier's catalog products — our cost vs the live market spread. Run a market scan (debits credits) or start daily price monitoring per product.
          </p>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground italic p-4">
            No catalog products are linked to this company. Pin the supplier to its ingested brand via the Factory link on the Details tab.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {products.map((p) => {
              const mk = market[p.id];
              const stats = mk?.stats;
              const headroom = stats?.median != null && p.cost != null ? stats.median - p.cost : null;
              const isMonitored = enrolled.has(p.id);
              return (
                <div key={p.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">Our cost: {money(p.cost, p.cost_currency)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => checkMarket(p)} disabled={mk?.loading}>
                        {mk?.loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5 mr-1.5" />}
                        Check market
                      </Button>
                      <Button
                        size="sm"
                        variant={isMonitored ? 'secondary' : 'outline'}
                        onClick={() => toggleMonitor(p)}
                        disabled={busyMonitor.has(p.id)}
                      >
                        {busyMonitor.has(p.id)
                          ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          : isMonitored ? <BellOff className="h-3.5 w-3.5 mr-1.5" /> : <Bell className="h-3.5 w-3.5 mr-1.5" />}
                        {isMonitored ? 'Monitoring' : 'Monitor'}
                      </Button>
                    </div>
                  </div>
                  {stats && (
                    <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 pl-0.5">
                      {stats.count > 0 ? (
                        <>
                          <span>Market: <span className="text-foreground">{money(stats.min, stats.currency)}</span> – <span className="text-foreground">{money(stats.max, stats.currency)}</span></span>
                          <span>Median: <span className="text-foreground">{money(stats.median, stats.currency)}</span></span>
                          <span className="text-muted-foreground/70">{stats.count} retailer{stats.count === 1 ? '' : 's'}</span>
                          {headroom != null && (
                            <span className={headroom >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                              {headroom >= 0 ? 'Headroom' : 'Underwater'} {money(Math.abs(headroom), stats.currency)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="italic">No market prices found.</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Panel: React.FC<{ icon: React.ElementType; title: string; children: React.ReactNode }> = ({ icon: Icon, title, children }) => (
  <div>
    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{title}</p>
    <div className="divide-y divide-border rounded-lg border border-border">{children}</div>
  </div>
);

const Row: React.FC<{ left: string; right: string }> = ({ left, right }) => (
  <div className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
    <span className="truncate">{left}</span>
    <span className="text-muted-foreground shrink-0">{right}</span>
  </div>
);

const StatCell: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="rounded-lg border border-border p-3">
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    <p className={`text-lg font-semibold ${accent ? 'text-amber-600 dark:text-amber-400' : ''}`}>{value}</p>
  </div>
);

export default CompanyMarketTab;

import React, { useEffect, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { Link } from 'react-router-dom';
import {
  Users, Sparkles, Loader2, ExternalLink, Wallet, Inbox, ArrowRight, Building2, Search,
  Package, BarChart3, MapPin, Gauge, LineChart, Bell, BellOff,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { financeService } from '@/modules/finance/services/financeService';
import { findCompetitors, type CompetitorOrg } from '@/services/companyEnrichService';
import { marketCheck, trackProduct, untrackProduct, type MarketStats } from '@/services/priceMonitoringApi';

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
  return (
    <div className="space-y-4">
      <CompetitorsCard workspaceId={workspaceId} companyId={companyId} company={company} />
      <MarketPositionCard workspaceId={workspaceId} companyId={companyId} company={company} />
      <ProductPriceIntelCard workspaceId={workspaceId} companyId={companyId} company={company} />
      <FinancialSnapshotCard workspaceId={workspaceId} companyId={companyId} company={company} />
    </div>
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
              Businesses in the same market — matched from your CRM by activity code (ΚΑΔ), plus live discovery.
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
                  to={`/admin/crm/companies/${m.id}`}
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
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Financial snapshot + unbooked myDATA
// ─────────────────────────────────────────────────────────────────────────────

const FinancialSnapshotCard: React.FC<CompanyMarketTabProps> = ({ workspaceId, companyId, company }) => {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<{ billedTotal: number; paidTotal: number; outstandingTotal: number } | null>(null);
  const [unbooked, setUnbooked] = useState<{ count: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Booked AP totals from the finance rollup view (converted supplier_bills only).
      const acct = await financeService.getSupplierAccount({ companyId }).catch(() => null);

      // Unbooked myDATA received docs: matched to this company by issuer VAT, not yet a bill.
      let unb: { count: number; total: number } | null = null;
      const vatDigits = (company.vat_number ?? '').replace(/[^0-9]/g, '');
      if (vatDigits.length >= 8) {
        const vatForms = Array.from(new Set([company.vat_number, vatDigits].filter(Boolean))) as string[];
        let q = supabase
          .from('inbound_documents')
          .select('total_gross', { count: 'exact' })
          .in('issuer_vat', vatForms)
          .is('created_supplier_bill_id', null)
          .neq('status', 'dismissed');
        if (workspaceId) q = q.eq('workspace_id', workspaceId);
        const { data, count, error } = await q;
        if (!error) {
          const total = (data ?? []).reduce((s: number, r: any) => s + (Number(r.total_gross) || 0), 0);
          unb = { count: count ?? (data?.length ?? 0), total };
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
                    {unbooked.total > 0 && <span className="text-muted-foreground"> · {eur(unbooked.total)}</span>}
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

interface MarketAnalytics {
  product_count: number;
  totals: Record<string, number>;
  geo: Array<{ country: string | null; city: string | null; count: number }>;
  top_products: Array<{ product_id: string; name: string | null; count: number }>;
}

const MarketPositionCard: React.FC<CompanyMarketTabProps> = ({ companyId }) => {
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
      const { data, error } = await (supabase.rpc as any)('company_market_analytics', { p_company_id: companyId, p_days: 90 });
      if (cancelled) return;
      setLoadError(!!error);
      setData(error ? null : (data as unknown as MarketAnalytics));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const t = data?.totals ?? {};
  const views = t.product_view ?? 0;
  const saves = t.product_save ?? 0;
  const quotes = t.product_quote ?? 0;
  const hasSignal = data && (data.product_count > 0) && (views || saves || quotes || data.geo.length);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />Market position</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            How our users engage with this supplier's catalog products — demand and geography over the last 90 days.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : loadError ? (
          <p className="text-sm text-destructive italic">
            Could not load market analytics. This is a query failure, not a statement about your
            data — try again, and report it if it persists.
          </p>
        ) : !hasSignal ? (
          <p className="text-sm text-muted-foreground italic">
            {(!data || data.product_count === 0)
              ? 'No catalog products are linked to this company yet (via the Factory link on the Details tab), so there is no engagement to report.'
              : 'No user engagement recorded for this company’s products in the last 90 days.'}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCell label="Products" value={String(data!.product_count)} />
              <StatCell label="Views" value={views.toLocaleString()} />
              <StatCell label="Saves" value={saves.toLocaleString()} />
              <StatCell label="Quote adds" value={quotes.toLocaleString()} />
            </div>

            {data!.geo.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Where demand comes from</p>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {data!.geo.map((g, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
                      <span>{[g.city, g.country].filter(Boolean).join(', ') || 'Unknown'}</span>
                      <span className="text-muted-foreground">{g.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data!.top_products.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5"><LineChart className="h-3.5 w-3.5" />Most-engaged products</p>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {data!.top_products.map((p) => (
                    <div key={p.product_id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                      <span className="truncate">{p.name || p.product_id}</span>
                      <span className="text-muted-foreground shrink-0">{p.count.toLocaleString()} saves/quotes</span>
                    </div>
                  ))}
                </div>
              </div>
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
        .select('id, name, cost, cost_currency')
        .eq('brand_company_id', companyId);
      if (workspaceId) pq = pq.eq('workspace_id', workspaceId);
      const { data, error } = await pq.order('name').limit(60);
      if (error) console.error('[CompanyMarketTab] product load failed:', error.message);
      const rows = (error ? [] : (data as ProductRow[])) ?? [];
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

const StatCell: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="rounded-lg border border-border p-3">
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    <p className={`text-lg font-semibold ${accent ? 'text-amber-600 dark:text-amber-400' : ''}`}>{value}</p>
  </div>
);

export default CompanyMarketTab;

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Sparkles, Loader2, ExternalLink, Wallet, Inbox, ArrowRight, Building2, Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { financeService } from '@/modules/finance/services/financeService';
import { findCompetitors, type CompetitorOrg } from '@/services/companyEnrichService';

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

const eur = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0);

const hostOf = (url?: string | null): string | null => {
  if (!url) return null;
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || null;
};

/**
 * "Market" tab — competitive & market intelligence for one company, built from data we
 * already hold. Increment 1a: Competitors (same-ΚΑΔ CRM matches + Apollo/web-search discovery)
 * and the Financial snapshot (per-company billed/owed/paid + unbooked myDATA invoices). Product
 * price intel + re-scoped market-position analytics land in 1b (issue #288).
 */
export const CompanyMarketTab: React.FC<CompanyMarketTabProps> = ({ workspaceId, companyId, company }) => {
  return (
    <div className="space-y-4">
      <CompetitorsCard workspaceId={workspaceId} companyId={companyId} company={company} />
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
                <span className="text-muted-foreground/70">· via {discoverSource === 'apollo' ? 'Apollo' : 'web search'}</span>
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
            <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" />Financial relationship</CardTitle>
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
                to="/finance?tab=doc_expenses"
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

const StatCell: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="rounded-lg border border-border p-3">
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    <p className={`text-lg font-semibold ${accent ? 'text-amber-600 dark:text-amber-400' : ''}`}>{value}</p>
  </div>
);

export default CompanyMarketTab;

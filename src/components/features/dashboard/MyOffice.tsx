import React, { useEffect, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import {
  Wallet,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  Lightbulb,
  Info,
  RefreshCw,
  ShoppingCart,
  FileText,
  Building2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { StatBlock } from './StatBlock';
import { QuickAccess } from './QuickAccess';
import { usePipelineCounts, useCrmCounts } from './useDashboardBlocks';
import {
  ordersLink, quotesLink, receivablesLink, payablesLink, companiesLink,
  CRM_KIND, PROJECTS_LINK,
} from './officeLinks';
import { loadAgingLedger, summarizeAging, type AgingSummary } from '@/modules/finance/services/agingLedger';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  getDashboardInsights,
  type DashboardInsights,
  type InsightTone,
} from '@/services/dashboardInsightsService';

// ── helpers ─────────────────────────────────────────────────────────────────
function money(n: number, currency = 'EUR'): string {
  return formatMoney(n, currency, { decimals: 0 });
}

const TONE_STYLES: Record<InsightTone, { icon: React.ComponentType<{ className?: string }>; cls: string; chip: string }> = {
  warning: { icon: AlertTriangle, cls: 'text-amber-400', chip: 'bg-amber-400/[0.12]' },
  positive: { icon: TrendingUp, cls: 'text-emerald-400', chip: 'bg-emerald-400/[0.12]' },
  tip: { icon: Lightbulb, cls: 'text-primary', chip: 'bg-primary/[0.12]' },
  info: { icon: Info, cls: 'text-muted-foreground', chip: 'bg-muted' },
};

// ── stat tile ─────────────────────────────────────────────────────────────────
const EMPTY_SUMMARY: AgingSummary = {
  outstanding: 0, creditHeld: 0, overdueTotal: 0, overdueCount: 0, openCount: 0,
  currency: 'EUR', mixed: false,
};

interface StatState {
  /** Receivables / payables, summarized from the SAME ledger the Finance page reads. */
  ar: AgingSummary;
  ap: AgingSummary;
  /** The uninvoiced-orders overlay failed → both figures UNDER-report. Never shown as settled. */
  overlayFailed: boolean;
  projects: number;
}

const EMPTY_STATS: StatState = {
  ar: EMPTY_SUMMARY,
  ap: EMPTY_SUMMARY,
  overlayFailed: false,
  projects: 0,
};

// ── main panel ──────────────────────────────────────────────────────────────
const MyOfficeImpl: React.FC = () => {
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const { user } = useAuth();
  const [personName, setPersonName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [stats, setStats] = useState<StatState>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(true);

  // New operational blocks. Separate hooks so each lands independently without
  // blocking the others — and each block reserves its own height, so a late one
  // fills in place rather than resizing the panel.
  const { counts: pipeline, loading: pipelineLoading } = usePipelineCounts();
  const { counts: crm, loading: crmLoading } = useCrmCounts();

  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── greeting names ── two independent values:
  //   personName  → the human (full_name → signup display_name → email local-part)
  //   companyName → the business, resolved from the first source that has one:
  //                 the profile's linked company (crm_companies) → the workspace
  //                 finance issuer (finance_settings.business_name) → branding.
  // The workspace label ("Default Workspace") is a system name and never used.
  useEffect(() => {
    // Wait for the workspace to settle. The panel now mounts DURING that resolution
    // (see Index), and `activeWorkspaceId` is in the dep list, so running early just
    // buys a throwaway round of the same three queries with no workspace to read the
    // issuer name from.
    if (!user || workspaceLoading) return;
    let alive = true;
    (async () => {
      const metaName = (user.user_metadata?.display_name as string | undefined)?.trim() || '';
      const emailPrefix = user.email?.split('@')[0]?.trim() || '';

      const { data: prof } = await supabase
        .from('user_profiles')
        .select('full_name, business_id, branding_company_name')
        .eq('user_id', user.id)
        .maybeSingle();
      const fullName = (prof?.full_name as string | null)?.trim() || '';
      const person = [fullName, metaName, emailPrefix].find(Boolean) || '';

      let linkedCompany = '';
      if (prof?.business_id) {
        const { data: company } = await supabase
          .from('crm_companies')
          .select('name')
          .eq('id', prof.business_id)
          .maybeSingle();
        linkedCompany = (company?.name as string | null)?.trim() || '';
      }

      let issuerName = '';
      if (activeWorkspaceId) {
        const { data: fs } = await supabase
          .from('finance_settings')
          .select('business_name')
          .eq('workspace_id', activeWorkspaceId)
          .maybeSingle();
        issuerName = (fs?.business_name as string | null)?.trim() || '';
      }

      const branding = (prof?.branding_company_name as string | null)?.trim() || '';
      const company = [linkedCompany, issuerName, branding].find(Boolean) || '';

      if (alive) {
        setPersonName(person);
        setCompanyName(company);
      }
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [user, activeWorkspaceId, workspaceLoading]);

  // ── stats ──
  //
  // Receivables and payables come from `loadAgingLedger` — the SAME assembly the Finance page
  // reads, so the figure on this tile and the tab it links to cannot disagree. This used to sum
  // `invoices.amount_due` for three statuses with `.limit(1000)`, which was wrong three ways at
  // once: a silent cap past 1,000 open invoices, a total summed across currencies and then
  // labelled with whichever one the last row carried, and — the reason it was noticed — no
  // knowledge of confirmed-but-uninvoiced orders. In this workspace that is every receivable
  // there is, so the tile said "All Settled" and the Receivables tab it opened listed the money.
  useEffect(() => {
    if (!activeWorkspaceId) {
      // Only leave the loading state once we KNOW there is no workspace. While the
      // workspace is still resolving, dropping out of it renders "—" / "0" in the
      // tiles for a beat and then swaps in the real numbers.
      if (!workspaceLoading) setStatsLoading(false);
      return;
    }
    let alive = true;
    setStatsLoading(true);
    (async () => {
      const [ledger, projRes] = await Promise.all([
        loadAgingLedger(activeWorkspaceId),
        supabase
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', activeWorkspaceId)
          .in('status', ['planning', 'in_progress', 'on_hold']),
      ]);

      if (!alive) return;

      setStats({
        ar: summarizeAging(ledger.ar),
        ap: summarizeAging(ledger.ap),
        overlayFailed: ledger.overlayFailed,
        projects: projRes.count ?? 0,
      });
      setStatsLoading(false);
    })().catch(() => alive && setStatsLoading(false));
    return () => {
      alive = false;
    };
  }, [activeWorkspaceId, workspaceLoading]);

  // ── insights ──
  const loadInsights = async (force = false) => {
    if (!activeWorkspaceId) {
      // Same as the stats above — hold the skeleton until the workspace is settled,
      // otherwise the "Pro tip" empty state flashes in before the real insights.
      if (!workspaceLoading) setInsightsLoading(false);
      return;
    }
    if (force) setRefreshing(true);
    else setInsightsLoading(true);
    try {
      const res = await getDashboardInsights(activeWorkspaceId, { force });
      setInsights(res.insights);
    } catch {
      setInsights(null);
    } finally {
      setInsightsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadInsights(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, workspaceLoading]);

  // The Finance headline, and the one thing it must never say by accident.
  //
  // `overlayFailed` means the uninvoiced-orders half of the ledger did not load, so `outstanding`
  // is an UNDER-report — and an under-report of money owed reads as good news. "All Settled" is
  // therefore only ever shown when we actually know the ledger is complete AND empty; a failed
  // load says so instead. `mixed` gets the same treatment: a sum across currencies is not a
  // number a symbol can fix, so the caption says the total cannot be taken at face value rather
  // than quietly stamping it with the largest bucket's currency.
  const financeIncomplete = stats.overlayFailed;
  const financeHeadline = financeIncomplete
    ? '—'
    : stats.ar.openCount === 0
      ? '—'
      : money(stats.ar.outstanding, stats.ar.currency);
  const financeCaption = financeIncomplete
    ? 'Could Not Load'
    : stats.ar.openCount === 0
      // Nothing owed to us is not the same as nothing to know about. Customer money sitting on
      // account is money we HOLD, and the Finance page says so right next to this figure — a bare
      // "All Settled" here would be the only surface that omits it.
      ? (stats.ar.creditHeld > 0 ? `Settled · ${money(stats.ar.creditHeld, stats.ar.currency)} Held` : 'All Settled')
      : stats.ar.mixed
        ? `Outstanding · ${stats.ar.currency} + Other`
        : 'Outstanding';

  // A user with genuinely no workspace has no office to show — but `activeWorkspaceId`
  // is ALSO null for the first beat of every load, while the workspace resolves.
  // Returning null there rendered the dashboard's top row hero-only and then grew it
  // by this panel's height a moment later, shoving the widgets below down the page:
  // the "grid starts smaller and then expands" blink. Render the panel through the
  // resolving phase — its stat/insight skeletons above already hold the full height —
  // and only drop out once we actually know there is no workspace.
  if (!activeWorkspaceId && !workspaceLoading) return null;

  return (
    <div
      className="col-span-12 lg:col-span-5 rounded-2xl border border-primary/15 bg-card p-5 flex flex-col gap-4 relative overflow-hidden"
      style={{ backgroundImage: 'radial-gradient(420px 200px at 90% -20%, hsl(var(--primary) / 0.10), transparent 70%)' }}
    >
      {/* Greeting */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.14em] text-primary truncate">
          {companyName ? `My office, ${companyName}` : 'My office'}
        </p>
        <h2 className="font-display text-lg tracking-tight mt-0.5 truncate" style={{ fontWeight: 600 }}>
          {personName ? `Welcome back, ${personName}` : 'Welcome back'}
        </h2>
      </div>

      {/* Operational blocks — every panel carries a figure, what it is made of, and a way into
          the detail. Two rules hold here and nothing else checks them:

          1. Every bucket counted in the headline is VISIBLE in the breakdown. Orders showed
             Draft / Confirmed / Fulfilled under a headline of confirmed + partially_fulfilled, so
             no combination of the rows on screen added up to the number above them — and the one
             bucket that did (`partially_fulfilled`) was the only one not shown. Same for quotes:
             `quoted` was counted and hidden while `accepted` was shown and not counted.
          2. Every figure LINKS to the records it counted — the block to the list, each row to its
             slice. Not to the module's front door: `/finance` opens the Dashboard pane and `/crm`
             opens Users, which is not the CRM at all. */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatBlock
          icon={ShoppingCart}
          title="Orders"
          loading={pipelineLoading}
          value={pipeline.ordersOpen}
          caption={pipeline.ordersOpen === 1 ? 'Open Order' : 'Open Orders'}
          rows={[
            { label: 'Confirmed', value: pipeline.orders.confirmed ?? 0, to: ordersLink('confirmed') },
            { label: 'Partly fulfilled', value: pipeline.orders.partially_fulfilled ?? 0, to: ordersLink('partially_fulfilled') },
            { label: 'Draft', value: pipeline.orders.draft ?? 0, to: ordersLink('draft') },
          ]}
          linkTo={ordersLink()}
          linkLabel="All orders"
        />
        <StatBlock
          icon={FileText}
          title="Quotes"
          loading={pipelineLoading}
          value={pipeline.quotesActive}
          caption="In Play"
          rows={[
            { label: 'Draft', value: pipeline.quotes.draft ?? 0, to: quotesLink('draft') },
            { label: 'Submitted', value: pipeline.quotes.submitted ?? 0, to: quotesLink('submitted') },
            { label: 'Quoted', value: pipeline.quotes.quoted ?? 0, to: quotesLink('quoted') },
          ]}
          linkTo={quotesLink()}
          linkLabel="All quotes"
        />
        <StatBlock
          icon={Wallet}
          title="Finance"
          loading={statsLoading}
          value={financeHeadline}
          caption={financeCaption}
          rows={[
            { label: 'Open receivables', value: stats.ar.openCount, to: receivablesLink() },
            {
              label: 'Overdue',
              value: stats.ar.overdueCount,
              alert: stats.ar.overdueCount > 0,
              to: receivablesLink({ pastDue: true }),
            },
            { label: 'Payables', value: money(stats.ap.outstanding, stats.ap.currency), to: payablesLink() },
          ]}
          linkTo={receivablesLink()}
          linkLabel="Receivables"
        />
        <StatBlock
          icon={Building2}
          title="Customers"
          loading={crmLoading}
          value={crm.total}
          caption={crm.total === 1 ? 'Company' : 'Companies'}
          rows={[
            { label: 'Customers', value: crm.customers, to: companiesLink(CRM_KIND.customer) },
            { label: 'Suppliers', value: crm.suppliers, to: companiesLink(CRM_KIND.supplier) },
            { label: 'Active projects', value: stats.projects, to: PROJECTS_LINK },
          ]}
          linkTo={companiesLink()}
          linkLabel="All companies"
        />
      </div>

      <QuickAccess />

      {/* KAI insights */}
      <div className="mt-1 pt-4 border-t border-hairline flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <span
            className="inline-flex items-center gap-1.5 text-[11px] text-primary bg-primary/[0.12] border border-primary/25 rounded-full px-2.5 py-1"
            style={{ fontWeight: 600 }}
          >
            <Sparkles className="h-3 w-3" /> KAI · Live insights
          </span>
          {insights && (
            <button
              onClick={() => loadInsights(true)}
              disabled={refreshing}
              title="Refresh insights"
              className="text-muted-foreground hover:text-foreground transition-colors p-1 -mr-1 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        {/* FIXED height, not min-height, and it scrolls. Insights come from an LLM edge
            function — the slowest thing on the dashboard — and the endpoint returns
            anywhere from 2 to 5 of them with one-to-two-sentence bodies, so the resolved
            height is genuinely unknowable at paint time: a reserve big enough for five
            three-line insights would be mostly dead space, and anything smaller grows the
            panel when the call lands. This panel is the tallest thing in the top grid row,
            so its height IS the row's height — any growth here shoves LatestWidgets down
            the page seconds into the load. The height steps with the breakpoint because
            the COLUMN steps with it — a 3-insight set measures 263px in the 264px-wide
            lg column and 214px in the 459px-wide one — so each step is the measured fit
            for the typical set at that width, and anything longer scrolls. Still a
            constant per width: nothing the endpoint returns can change it. All three
            states (loading / pro-tip / resolved) occupy exactly this box. */}
        <div className="h-[15.5rem] sm:h-[13.5rem] lg:h-[16.5rem] xl:h-[14.5rem] 2xl:h-[13.5rem] scroll-y-clean">
          {insightsLoading ? (
            /* Shaped like a real insight row (icon chip + title + two-line body), not thin
               bars — a skeleton that doesn't match the row it stands in for is what let the
               height gap open up in the first place. */
            <div className="space-y-2.5 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-2.5 items-start p-1.5 -mx-1.5">
                  <span className="w-7 h-7 rounded-lg bg-primary/10 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-3 bg-primary/10 rounded w-1/2" />
                    <div className="h-2.5 bg-primary/10 rounded w-full" />
                    <div className="h-2.5 bg-primary/10 rounded w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : !insights ? (
            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
              <span className="text-[11px] font-medium text-primary uppercase tracking-wider">Pro tip</span>
              <p className="text-sm mt-1 leading-snug">
                Ask JARVIS to compare technical specs across brands, or prepare a quote from your catalog.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {insights.insights.map((ins, i) => {
                const t = TONE_STYLES[ins.tone] ?? TONE_STYLES.info;
                const Icon = t.icon;
                return (
                  <div key={i} className="flex gap-2.5 items-start p-1.5 -mx-1.5 rounded-xl hover:bg-white/5 transition-colors">
                    <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${t.chip}`}>
                      <Icon className={`h-3.5 w-3.5 ${t.cls}`} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm leading-tight" style={{ fontWeight: 500 }}>{ins.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{ins.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const MyOffice = React.memo(MyOfficeImpl);

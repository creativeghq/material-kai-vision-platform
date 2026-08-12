import React, { useEffect, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { Link } from 'react-router-dom';
import {
  Wallet,
  FolderKanban,
  ListChecks,
  Inbox as InboxIcon,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  Lightbulb,
  Info,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { inboxApi } from '@/services/inboxApi';
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
  warning: { icon: AlertTriangle, cls: 'text-amber-400', chip: 'bg-amber-400/12' },
  positive: { icon: TrendingUp, cls: 'text-emerald-400', chip: 'bg-emerald-400/12' },
  tip: { icon: Lightbulb, cls: 'text-primary', chip: 'bg-primary/12' },
  info: { icon: Info, cls: 'text-muted-foreground', chip: 'bg-muted' },
};

// ── stat tile ─────────────────────────────────────────────────────────────────
interface StatState {
  finance: { total: number; count: number; overdue: number; currency: string };
  projects: number;
  tasks: number;
  inbox: number;
}

const EMPTY_STATS: StatState = {
  finance: { total: 0, count: 0, overdue: 0, currency: 'EUR' },
  projects: 0,
  tasks: 0,
  inbox: 0,
};

function StatTile({
  icon: Icon,
  to,
  value,
  label,
  accent,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  value: React.ReactNode;
  label: string;
  accent?: boolean;
  loading: boolean;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-1 rounded-xl border border-white/8 bg-background/50 p-3 transition-colors hover:border-primary/40 hover:bg-background/80"
    >
      <div className="flex items-center justify-between">
        <Icon className={`h-4 w-4 ${accent ? 'text-amber-400' : 'text-primary'}`} />
        <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      {loading ? (
        /* h-5, no margin: exactly the box the resolved value occupies (text-xl +
           leading-none = 20px, and the <p> below has no margin of its own). The old
           h-6 + mt-0.5 was 6px taller, so all four tiles shrank a little the moment
           the numbers landed. */
        <div className="h-5 w-2/3 rounded bg-primary/10 animate-pulse" />
      ) : (
        <p className="text-xl font-display leading-none tracking-tight tabular-nums" style={{ fontWeight: 700 }}>
          {value}
        </p>
      )}
      {/* Two lines, always. The label is derived from the STATS, not skeletoned with
          them: it reads "All settled" / "0 open tasks" while the queries are in flight
          and "outstanding · 12 invoices" after — which wraps to a second line on any
          column narrower than ~1400px, growing all four tiles the moment the numbers
          land. Reserving both lines costs one blank line on wide screens and
          removes the shift everywhere. */}
      <p className="text-[11px] text-muted-foreground leading-snug min-h-[1.9rem] line-clamp-2">{label}</p>
    </Link>
  );
}

// ── main panel ──────────────────────────────────────────────────────────────
const MyOfficeImpl: React.FC = () => {
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const { user } = useAuth();
  const [personName, setPersonName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [stats, setStats] = useState<StatState>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(true);

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
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      const [invRes, projRes, taskRes, threadsRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('amount_due, due_at, status, currency')
          .eq('workspace_id', activeWorkspaceId)
          .in('status', ['issued', 'partially_paid', 'overdue'])
          .limit(1000),
        supabase
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', activeWorkspaceId)
          .in('status', ['planning', 'in_progress', 'on_hold']),
        userId
          ? supabase
              .from('project_tasks')
              .select('id', { count: 'exact', head: true })
              .eq('assignee_id', userId)
              .in('status', ['todo', 'in_progress', 'blocked'])
          : Promise.resolve({ count: 0 } as { count: number | null }),
        inboxApi.listThreads({ status: 'open' }).catch(() => ({ threads: [] as unknown[] })),
      ]);

      if (!alive) return;

      const invRows = (invRes.data ?? []) as Array<{ amount_due: number | null; due_at: string | null; status: string; currency: string }>;
      const now = Date.now();
      let total = 0;
      let overdue = 0;
      let currency = 'EUR';
      for (const r of invRows) {
        total += Number(r.amount_due ?? 0);
        if (r.status === 'overdue' || (r.due_at && new Date(r.due_at).getTime() < now)) overdue++;
        if (r.currency) currency = r.currency;
      }

      setStats({
        finance: { total: Math.round(total), count: invRows.length, overdue, currency },
        projects: projRes.count ?? 0,
        tasks: (taskRes as { count: number | null }).count ?? 0,
        inbox: ((threadsRes as { threads?: unknown[] })?.threads ?? []).length,
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
      className="col-span-12 lg:col-span-4 rounded-2xl border border-primary/15 bg-card p-5 flex flex-col gap-4 relative overflow-hidden"
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

      {/* Personal stats */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile
          icon={Wallet}
          to="/finance"
          loading={statsLoading}
          value={stats.finance.count === 0 ? '—' : money(stats.finance.total, stats.finance.currency)}
          label={
            stats.finance.count === 0
              ? 'All settled'
              : `outstanding · ${stats.finance.count} invoice${stats.finance.count !== 1 ? 's' : ''}`
          }
          accent={stats.finance.overdue > 0}
        />
        <StatTile
          icon={FolderKanban}
          to="/projects"
          loading={statsLoading}
          value={stats.projects}
          label={`active project${stats.projects !== 1 ? 's' : ''}`}
        />
        <StatTile
          icon={ListChecks}
          to="/projects"
          loading={statsLoading}
          value={stats.tasks}
          label={`open task${stats.tasks !== 1 ? 's' : ''}`}
        />
        <StatTile
          icon={InboxIcon}
          to="/inbox"
          loading={statsLoading}
          value={stats.inbox}
          label={`open conversation${stats.inbox !== 1 ? 's' : ''}`}
        />
      </div>

      {/* KAI insights */}
      <div className="mt-1 pt-4 border-t border-white/8 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <span
            className="inline-flex items-center gap-1.5 text-[11px] text-primary bg-primary/12 border border-primary/25 rounded-full px-2.5 py-1"
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
        <div className="h-[15.5rem] sm:h-[13.5rem] lg:h-[16.5rem] xl:h-[14.5rem] 2xl:h-[13.5rem] overflow-y-auto">
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

import React from 'react';
import {
  Wallet,
  FolderKanban,
  ListChecks,
  AlertTriangle,
  TrendingUp,
  Lightbulb,
  Info,
  RefreshCw,
} from 'lucide-react';

import { formatMoney } from '@/utils/decimal';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import type { InsightTone } from '@/services/dashboardInsightsService';
import {
  MicroLabel,
  KpiCard,
  MeshCard,
  StatTile,
  NotchPanel,
  NotchGroup,
  QuickActions,
  type QuickAction,
} from '@/components/core/DesignSystem';

import { useOfficeIdentity, useOfficeStats, useOfficeInsights } from './useOfficeData';

// ── helpers ─────────────────────────────────────────────────────────────────
function money(n: number, currency = 'EUR'): string {
  return formatMoney(n, currency, { decimals: 0 });
}

const TONE_STYLES: Record<InsightTone, { icon: React.ComponentType<{ className?: string }>; cls: string; chip: string }> = {
  warning: { icon: AlertTriangle, cls: 'text-amber', chip: 'bg-amber/12' },
  positive: { icon: TrendingUp, cls: 'text-vivid', chip: 'bg-vivid/12' },
  tip: { icon: Lightbulb, cls: 'text-primary', chip: 'bg-primary/12' },
  info: { icon: Info, cls: 'text-muted-foreground', chip: 'bg-muted' },
};

/** The five things a session actually starts with.
 *
 *  These point at the LIST pages, not `/…/new`: the platform has no bare `/new`
 *  routes at all — creation happens through each list's own create control (and
 *  for money documents, deliberately so; a prefill has to pass through numbering
 *  and buyer-risk rather than being conjured from a shortcut). Note `/moodboard`
 *  is singular — the plural is not a route. */
const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Quotes', to: '/quotes' },
  { label: 'Invoices', to: '/finance' },
  { label: 'Projects', to: '/projects' },
  { label: 'MoodBoards', to: '/moodboard' },
  { label: 'Contacts', to: '/crm' },
];

/** Skeleton shaped like the metric it stands in for, so nothing reflows on load. */
const MetricSkeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`h-[3.5rem] w-3/4 rounded-lg bg-foreground/8 animate-pulse ${className ?? ''}`} />
);

// ── main panel ──────────────────────────────────────────────────────────────
const MyOfficeImpl: React.FC = () => {
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const { personName, companyName } = useOfficeIdentity();
  const { stats, loading: statsLoading } = useOfficeStats();
  const { insights, loading: insightsLoading, refreshing, reload } = useOfficeInsights();

  // A user with genuinely no workspace has no office to show — but `activeWorkspaceId`
  // is ALSO null for the first beat of every load. Rendering null there and then
  // growing the page a moment later is the "grid starts smaller and expands" blink,
  // so render through the resolving phase and only drop out once we KNOW.
  if (!activeWorkspaceId && !workspaceLoading) return null;

  const fin = stats.finance;
  const headline = insights?.insights?.[0] ?? null;

  return (
    <div className="col-span-12 space-y-6">
      {/* ── Greeting + quick actions ───────────────────────────────────── */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <MicroLabel className="mb-2">
            {companyName ? `My Office · ${companyName}` : 'My Office'}
          </MicroLabel>
          <h2 className="display-hero text-foreground truncate">
            {personName ? `Welcome back, ${personName}` : 'Welcome back'}
          </h2>
        </div>
        <QuickActions actions={QUICK_ACTIONS} moreTo="/agent-hub" className="shrink-0" />
      </div>

      {/* ── Headline metrics + the one loud surface ────────────────────── */}
      <div className="grid grid-cols-12 gap-4 sm:gap-5 items-stretch">
        <div className="col-span-12 xl:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
          {statsLoading ? (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="surface-raised p-5 sm:p-6">
                  <div className="h-3 w-1/2 rounded bg-foreground/8 animate-pulse" />
                  <MetricSkeleton className="mt-5" />
                </div>
              ))}
            </>
          ) : (
            <>
              <KpiCard
                label="Outstanding"
                icon={Wallet}
                value={fin.count === 0 ? '—' : money(fin.total, fin.currency)}
                size="lg"
                to="/finance"
                caption={
                  fin.count === 0
                    ? 'All settled'
                    : `across ${fin.count} invoice${fin.count !== 1 ? 's' : ''}${fin.overdue > 0 ? ` · ${fin.overdue} overdue` : ''}`
                }
                {...(fin.overdue > 0
                  ? { delta: { label: `${fin.overdue} overdue`, direction: 'down' as const } }
                  : {})}
              />
              <KpiCard
                label="Active Projects"
                icon={FolderKanban}
                value={String(stats.projects)}
                size="lg"
                to="/projects"
                caption={stats.projects === 0 ? 'Nothing in flight' : 'planning, in progress or on hold'}
              />
              <KpiCard
                label="My Open Tasks"
                icon={ListChecks}
                value={String(stats.tasks)}
                size="lg"
                to="/projects"
                caption={stats.tasks === 0 ? 'Inbox zero' : 'assigned to you'}
              />
            </>
          )}
        </div>

        {/* The single saturated surface on the page. Carries the top KAI insight;
            the rest of the set lives in the Activities panel below. */}
        <div className="col-span-12 xl:col-span-4">
          <MeshCard
            eyebrow="KAI · Live Insights"
            to="/agent-hub"
            {...(insights?.insights?.length
              ? { pager: { count: Math.min(insights.insights.length, 4), active: 0 } }
              : {})}
            className="h-full"
          >
            {insightsLoading ? (
              <span className="block h-6 w-3/4 rounded bg-white/25 animate-pulse" />
            ) : headline ? (
              headline.title
            ) : (
              <>
                Ask JARVIS to compare specs across brands, or build a quote from your catalog.
              </>
            )}
          </MeshCard>
        </div>
      </div>

      {/* ── Activities ─────────────────────────────────────────────────── */}
      <NotchPanel
        title="Activities"
        count={stats.projects + stats.tasks + stats.inbox}
        toolbar={
          insights && (
            <button
              onClick={() => void reload(true)}
              disabled={refreshing}
              title="Refresh insights"
              className="circle-action"
              aria-label="Refresh insights"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          )
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-6">
          <NotchGroup label="Ongoing Work">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatTile
                value={String(stats.projects)}
                label="Projects"
                to="/projects"
                delta={
                  stats.projects > 0 ? { label: 'active', direction: 'up' as const } : undefined
                }
              />
              <StatTile value={String(stats.tasks)} label="Open Tasks" to="/projects" />
              <StatTile value={String(stats.inbox)} label="Conversations" to="/inbox" />
            </div>
          </NotchGroup>

          <div className="hidden lg:block w-px bg-border/60" />

          <NotchGroup label="Live Insights">
            {insightsLoading ? (
              <div className="space-y-2.5 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-2.5 items-start">
                    <span className="w-7 h-7 rounded-lg bg-foreground/8 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="h-3 bg-foreground/8 rounded w-1/2" />
                      <div className="h-2.5 bg-foreground/8 rounded w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !insights ? (
              <div className="surface-raised p-4">
                <MicroLabel>Pro Tip</MicroLabel>
                <p className="text-sm mt-2 leading-snug">
                  Ask JARVIS to compare technical specs across brands, or prepare a quote from your
                  catalog.
                </p>
              </div>
            ) : (
              /* Fixed height that scrolls: the endpoint returns anywhere from 2 to 5
                 insights of one-to-two sentences, so the resolved height is genuinely
                 unknowable at paint time. A constant box removes the reflow. */
              <div className="h-[13rem] overflow-y-auto pr-1 space-y-2.5">
                {insights.insights.map((ins, i) => {
                  const t = TONE_STYLES[ins.tone] ?? TONE_STYLES.info;
                  const Icon = t.icon;
                  return (
                    <div
                      key={i}
                      className="flex gap-2.5 items-start p-1.5 -mx-1.5 rounded-xl hover:bg-foreground/5 transition-colors"
                    >
                      <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${t.chip}`}>
                        <Icon className={`h-3.5 w-3.5 ${t.cls}`} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm leading-tight font-medium">{ins.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{ins.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </NotchGroup>
        </div>
      </NotchPanel>
    </div>
  );
};

export const MyOffice = React.memo(MyOfficeImpl);

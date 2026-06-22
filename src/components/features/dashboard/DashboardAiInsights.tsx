import React, { useEffect, useState } from 'react';
import { Sparkles, AlertTriangle, TrendingUp, Lightbulb, Info, RefreshCw } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  getDashboardInsights,
  type DashboardInsights,
  type InsightTone,
} from '@/services/dashboardInsightsService';

const TONE_STYLES: Record<InsightTone, { icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  warning: { icon: AlertTriangle, cls: 'text-amber-400' },
  positive: { icon: TrendingUp, cls: 'text-emerald-400' },
  tip: { icon: Lightbulb, cls: 'text-primary' },
  info: { icon: Info, cls: 'text-muted-foreground' },
};

/** Static, dependency-free panel shown until insights load or if they fail entirely. */
const StaticFallback: React.FC = () => (
  <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
    <span className="text-xs font-medium text-primary uppercase tracking-wider">Pro Tip</span>
    <p className="text-sm mt-1">Use the Agent Hub to compare technical specs across different manufacturers.</p>
  </div>
);

export const DashboardAiInsights: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const [data, setData] = useState<DashboardInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (force = false) => {
    if (!activeWorkspaceId) {
      setLoading(false);
      return;
    }
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await getDashboardInsights(activeWorkspaceId, { force });
      setData(res.insights);
      setFailed(false);
    } catch {
      // The endpoint is designed not to fail; this only catches network/auth issues.
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  return (
    <div className="col-span-12 lg:col-span-4 rounded-xl border border-white/8 bg-card p-6 flex flex-col">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-xl font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Insights
        </h3>
        {data && (
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            title="Refresh insights"
            className="text-muted-foreground hover:text-foreground transition-colors p-1 -mr-1 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3 mt-2 animate-pulse">
          <div className="h-3 bg-primary/10 rounded w-5/6" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-2.5 bg-primary/10 rounded w-1/3" />
              <div className="h-2 bg-primary/10 rounded w-full" />
            </div>
          ))}
        </div>
      ) : failed || !data ? (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            JARVIS is continuously learning from new catalogs and materials added to the platform.
            Ask it anything about specs, suppliers, or design.
          </p>
          <div className="mt-auto">
            <StaticFallback />
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{data.headline}</p>
          <div className="space-y-3 flex-1">
            {data.insights.map((ins, i) => {
              const t = TONE_STYLES[ins.tone] ?? TONE_STYLES.info;
              const Icon = t.icon;
              return (
                <div key={i} className="flex gap-2.5">
                  <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${t.cls}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{ins.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{ins.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

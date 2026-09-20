import React, { useState } from 'react';
import { AlertTriangle, Globe2, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { timeAgo } from '@/utils/datetime';
import { Sparkline } from './Sparkline';
import { statusPresentation } from './seoMetrics';
import type { LlmMentionTarget, LlmMentionsReport } from './aiCitations';

function firstNumber(m: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = m?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

const Leaderboard: React.FC<{
  title: string;
  rows: { label: string; n: number | null }[];
  empty: string;
}> = ({ title, rows, empty }) => (
  <div>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
    {rows.length === 0 ? (
      <p className="mt-1 text-[11px] text-muted-foreground">{empty}</p>
    ) : (
      <ol className="mt-1 space-y-1">
        {rows.slice(0, 8).map((r, i) => (
          <li key={`${r.label}-${i}`} className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-xs text-foreground">{r.label}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{r.n ?? '—'}</span>
          </li>
        ))}
      </ol>
    )}
  </div>
);

const TargetCard: React.FC<{ t: LlmMentionTarget }> = ({ t }) => {
  const presentation = statusPresentation(t.status);
  const ok = t.status === 'ok';
  const citations = firstNumber(t.metrics, ['citations', 'citations_count', 'total_citations']);
  const mentions = firstNumber(t.metrics, ['mentions', 'mentions_count', 'total_mentions']);
  const points = (t.series ?? []).map((p) => Number(p.value)).filter((n) => Number.isFinite(n));

  return (
    <div className="rounded-sm border border-hairline p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-foreground">
          {t.target_kind === 'domain' ? 'Your domain' : 'Market'}: <span className="font-normal">{t.target}</span>
        </p>
        <span className="text-[11px] text-muted-foreground">read {timeAgo(t.captured_at)}</span>
      </div>

      {!ok && (
        <p className="mt-1.5 flex items-start gap-1 text-[11px] leading-snug text-muted-foreground">
          {presentation.tone === 'warning' && (
            <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          )}
          <span>{t.note || presentation.explain}</span>
        </p>
      )}

      {ok && t.target_kind === 'domain' && (
        <div className="mt-2 flex flex-wrap items-end gap-6">
          <div>
            <p className="text-[11px] text-muted-foreground">Citations in the corpus</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">{citations ?? '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Mentions</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">{mentions ?? '—'}</p>
          </div>
          {points.length >= 2 && (
            <div className="min-w-[140px] flex-1">
              <p className="mb-1 text-[11px] text-muted-foreground">Over time</p>
              <Sparkline points={points} className="h-10 w-full" ariaLabel="Citations over time" />
            </div>
          )}
        </div>
      )}

      {ok && t.target_kind === 'keyword' && (
        <div className="mt-2 grid gap-4 sm:grid-cols-3">
          <Leaderboard
            title="Most cited domains"
            rows={(t.top_domains ?? []).map((d) => ({ label: d.domain ?? '—', n: d.citations ?? d.mentions ?? null }))}
            empty="No domain data for this keyword."
          />
          <Leaderboard
            title="Most named brands"
            rows={(t.top_brands ?? []).map((b) => ({ label: b.brand ?? '—', n: b.mentions ?? null }))}
            empty="No brand data for this keyword."
          />
          <Leaderboard
            title="Most cited pages"
            rows={(t.top_pages ?? []).map((p) => ({ label: (p.url ?? '—').replace(/^https?:\/\/(www\.)?/, ''), n: p.citations ?? null }))}
            empty="No page data for this keyword."
          />
        </div>
      )}
    </div>
  );
};

export const LlmMentionsPanel: React.FC<{
  report: LlmMentionsReport | null;
  onRefresh: () => Promise<void>;
}> = ({ report, onRefresh }) => {
  const [busy, setBusy] = useState(false);
  const targets = report?.targets ?? [];

  const run = async () => {
    setBusy(true);
    try { await onRefresh(); } finally { setBusy(false); }
  };

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe2 className="h-4 w-4 text-primary" />
              In the wider corpus
            </CardTitle>
            <CardDescription>
              DataForSEO&rsquo;s index of real AI answers — millions of other people&rsquo;s questions, not the
              ones we ask. A separate sample, deliberately never merged with our own probes. ChatGPT
              coverage here is United States only.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" className="shrink-0" disabled={busy} onClick={run}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            Read the corpus
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {targets.length === 0 ? (
          <HubEmptyState
            variant="empty"
            title="The corpus has not been read yet"
            description={report?.note
              || 'Read it to see how often your domain is cited in real AI answers, and which domains and brands lead your market.'}
          />
        ) : (
          <div className="space-y-3">
            {targets.map((t) => <TargetCard key={`${t.target_kind}:${t.target}`} t={t} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LlmMentionsPanel;

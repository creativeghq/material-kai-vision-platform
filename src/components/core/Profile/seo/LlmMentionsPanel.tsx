import React, { useState } from 'react';
import { AlertTriangle, Globe2, Loader2, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { timeAgo } from '@/utils/datetime';
import { Sparkline } from './Sparkline';
import { compact, statusPresentation } from './seoMetrics';
import {
  PLATFORM_LABEL, leaderCount, leaderLabel,
  type LlmLeader, type LlmMentionTarget, type LlmMentionsReport, type LlmPlatformCoverage,
} from './aiCitations';

const MARKET_SOURCE: Record<string, string> = {
  tracked_keywords: 'from the site’s tracked keywords',
  tracked_subject: 'from the AI-visibility subject',
  request: 'chosen for the last read',
};

const StatusTag: React.FC<{ status: string }> = ({ status }) => {
  if (status === 'ok') return <Badge variant="success">Measured</Badge>;
  const p = statusPresentation(status);
  return <Badge variant={p.tone === 'warning' ? 'warning' : 'neutral'}>{p.placeholder}</Badge>;
};

const Note: React.FC<{ text: string | null | undefined; warn?: boolean }> = ({ text, warn }) =>
  text ? (
    <p className="flex items-start gap-1 text-[11px] leading-snug text-muted-foreground">
      {warn && <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />}
      <span>{text}</span>
    </p>
  ) : null;

const Leaderboard: React.FC<{ title: string; rows: LlmLeader[]; empty: string; strip?: boolean }> = ({
  title, rows, empty, strip,
}) => {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 8);
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-muted-foreground">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{empty}</p>
      ) : (
        <>
          <ol className="mt-1 space-y-1">
            {shown.map((r, i) => {
              const label = leaderLabel(r);
              return (
                <li key={`${label}-${i}`} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-xs text-foreground" title={label}>
                    {strip ? label.replace(/^https?:\/\/(www\.)?/, '') : label}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {leaderCount(r) ?? '—'}
                    {r.ai_search_volume != null ? ` · vol ${compact(r.ai_search_volume)}` : ''}
                  </span>
                </li>
              );
            })}
          </ol>
          {rows.length > 8 && (
            <button type="button" className="mt-1 text-[11px] text-primary hover:underline" onClick={() => setAll((v) => !v)}>
              {all ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
};

const DomainBlock: React.FC<{ t: LlmMentionTarget }> = ({ t }) => {
  const m = t.metrics ?? {};
  const series = (t.series ?? []).filter((p) => p.value != null && Number.isFinite(Number(p.value)));
  const points = series.map((p) => Number(p.value));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-foreground">Your domain · <span className="font-normal">{t.target}</span></p>
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <StatusTag status={t.status} /> read {timeAgo(t.captured_at)}
        </span>
      </div>
      <Note text={t.status === 'ok' ? t.note : (t.note || statusPresentation(t.status).explain)} warn={t.status !== 'ok' || !!t.note} />
      {t.status === 'ok' && (
        <>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="text-[11px] text-muted-foreground">Mentions in AI answers</p>
              <p className="text-2xl font-semibold tabular-nums text-foreground">{m.mentions ?? '—'}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">AI search volume</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {m.ai_search_volume != null ? compact(m.ai_search_volume) : '—'}
              </p>
            </div>
            <div className="min-w-[160px] flex-1">
              <p className="mb-1 text-[11px] text-muted-foreground">
                Month by month{series.length > 0 ? ` · ${series[0].date} → ${series[series.length - 1].date}` : ''}
              </p>
              {points.length >= 2 ? (
                <Sparkline points={points} className="h-10 w-full" ariaLabel="Mentions per month" />
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {points.length === 1 ? `One month on record (${points[0]}); a trend needs two.` : 'No monthly history returned.'}
                </p>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Leaderboard title="Sources cited alongside you" rows={m.sources_domain ?? []}
              empty="No source domains were returned for your mentions." />
            <Leaderboard title="Brands named alongside you" rows={m.brand_entities ?? []}
              empty="No brand entities were returned for your mentions." />
            <Leaderboard title="Categories" rows={m.brand_categories ?? []}
              empty="No brand categories were returned." />
          </div>
        </>
      )}
    </div>
  );
};

const KeywordBlock: React.FC<{ t: LlmMentionTarget }> = ({ t }) => (
  <div className="space-y-2 border-t border-hairline pt-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="text-xs font-medium text-foreground">Your market · <span className="font-normal">answers about “{t.target}”</span></p>
      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <StatusTag status={t.status} /> read {timeAgo(t.captured_at)}
      </span>
    </div>
    <Note text={t.status === 'ok' ? t.note : (t.note || statusPresentation(t.status).explain)} warn={t.status !== 'ok' || !!t.note} />
    {t.status === 'ok' && (
      <div className="grid gap-4 sm:grid-cols-3">
        <Leaderboard title="Most mentioned domains" rows={t.top_domains ?? []} empty="No domain data for this keyword." />
        <Leaderboard title="Most named brands" rows={t.top_brands ?? []} empty="No brand data for this keyword." />
        <Leaderboard title="Most cited pages" rows={t.top_pages ?? []} empty="No page data for this keyword." strip />
      </div>
    )}
  </div>
);

const PlatformSection: React.FC<{
  label: string;
  coverage: LlmPlatformCoverage | null;
  targets: LlmMentionTarget[];
}> = ({ label, coverage, targets }) => {
  const domain = targets.find((t) => t.target_kind === 'domain');
  const keyword = targets.find((t) => t.target_kind === 'keyword');
  return (
    <div className="space-y-3 rounded-sm border border-hairline p-3">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      {coverage && !coverage.covered && targets.length === 0 && (
        <div className="flex items-start gap-2">
          <Badge variant="neutral">Not collected</Badge>
          <Note text={coverage.note} />
        </div>
      )}
      {targets.length === 0 && (!coverage || coverage.covered) && (
        <Note text="Not read yet for this platform. Read the corpus, or wait for the weekly run." />
      )}
      {domain && <DomainBlock t={domain} />}
      {keyword && <KeywordBlock t={keyword} />}
    </div>
  );
};

export const LlmMentionsPanel: React.FC<{
  report: LlmMentionsReport | null;
  onRefresh: () => Promise<void>;
}> = ({ report, onRefresh }) => {
  const [busy, setBusy] = useState(false);
  const targets = report?.targets ?? [];
  const platforms = report?.platforms ?? [];
  const market = report?.market;
  const known = new Set(platforms.map((p) => p.platform));
  const orphanPlatforms = Array.from(new Set(targets.map((t) => t.platform ?? '').filter((p) => !known.has(p))));

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
              DataForSEO&rsquo;s index of real AI answers — other people&rsquo;s questions, not the ones we ask. A
              separate sample, never merged with our own probes.
            </CardDescription>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {market?.country_code && market?.language_code ? (
                <>
                  Market <b className="text-foreground">{market.country_code} / {market.language_code}</b>
                  {market.source ? ` ${MARKET_SOURCE[market.source] ?? `(${market.source})`}` : ''}
                  {market.note ? ` — ${market.note}` : ''}
                </>
              ) : (
                <span className="text-amber-800 dark:text-amber-300">{market?.note || 'No market is known for this site.'}</span>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {report?.reads ? `Read ${report.reads} time${report.reads === 1 ? '' : 's'} in ${report.window_days} days · last ${timeAgo(report.last_read_at ?? null)}` : 'Never read'}
              {report?.schedule ? ` · ${report.schedule}` : ''}
            </p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0" disabled={busy} onClick={run}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            Read the corpus
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!report && <Note warn text="The corpus report could not be loaded, so nothing here is known." />}
        {report && targets.length === 0 && <Note text={report.note} />}
        {platforms.map((p) => (
          <PlatformSection
            key={p.platform}
            label={p.label || PLATFORM_LABEL[p.platform] || p.platform}
            coverage={p}
            targets={targets.filter((t) => t.platform === p.platform)}
          />
        ))}
        {orphanPlatforms.map((p) => (
          <PlatformSection
            key={`orphan-${p}`}
            label={p ? (PLATFORM_LABEL[p] ?? p) : 'All platforms (earlier read, before per-platform reads)'}
            coverage={null}
            targets={targets.filter((t) => (t.platform ?? '') === p)}
          />
        ))}
      </CardContent>
    </Card>
  );
};

export default LlmMentionsPanel;

import React, { useState } from 'react';
import { AlertTriangle, FileSearch, Loader2, Wrench } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/utils/datetime';
import { statusPresentation } from './seoMetrics';
import { CITABILITY_DIMENSIONS } from './citabilityDimensions';
import { displayHost, modelLabel, type CitabilityReport, type LostQuestion } from './aiCitations';

const FIX_BY_KEY = new Map(CITABILITY_DIMENSIONS.map((d) => [d.key, d]));

function scoreTone(score: number): string {
  if (score >= 70) return 'text-emerald-700 dark:text-emerald-400';
  if (score >= 40) return 'text-amber-800 dark:text-amber-300';
  return 'text-[hsl(var(--error))]';
}

const QuestionRow: React.FC<{
  q: LostQuestion;
  busy: boolean;
  onAnalyse: () => void;
}> = ({ q, busy, onAnalyse }) => {
  const page = q.page;
  const scored = page && page.status === 'ok' && page.score != null;
  const presentation = statusPresentation(page?.status ?? 'not_collected');
  const gaps = (page?.gaps ?? []).slice(0, 3).map((k) => FIX_BY_KEY.get(k)).filter(Boolean);
  return (
    <li className="rounded-sm border border-hairline">
      <div className="flex flex-wrap items-start justify-between gap-2 bg-surface-sunken px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-snug text-foreground">{q.prompt_text}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {q.cited === 0 && q.named === 0
              ? 'Never named, never cited'
              : q.cited === 0
                ? `Named in ${q.named} of ${q.answers} answers, cited in none`
                : `Cited in ${q.cited} of ${q.answers}`}
            {' · '}{q.engines.map(modelLabel).join(', ')}
            {q.last_asked ? ` · asked ${timeAgo(q.last_asked)}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {scored && (
            <span className={cn('text-lg font-semibold tabular-nums', scoreTone(page!.score as number))}>
              {page!.score}
            </span>
          )}
          <Button size="sm" variant="outline" disabled={busy} onClick={onAnalyse}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileSearch className="mr-1 h-3.5 w-3.5" />}
            {page ? 'Re-read page' : 'Find the page'}
          </Button>
        </div>
      </div>
      <div className="space-y-2 px-3 py-2">
        {q.rival_urls.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Cited instead:{' '}
            {q.rival_urls.slice(0, 5).map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="mr-2 text-primary hover:underline">
                {displayHost(u)}
              </a>
            ))}
          </p>
        )}
        {q.rival_urls.length === 0 && q.rival_brands.length > 0 && (
          <p className="text-[11px] text-muted-foreground" title={q.rival_brands.join(', ')}>
            Named instead: {q.rival_brands.slice(0, 6).join(', ')}
            {q.rival_brands.length > 6 ? ` +${q.rival_brands.length - 6}` : ''}
          </p>
        )}
        {!page && (
          <p className="text-[11px] text-muted-foreground">
            No page of yours has been checked against this question yet.
          </p>
        )}
        {page && !scored && (
          <p className="flex items-start gap-1 text-[11px] leading-snug text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{page.note || presentation.explain}</span>
          </p>
        )}
        {scored && (
          <>
            <p className="text-[11px] text-muted-foreground">
              Best match:{' '}
              <a href={page!.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {displayHost(page!.url)}{new URL(page!.url).pathname}
              </a>
              {page!.words ? ` · ${page!.words} words` : ''}
              {page!.analysed_at ? ` · read ${timeAgo(page!.analysed_at)}` : ''}
            </p>
            {gaps.length > 0 ? (
              <ul className="space-y-1">
                {gaps.map((d) => (
                  <li key={d!.key} className="flex items-start gap-1.5 text-[11px] leading-snug">
                    <Wrench className="mt-px h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                    <span className="text-foreground"><b>{d!.label}.</b>{' '}
                      <span className="text-muted-foreground">{d!.fix}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                This page is already well shaped for the question — the gap is authority or awareness, not the page.
              </p>
            )}
          </>
        )}
      </div>
    </li>
  );
};

/** Which page should have answered, what is wrong with it, and what to change. */
export const CitabilityPanel: React.FC<{
  report: CitabilityReport | null;
  onAnalyse: (question: string) => Promise<void>;
}> = ({ report, onAnalyse }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (question: string) => {
    setBusy(question);
    try { await onAnalyse(question); } finally { setBusy(null); }
  };
  const questions = report?.questions ?? [];
  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4 text-primary" />
          Why you were not cited
        </CardTitle>
        <CardDescription>
          Every question an assistant answered without linking you, the page of yours that should
          have won it, and what that page is missing. A page is read when you ask for it.
        </CardDescription>
        {report?.pages_note && (
          <p className="mt-1 text-[11px] text-muted-foreground">{report.pages_note}</p>
        )}
      </CardHeader>
      <CardContent>
        {questions.length === 0 ? (
          <HubEmptyState
            variant="empty"
            title="Nothing lost in this window"
            description={report?.note
              || 'No answered question failed to cite you — either every answer linked you, or nothing has been asked yet.'}
          />
        ) : (
          <ul className="space-y-2.5">
            {questions.map((q) => (
              <QuestionRow
                key={`${q.template_key}:${q.prompt_text}`}
                q={q}
                busy={busy === q.prompt_text}
                onAnalyse={() => run(q.prompt_text)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default CitabilityPanel;

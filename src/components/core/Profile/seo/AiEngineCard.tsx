import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/core/ui/tooltip';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/utils/datetime';
import { statusPresentation } from './seoMetrics';
import {
  VERDICT_FILL, formatUsd, modelLabel,
  type AiEngine, type AiRate, type AiRival,
} from './aiCitations';

/** One answer engine as its own column. It leads with the rate that can be UNKNOWN,
 *  so an engine that never browsed says so where the figure would be. */

/** The headline rate, or the stated reason there is none. */
const Rate: React.FC<{ rate: AiRate; label: string; help: string; big?: boolean }> = ({
  rate, label, help, big,
}) => {
  const present = rate.status === 'ok' && rate.value != null;
  const presentation = statusPresentation(rate.status);
  return (
    <div>
      <div className="flex items-center gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label={`About ${label}`} className="shrink-0 rounded-xs text-muted-foreground hover:text-foreground">
              <Info className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{help}</TooltipContent>
        </Tooltip>
      </div>
      <p
        className={cn(
          'mt-0.5 font-semibold leading-none tracking-tight tabular-nums',
          big ? 'text-3xl' : 'text-lg',
          present
            ? 'text-foreground'
            : presentation.tone === 'warning'
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-muted-foreground',
        )}
      >
        {present ? `${rate.value}%` : presentation.placeholder}
      </p>
      {!present && (
        <p className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-muted-foreground">
          {presentation.tone === 'warning' && (
            <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          )}
          <span>{rate.note || presentation.explain}</span>
        </p>
      )}
    </div>
  );
};

/** The denominator is `probes`, not `answered` — a bar drawn over successes alone
 *  hides the outage that produced them. */
const VerdictBar: React.FC<{ engine: AiEngine }> = ({ engine }) => {
  const total = Math.max(engine.probes, 1);
  const namedOnly = Math.max(engine.named - engine.cited, 0);
  const absent = Math.max(engine.answered - engine.named, 0);
  const segments: { key: keyof typeof VERDICT_FILL; n: number; label: string }[] = [
    { key: 'cited', n: engine.cited, label: 'cited you as a source' },
    { key: 'named', n: namedOnly, label: 'named you in the prose' },
    { key: 'absent', n: absent, label: 'left you out' },
    { key: 'failed', n: engine.failed, label: 'failed' },
  ];
  return (
    <div>
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-sm bg-muted"
        role="img"
        aria-label={segments.map((s) => `${s.n} ${s.label}`).join(', ')}
      >
        {segments.filter((s) => s.n > 0).map((s) => (
          <Tooltip key={s.key}>
            <TooltipTrigger asChild>
              <div className={cn('h-full', VERDICT_FILL[s.key])} style={{ width: `${(s.n / total) * 100}%` }} />
            </TooltipTrigger>
            <TooltipContent>{s.n} of {engine.probes} {s.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {engine.answered} answered{engine.failed > 0 ? ` · ${engine.failed} failed` : ''}
        {engine.avg_position != null ? ` · avg rank #${engine.avg_position}` : ''}
        {engine.cost_usd ? ` · ${formatUsd(engine.cost_usd)}` : ''}
      </p>
    </div>
  );
};

const Instead: React.FC<{ rivals: AiRival[]; model: string; sourced: boolean }> = ({ rivals, model, sourced }) => {
  const mine = rivals.filter((r) => r.engines.includes(model)).slice(0, 3);
  if (mine.length === 0) return null;
  return (
    <div className="border-t border-hairline pt-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {sourced ? 'Cites instead' : 'Names instead'}
      </p>
      <ul className="mt-1 space-y-0.5">
        {mine.map((r) => (
          <li key={r.domain ?? r.name} className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-xs text-foreground">{r.domain ?? r.name}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{r.answers}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const AiEngineCard: React.FC<{
  engine: AiEngine;
  citedInstead: AiRival[];
  namedInstead: AiRival[];
}> = ({ engine, citedInstead, namedInstead }) => {
  const dead = engine.status === 'collector_failed';
  return (
    <div className="flex flex-col gap-3 rounded-md border border-hairline bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{modelLabel(engine.model)}</p>
          <p className="truncate text-[11px] text-muted-foreground" title={engine.model}>{engine.model}</p>
        </div>
        <span
          className={cn(
            'mt-1 h-2 w-2 shrink-0 rounded-full',
            dead ? 'bg-[hsl(var(--error))]' : engine.browses ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-amber-600 dark:bg-amber-400',
          )}
          title={dead ? 'Every call failed' : engine.browses ? 'Answers with sources' : 'Answers from memory — no sources'}
          aria-hidden="true"
        />
      </div>

      <Rate
        big
        rate={engine.citation_rate}
        label="Citation rate"
        help="Share of this assistant's answers that linked your site as a source. Only answerable when it returned sources at all — an assistant answering from memory reports Not measured, not 0%."
      />
      <Rate
        rate={engine.mention_rate}
        label="Named rate"
        help="Share of answers that named your brand anywhere in the prose, whether or not it linked you."
      />

      <VerdictBar engine={engine} />
      <Instead
        rivals={engine.browses ? citedInstead : namedInstead}
        model={engine.model}
        sourced={engine.browses}
      />

      {engine.last_run_at && (
        <p className="text-[11px] text-muted-foreground">Last asked {timeAgo(engine.last_run_at)}</p>
      )}
    </div>
  );
};

export default AiEngineCard;

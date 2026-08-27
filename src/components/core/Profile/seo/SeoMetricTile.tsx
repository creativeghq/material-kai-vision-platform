import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';

import { HubStatTile } from '@/components/core/hub/HubStatTile';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/core/ui/tooltip';
import { cn } from '@/lib/utils';
import { Sparkline } from './Sparkline';
import {
  deltaDirection,
  formatDelta,
  formatMetricValue,
  statusPresentation,
  type SeoMetric,
  type SeoMetricDescriptor,
} from './seoMetrics';

/**
 * One metric tile that can honestly say "I don't have this".
 *
 * The tile is ALWAYS rendered — an absent metric keeps its slot in the grid and
 * states why it is absent. Dropping the tile is what produced the original
 * complaint: the site's backlink figures have never once been fetched, and the
 * panel's response was to silently render four tiles instead of eight, so
 * nothing on screen ever said the backlink collector was broken.
 */
export const SeoMetricTile: React.FC<{
  descriptor: SeoMetricDescriptor;
  metric: SeoMetric | null | undefined;
  /** Period the delta compares against, e.g. "vs last capture". */
  deltaCaption?: string;
  onClick?: () => void;
  className?: string;
}> = ({ descriptor, metric, deltaCaption, onClick, className }) => {
  const status = metric?.status ?? 'not_collected';
  const present = status === 'ok' && metric?.value != null;
  const presentation = statusPresentation(status);

  if (!present) {
    return (
      <div className={cn('rounded-md border border-hairline bg-card p-3.5', className)}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-muted-foreground">{descriptor.label}</p>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`About ${descriptor.label}`}
                className="shrink-0 rounded-xs text-muted-foreground hover:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{descriptor.help}</TooltipContent>
          </Tooltip>
        </div>

        <p
          className={cn(
            'mt-1 text-2xl font-semibold leading-none tracking-tight',
            presentation.tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
          )}
        >
          {presentation.placeholder}
        </p>

        <p className="mt-1.5 flex items-start gap-1 text-[11px] leading-snug text-muted-foreground">
          {presentation.tone === 'warning' && (
            <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          )}
          <span>{metric?.note || presentation.explain}</span>
        </p>
      </div>
    );
  }

  const m = metric as SeoMetric;
  const hasDelta = m.delta != null || m.delta_pct != null;

  return (
    <HubStatTile
      className={className}
      label={descriptor.label}
      help={descriptor.help}
      value={formatMetricValue(m.value as number, descriptor.format)}
      onClick={onClick}
      delta={
        hasDelta
          ? {
              value: formatDelta(m, descriptor.format),
              direction: deltaDirection(m),
              upIsGood: descriptor.upIsGood,
              caption: deltaCaption,
            }
          : undefined
      }
      chart={
        m.series.length >= 2 ? (
          <Sparkline
            points={m.series.map((p) => p.v)}
            upIsGood={descriptor.upIsGood}
            ariaLabel={`${descriptor.label} across ${m.series.length} captures`}
          />
        ) : undefined
      }
    />
  );
};

export default SeoMetricTile;

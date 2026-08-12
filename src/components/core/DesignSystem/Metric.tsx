import React from 'react';

import { cn } from '@/lib/utils';

export type MetricSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<MetricSize, string> = {
  sm: 'metric-sm',
  md: 'metric-md',
  lg: 'metric-lg',
  xl: 'metric-xl',
};

interface MetricProps {
  /** Already-formatted display value, e.g. "€23,876" or "32.5%". Format upstream —
   *  this component NEVER derives or rounds a number, it only sets type. */
  value: string;
  size?: MetricSize;
  /** Two-tone split. 'auto' greys the final group (",876" of "23,876"), which is
   *  what makes the magnitude land first. 'none' renders one flat tone. */
  split?: 'auto' | 'none';
  className?: string;
}

/** A currency mark / unit that should ride small and high rather than at numeral size. */
const AFFIX_RE = /^([^\d\-+.]*)(.*?)([^\d]*)$/s;

/** Split a formatted number into { prefix, lead, trail, suffix }.
 *
 *  The reference dashboards grey the LAST group only — "$ 170,024" sets "170"
 *  at full weight and ",024" muted — so the split point is the final separator
 *  followed by digits, not the first one. */
export function splitMetric(value: string): {
  prefix: string;
  lead: string;
  trail: string;
  suffix: string;
} {
  const m = AFFIX_RE.exec(value);
  const prefix = m?.[1] ?? '';
  const body = m?.[2] ?? value;
  const suffix = m?.[3] ?? '';

  // Final separator + trailing digit group (thousands tail or decimals).
  const sep = /[.,](\d+)$/.exec(body);
  if (!sep || sep.index <= 0) {
    return { prefix, lead: body, trail: '', suffix };
  }
  return {
    prefix,
    lead: body.slice(0, sep.index),
    trail: body.slice(sep.index),
    suffix,
  };
}

/**
 * Metric — the oversized two-tone numeral.
 *
 * This is the centrepiece of the 2026 command-center language. Before it, the
 * platform had no type tier above 36px, so a KPI and a table cell carried the
 * same visual weight and nothing on a screen led the eye.
 *
 * Usage:
 *   <Metric value={formatMoney(total, 'EUR', { decimals: 0 })} size="lg" />
 */
export const Metric: React.FC<MetricProps> = ({
  value,
  size = 'md',
  split = 'auto',
  className,
}) => {
  const { prefix, lead, trail, suffix } = React.useMemo(
    () => (split === 'auto' ? splitMetric(value) : { prefix: '', lead: value, trail: '', suffix: '' }),
    [value, split],
  );

  return (
    <span className={cn('metric', SIZE_CLASS[size], className)}>
      {prefix && <span className="metric-affix">{prefix}</span>}
      <span>{lead}</span>
      {trail && <span className="metric-trail">{trail}</span>}
      {suffix && <span className="metric-affix">{suffix}</span>}
    </span>
  );
};

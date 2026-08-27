import React from 'react';

/**
 * Minimal inline SVG sparkline — no chart dependency, theme-token stroke so it
 * reads on all four theme combinations.
 *
 * Two behaviours that matter more than they look:
 *
 *  - **A flat line is drawn flat.** When every point is equal (this platform's
 *    domain snapshots sat at exactly 2 organic keywords for five straight weeks)
 *    a min/max-normalised chart divides by a zero range and either blows up or
 *    draws a misleading full-height sweep. Here it renders as a real flat line
 *    through the middle, which is the truth.
 *  - **It refuses to draw a trend from one point.** A single capture is not a
 *    trend; the caller gets nothing rather than a decorative stub.
 */
export const Sparkline: React.FC<{
  points: number[];
  /** Down = good for position and spam score. Flips the stroke colour only. */
  upIsGood?: boolean;
  className?: string;
  ariaLabel?: string;
}> = ({ points, upIsGood = true, className = 'w-full h-8', ariaLabel }) => {
  const clean = points.filter((p) => Number.isFinite(p));
  if (clean.length < 2) return null;

  const w = 240;
  const h = 32;
  const pad = 3;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min;
  const step = w / (clean.length - 1);

  const y = (v: number) =>
    // Zero range → the flat middle, not a divide-by-zero.
    range === 0 ? h / 2 : h - pad - ((v - min) / range) * (h - pad * 2);

  const line = clean
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ');
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;

  const first = clean[0];
  const last = clean[clean.length - 1];
  const rising = last > first;
  const good = range === 0 ? null : rising === upIsGood;
  const stroke =
    good === null
      ? 'hsl(var(--muted-foreground))'
      : good
        ? 'hsl(var(--success))'
        : 'hsl(var(--error))';

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={ariaLabel ?? `Trend across ${clean.length} captures`}
    >
      <path d={area} fill={stroke} fillOpacity={0.1} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

export default Sparkline;

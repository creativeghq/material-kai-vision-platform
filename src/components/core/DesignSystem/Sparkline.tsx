import React from 'react';

import { cn } from '@/lib/utils';

interface SparklineProps {
  /** Raw series, oldest → newest. Fewer than 2 points renders nothing. */
  data: number[];
  width?: number;
  height?: number;
  /** 'vivid' uses the acid data accent; 'ink' uses the foreground (the reference
   *  draws these as thin near-black strokes on light cards). */
  tone?: 'ink' | 'vivid';
  /** Fill the area under the curve with a faint wash. */
  area?: boolean;
  className?: string;
}

/** Catmull-Rom → cubic bezier, so the line reads hand-drawn rather than jagged. */
function smoothPath(points: Array<[number, number]>): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`;
  }

  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

/**
 * Sparkline — the thin trend line riding beside a stat.
 *
 * Deliberately unlabelled and unaxised: it carries SHAPE, not value. The number
 * next to it carries the value. Purely presentational, no data fetching.
 */
export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 64,
  height = 24,
  tone = 'ink',
  area = false,
  className,
}) => {
  const path = React.useMemo(() => {
    if (!data || data.length < 2) return { line: '', fill: '' };

    const min = Math.min(...data);
    const max = Math.max(...data);
    // A flat series would divide by zero — pin it to the vertical centre instead.
    const span = max - min || 1;
    const pad = 2;
    const innerH = height - pad * 2;

    const points = data.map<[number, number]>((v, i) => [
      (i / (data.length - 1)) * width,
      pad + innerH - ((v - min) / span) * innerH,
    ]);

    const line = smoothPath(points);
    const fill = line ? `${line} L ${width} ${height} L 0 ${height} Z` : '';
    return { line, fill };
  }, [data, width, height]);

  if (!path.line) return null;

  const strokeClass = tone === 'vivid' ? 'spark-stroke-vivid' : 'spark-stroke';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className={cn('overflow-visible', className)}
      aria-hidden="true"
      focusable="false"
    >
      {area && (
        <path
          d={path.fill}
          className={tone === 'vivid' ? 'fill-vivid/12' : 'fill-foreground/8'}
        />
      )}
      <path
        d={path.line}
        className={strokeClass}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

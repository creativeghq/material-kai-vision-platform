import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export interface StatBreakdownRow {
  label: string;
  value: number | string;
  /** Draw attention to a row that needs action (overdue, rejected…). */
  alert?: boolean;
}

interface StatBlockProps {
  icon: React.ComponentType<{ className?: string }>;
  /** Block heading — Title Case, it reads as a section heading. */
  title: string;
  /** Headline figure, already formatted. Money is formatted upstream. */
  value: React.ReactNode;
  /** One-line caption under the figure. */
  caption?: string;
  /** Always render the SAME number of rows — see the note on height below. */
  rows?: StatBreakdownRow[];
  linkTo: string;
  linkLabel?: string;
  loading?: boolean;
}

/**
 * StatBlock — an operational panel: what the number is, what it is made of, and
 * a way into the detail.
 *
 * The breakdown is the point. A bare "0" tells you nothing; "0 open — 1 draft,
 * 3 confirmed, 1 fulfilled" tells you where the work actually sits. This mirrors
 * the reference dashboard's cards, which pair every figure with its composition
 * and a "view details" link.
 *
 * HEIGHT IS FIXED ON PURPOSE. The loading and resolved states must occupy the
 * same box or the dashboard shifts as each block's query lands — four blocks
 * resolving independently is four shifts. `rows` is padded to ROW_SLOTS so a
 * block with two breakdown rows is exactly as tall as one with four.
 */
const ROW_SLOTS = 3;

export const StatBlock: React.FC<StatBlockProps> = ({
  icon: Icon,
  title,
  value,
  caption,
  rows = [],
  linkTo,
  linkLabel = 'View details',
  loading = false,
}) => {
  // Pad (or trim) to a constant slot count so every block is the same height.
  const slots: (StatBreakdownRow | null)[] = [
    ...rows.slice(0, ROW_SLOTS),
    ...Array.from({ length: Math.max(0, ROW_SLOTS - rows.length) }, () => null),
  ];

  return (
    <div className="rounded-xl border border-white/8 bg-background/40 p-3.5 flex flex-col">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-6 h-6 rounded-md bg-primary/10 grid place-items-center shrink-0">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </span>
        <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground truncate">
          {title}
        </span>
      </div>

      {loading ? (
        /* Same 28px box the resolved figure occupies — not a thin bar. */
        <div className="h-7 w-2/3 rounded bg-primary/10 animate-pulse" />
      ) : (
        <p className="text-2xl leading-none font-display tabular-nums" style={{ fontWeight: 700 }}>
          {value}
        </p>
      )}

      {/* Reserved whether or not a caption is passed, so blocks stay aligned. */}
      <p className="text-[11px] text-muted-foreground mt-1.5 min-h-[1rem] truncate">
        {loading ? '' : (caption ?? '')}
      </p>

      <div className="mt-2.5 space-y-1">
        {slots.map((row, i) => (
          <div key={i} className="flex items-center justify-between gap-2 h-[1.05rem]">
            {row && !loading ? (
              <>
                <span className="text-[11px] text-muted-foreground truncate">{row.label}</span>
                <span
                  className={`text-[11px] tabular-nums shrink-0 ${row.alert ? 'text-amber' : 'text-foreground/80'}`}
                >
                  {row.value}
                </span>
              </>
            ) : (
              /* Empty slot — holds the row's height and nothing else. */
              <span aria-hidden="true" className="block w-full" />
            )}
          </div>
        ))}
      </div>

      <Link
        to={linkTo}
        className="mt-3 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
      >
        {linkLabel}
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
};

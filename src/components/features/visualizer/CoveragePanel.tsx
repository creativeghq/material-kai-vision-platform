/**
 * What the render costs in product (#447): area, pieces, allowance, boxes.
 *
 * The order quantity is shown only when every input is known. Anything missing is named, because
 * an under-ordered tile job comes back as a second batch in a different tone.
 */
import React from 'react';
import { AlertTriangle, PackageCheck } from 'lucide-react';
import { COVERAGE_GAP_LABEL, type Coverage } from '@/lib/surfaceRenderer';

interface Props {
  coverage: Coverage;
  /** Shown beside the order line when the workspace prices this product. */
  priceLine?: React.ReactNode;
  compact?: boolean;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-3 py-1">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className="text-xs font-medium tabular-nums">{children}</span>
  </div>
);

export const CoveragePanel: React.FC<Props> = ({ coverage, priceLine, compact = false }) => {
  const c = coverage;
  return (
    <div className="rounded-sm border border-hairline bg-surface-sunken p-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        <PackageCheck className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold">How much you need</span>
      </div>

      <Row label="Surface">{c.surfaceM2.toFixed(2)} m²</Row>
      <Row label="One piece">{c.pieceM2 === null ? '—' : `${c.pieceM2.toFixed(3)} m²`}</Row>
      <Row label="Pieces before cuts">{c.piecesNet ?? '—'}</Row>
      <Row label="Cutting allowance">
        {c.wastagePercent === null
          ? <span className="font-normal text-muted-foreground">not set</span>
          : `${c.wastagePercent}%`}
      </Row>

      {c.orderable ? (
        <div className="mt-1.5 border-t border-hairline pt-1.5">
          <Row label="Order">{c.piecesGross} pieces · {c.m2Gross?.toFixed(2)} m²</Row>
          <Row label="Boxes">{c.boxes}</Row>
          {priceLine}
        </div>
      ) : (
        <div className="mt-1.5 border-t border-hairline pt-1.5">
          {/* Naming the missing input, rather than printing the short count as if it were an order. */}
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800 dark:text-amber-300" />
            <div className="grid gap-0.5">
              <span className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                Not an order quantity yet
              </span>
              {!compact && c.gaps.map((g) => (
                <span key={g} className="text-[11px] text-muted-foreground">{COVERAGE_GAP_LABEL[g]}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

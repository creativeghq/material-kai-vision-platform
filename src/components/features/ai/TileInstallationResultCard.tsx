/** Inline AgentHub card for the `tile_installation` chunk emitted by plan_tile_installation. */

import { AlertTriangle, Grid3x3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/core/ui/card';
import { formatNumber } from '@/utils/decimal';
import type { TileQuantity } from '@/modules/finance/approvalRules';

export interface TileInstallationResult {
  product: { id: string; name: string; size: string | null } | null;
  tile: { length_mm: number; width_mm: number };
  pattern: string;
  rooms: { label: string; area_m2: number; source: string }[];
  rooms_from: string;
  area_m2: number;
  wastage_percent: number | null;
  order: TileQuantity | null;
  adhesive_kg: number;
  grout_kg: number;
  spacers: number | null;
  trowel_notch_mm: number;
  joint_mm: number;
  steps: { title: string; wait: string | null }[];
  warnings: string[];
  notes: string[];
}

export function TileInstallationResultCard({ result }: { result: TileInstallationResult }) {
  if (!result?.rooms?.length) return null;
  const n = (v: number | null | undefined, dp = 0) => formatNumber(v ?? null, { maxDecimals: dp });
  const o = result.order;
  const orderLine = o?.boxes != null
    ? `${n(o.boxes)} boxes · ${n(o.supplied, 2)} m²`
    : o?.whole_boxes != null
      ? `≈ ${n(o.whole_boxes)} boxes · ${n(o.supplied, 2)} m²`
      : `${n(o?.supplied ?? result.area_m2, 2)} m²`;
  const alerts = [
    ...(o?.box_m2_estimated ? ['The box size is estimated, not printed by the maker — confirm it before ordering.'] : []),
    ...(o && o.status !== 'rounded_to_packs' && o.reason ? [o.reason] : []),
    ...result.notes,
    ...result.warnings,
  ];
  const tileLabel = result.product
    ? `${result.product.name}${result.product.size ? ` ${result.product.size}` : ''}`
    : `${n(result.tile.length_mm)}×${n(result.tile.width_mm)} mm tile`;

  return (
    <Card className="dashboard-card border-primary/30 max-w-md">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Grid3x3 className="h-4 w-4 text-primary" />
            {tileLabel}
          </span>
          <span className="text-sm font-semibold tabular-nums text-primary text-right">{orderLine}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {n(result.area_m2, 2)} m² from {result.rooms_from} · {result.pattern}
          {result.wastage_percent != null ? ` · ${n(result.wastage_percent, 1)}% cutting allowance` : ' · no cutting allowance set'}
        </div>

        <div className="space-y-1">
          {result.rooms.map((r) => (
            <div key={`${r.label}-${r.source}`} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground truncate">{r.label}</span>
              <span className="tabular-nums shrink-0">{n(r.area_m2, 2)} m²</span>
            </div>
          ))}
        </div>

        <div className="space-y-1 border-t border-hairline pt-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Adhesive ({n(result.trowel_notch_mm)} mm notch)</span><span className="tabular-nums">≈ {n(result.adhesive_kg)} kg</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Grout ({n(result.joint_mm, 1)} mm joints)</span><span className="tabular-nums">≈ {n(result.grout_kg, 1)} kg</span></div>
          {result.spacers != null && (
            <div className="flex justify-between"><span className="text-muted-foreground">Spacers</span><span className="tabular-nums">{n(result.spacers)}</span></div>
          )}
        </div>

        {alerts.length > 0 && (
          <div className="flex items-start gap-2 rounded-sm border border-amber-500/40 bg-amber-500/10 p-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 dark:text-amber-300">{alerts.join(' ')}</p>
          </div>
        )}

        <Link to="/tools/tile-installation" className="block text-xs text-primary hover:underline">
          See the laying steps in 3D →
        </Link>
      </CardContent>
    </Card>
  );
}

/** Inline AgentHub card for the `tile_installation` chunk emitted by plan_tile_installation. */

import { AlertTriangle, Grid3x3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/core/ui/card';
import { formatNumber } from '@/utils/decimal';

export interface TileInstallationResult {
  room: { width_m: number; depth_m: number };
  tile: { length_mm: number; width_mm: number; thickness_mm: number };
  pattern: string;
  joint_mm: number;
  trowel_notch_mm: number;
  quantities: {
    areaM2: number;
    tilesToBuy: number;
    tilesFromLayout: number;
    sparePct: number;
    spacers: number;
    adhesiveKg: number;
    groutKg: number;
  };
  steps: { title: string; instruction: string; wait: string | null }[];
  warnings: string[];
}

export function TileInstallationResultCard({ result }: { result: TileInstallationResult }) {
  if (!result?.quantities) return null;
  const q = result.quantities;
  const n = (v: number, dp = 0) => formatNumber(v, { maxDecimals: dp });
  const rows: [string, string][] = [
    ['Tiles to buy', `${n(q.tilesToBuy)} (layout uses ${n(q.tilesFromLayout)}, +${n(q.sparePct)}% spare)`],
    ['Floor area', `${n(q.areaM2, 2)} m²`],
    ['Adhesive', `${n(q.adhesiveKg, 1)} kg · ${n(result.trowel_notch_mm)} mm notch`],
    ['Grout', `${n(q.groutKg, 1)} kg · ${n(result.joint_mm)} mm joints`],
    ['Spacers', n(q.spacers)],
  ];

  return (
    <Card className="dashboard-card border-primary/30 max-w-md">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Grid3x3 className="h-4 w-4 text-primary" />
          Tile floor plan
        </div>
        <div className="text-xs text-muted-foreground">
          {n(result.room.width_m, 2)} × {n(result.room.depth_m, 2)} m · {n(result.tile.length_mm)}×{n(result.tile.width_mm)} mm tiles · {result.pattern}
        </div>

        <div className="space-y-1.5">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="tabular-nums font-medium text-right">{value}</span>
            </div>
          ))}
        </div>

        {result.steps?.length > 0 && (
          <ol className="list-decimal pl-4 space-y-0.5 text-xs text-muted-foreground">
            {result.steps.map((s) => (
              <li key={s.title}>
                <span className="text-foreground">{s.title}</span>
                {s.wait ? ` — wait ${s.wait}` : ''}
              </li>
            ))}
          </ol>
        )}

        {result.warnings?.length > 0 && (
          <div className="flex items-start gap-2 rounded-sm border border-amber-500/40 bg-amber-500/10 p-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 dark:text-amber-300">{result.warnings.join(' ')}</p>
          </div>
        )}

        <Link to="/tools/tile-installation" className="block text-xs text-primary hover:underline">
          See it laid in 3D →
        </Link>
      </CardContent>
    </Card>
  );
}

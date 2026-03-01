/**
 * BillOfMaterials
 * Displays a table of applied materials from inpainting operations with export options.
 */

import React, { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Download, Copy, X, Package } from 'lucide-react';
import { AppliedMaterial } from './MaterialPickerModal';

// Estimated area per zone type (rough m² values for typical rooms)
const ZONE_AREA_ESTIMATES: Record<string, number> = {
  floor: 18,
  wall: 12,
  ceiling: 15,
  'back wall': 10,
  sofa: 5,
  chair: 2,
  'dining table': 3,
  curtain: 6,
  rug: 8,
  door: 3,
  window: 2,
};

function estimateArea(zone_label: string): number {
  const lower = zone_label.toLowerCase();
  for (const [key, val] of Object.entries(ZONE_AREA_ESTIMATES)) {
    if (lower.includes(key)) return val;
  }
  return 5; // default 5m²
}

interface BillOfMaterialsProps {
  appliedMaterials: AppliedMaterial[];
  roomType?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const BillOfMaterials: React.FC<BillOfMaterialsProps> = ({
  appliedMaterials,
  roomType,
  isOpen,
  onClose,
}) => {
  const rows = useMemo(() => {
    return appliedMaterials.map(mat => {
      const area = estimateArea(mat.zone_label);
      const unitPrice = mat.price ?? 0;
      const estCost = unitPrice > 0 ? unitPrice * area : null;
      return { ...mat, area, unitPrice, estCost };
    });
  }, [appliedMaterials]);

  const totalCost = rows.reduce((sum, r) => sum + (r.estCost ?? 0), 0);

  const handleDownloadCSV = () => {
    const header = ['Zone', 'Material', 'Product Code', 'Color Override', 'Price/unit (€)', 'Est. Area (m²)', 'Est. Cost (€)'];
    const lines = rows.map(r => [
      r.zone_label,
      r.product_name,
      r.product_id,
      r.colorOverride || '',
      r.unitPrice.toFixed(2),
      r.area.toString(),
      r.estCost != null ? r.estCost.toFixed(2) : 'N/A',
    ].map(v => `"${v}"`).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bill-of-materials${roomType ? `-${roomType}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyText = async () => {
    const text = rows.map(r =>
      `${r.zone_label}: ${r.product_name}${r.colorOverride ? ` (${r.colorOverride})` : ''} — €${r.unitPrice}/unit, ~${r.area}m², est. €${r.estCost?.toFixed(0) ?? 'N/A'}`
    ).join('\n');
    await navigator.clipboard.writeText(text);
  };

  if (appliedMaterials.length === 0) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl w-full max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">

        {/* Header */}
        <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-border bg-gradient-to-r from-slate-50 to-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
                <Package className="w-4 h-4 text-white" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">Bill of Materials</DialogTitle>
                {roomType && (
                  <p className="text-xs text-muted-foreground mt-0.5">{roomType}</p>
                )}
              </div>
            </div>
            <Badge variant="secondary" className="text-xs">{rows.length} item{rows.length !== 1 ? 's' : ''}</Badge>
          </div>
        </DialogHeader>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50/90 backdrop-blur-sm border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Zone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Material</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Color</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Price/unit</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Est. Area</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Est. Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium capitalize text-foreground">{row.zone_label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-foreground line-clamp-1">{row.product_name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{row.product_id.slice(0, 8)}…</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {row.colorOverride ? (
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-4 h-4 rounded-full border border-border flex-shrink-0"
                          style={{ backgroundColor: row.colorOverride }}
                        />
                        <span className="text-xs font-mono text-muted-foreground">{row.colorOverride}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.unitPrice > 0
                      ? <span className="text-foreground">€{row.unitPrice.toFixed(2)}</span>
                      : <span className="text-muted-foreground text-xs">N/A</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-foreground">~{row.area}m²</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.estCost != null
                      ? <span className="font-semibold text-foreground">€{row.estCost.toFixed(0)}</span>
                      : <span className="text-muted-foreground text-xs">N/A</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-t border-border bg-white/80 backdrop-blur-sm">
          <div className="text-sm">
            {totalCost > 0 && (
              <span className="text-muted-foreground">
                Estimated total: <span className="font-bold text-foreground text-base">€{totalCost.toFixed(0)}</span>
                <span className="text-xs text-muted-foreground ml-1">(indicative)</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyText}
              className="text-xs gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadCSV}
              className="text-xs gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV
            </Button>
            <Button
              size="sm"
              onClick={onClose}
              className="text-xs"
            >
              Done
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
};

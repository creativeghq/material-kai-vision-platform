/**
 * Room dimensions → m² → boxes, on the line (#436).
 *
 * The counter's most repeated action, and no vendor in the sweep advertises doing it. The cut
 * allowance and the box rounding come from the SQL derivation, so what is shown here is what the
 * order will carry — and the uplift is shown AS an uplift, never folded into the quantity.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Ruler, Plus, Trash2, AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { totalArea, describeRooms, type RoomArea, type LengthUnit } from '@/modules/finance/tileQuantity';
import {
  tileQuantityService, hasVisibleUplift, type TileQuantity,
} from '@/modules/finance/services/tileQuantityService';

const blankRoom = (): RoomArea => ({ length: 0, width: 0, count: 1, unit: 'm', label: '' });

export const TileQuantityDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string;
  productName?: string;
  /** Applied to the line: the quantity ordered, the allowance, and what it measures. */
  onApply: (result: { quantity: number; wastagePercent: number | null; note: string }) => void;
}> = ({ open, onOpenChange, productId, productName, onApply }) => {
  const [rooms, setRooms] = useState<RoomArea[]>([blankRoom()]);
  const [wastage, setWastage] = useState('10');
  const [quantity, setQuantity] = useState<TileQuantity | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const measured = totalArea(rooms);

  const derive = useCallback(async (area: number, pct: number | null) => {
    if (area <= 0) { setQuantity(null); return; }
    setLoading(true);
    try {
      setQuantity(await tileQuantityService.forLine({
        productId, requested: area, wastagePercent: pct,
      }));
      setFailed(false);
    } catch {
      setQuantity(null); setFailed(true);
    } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => {
    if (!open) return;
    const pct = wastage.trim() === '' ? null : Number(wastage);
    void derive(measured.area, Number.isFinite(pct as number) ? pct : null);
    // `measured.area` is the only input that matters; recomputing on every keystroke of an
    // unfinished dimension would fire a query per digit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, measured.area, wastage, derive]);

  const set = (i: number, patch: Partial<RoomArea>) =>
    setRooms((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  const apply = () => {
    const pct = wastage.trim() === '' ? null : Number(wastage);
    onApply({
      quantity: quantity?.supplied ?? measured.area,
      wastagePercent: Number.isFinite(pct as number) ? (pct as number) : null,
      note: describeRooms(rooms),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ruler className="h-4 w-4 text-primary" /> How much {productName ?? 'tile'}?
          </DialogTitle>
          <DialogDescription>
            Measure the rooms; the cut allowance and the whole-box rounding are worked out from the
            product&rsquo;s own packing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {rooms.map((r, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="w-28">
                <Label htmlFor={`room-label-${i}`} className="text-[11px]">Room</Label>
                <Input
                  id={`room-label-${i}`} className="mt-1 h-8 text-xs" value={r.label ?? ''}
                  onChange={(e) => set(i, { label: e.target.value })} placeholder="kitchen"
                />
              </div>
              <div className="w-20">
                <Label htmlFor={`room-len-${i}`} className="text-[11px]">Length</Label>
                <Input
                  id={`room-len-${i}`} type="number" className="mt-1 h-8 text-xs"
                  value={r.length || ''} onChange={(e) => set(i, { length: Number(e.target.value) })}
                />
              </div>
              <div className="w-20">
                <Label htmlFor={`room-wid-${i}`} className="text-[11px]">Width</Label>
                <Input
                  id={`room-wid-${i}`} type="number" className="mt-1 h-8 text-xs"
                  value={r.width || ''} onChange={(e) => set(i, { width: Number(e.target.value) })}
                />
              </div>
              <div className="w-20">
                <Label htmlFor={`room-unit-${i}`} className="text-[11px]">Unit</Label>
                <Select value={r.unit ?? 'm'} onValueChange={(v) => set(i, { unit: v as LengthUnit })}>
                  <SelectTrigger id={`room-unit-${i}`} className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="m">m</SelectItem>
                    <SelectItem value="cm">cm</SelectItem>
                    <SelectItem value="mm">mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-16">
                <Label htmlFor={`room-count-${i}`} className="text-[11px]">×</Label>
                <Input
                  id={`room-count-${i}`} type="number" className="mt-1 h-8 text-xs"
                  value={r.count ?? 1} onChange={(e) => set(i, { count: Number(e.target.value) })}
                />
              </div>
              {rooms.length > 1 && (
                <Button
                  type="button" size="sm" variant="ghost" className="h-8 px-2"
                  aria-label={`Remove room ${i + 1}`}
                  onClick={() => setRooms((rs) => rs.filter((_, n) => n !== i))}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button" size="sm" variant="outline"
            onClick={() => setRooms((rs) => [...rs, blankRoom()])}
          >
            <Plus className="mr-1 h-3 w-3" /> Another room
          </Button>
        </div>

        <div className="flex items-end gap-2">
          <div className="w-28">
            <Label htmlFor="tile-wastage" className="text-[11px]">Cut allowance %</Label>
            <Input
              id="tile-wastage" type="number" className="mt-1 h-8 text-xs" value={wastage}
              onChange={(e) => setWastage(e.target.value)}
            />
          </div>
          <p className="pb-1 text-[11px] text-muted-foreground">
            Shown on the quote as an uplift, not folded into the quantity.
          </p>
        </div>

        {measured.unusable > 0 && (
          <p className="flex items-start gap-1.5 text-[11px] text-destructive">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            {measured.unusable} of the rooms have no usable measurement, so they count for nothing
            here. That is not the same as them needing no tiles.
          </p>
        )}

        <div className="rounded-md border border-hairline bg-surface-sunken p-2 text-xs">
          {loading && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Working it out…
            </p>
          )}
          {!loading && failed && (
            <p className="text-destructive">
              The packing could not be read just now, so the box rounding is unknown. The measured
              area is {measured.area} m².
            </p>
          )}
          {!loading && !failed && quantity && (
            <>
              <p className="font-medium tabular-nums">
                {quantity.supplied} {quantity.boxes != null ? `(${quantity.boxes} boxes)` : ''}
              </p>
              <p className="mt-0.5 text-muted-foreground">{quantity.reason}</p>
              {hasVisibleUplift(quantity) && quantity.pack_uplift != null && quantity.pack_uplift > 0 && (
                <p className="mt-0.5 text-muted-foreground tabular-nums">
                  Whole-box uplift: {quantity.pack_uplift}
                </p>
              )}
            </>
          )}
          {!loading && !failed && !quantity && (
            <p className="text-muted-foreground">Measure a room to see the quantity.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={apply} disabled={measured.area <= 0}>Use this quantity</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

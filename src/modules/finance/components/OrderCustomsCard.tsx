/**
 * What an order will cost at the border, before it ships.
 *
 * Since 1 July 2026 a low-value EU import — under €150, IOSS included — is charged **€3 of duty
 * per tariff sub-heading**, not per parcel. Three sub-headings on one consignment is €9. That
 * makes "can these lines be consolidated into fewer sub-headings?" a real commercial question,
 * and it is invisible unless something counts them, which is the whole point of this card.
 *
 * Everything shown is derived by `get_order_customs_preview` from the codes SNAPSHOTTED on the
 * order lines — not re-read from the products. A line keeps the code it carried when the order
 * was placed, because the nomenclature is republished monthly and a past order must not be
 * silently restated.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Ship, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { TaricCombobox } from '@/components/core/TaricCombobox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney } from '@/modules/finance/services/financeService';
import { ordersService } from '@/modules/finance/services/ordersService';
import { formatTaricCode } from '@/services/taricService';

interface Preview {
  currency: string;
  order_total: number | null;
  subheading_level: number;
  duty_per_subheading: number;
  distinct_subheadings: number;
  estimated_duty: number;
  low_value_regime: boolean;
  applies_note: string;
  unclassified_lines: number;
  unweighed_lines: number;
  subheadings: Array<{
    subheading: string; description: string | null; lines: number;
    net_value: number | null; net_mass_kg: number | null; duty: number;
  }>;
}

interface GapLine {
  id: string; description: string; quantity: number;
  taric_code: string | null; net_mass_kg: number | null;
}

export const OrderCustomsCard: React.FC<{
  orderId: string;
  /**
   * Book what the border costs. Duty, clearance and the broker's fee are ordinary costs on the
   * order like freight is — this panel is simply where you find out how much they are, so it is
   * also where you should be able to record them. The parent owns the expense dialog; this hands
   * it the figure it just derived rather than making the operator retype it.
   */
  onAddCost?: (suggested: { amount?: number; description: string }) => void;
}> = ({ orderId, onAddCost }) => {
  const { toast } = useToast();
  const [data, setData] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  // The lines the warning below counts. Held here so the card that REPORTS the gap can close it —
  // until now it named a number and offered no field anywhere in the app to change it, because a
  // line's code is a snapshot and the only editors that existed wrote the product instead.
  const [gaps, setGaps] = useState<GapLine[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: res, error }, gapRows] = await Promise.all([
        supabase.rpc('get_order_customs_preview', { p_order_id: orderId }),
        ordersService.listUnclassifiedLines(orderId).catch(() => [] as GapLine[]),
      ]);
      setData(error ? null : (res as unknown as Preview));
      setGaps(gapRows);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  /** Write one field on one line, then re-derive: the duty estimate above depends on it. */
  const saveLine = async (id: string, patch: { taricCode?: string | null; netMassKg?: number | null }) => {
    setSavingId(id);
    try {
      await ordersService.setOrderItemCustoms(id, patch);
      await load();
    } catch (err: any) {
      toast({ title: 'Could not save', description: err?.message, variant: 'destructive' });
    } finally { setSavingId(null); }
  };

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  }
  // Nothing classified and nothing missing means this order has no goods worth declaring. It is a
  // tab of its own now, so it says that rather than rendering nothing.
  if (!data || (data.distinct_subheadings === 0 && data.unclassified_lines === 0)) {
    return (
      <p className="text-xs text-muted-foreground">
        Nothing on this order needs declaring — no line carries goods with a commodity code.
      </p>
    );
  }

  const cur = data.currency ?? 'EUR';

  return (
    /* Deliberately unboxed: no card surface, no border, no fill. The card chrome this used to wear
       is a near-white glass surface on the light theme, which stamped a white panel onto the cream
       page and read as a foreign object rather than a section of the order. */
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
        <h4 className="flex items-center gap-2 text-sm font-medium">
          <Ship className="h-4 w-4 text-primary" />
          Customs
        </h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {data.low_value_regime
            ? <>
                <span className="font-medium text-foreground">
                  {data.distinct_subheadings} sub-heading{data.distinct_subheadings === 1 ? '' : 's'}
                  {' · '}{formatMoney(data.estimated_duty, cur)} estimated duty
                </span>
                {' — '}€{data.duty_per_subheading} per sub-heading. Fewer sub-headings, less duty.
              </>
            : data.applies_note}
        </p>
        </div>
        {/* Seeded with the estimate when there is one — under the low-value regime the duty is a
            derived figure sitting right there, and retyping a number the panel already computed is
            how it gets retyped wrong. Outside that regime the rate depends on the goods, so the
            amount is left for the operator and only the description is carried. */}
        {onAddCost && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 shrink-0 text-[11px]"
            onClick={() => onAddCost({
              amount: data.low_value_regime && data.estimated_duty > 0 ? data.estimated_duty : undefined,
              description: 'Customs duty & clearance',
            })}
          >
            <ArrowUpRight className="h-3 w-3 mr-1 text-red-400" /> Book as expense
          </Button>
        )}
      </div>

      {/* A header row over no rows is furniture, not information: when every line is still
          unclassified the table has nothing to say, and the gap editors below are the whole point. */}
      {data.subheadings.length > 0 && (
        <Table>
          {/* Flat on purpose: the shared table chrome (a muted header band + a hairline under
              every row) reads as a second panel stacked inside the card on the light theme.
              Column labels are muted and small enough to hold the header without it. */}
          <TableHeader className="bg-transparent border-0">
            <TableRow className="border-0">
              <TableHead>Sub-heading</TableHead>
              <TableHead>What it covers</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead className="text-right">Net mass</TableHead>
              <TableHead className="text-right">Duty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.subheadings.map((s) => (
              <TableRow key={s.subheading} className="border-0">
                <TableCell className="font-mono text-xs">{formatTaricCode(s.subheading.padEnd(10, '0'))}</TableCell>
                <TableCell className="text-muted-foreground max-w-md truncate">{s.description ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{s.lines}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.net_mass_kg != null ? `${s.net_mass_kg} kg` : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {data.low_value_regime ? formatMoney(s.duty, cur) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {(data.unclassified_lines > 0 || data.unweighed_lines > 0) && (
          <p className="flex items-start gap-2 px-3 text-xs text-amber-500">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {/* An unclassified line is precisely the one that holds up a clearance, so it is
                counted here rather than quietly excluded from the estimate above. */}
            {data.unclassified_lines > 0 && (
              <>{data.unclassified_lines} line{data.unclassified_lines === 1 ? '' : 's'} carry no
                commodity code and are not in this estimate. </>
            )}
            {data.unweighed_lines > 0 && (
              <>{data.unweighed_lines} line{data.unweighed_lines === 1 ? '' : 's'} have no net
                mass — customs and Intrastat both require it.</>
            )}
          </p>
        )}

        {/* …and the fields to close it. Saved per line, straight onto `order_items` — a line's
            code is a snapshot of what it cleared under, so this must not be routed through the
            product, and it must stay available after the supplier's bill has locked the figures. */}
        {gaps.length > 0 && (
          <div className="px-3 space-y-3">
            {gaps.map((l) => (
              <div key={l.id} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs" htmlFor={`taric-${l.id}`}>
                    <span className="truncate">{l.description}</span>
                    <span className="ml-1 text-muted-foreground">· {l.quantity}</span>
                  </Label>
                  <TaricCombobox
                    id={`taric-${l.id}`}
                    value={l.taric_code ?? ''}
                    disabled={savingId === l.id}
                    onChange={(code) => void saveLine(l.id, { taricCode: code })}
                    // Borderless and unfilled: the shared trigger/input chrome is a white
                    // overlay (`bg-white/8` + `border-white/12`) built for the dark theme, and
                    // on the cream card it stamps a white panel over the card. The hover tint
                    // carries the affordance instead. An unrecognised code still announces
                    // itself in the trigger's own content (red text + "not in the nomenclature"),
                    // which is what survives here now that its red border has no width.
                    triggerClassName="w-full h-9 border-0 bg-transparent px-2 hover:bg-muted/60"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground" htmlFor={`mass-${l.id}`}>Net mass (kg)</Label>
                  <Input
                    id={`mass-${l.id}`}
                    className="h-9 w-32 border-0 bg-transparent px-2 text-sm tabular-nums hover:bg-muted/60"
                    type="number"
                    min={0}
                    step="0.001"
                    inputMode="decimal"
                    placeholder="—"
                    disabled={savingId === l.id}
                    defaultValue={l.net_mass_kg ?? ''}
                    // Committed on blur, not per keystroke: every save re-derives the duty estimate
                    // above, and doing that mid-number makes the figure flicker through nonsense.
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const next = raw === '' ? null : Number(raw);
                      if (next != null && !Number.isFinite(next)) return;
                      if ((l.net_mass_kg ?? null) === next) return;
                      void saveLine(l.id, { netMassKg: next });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
};

export default OrderCustomsCard;

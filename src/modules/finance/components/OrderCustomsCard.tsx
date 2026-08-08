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
import { Loader2, Ship, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
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

export const OrderCustomsCard: React.FC<{ orderId: string }> = ({ orderId }) => {
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
  // Nothing classified and nothing missing means this order has no goods worth declaring.
  if (!data || (data.distinct_subheadings === 0 && data.unclassified_lines === 0)) return null;

  const cur = data.currency ?? 'EUR';

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ship className="h-4 w-4 text-primary" />
          Customs
        </CardTitle>
        <CardDescription>
          {data.low_value_regime
            ? <>
                <span className="font-medium text-foreground">
                  {data.distinct_subheadings} sub-heading{data.distinct_subheadings === 1 ? '' : 's'}
                  {' · '}{formatMoney(data.estimated_duty, cur)} estimated duty
                </span>
                {' — '}€{data.duty_per_subheading} per sub-heading. Fewer sub-headings, less duty.
              </>
            : data.applies_note}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sub-heading</TableHead>
              <TableHead>What it covers</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead className="text-right">Net mass</TableHead>
              <TableHead className="text-right">Duty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.subheadings.map((s) => (
              <TableRow key={s.subheading}>
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

        {(data.unclassified_lines > 0 || data.unweighed_lines > 0) && (
          <p className="flex items-start gap-2 border-t border-border/50 px-4 py-3 text-xs text-amber-500">
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
          <div className="border-t border-border/50 px-4 py-3 space-y-3">
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
                    triggerClassName="w-full h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground" htmlFor={`mass-${l.id}`}>Net mass (kg)</Label>
                  <Input
                    id={`mass-${l.id}`}
                    className="h-9 w-32 text-sm tabular-nums"
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
      </CardContent>
    </Card>
  );
};

export default OrderCustomsCard;

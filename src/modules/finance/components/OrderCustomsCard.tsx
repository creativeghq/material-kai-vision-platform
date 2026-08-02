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
import { supabase } from '@/integrations/supabase/client';
import { formatMoney } from '@/modules/finance/services/financeService';
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

export const OrderCustomsCard: React.FC<{ orderId: string }> = ({ orderId }) => {
  const [data, setData] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.rpc('get_order_customs_preview', { p_order_id: orderId });
      setData(error ? null : (res as unknown as Preview));
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

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
      </CardContent>
    </Card>
  );
};

export default OrderCustomsCard;

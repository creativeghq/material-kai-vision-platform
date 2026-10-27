/** PriceResolutionCard */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { Checkbox } from '@/components/core/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';

export interface ResolutionOption {
  rule_id: number;
  kind: string;
  percents: number[];
  filter?: string | null;
  condition?: string | null;
  quote?: string | null;
  email_date?: string | null;
  needs_human?: boolean;
  net_if_applied?: number | null;
}

export interface ResolutionRow {
  row_id: number;
  doc_id?: string | null;
  supplier: string;
  item_text: string;
  price_label: string;
  unit?: string | null;
  currency?: string | null;
  effective_date?: string | null;
  price_role: string;
  printed_net: number | string;
  final_net: number | string | null;
  final_gross: number | string | null;
  vat_rate?: number | string | null;
  status: string;
  warnings?: string[];
  conditional_options: ResolutionOption[];
}

export interface ResolutionPick {
  value: number;
  basis: 'net' | 'gross';
  net: number;
  gross: number | null;
  currency: string;
  unit: string | null;
  doc_id: string | null;
  summary: string;
}

interface Computed {
  final_net: number;
  final_gross: number | null;
  base_net: number;
  base_is_list: boolean;
}

const money = (n: number | string | null | undefined) =>
  n == null || n === '' ? '—' : Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const optionLabel = (o: ResolutionOption) => {
  const p = o.percents.map((x) => `${o.kind === 'surcharge' ? '+' : '−'}${x}%`).join(' then ');
  return p || o.kind.replace('_', ' ');
};

/** Options that read the same (same kind and percents) are one choice: ticking both would deduct twice. */
const uniqueOptions = (options: ResolutionOption[]) => {
  const seen = new Set<string>();
  return options.filter((o) => {
    if (!o.percents?.length) return false;
    const key = `${o.kind}:${o.percents.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const RowCard: React.FC<{
  row: ResolutionRow;
  workspaceId: string;
  onUse: (pick: ResolutionPick) => void;
}> = ({ row, workspaceId, onUse }) => {
  const options = useMemo(() => uniqueOptions(row.conditional_options ?? []), [row.conditional_options]);
  const [selected, setSelected] = useState<number[]>([]);
  const [computed, setComputed] = useState<Computed | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isList = row.status.startsWith('list_price');
  const fixed = !isList;

  const recompute = useCallback(async (ids: number[]) => {
    setBusy(true);
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc('compute_price_with_options', {
      p_workspace_id: workspaceId,
      p_row_id: row.row_id,
      p_rule_ids: ids,
    });
    setBusy(false);
    if (rpcErr || !data || (data as unknown[]).length === 0) {
      setError(rpcErr?.message ?? 'Could not calculate this price.');
      setComputed(null);
      return;
    }
    const r = (data as Array<{ final_net: number; final_gross: number | null; base_net: number; base_is_list: boolean }>)[0];
    setComputed({ final_net: Number(r.final_net), final_gross: r.final_gross == null ? null : Number(r.final_gross), base_net: Number(r.base_net), base_is_list: r.base_is_list });
  }, [row.row_id, workspaceId]);

  useEffect(() => {
    if (isList) void recompute(selected);
  }, [isList, selected, recompute]);

  const toggle = (id: number, on: boolean) =>
    setSelected((cur) => (on ? [...cur, id] : cur.filter((x) => x !== id)));

  const net = fixed ? Number(row.final_net) : computed?.final_net ?? null;
  const gross = fixed ? (row.final_gross == null ? null : Number(row.final_gross)) : computed?.final_gross ?? null;
  const readyToUse = net != null && !Number.isNaN(net) && (fixed || selected.length > 0);

  const use = (basis: 'net' | 'gross') => {
    const value = basis === 'net' ? net : gross;
    if (value == null) return;
    const picked = options.filter((o) => selected.includes(o.rule_id)).map(optionLabel);
    onUse({
      value,
      basis,
      net: net as number,
      gross,
      currency: row.currency || 'EUR',
      unit: row.unit ?? null,
      doc_id: row.doc_id ?? null,
      summary: `${row.supplier} · ${row.price_label}${picked.length ? ` · ${picked.join(', ')}` : ''}`,
    });
  };

  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate" title={row.item_text}>{row.item_text}</div>
            <div className="text-xs text-muted-foreground">
              {row.supplier} · {row.price_label}{row.effective_date ? ` · list of ${row.effective_date}` : ''}{row.unit ? ` · per ${row.unit}` : ''}
            </div>
          </div>
          <Badge variant={fixed ? 'success' : 'warning'}>{fixed ? 'Final purchase price' : 'List price'}</Badge>
        </div>

        {isList && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              Printed list price {money(row.printed_net)} {row.currency || 'EUR'}. Choose what applies to this order:
            </div>
            {options.length === 0 && (
              <div className="text-xs text-muted-foreground">No discount rule is on file for this item — confirm the price manually.</div>
            )}
            {options.map((o) => (
              <label key={o.rule_id} className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={selected.includes(o.rule_id)}
                  onCheckedChange={(v) => toggle(o.rule_id, v === true)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="font-medium">{optionLabel(o)}</span>
                  {(o.condition || o.filter) && <span className="text-muted-foreground"> — {o.condition || o.filter}</span>}
                  {o.quote && (
                    <span className="block text-xs text-muted-foreground">
                      {o.email_date ? `${o.email_date}: ` : ''}“{o.quote.length > 160 ? `${o.quote.slice(0, 160)}…` : o.quote}”
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Net (ex VAT)</div>
            <div className="font-medium tabular-nums">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : money(net)} {row.currency || 'EUR'}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Incl. VAT{row.vat_rate != null ? ` ${Number(row.vat_rate)}%` : ''}</div>
            <div className="font-medium tabular-nums">{busy ? '…' : money(gross)} {row.currency || 'EUR'}</div>
          </div>
        </div>

        {row.warnings && row.warnings.length > 0 && (
          <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
            {row.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}
        {error && <div className="text-xs text-destructive">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={!readyToUse || busy} onClick={() => use('net')}>Use net</Button>
          <Button size="sm" disabled={!readyToUse || busy || gross == null} onClick={() => use('gross')}>Use incl. VAT</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export const PriceResolutionCard: React.FC<{
  rows: ResolutionRow[];
  workspaceId: string;
  onUse: (pick: ResolutionPick) => void;
}> = ({ rows, workspaceId, onUse }) => (
  <div className="space-y-2">
    <h3 className="font-semibold text-sm">Calculation ({rows.length})</h3>
    {rows.map((r) => (
      <RowCard key={r.row_id} row={r} workspaceId={workspaceId} onUse={onUse} />
    ))}
  </div>
);

export default PriceResolutionCard;

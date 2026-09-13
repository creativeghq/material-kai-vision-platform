/**
 * What the stock is worth, and what it cost to sell (#421).
 *
 * Both figures say plainly which part of the warehouse they cover. An inventory value that
 * silently omits the shelves it could not price is worse than no figure, because it looks like one
 * — and an issue with no cost makes that sale's margin UNKNOWN, never zero.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, Coins, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO, localISODateOffset } from '@/utils/datetime';
import {
  stockValuationService, valuationIsPartial, formatValuation, METHOD_LABEL,
  type InventoryValue, type CogsResult, type ValuationMethod,
} from '@/modules/stock/services/stockValuationService';

const METHODS: ValuationMethod[] = ['weighted_average', 'fifo', 'standard'];

export const StockValuationSection: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [value, setValue] = useState<InventoryValue | null>(null);
  const [cogs, setCogs] = useState<CogsResult | null>(null);
  const [history, setHistory] = useState<{ effective_from: string; method: ValuationMethod; note: string | null }[]>([]);
  const [from, setFrom] = useState(() => localISODateOffset(-30));
  const [to, setTo] = useState(() => todayLocalISO());
  const [nextMethod, setNextMethod] = useState<ValuationMethod>('weighted_average');
  const [effectiveFrom, setEffectiveFrom] = useState(() => todayLocalISO());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [v, c, h] = await Promise.all([
        stockValuationService.inventoryValue(workspaceId),
        stockValuationService.cogs(workspaceId, `${from}T00:00:00Z`, `${to}T23:59:59Z`),
        stockValuationService.methodHistory(workspaceId).catch(() => []),
      ]);
      setValue(v); setCogs(c); setHistory(h); setFailed(false);
      if (h[0]?.method) setNextMethod(h[0].method);
    } catch {
      setValue(null); setCogs(null); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId, from, to]);

  useEffect(() => { void load(); }, [load]);

  const saveMethod = async () => {
    setSaving(true);
    try {
      await stockValuationService.setMethod(workspaceId, nextMethod, effectiveFrom);
      await load();
      toast({ title: 'Costing method recorded' });
    } catch (err: unknown) {
      toast({
        title: 'Could not record the method',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4 text-primary" /> Stock value and cost of sales
        </CardTitle>
        <CardDescription>
          Derived from the cost that travelled with each movement, so a cost that changes today does
          not rewrite the margin on a sale from March.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Valuing the warehouse…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The valuation could not be derived just now. That is not a statement that the stock is
            worth nothing.
          </p>
        )}

        {!loading && !failed && value && (
          <Figure
            title="Inventory value"
            amount={value.status === 'no_stock' ? null : value.value}
            partial={valuationIsPartial(value)}
            reason={value.reason}
            method={value.method}
          />
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="cogs-from" className="text-[11px]">From</Label>
            <Input
              id="cogs-from" type="date" className="mt-1 h-8 w-40 text-xs" value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cogs-to" className="text-[11px]">To</Label>
            <Input
              id="cogs-to" type="date" className="mt-1 h-8 w-40 text-xs" value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        {!loading && !failed && cogs && (
          <Figure
            title="Cost of goods sold"
            amount={cogs.status === 'no_movements' ? null : cogs.cogs}
            partial={valuationIsPartial(cogs)}
            reason={cogs.reason}
            method={cogs.method}
          />
        )}

        <div className="space-y-2 rounded-md border border-hairline p-3">
          <p className="text-sm font-medium">Costing method</p>
          <p className="text-[11px] text-muted-foreground">
            Recorded with a date rather than set as a flag: the method decides what every past issue
            cost, so changing it re-values sales that are already invoiced.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="method" className="text-[11px]">Method</Label>
              <Select value={nextMethod} onValueChange={(v) => setNextMethod(v as ValuationMethod)}>
                <SelectTrigger id="method" className="mt-1 h-8 w-64 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="method-from" className="text-[11px]">In force from</Label>
              <Input
                id="method-from" type="date" className="mt-1 h-8 w-40 text-xs" value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
            <Button size="sm" onClick={saveMethod} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
              Record
            </Button>
          </div>
          {history.length > 0 && (
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              {history.map((h) => (
                <li key={`${h.effective_from}:${h.method}`} className="tabular-nums">
                  {h.effective_from} — {METHOD_LABEL[h.method]}{h.note ? ` · ${h.note}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const Figure: React.FC<{
  title: string;
  amount: number | null;
  partial: boolean;
  reason: string;
  method?: ValuationMethod;
}> = ({ title, amount, partial, reason, method }) => (
  <div
    className={`rounded-md border p-2 text-xs ${
      partial
        ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
        : 'border-hairline bg-surface-sunken text-muted-foreground'
    }`}
  >
    <div className="flex flex-wrap items-center gap-2 font-medium">
      {partial ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
      {title}: <span className="tabular-nums">{formatValuation(amount)}</span>
      {partial && <span>(part of the warehouse)</span>}
    </div>
    <p className="mt-1">{reason}</p>
    {method && <p className="mt-0.5">{METHOD_LABEL[method]}</p>}
  </div>
);

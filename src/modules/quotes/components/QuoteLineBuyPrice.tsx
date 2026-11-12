import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/core/ui/input';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { parseDecimal } from '@/utils/decimal';
import { formatMoney } from '@/modules/finance/services/financeService';
import { formatDate } from '@/utils/datetime';
import type { BuyPriceSuggestion } from '../services/QuotesService';

const CONFIDENCE_VARIANT = { high: 'success', medium: 'warning', low: 'neutral' } as const;

/** One line's buy price: what we recorded, editable, plus the price-list match when one was looked up. */
export const QuoteLineBuyPrice: React.FC<{
  cost: number | null;
  sellPrice: number;
  suggestion?: BuyPriceSuggestion;
  readOnly: boolean;
  onSave: (cost: number | null, source: 'manual' | 'price_list') => Promise<void>;
}> = ({ cost, sellPrice, suggestion, readOnly, onSave }) => {
  const { toast } = useToast();
  const [value, setValue] = useState(cost != null ? String(cost) : '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setValue(cost != null ? String(cost) : ''); }, [cost]);

  const save = async (next: number | null, source: 'manual' | 'price_list') => {
    if (next === cost) return;
    try {
      setSaving(true);
      await onSave(next, source);
    } catch (err) {
      toast({ title: 'Could not save the buy price', description: (err as Error).message, variant: 'destructive' });
      setValue(cost != null ? String(cost) : '');
    } finally {
      setSaving(false);
    }
  };

  const commit = () => {
    const raw = value.trim();
    if (!raw) return void save(null, 'manual');
    const n = parseDecimal(raw);
    if (n == null || n < 0) {
      toast({ title: 'Enter a valid buy price', variant: 'destructive' });
      setValue(cost != null ? String(cost) : '');
      return;
    }
    void save(n, 'manual');
  };

  const margin = cost != null && sellPrice > 0 ? ((sellPrice - cost) / sellPrice) * 100 : null;
  const m = suggestion?.match;
  const usable = m && (m.currency ?? 'EUR').toUpperCase() === 'EUR';

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
          <Input
            type="text"
            inputMode="decimal"
            aria-label="Buy price"
            placeholder="—"
            className="h-8 w-24 pl-6"
            value={value}
            disabled={readOnly || saving}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </div>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      {margin != null && (
        <div className={`text-[11px] tabular-nums ${margin < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
          Margin {margin.toFixed(1)}%
        </div>
      )}
      {suggestion && !m && (
        <div className="max-w-[16rem] text-[11px] text-muted-foreground">
          {suggestion.status === 'not_in_price_lists' ? 'Not in your price lists' : `No match: ${suggestion.reason ?? ''}`}
        </div>
      )}
      {m && (
        <div className="max-w-[16rem] space-y-0.5 rounded-sm border border-hairline bg-surface-sunken p-1.5 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold tabular-nums">{formatMoney(m.net_price, m.currency || 'EUR')}</span>
            {m.unit && <span className="text-muted-foreground">/ {m.unit}</span>}
            {suggestion?.confidence && (
              <Badge variant={CONFIDENCE_VARIANT[suggestion.confidence]} className="px-1 py-0 text-[10px]">
                {suggestion.confidence === 'high' ? 'Exact' : suggestion.confidence === 'medium' ? 'Likely' : 'Unsure'}
              </Badge>
            )}
          </div>
          <div className="text-muted-foreground" title={m.item_text}>
            {m.supplier ?? 'Price list'}{m.effective_date ? ` · ${formatDate(m.effective_date)}` : ''}
          </div>
          {suggestion?.reason && <div className="text-muted-foreground">{suggestion.reason}</div>}
          {m.warnings.map((w) => <div key={w} className="text-amber-800 dark:text-amber-300">{w}</div>)}
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              className="mt-1 h-6 px-2 text-[11px]"
              disabled={!usable || saving || m.net_price === cost}
              title={usable ? undefined : 'This row is not in EUR — enter the converted price by hand'}
              onClick={() => void save(m.net_price, 'price_list')}
            >
              {m.net_price === cost ? 'In use' : 'Use this price'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Product Price panel (per-workspace) — the headline Purchase / Retail / Margin for a
 * product, resolved for the ACTIVE workspace via the resale resolver:
 *   • Purchase = cost_basis (what this workspace pays — its own cost, or the resolved
 *     cost down the resale chain for an operator-catalog product it resells).
 *   • Retail   = this workspace's list_price (editable — works for the owner AND a
 *     reseller pricing a resold product; saved to product_prices for this workspace).
 *   • Margin   = retail − cost, shown red when negative (display-only, no block).
 * A reseller can set a retail price here, not only the price-owner.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Input } from '@/components/core/ui/input';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import { marketplacePricingService, type WorkspacePrice } from '@/services/marketplacePricingService';
import { parseDecimal, formatMoney } from '@/utils/decimal';

export const ProductPricePanel: React.FC<{ productId: string }> = ({ productId }) => {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [price, setPrice] = useState<WorkspacePrice | null>(null);
  const [retail, setRetail] = useState('');
  const [unit, setUnit] = useState('');

  const load = useCallback(async () => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [p, row] = await Promise.all([
        marketplacePricingService.getProductPrice(activeWorkspaceId, productId),
        supabase.from('product_prices').select('list_price, unit')
          .eq('workspace_id', activeWorkspaceId).eq('product_id', productId).maybeSingle(),
      ]);
      // supabase-js RESOLVES on an RLS denial instead of throwing, so `row.error` has to be
      // checked by hand. Discarding it made a failed read indistinguishable from "no explicit
      // list price set": the field fell back to the markup-derived retail, and saving then wrote
      // that figure back as an explicit `list_price` — pinning the price and quietly taking the
      // product off the markup ladder.
      if (row.error) throw row.error;
      setPrice(p);
      setRetail(row.data?.list_price != null ? String(row.data.list_price) : (p?.retail != null ? String(p.retail) : ''));
      setUnit(row.data?.unit ?? '');
    } catch (e: any) {
      toast({ title: 'Failed to load pricing', description: e?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [activeWorkspaceId, productId, toast]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!activeWorkspaceId) return;
    setSaving(true);
    try {
      await marketplacePricingService.setListPrice(activeWorkspaceId, productId, parseDecimal(retail), {
        currency: price?.currency ?? 'EUR', unit: unit || null,
      });
      toast({ title: 'Retail price saved' });
      await load();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="rounded-md border border-border/60 p-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>;

  const cur = price?.currency ?? 'EUR';
  const cost = price?.cost_basis ?? null;
  const retailNum = parseDecimal(retail);
  const margin = (retailNum != null && cost != null) ? Math.round((retailNum - cost) * 100) / 100 : null;
  const marginPct = (margin != null && cost) ? Math.round((margin / cost) * 1000) / 10 : null;
  const fmt = (n: number | null | undefined) => formatMoney(n, cur);
  const negative = margin != null && margin < 0;

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Purchase price</div>
          <div className="text-lg font-semibold tabular-nums">{fmt(cost)}</div>
          <div className="text-[10px] text-muted-foreground">{price?.mode === 'own_product' ? 'Your cost' : 'Your cost (from catalog)'}{unit ? ` · per ${unit}` : ''}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Retail price</div>
          <Input className="h-8 text-sm mt-0.5" inputMode="decimal" value={retail} onChange={(e) => setRetail(e.target.value)} placeholder="0.00" />
          <div className="text-[10px] text-muted-foreground mt-0.5">{price?.retail_source === 'list_price' ? 'Set explicitly' : 'Computed from markup'}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Margin</div>
          <div className={`text-lg font-semibold tabular-nums ${negative ? 'text-destructive' : ''}`}>{fmt(margin)}</div>
          <div className={`text-[10px] ${negative ? 'text-destructive' : 'text-muted-foreground'}`}>
            {marginPct != null ? `${marginPct}%` : '—'}{negative ? ' · below cost' : ''}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Input className="h-8 text-xs w-32" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit (m², pc…)" />
        <Button size="sm" variant="outline" onClick={save} disabled={saving} className="ml-auto">
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />} Save retail
        </Button>
      </div>
    </div>
  );
};

export default ProductPricePanel;

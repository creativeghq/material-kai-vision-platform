/**
 * #176 — supplier per-product pricing + supply mode.
 *
 * The price set here is the BASE the cascade resolver reads:
 *  - root operator → the catalog base price every downstream tier inherits (+ commission);
 *  - a dealer on their OWN product → their sell price to the tier below.
 *
 * Writes product_prices (UNIQUE workspace_id,product_id → upsert) + products.supply_mode.
 * Only rendered for the price-owner (root, or the product's owning workspace) and only to
 * a supplier-capable user. For an operator-catalog product seen by a downstream dealer the
 * read-only WorkspaceCostBadge already shows their resolved cost, so this card stays hidden.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Save, Tag } from 'lucide-react';
import { Label } from '@/components/core/ui/label';
import { Input } from '@/components/core/ui/input';
import { Button } from '@/components/core/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useCapabilities } from '@/hooks/useCapabilities';

const CURRENCIES = ['EUR', 'USD', 'GBP'];

export const ProductPricingCard: React.FC<{ productId: string }> = ({ productId }) => {
  const { toast } = useToast();
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const { canSupplyProducts } = useCapabilities();

  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [listPrice, setListPrice] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [unit, setUnit] = useState('');
  const [discountPct, setDiscountPct] = useState('');
  const [supplyMode, setSupplyMode] = useState<'platform_sold' | 'reference_only'>('platform_sold');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: prod } = await supabase
        .from('products')
        .select('workspace_id, supply_mode')
        .eq('id', productId)
        .maybeSingle();
      // Price-owner = root operator, or the workspace that owns this product.
      const isPriceOwner = !!activeWorkspace?.isRoot || prod?.workspace_id === activeWorkspaceId;
      if (cancelled) return;
      if (!isPriceOwner) { setEligible(false); setLoading(false); return; }

      const { data: price } = await supabase
        .from('product_prices')
        .select('list_price, currency, unit, discount_percent')
        .eq('product_id', productId)
        .eq('workspace_id', activeWorkspaceId as string)
        .maybeSingle();
      if (cancelled) return;
      setListPrice(price?.list_price != null ? String(price.list_price) : '');
      setCurrency(price?.currency || 'EUR');
      setUnit(price?.unit || '');
      setDiscountPct(price?.discount_percent != null ? String(price.discount_percent) : '');
      setSupplyMode((prod?.supply_mode as any) || 'platform_sold');
      setEligible(true);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [productId, activeWorkspaceId, activeWorkspace?.isRoot]);

  const save = async () => {
    if (!activeWorkspaceId) return;
    setSaving(true);
    try {
      const lp = listPrice ? Number(listPrice) : null;
      const dp = discountPct ? Number(discountPct) : null;
      const { error: priceErr } = await supabase
        .from('product_prices')
        .upsert({
          workspace_id: activeWorkspaceId,
          product_id: productId,
          list_price: lp,
          currency,
          unit: unit || null,
          discount_percent: dp,
          discount_price: lp != null && dp != null ? Math.round(lp * (1 - dp / 100) * 100) / 100 : null,
          confirmed_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id,product_id' });
      if (priceErr) throw priceErr;

      // supply_mode is a product-level flag; only the product owner / root sets it.
      const { error: modeErr } = await supabase
        .from('products')
        .update({ supply_mode: supplyMode })
        .eq('id', productId);
      if (modeErr) throw modeErr;

      toast({ title: 'Pricing saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (!canSupplyProducts || loading || !eligible) return null;

  const isRoot = !!activeWorkspace?.isRoot;

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2 mt-2">
      <div className="text-xs font-medium flex items-center gap-1">
        <Tag className="h-3.5 w-3.5 text-primary" />
        {isRoot ? 'Catalog base price' : 'Your sell price'}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">List price</Label>
          <Input className="h-8 text-xs" type="number" step="0.01" min="0" value={listPrice}
            onChange={(e) => setListPrice(e.target.value)} placeholder="0.00" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Unit</Label>
          <Input className="h-8 text-xs" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="m², piece…" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Discount %</Label>
          <Input className="h-8 text-xs" type="number" step="0.5" min="0" max="100" value={discountPct}
            onChange={(e) => setDiscountPct(e.target.value)} placeholder="0" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Supply mode</Label>
        <Select value={supplyMode} onValueChange={(v: any) => setSupplyMode(v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="platform_sold">Platform-sold (invoiced through the platform)</SelectItem>
            <SelectItem value="reference_only">Reference only (shown, transacted off-platform)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button size="sm" variant="outline" onClick={save} disabled={saving} className="w-full">
        {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />} Save pricing
      </Button>
    </div>
  );
};

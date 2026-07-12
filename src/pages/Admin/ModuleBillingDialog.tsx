// #251 A2 — operator binds a module 1:1 to a Stripe PRODUCT (not a bare price). The charge uses
// the product's default_price (resolved at activation), so two modules can never collide on a
// shared price id. The plan tier that INCLUDES a module for free is set separately on /admin/plans.
import React, { useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';

interface StripeProductPrice {
  id: string;
  unit_amount: number | null;
  currency: string;
  interval: string;
}
interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  price: StripeProductPrice | null; // null when the product has no recurring default price
}

interface Props {
  slug: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function priceLabel(p: StripeProductPrice): string {
  const amt = p.unit_amount != null ? (p.unit_amount / 100).toFixed(2) : '—';
  return `${amt} ${p.currency.toUpperCase()}/${p.interval}`;
}

export const ModuleBillingDialog: React.FC<Props> = ({ slug, name, open, onOpenChange, onSaved }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<StripeProduct[]>([]);
  const [isAddon, setIsAddon] = useState(false);
  const [productId, setProductId] = useState<string>('');
  const [summary, setSummary] = useState('');
  // #256 — one-click "create & attach" a Stripe product so the operator never leaves the app.
  const [creating, setCreating] = useState(false);
  const [newAmount, setNewAmount] = useState(''); // major units, e.g. "9.00"
  const [newInterval, setNewInterval] = useState<'month' | 'year'>('month');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const modReq = supabase.from('modules').select('*').eq('slug', slug).maybeSingle();
      const prodReq = supabase.functions.invoke('stripe-api', { body: { action: 'list-stripe-products' } });
      const [{ data: mod }, { data: pr, error: prErr }] = await Promise.all([modReq, prodReq]);
      if (cancelled) return;
      setIsAddon(!!mod?.is_addon);
      setProductId(mod?.addon_stripe_product_id ?? '');
      setSummary(mod?.summary ?? '');
      if (prErr) {
        toast({ title: 'Could not load Stripe products', description: 'Check the Stripe key at Payments → Keys.', variant: 'destructive' });
        setProducts([]);
      } else {
        setProducts(((pr as { products?: StripeProduct[] })?.products) ?? []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, slug, toast]);

  const selected = products.find((p) => p.id === productId);
  const priceMissing = isAddon && !!selected && !selected.price;

  const createProduct = async () => {
    const amount = Math.round(parseFloat(newAmount.replace(',', '.')) * 100);
    if (!Number.isFinite(amount) || amount < 50) {
      toast({ title: 'Enter a price', description: 'Amount must be at least 0.50.', variant: 'destructive' });
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke('stripe-api', {
      body: { action: 'create-addon-product', module_slug: slug, amount_cents: amount, currency: 'eur', interval: newInterval },
    });
    setCreating(false);
    const res = data as { created?: boolean; product?: StripeProduct; error?: string } | null;
    if (error || !res?.created || !res.product) {
      toast({ title: 'Could not create product', description: res?.error || error?.message || 'Stripe error', variant: 'destructive' });
      return;
    }
    // Splice the new product into the list + select it, and reflect it saved.
    setProducts((prev) => [res.product as StripeProduct, ...prev.filter((p) => p.id !== res.product!.id)]);
    setProductId(res.product.id);
    setNewAmount('');
    toast({ title: 'Product created & attached', description: `${name} is now purchasable.` });
    onSaved();
  };

  const save = async () => {
    setSaving(true);
    const payload = {
      is_addon: isAddon,
      addon_stripe_product_id: isAddon ? (productId || null) : null,
      addon_price_cents: isAddon ? (selected?.price?.unit_amount ?? null) : null,
      addon_currency: isAddon ? (selected?.price?.currency ?? 'eur') : 'eur',
      summary: summary || null,
    };
    const { error } = await supabase.from('modules').update(payload).eq('slug', slug);
    setSaving(false);
    if (error) {
      // A duplicate Stripe product on another module trips the unique index → friendly message.
      const dup = /modules_addon_product_uniq|duplicate key/i.test(error.message);
      toast({
        title: 'Could not save billing',
        description: dup ? 'That Stripe product is already bound to another module. Use one product per module.' : error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Billing updated', description: name });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{name} — Add-on billing</DialogTitle></DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Purchasable as an add-on</Label>
                <p className="text-xs text-muted-foreground">Workspaces whose plan doesn't include it can buy it.</p>
              </div>
              <Switch checked={isAddon} onCheckedChange={setIsAddon} />
            </div>

            {isAddon && (
              <div className="space-y-2">
                <Label>Stripe product</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger><SelectValue placeholder="Select a Stripe product…" /></SelectTrigger>
                  <SelectContent>
                    {products.length === 0 && <SelectItem value="none" disabled>No active products found</SelectItem>}
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id} disabled={!p.price}>
                        {p.name}{p.price ? ` — ${priceLabel(p.price)}` : ' — no recurring price'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {priceMissing ? (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> This product has no recurring default price in Stripe — set one before binding.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    One product per module. The charge uses the product's <strong>default price</strong>.
                  </p>
                )}

                {/* One-click create — no Stripe dashboard trip needed. */}
                <div className="rounded-md border border-dashed p-3 space-y-2">
                  <Label className="text-xs">Or create a new product</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text" inputMode="decimal" value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      placeholder="9.00" className="w-24"
                    />
                    <span className="text-xs text-muted-foreground">EUR /</span>
                    <Select value={newInterval} onValueChange={(v) => setNewInterval(v as 'month' | 'year')}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="month">month</SelectItem>
                        <SelectItem value="year">year</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="secondary" onClick={createProduct} disabled={creating || !newAmount.trim()}>
                      {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create & attach'}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Creates the Stripe product + recurring price and binds it here automatically.</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Catalog summary (optional)</Label>
              <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One line shown on the activation card" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading || (isAddon && (!productId || priceMissing))}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

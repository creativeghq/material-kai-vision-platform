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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const modReq = supabase.from('modules').select('*').eq('slug', slug).maybeSingle();
      const prodReq = supabase.functions.invoke('stripe-api', { body: { action: 'list-stripe-products' } });
      const [{ data: mod }, { data: pr, error: prErr }] = await Promise.all([modReq, prodReq]);
      if (cancelled) return;
      const m = mod as unknown as { is_addon?: boolean; addon_stripe_product_id?: string | null; summary?: string | null } | null;
      setIsAddon(!!m?.is_addon);
      setProductId(m?.addon_stripe_product_id ?? '');
      setSummary(m?.summary ?? '');
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

  const save = async () => {
    setSaving(true);
    const payload = {
      is_addon: isAddon,
      addon_stripe_product_id: isAddon ? (productId || null) : null,
      addon_price_cents: isAddon ? (selected?.price?.unit_amount ?? null) : null,
      addon_currency: isAddon ? (selected?.price?.currency ?? 'eur') : 'eur',
      summary: summary || null,
    };
    // `modules` add-on columns aren't in the generated Database type yet — cast the builder.
    const { error } = await (supabase.from('modules') as unknown as {
      update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
    }).update(payload).eq('slug', slug);
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
                    One product per module. The charge uses the product's <strong>default price</strong> (set it in Stripe).
                  </p>
                )}
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

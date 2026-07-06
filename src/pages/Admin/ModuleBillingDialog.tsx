// #251 A2 — operator sets a module's add-on billing: mark it purchasable and bind a recurring
// Stripe price (fetched live from Stripe). The plan tier that INCLUDES it is set separately on
// /admin/plans (modules.price_tier). Price + currency are derived from the chosen Stripe price.
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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

interface StripePrice {
  id: string;
  nickname: string | null;
  unit_amount: number | null;
  currency: string;
  interval?: string;
  product_name?: string;
}

interface Props {
  slug: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export const ModuleBillingDialog: React.FC<Props> = ({ slug, name, open, onOpenChange, onSaved }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prices, setPrices] = useState<StripePrice[]>([]);
  const [isAddon, setIsAddon] = useState(false);
  const [priceId, setPriceId] = useState<string>('');
  const [summary, setSummary] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Current billing config on the module row (new #251 columns not yet in generated types).
      const modReq = supabase.from('modules').select('*').eq('slug', slug).maybeSingle();
      // Live Stripe recurring prices (operator-gated edge action).
      const pricesReq = supabase.functions.invoke('stripe-api', { body: { action: 'list-stripe-prices' } });
      const [{ data: mod }, { data: pr, error: prErr }] = await Promise.all([modReq, pricesReq]);
      if (cancelled) return;
      const m = mod as unknown as { is_addon?: boolean; addon_stripe_price_id?: string | null; summary?: string | null } | null;
      setIsAddon(!!m?.is_addon);
      setPriceId(m?.addon_stripe_price_id ?? '');
      setSummary(m?.summary ?? '');
      if (prErr) {
        toast({ title: 'Could not load Stripe prices', description: 'Check the Stripe key at Payments → Keys.', variant: 'destructive' });
        setPrices([]);
      } else {
        setPrices(((pr as { prices?: StripePrice[] })?.prices) ?? []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, slug, toast]);

  const selected = prices.find((p) => p.id === priceId);

  const save = async () => {
    setSaving(true);
    // Derive display price + currency from the chosen Stripe price (authoritative).
    const payload = {
      is_addon: isAddon,
      addon_stripe_price_id: isAddon ? (priceId || null) : null,
      addon_price_cents: isAddon ? (selected?.unit_amount ?? null) : null,
      addon_currency: isAddon ? (selected?.currency ?? 'eur') : 'eur',
      summary: summary || null,
    };
    // `modules` add-on columns aren't in the generated Database type yet — cast the builder.
    const { error } = await (supabase.from('modules') as unknown as {
      update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
    }).update(payload).eq('slug', slug);
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save billing', description: error.message, variant: 'destructive' });
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
                <Label>Recurring Stripe price</Label>
                <Select value={priceId} onValueChange={setPriceId}>
                  <SelectTrigger><SelectValue placeholder="Select a Stripe price…" /></SelectTrigger>
                  <SelectContent>
                    {prices.length === 0 && <SelectItem value="none" disabled>No recurring prices found</SelectItem>}
                    {prices.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {(p.product_name || p.nickname || p.id)}
                        {p.unit_amount != null ? ` — ${(p.unit_amount / 100).toFixed(2)} ${p.currency.toUpperCase()}/${p.interval ?? 'mo'}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Create the price in Stripe (recurring), then pick it here. Price &amp; currency are read from Stripe.
                </p>
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
          <Button onClick={save} disabled={saving || loading || (isAddon && !priceId)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

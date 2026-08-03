/**
 * Public online storefront at /store/:slug (no auth). Browse a workspace's published
 * products, add to cart, check out → a draft order + pay token → redirect to the existing
 * /pay/:token Stripe-Connect flow.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { useParams } from 'react-router-dom';
import { Loader2, ShoppingCart, Plus, Minus, Trash2, Store, ArrowRight, Package, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { TurnstileWidget, type TurnstileHandle } from '@/components/features/turnstile/TurnstileWidget';
import { storefrontService, type StorefrontMeta, type StorefrontProduct } from '@/modules/finance/services/storefrontService';

const money = (n: number, ccy: string) => formatMoney(n, ccy || 'EUR');

const PublicStorefrontPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [meta, setMeta] = useState<StorefrontMeta | null>(null);
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  // Null until the visitor passes the challenge. When the platform has no Turnstile configured
  // `meta.turnstile_site_key` is null, no widget renders, and the server accepts the checkout
  // without a token — the same fail-open ruling the rest of the public surface uses.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  useEffect(() => {
    if (!slug) return;
    void (async () => {
      try {
        setLoading(true);
        const m = await storefrontService.getMeta(slug);
        setMeta(m);
        if (!m.enabled) { setError('This store is not open.'); return; }
        const p = await storefrontService.getProducts(slug);
        setProducts(p.products ?? []);
      } catch (e: any) {
        setError(e?.message ?? 'Could not load this store.');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const byId = useMemo(() => new Map(products.map((p) => [p.product_id, p])), [products]);
  const currency = products[0]?.currency ?? 'EUR';
  const cartLines = Object.entries(cart).filter(([, q]) => q > 0);
  const total = cartLines.reduce((s, [id, q]) => s + (byId.get(id)?.price ?? 0) * q, 0);

  const setQty = (id: string, delta: number) => setCart((c) => {
    const next = Math.max(0, (c[id] ?? 0) + delta);
    const copy = { ...c }; if (next === 0) delete copy[id]; else copy[id] = next; return copy;
  });
  const removeLine = (id: string) => setCart((c) => { const copy = { ...c }; delete copy[id]; return copy; });

  const checkout = async () => {
    if (!slug || cartLines.length === 0) return;
    if (!name.trim() || !email.trim()) { setError('Enter your name and email to check out.'); return; }
    setError(null); setCheckingOut(true);
    try {
      const res = await storefrontService.checkout(
        slug,
        cartLines.map(([product_id, qty]) => ({ product_id, qty })),
        { name: name.trim(), email: email.trim(), note: note.trim() || undefined },
        turnstileToken,
      );
      // Hand off to the existing pay page → Stripe Connect checkout.
      window.location.href = res.pay_url;
    } catch (e: any) {
      setError(e?.message ?? 'Checkout failed. Please try again.');
      // A Turnstile token is single-use: whatever failed, the old one is now spent, so clear it
      // and re-arm the widget. Without this a retry sends a burnt token and fails the bot check
      // for a reason that has nothing to do with why the first attempt failed.
      setTurnstileToken(null);
      turnstileRef.current?.reset();
      setCheckingOut(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error && !meta?.enabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-sm"><CardContent className="p-8 text-center">
          <Store className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"><Store className="h-3.5 w-3.5" /> {meta?.workspace_name}</div>
          <h1 className="mt-1 text-2xl font-semibold">{meta?.headline}</h1>
          {meta?.subheadline && <p className="mt-1 text-sm text-muted-foreground">{meta.subheadline}</p>}
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[1fr_340px]">
        {/* Catalog */}
        <div>
          {products.length === 0 ? (
            <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No products available right now.</CardContent></Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {products.map((p) => (
                <Card key={p.product_id} className="overflow-hidden">
                  <div className="aspect-square bg-muted/40">
                    {p.image_url
                      ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                      : <div className="flex h-full items-center justify-center text-muted-foreground">{p.item_type === 'service' ? <Wrench className="h-8 w-8" /> : <Package className="h-8 w-8" />}</div>}
                  </div>
                  <CardContent className="p-3">
                    <div className="line-clamp-2 text-sm font-medium">{p.name}</div>
                    <div className="mt-1 text-sm text-primary">{money(p.price, p.currency)}{p.unit ? <span className="text-muted-foreground">/{p.unit}</span> : ''}</div>
                    <Button size="sm" variant="outline" className="mt-2 w-full rounded-full" onClick={() => setQty(p.product_id, 1)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Cart */}
        <Card className="h-fit lg:sticky lg:top-4">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><ShoppingCart className="h-4 w-4" /> Your cart</div>
            {cartLines.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Add products to get started.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {cartLines.map(([id, qty]) => {
                    const p = byId.get(id); if (!p) return null;
                    return (
                      <div key={id} className="flex items-center gap-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{money(p.price, p.currency)} × {qty}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button className="rounded p-1 hover:bg-muted" onClick={() => setQty(id, -1)}><Minus className="h-3 w-3" /></button>
                          <span className="w-5 text-center">{qty}</span>
                          <button className="rounded p-1 hover:bg-muted" onClick={() => setQty(id, 1)}><Plus className="h-3 w-3" /></button>
                          <button className="rounded p-1 text-muted-foreground hover:text-destructive" onClick={() => removeLine(id)}><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between border-t border-border/60 pt-2 text-base font-semibold">
                  <span>Total</span><span>{money(total, currency)}</span>
                </div>
                <div className="space-y-2 border-t border-border/60 pt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Email</Label>
                    <Input className="h-9" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Note <span className="text-muted-foreground">(optional)</span></Label>
                    <Input className="h-9" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I'll pick up today" maxLength={500} />
                  </div>
                </div>
                {meta?.turnstile_site_key && (
                  <div className="space-y-1">
                    <Label className="text-xs">Bot check</Label>
                    <TurnstileWidget
                      ref={turnstileRef}
                      siteKey={meta.turnstile_site_key}
                      action="storefront_checkout"
                      onVerify={setTurnstileToken}
                      onExpired={() => setTurnstileToken(null)}
                      onError={() => setTurnstileToken(null)}
                    />
                  </div>
                )}
                {error && <p className="text-xs text-destructive">{error}</p>}
                <Button
                  className="w-full"
                  onClick={checkout}
                  // Only gated when a challenge is actually being shown.
                  disabled={checkingOut || (!!meta?.turnstile_site_key && !turnstileToken)}
                >
                  {checkingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Checkout · {money(total, currency)} <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
                <p className="text-[11px] text-muted-foreground">Secure payment via Stripe. You&apos;ll be redirected to complete your purchase.</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PublicStorefrontPage;

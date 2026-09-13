/**
 * Public online storefront at /store/:slug (no auth). Browse a workspace's published
 * products, add to cart, check out → a draft order + pay token → redirect to the existing
 * /pay/:token Stripe-Connect flow.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, ShoppingCart, Plus, Minus, Trash2, Store, ArrowRight, Package, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { TurnstileWidget, type TurnstileHandle } from '@/components/features/turnstile/TurnstileWidget';
import {
  storefrontService,
  type StorefrontMeta, type StorefrontProduct, type StorefrontProductSafety,
} from '@/modules/finance/services/storefrontService';

const money = (n: number, ccy: string) => formatMoney(n, ccy || 'EUR');

const PublicStorefrontPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  // `?product=<id>` is where an Inbox card's "View product" button lands: the store, opened
  // on that product. It is highlighted and scrolled to once the catalog has loaded.
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('product');
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

  useEffect(() => {
    if (!highlightId || !products.length) return;
    document.getElementById(`product-${highlightId}`)?.scrollIntoView({ block: 'center' });
  }, [highlightId, products]);

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
                <Card
                  key={p.product_id}
                  id={`product-${p.product_id}`}
                  className={`overflow-hidden ${p.product_id === highlightId ? 'ring-2 ring-primary' : ''}`}
                >
                  <div className="aspect-square bg-muted/40">
                    {p.image_url
                      ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                      : <div className="flex h-full items-center justify-center text-muted-foreground">{p.item_type === 'service' ? <Wrench className="h-8 w-8" /> : <Package className="h-8 w-8" />}</div>}
                  </div>
                  <CardContent className="p-3">
                    <div className="line-clamp-2 text-sm font-medium">{p.name}</div>
                    <div className="mt-1 text-sm text-primary">{money(p.price, p.currency)}{p.unit ? <span className="text-muted-foreground">/{p.unit}</span> : ''}</div>
                    {/* The visible label is short because the card is; the accessible name is not,
                        because "Add" repeated twenty times down a list says nothing. */}
                    <Button
                      size="sm" variant="outline" className="mt-2 w-full"
                      aria-label={`Add ${p.name} to the cart`}
                      onClick={() => setQty(p.product_id, 1)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add
                    </Button>
                    <SafetyDisclosure safety={p.safety ?? null} />
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
                          {/* An icon-only control has no accessible name, so a screen reader
                              announces "button" three times per line. EAA Annex I IV(g)(ii). */}
                          <button type="button" aria-label={`Remove one ${p.name}`} className="rounded p-1 hover:bg-muted" onClick={() => setQty(id, -1)}><Minus className="h-3 w-3" /></button>
                          <span className="w-5 text-center">{qty}</span>
                          <button type="button" aria-label={`Add one ${p.name}`} className="rounded p-1 hover:bg-muted" onClick={() => setQty(id, 1)}><Plus className="h-3 w-3" /></button>
                          <button type="button" aria-label={`Remove ${p.name} from the cart`} className="rounded p-1 text-muted-foreground hover:text-destructive" onClick={() => removeLine(id)}><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between border-t border-border/60 pt-2 text-base font-semibold">
                  <span>Total</span><span>{money(total, currency)}</span>
                </div>
                <div className="space-y-2 border-t border-border/60 pt-2">
                  {/* A placeholder is not a label: it disappears on focus and is not exposed
                      as one. Checkout is named in Annex I IV(g)(ii) specifically. */}
                  <div className="space-y-1">
                    <Label htmlFor="storefront-name" className="text-xs">Name</Label>
                    <Input id="storefront-name" autoComplete="name" className="h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="storefront-email" className="text-xs">Email</Label>
                    <Input id="storefront-email" autoComplete="email" className="h-9" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="storefront-note" className="text-xs">Note <span className="text-muted-foreground">(optional)</span></Label>
                    <Input id="storefront-note" className="h-9" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I'll pick up today" maxLength={500} />
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
                {/* An error that is only a colour and a font size is not an identified one. */}
                {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
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

      {meta?.accessibility_statement && (
        <footer className="border-t border-border/60">
          <div className="mx-auto max-w-5xl px-4 py-6">
            <h2 className="text-sm font-semibold">Accessibility</h2>
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
              {meta.accessibility_statement}
            </p>
          </div>
        </footer>
      )}
    </div>
  );
};

/**
 * GPSR art. 19 on the offer itself.
 *
 * A <details> rather than a dialog: it is keyboard-operable and announced with no JavaScript,
 * which is the point of putting safety information behind a control at all.
 */
const SafetyDisclosure: React.FC<{ safety: StorefrontProductSafety | null }> = ({ safety }) => {
  if (!safety || safety.status === 'not_found') return null;
  const rp = safety.responsible_person;
  return (
    <details className="mt-2 text-[11px] text-muted-foreground">
      <summary className="cursor-pointer">Safety and manufacturer information</summary>
      <div className="mt-1 space-y-1">
        {(safety.warnings?.length ?? 0) > 0 && (
          <ul className="list-disc pl-4 font-medium text-foreground">
            {safety.warnings?.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}
        {safety.manufacturer?.name && (
          <p>
            Manufacturer: {safety.manufacturer.name}
            {safety.manufacturer.postal_address ? `, ${safety.manufacturer.postal_address}` : ''}
            {safety.manufacturer.email ? ` · ${safety.manufacturer.email}` : ''}
          </p>
        )}
        {rp && rp.source !== 'manufacturer_is_eu' && rp.name && (
          <p>
            Responsible person in the EU: {rp.name}
            {rp.postal_address ? `, ${rp.postal_address}` : ''}
            {rp.email ? ` · ${rp.email}` : ''}
          </p>
        )}
        {safety.product_identifier && (
          <p>Identifier: {safety.product_identifier}{safety.product_type ? ` · ${safety.product_type}` : ''}</p>
        )}
        {safety.accessibility_information && (
          <p>Accessibility: {safety.accessibility_information}</p>
        )}
      </div>
    </details>
  );
};

export default PublicStorefrontPage;

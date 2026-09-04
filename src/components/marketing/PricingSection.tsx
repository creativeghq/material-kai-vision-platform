/**
 * The public price.
 *
 * Every figure comes from `get_public_pricing()`, which reads the plans that actually bill. The
 * alternative was writing "€25" into this file — a second copy of a money quantity, and the one
 * kind of drift a customer screenshots. `included_modules` is derived by the same `tier_rank`
 * comparison the entitlement gate uses, so what this page promises and what a workspace can
 * actually open cannot disagree.
 *
 * WHEN THE FETCH FAILS IT SHOWS NO PRICE. Not a cached one, not a hardcoded fallback — a line
 * saying the plans could not be loaded, and a link to the page that always knows. A stale price on
 * a public page is worse than no price: one is an inconvenience, the other is a quote.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Loader2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney } from '@/utils/decimal';

interface PublicPlan {
  slug: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  currency: string;
  contact_sales: boolean;
  /** null means NO LIMIT — never 0, and never rendered as a number. */
  max_materials: number | null;
  max_services: number | null;
  max_contacts: number | null;
  included_modules: number;
}

interface PublicAddon {
  slug: string;
  name: string;
  summary: string | null;
  price_cents: number;
  currency: string;
  interval: string;
}

interface PublicPricing {
  plans: PublicPlan[];
  addons: PublicAddon[];
  live_modules: number;
}

const limit = (n: number | null, noun: string): string =>
  n === null ? `Unlimited ${noun}` : `${n.toLocaleString('en-GB')} ${noun}`;

export const PricingSection: React.FC = () => {
  const [pricing, setPricing] = useState<PublicPricing | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc('get_public_pricing');
        if (error) throw error;
        if (!alive) return;
        setPricing(data as PublicPricing);
        setState('ready');
      } catch {
        if (alive) setState('failed');
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <section id="pricing" className="container mx-auto max-w-6xl px-4 py-16 scroll-mt-20">
      <div className="text-center mb-10">
        <h2 className="font-display text-3xl font-semibold tracking-tight mb-3">
          One price, everything included
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Start free, with no card. Move up when the free limits stop fitting — not when a
          salesperson calls.
        </p>
      </div>

      {state === 'loading' && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}

      {state === 'failed' && (
        // No price rather than a wrong one. A hardcoded fallback here is exactly how a page ends
        // up quoting a number the checkout does not charge.
        <div className="rounded-sm border border-hairline p-8 text-center">
          <p className="text-sm text-muted-foreground">
            The plans could not be loaded just now.
          </p>
          <Link to="/auth?mode=signup" className="mt-3 inline-block">
            <Button size="sm" variant="outline" className="gap-2">
              Create a free account <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      )}

      {state === 'ready' && pricing && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {pricing.plans.map((p) => {
              const paid = !p.contact_sales && (p.price_cents ?? 0) > 0;
              return (
                <Card
                  key={p.slug}
                  className={`dashboard-card h-full ${paid ? 'border-primary/40' : ''}`}
                >
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold">{p.name}</h3>
                      {paid && <Badge variant="info">Most complete</Badge>}
                    </div>

                    <div className="mb-4 mt-2">
                      {p.contact_sales ? (
                        <span className="text-2xl font-semibold tabular-nums">Let&apos;s talk</span>
                      ) : (
                        <>
                          <span className="text-3xl font-semibold tabular-nums">
                            {formatMoney((p.price_cents ?? 0) / 100, p.currency, { decimals: 0, maxDecimals: 0 })}
                          </span>
                          <span className="text-sm text-muted-foreground"> / month</span>
                        </>
                      )}
                    </div>

                    {p.description && (
                      <p className="text-sm text-muted-foreground mb-4">{p.description}</p>
                    )}

                    <ul className="space-y-1.5 text-sm flex-1">
                      {/* The module count is derived, so it stays true as modules ship. */}
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>{p.included_modules} of {pricing.live_modules} modules included</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>{limit(p.max_materials, 'materials')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>{limit(p.max_contacts, 'contacts')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>{limit(p.max_services, 'services')}</span>
                      </li>
                    </ul>

                    <div className="pt-5">
                      {p.contact_sales ? (
                        <a href="mailto:support@materialshub.gr?subject=Self-hosting">
                          <Button variant="outline" className="w-full">Talk to us</Button>
                        </a>
                      ) : (
                        <Link to="/auth?mode=signup">
                          <Button variant={paid ? 'default' : 'outline'} className="w-full gap-2">
                            {paid ? 'Start on Pro' : 'Start free'}
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Only modules that are a genuine EXTRA charge appear here. Anything already covered by
              a plan's tier is not an add-on, and listing it would overstate the bill. */}
          {pricing.addons.length > 0 && (
            <div className="mt-8 rounded-sm border border-hairline bg-surface-sunken p-5">
              <h3 className="text-sm font-medium mb-3">Add on when you need it</h3>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {pricing.addons.map((a) => (
                  <li key={a.slug} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{a.name}</p>
                      {a.summary && (
                        <p className="text-xs text-muted-foreground">{a.summary}</p>
                      )}
                    </div>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatMoney(a.price_cents / 100, a.currency, { decimals: 0, maxDecimals: 0 })}
                      {' / '}{a.interval}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            No card to start — an email and a password is the whole sign-up. Prices exclude VAT.
          </p>
        </>
      )}
    </section>
  );
};

export default PricingSection;

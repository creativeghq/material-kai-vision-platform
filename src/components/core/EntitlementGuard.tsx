/**
 * #212 — route-level entitlement gate. Renders children only when the active workspace owns
 * (or gets free) the module; otherwise shows an UPSELL (not a bare "restricted" wall), because
 * the right action for a paid module is "purchase it", not "go away". URL-level half of module
 * gating — hiding the nav item isn't enough, a user could type `/finance` directly.
 *
 *   <EntitlementGuard moduleSlug="sales-finance" moduleName="Finance"><FinancePage /></EntitlementGuard>
 *
 * Fails OPEN while loading (returns null → no flash) and never blocks the operator root.
 *
 * #256 — when the module is a purchasable add-on with a price, the upsell shows the price and a
 * direct Buy button (owner → Stripe checkout via activate-module) or a "request" button
 * (non-owner → notify the owner), in addition to the plan-upgrade path.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ArrowLeft, Sparkles, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { PageLoader } from '@/components/core/PageLoader';
import { useModuleUpsell } from '@/hooks/useModuleUpsell';

interface Props {
  moduleSlug: string;
  /** Human label for the upsell copy (defaults to the slug). */
  moduleName?: string;
  children: React.ReactNode;
  fallbackPath?: string;
}

export const EntitlementGuard: React.FC<Props> = ({ moduleSlug, moduleName, children, fallbackPath = '/' }) => {
  const navigate = useNavigate();
  const { loading, available, mod, label, price, tier, isOwner, purchasable, busy, onBuy, onRequest } =
    useModuleUpsell(moduleSlug, moduleName);

  if (loading) return <PageLoader />;
  if (available) return <>{children}</>;

  return (
    <div className="container mx-auto py-12">
      <Card className="max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">{label} is a {tier === 'pro' ? 'Pro' : 'paid'} feature</CardTitle>
          <CardDescription>
            This workspace doesn’t have the {label} package yet.
            {price && <> {' '}<span className="font-medium text-foreground">{price}</span>.</>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {mod?.summary && (
            <p className="text-center text-sm text-muted-foreground">{mod.summary}</p>
          )}

          {purchasable ? (
            isOwner ? (
              <Button className="w-full" onClick={onBuy} disabled={busy !== null}>
                {busy === 'buy' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {price ? `Add ${label} — ${price}` : `Enable ${label}`}
              </Button>
            ) : (
              <Button className="w-full" onClick={onRequest} disabled={busy !== null}>
                {busy === 'request' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Ask my workspace owner to enable it
              </Button>
            )
          ) : (
            <Button className="w-full" onClick={() => navigate('/billing/subscriptions')}>
              <Sparkles className="mr-2 h-4 w-4" /> See plans &amp; unlock
            </Button>
          )}

          {/* Add-ons can also be plan-covered — keep the plans link as a secondary path. */}
          {purchasable && isOwner && (
            <Button className="w-full" variant="ghost" onClick={() => navigate('/profile?tab=modules')}>
              Manage modules
            </Button>
          )}

          <Button className="w-full" variant="outline" onClick={() => navigate(fallbackPath)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

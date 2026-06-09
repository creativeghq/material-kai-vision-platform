/**
 * #212 — route-level entitlement gate. Renders children only when the active workspace owns
 * (or gets free) the module; otherwise shows an UPSELL (not a bare "restricted" wall), because
 * the right action for a paid module is "purchase it", not "go away". URL-level half of module
 * gating — hiding the nav item isn't enough, a user could type `/finance` directly.
 *
 *   <EntitlementGuard moduleSlug="sales-finance" moduleName="Finance"><FinancePage /></EntitlementGuard>
 *
 * Fails OPEN while loading (returns null → no flash) and never blocks the operator root.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ArrowLeft, Sparkles } from 'lucide-react';
import { useEntitlements } from '@/hooks/useEntitlements';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';

interface Props {
  moduleSlug: string;
  /** Human label for the upsell copy (defaults to the slug). */
  moduleName?: string;
  children: React.ReactNode;
  fallbackPath?: string;
}

export const EntitlementGuard: React.FC<Props> = ({ moduleSlug, moduleName, children, fallbackPath = '/' }) => {
  const { isModuleAvailable, tierOf, loading } = useEntitlements();
  const navigate = useNavigate();

  if (loading) return null;
  if (isModuleAvailable(moduleSlug)) return <>{children}</>;

  const label = moduleName ?? moduleSlug;
  const tier = tierOf(moduleSlug);

  return (
    <div className="container mx-auto py-12">
      <Card className="max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">{label} is a {tier === 'pro' ? 'Pro' : 'paid'} feature</CardTitle>
          <CardDescription>This workspace doesn’t have the {label} package yet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-center text-sm text-muted-foreground">
            Unlock {label} to use it here. Plans add modules like this to your workspace.
          </p>
          <Button className="w-full" onClick={() => navigate('/billing/subscriptions')}>
            <Sparkles className="mr-2 h-4 w-4" /> See plans &amp; unlock
          </Button>
          <Button className="w-full" variant="outline" onClick={() => navigate(fallbackPath)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

/**
 * Inline module gate for CROSS-MODULE surfaces — a tab/panel belonging to module X rendered
 * inside a record the user already owns (e.g. a "Real Estate" tab on a CRM contact, a "Finance"
 * panel on a project, a "Monitoring" tab on a product).
 *
 * The record stays visible; only THIS surface gates. When the active workspace lacks the module,
 * it renders a compact upsell (owner → Buy, member → request) instead of the children — never a
 * full-page wall (that's EntitlementGuard's job, for whole routes). Both share `useModuleUpsell`,
 * so there is exactly ONE buy/request/price implementation on the frontend.
 *
 *   <ModuleTabGate moduleSlug="real-estate" moduleName="Real Estate">
 *     <RealEstateContactPanel contactId={id} />
 *   </ModuleTabGate>
 *
 * The edge function behind the panel MUST still call `assertEntitled(...)` — this is UX, not the
 * security boundary. A 402 `not_entitled` from that call maps back to this same upsell.
 */
import React from 'react';
import { Lock, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useModuleUpsell } from '@/hooks/useModuleUpsell';

interface Props {
  moduleSlug: string;
  /** Human label for the upsell copy (defaults to the catalog name / slug). */
  moduleName?: string;
  /** One-liner describing what this surface adds; falls back to the module's catalog summary. */
  blurb?: string;
  children: React.ReactNode;
  /** Optional skeleton while entitlements load; defaults to nothing (no flash). */
  loadingFallback?: React.ReactNode;
}

export const ModuleTabGate: React.FC<Props> = ({ moduleSlug, moduleName, blurb, children, loadingFallback = null }) => {
  const { loading, available, mod, label, price, isOwner, purchasable, busy, onBuy, onRequest } =
    useModuleUpsell(moduleSlug, moduleName);

  if (loading) return <>{loadingFallback}</>;
  if (available) return <>{children}</>;

  const description = blurb ?? mod?.summary ?? `Unlock the ${label} tools for this record.`;

  return (
    <div className="mx-auto my-6 max-w-md rounded-lg border border-border bg-card/50 p-6 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Lock className="h-5 w-5 text-primary" />
      </div>
      <h3 className="text-sm font-semibold">
        {label} {price ? <span className="text-muted-foreground">· {price}</span> : null}
      </h3>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">{description}</p>

      {purchasable ? (
        isOwner ? (
          <Button size="sm" className="w-full" onClick={onBuy} disabled={busy !== null}>
            {busy === 'buy' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {price ? `Add ${label} — ${price}` : `Enable ${label}`}
          </Button>
        ) : (
          <Button size="sm" className="w-full" onClick={onRequest} disabled={busy !== null}>
            {busy === 'request' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Ask my workspace owner to enable it
          </Button>
        )
      ) : (
        <Button asChild size="sm" className="w-full">
          <a href="/billing/subscriptions"><Sparkles className="mr-2 h-4 w-4" /> See plans &amp; unlock</a>
        </Button>
      )}
    </div>
  );
};

/**
 * Profile → Keys: one place for a workspace's third-party access.
 *
 *  - Bring your own key (paste a secret): myAADE Special Access Codes, Resend email, myDATA REST.
 *    These reuse the exact cards mounted in Finance → Settings (same RLS, same storage).
 *  - Connections (OAuth, nothing to paste): Stripe, Social, WhatsApp — status + a link to where
 *    they're managed.
 *
 * Everything is scoped to the active workspace; the BYOK cards self-gate via
 * is_workspace_finance_manager RLS.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Plug, CreditCard, Share2, MessageCircle, ArrowRight, FileImage } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { AadeCredentialsCard } from '@/modules/myaade/components/AadeCredentialsCard';
import { WorkspaceEmailConfigCard } from '@/modules/email/components/WorkspaceEmailConfigCard';
import { WorkspacePdfTemplateCard } from '@/components/core/Profile/WorkspacePdfTemplateCard';
import { InboundSetupCard } from '@/modules/finance/components/InboundSetupCard';
import { ErganiCredentialsCard } from '@/modules/hr/components/ErganiCredentialsCard';
import { ShippingCredentialsCard } from '@/modules/stock/components/ShippingCredentialsCard';
import { useModule } from '@/modules/_core';
import { paymentRoutingService } from '@/services/paymentRoutingService';

interface ConnState {
  stripe: 'connected' | 'onboarding' | 'none';
  social: number;
}

const ConnectionRow: React.FC<{
  icon: React.ElementType;
  title: string;
  description: string;
  status: React.ReactNode;
  to: string;
  manageLabel?: string;
}> = ({ icon: Icon, title, description, status, to, manageLabel = 'Manage' }) => (
  <div className="flex items-center gap-3 rounded-md border border-border/60 p-3">
    <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium">{title}</div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
    <div className="shrink-0">{status}</div>
    <Button asChild size="sm" variant="outline" className="rounded-full shrink-0">
      <Link to={to}>{manageLabel}<ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
    </Button>
  </div>
);

export const WorkspaceKeysTab: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const stockModule = useModule('stock');
  const [conn, setConn] = useState<ConnState>({ stripe: 'none', social: 0 });

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    (async () => {
      const [cfg, socialRes] = await Promise.all([
        paymentRoutingService.getConfig(activeWorkspaceId).catch(() => null),
        supabase.from('social_accounts').select('id', { count: 'exact', head: true })
          .eq('workspace_id', activeWorkspaceId).eq('is_active', true),
      ]);
      if (cancelled) return;
      const stripe: ConnState['stripe'] = cfg?.charges_enabled
        ? 'connected'
        : cfg?.stripe_connect_account_id ? 'onboarding' : 'none';
      setConn({ stripe, social: socialRes.count ?? 0 });
    })();
    return () => { cancelled = true; };
  }, [activeWorkspaceId]);

  if (!activeWorkspaceId) {
    return <p className="text-sm text-muted-foreground">Select a workspace to manage its keys.</p>;
  }

  return (
    <div className="space-y-8">
      {/* Bring your own key */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Bring your own key</h2>
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          Paste your own provider credentials so these run under your account. Leave blank to use the platform defaults.
        </p>
        <AadeCredentialsCard workspaceId={activeWorkspaceId} />
        <WorkspaceEmailConfigCard workspaceId={activeWorkspaceId} />
        <InboundSetupCard workspaceId={activeWorkspaceId} />
        <ErganiCredentialsCard workspaceId={activeWorkspaceId} />
        {stockModule.enabled && <ShippingCredentialsCard workspaceId={activeWorkspaceId} />}
      </section>

      {/* Document design — the branded PDF template used by every generated document */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <FileImage className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Document templates</h2>
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          The branded cover / background / back-cover used by every PDF this workspace generates.
        </p>
        <WorkspacePdfTemplateCard />
      </section>

      {/* Connections */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Connections</h2>
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          Authorized by connecting an account — no key to paste.
        </p>
        <Card>
          <CardContent className="space-y-3 p-5">
            <ConnectionRow
              icon={CreditCard}
              title="Stripe payouts"
              description="Receive store payments into your own Stripe account."
              to="/finance"
              status={
                conn.stripe === 'connected'
                  ? <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Connected</Badge>
                  : conn.stripe === 'onboarding'
                    ? <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30">Onboarding</Badge>
                    : <Badge variant="secondary">Not connected</Badge>
              }
            />
            <ConnectionRow
              icon={Share2}
              title="Social accounts"
              description="Instagram, Facebook, LinkedIn, TikTok and more (via Zernio)."
              to="/profile?tab=social-accounts"
              status={conn.social > 0
                ? <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">{conn.social} connected</Badge>
                : <Badge variant="secondary">None</Badge>}
            />
            <ConnectionRow
              icon={MessageCircle}
              title="WhatsApp"
              description="Send & receive WhatsApp messages (via Zernio)."
              to="/admin/messaging"
              status={<Badge variant="secondary">Via Zernio</Badge>}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

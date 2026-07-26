/**
 * Profile → Keys: one place for a workspace's third-party access, laid out as a
 * left sidebar of sections + a content pane (instead of one long scroll).
 *
 * Sections group the BYOK cards + connections by domain:
 *  - Finance & Tax  → myAADE Special Access Codes, myDATA REST inbound, Stripe payouts
 *  - Email          → Resend
 *  - Documents      → branded PDF template
 *  - HR & Payroll   → Ergani            (only when the HR module is enabled)
 *  - Shipping       → courier creds     (only when the Stock module is enabled)
 *  - Social & Messaging → Social, WhatsApp
 *
 * Everything is scoped to the active workspace; the BYOK cards self-gate via
 * is_workspace_finance_manager RLS. The cards themselves are the same ones mounted
 * in Finance → Settings / the module pages — this is just the tidy home for them.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  KeyRound, CreditCard, Share2, MessageCircle, ArrowRight,
  FileImage, Landmark, Mail, Users, Truck,
} from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { AadeCredentialsCard } from '@/modules/myaade/components/AadeCredentialsCard';
import { WorkspaceEmailConfigCard } from '@/modules/email/components/WorkspaceEmailConfigCard';
import { VivaConfigCard } from '@/modules/payments-viva/components/VivaConfigCard';
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

const SectionHead: React.FC<{ icon: React.ElementType; title: string; description: string }> = ({
  icon: Icon, title, description,
}) => (
  <div className="space-y-1">
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h2 className="text-base font-semibold">{title}</h2>
    </div>
    <p className="text-sm text-muted-foreground">{description}</p>
  </div>
);

type SectionId = 'finance' | 'email' | 'documents' | 'hr' | 'shipping' | 'social';

export const WorkspaceKeysTab: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const stockModule = useModule('stock');
  const hrModule = useModule('hr');
  const [conn, setConn] = useState<ConnState>({ stripe: 'none', social: 0 });
  const [searchParams, setSearchParams] = useSearchParams();
  // Deep-linkable: `/profile?tab=keys&section=email` lands on the right card (cross-module
  // "configure your key here" links target it). Falls back to finance.
  const VALID_SECTIONS: SectionId[] = ['finance', 'email', 'documents', 'hr', 'shipping', 'social'];
  const paramSection = searchParams.get('section') as SectionId | null;
  const [active, setActive] = useState<SectionId>(
    paramSection && VALID_SECTIONS.includes(paramSection) ? paramSection : 'finance',
  );
  // Reflect the current section in the URL so it stays shareable/back-navigable.
  useEffect(() => {
    if (searchParams.get('section') === active) return;
    const next = new URLSearchParams(searchParams);
    next.set('section', active);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

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

  // Sidebar sections — HR / Shipping only show when their module is enabled.
  const sections = useMemo(
    () => ([
      { id: 'finance' as const, label: 'Finance & Tax', icon: Landmark, available: true },
      { id: 'email' as const, label: 'Email', icon: Mail, available: true },
      { id: 'documents' as const, label: 'Documents', icon: FileImage, available: true },
      { id: 'hr' as const, label: 'HR & Payroll', icon: Users, available: hrModule.enabled },
      { id: 'shipping' as const, label: 'Shipping', icon: Truck, available: stockModule.enabled },
      { id: 'social' as const, label: 'Social & Messaging', icon: Share2, available: true },
    ].filter((s) => s.available)),
    [hrModule.enabled, stockModule.enabled],
  );

  // Keep the active section valid if a module toggles off underneath us.
  useEffect(() => {
    if (!sections.some((s) => s.id === active)) setActive(sections[0]?.id ?? 'finance');
  }, [sections, active]);

  if (!activeWorkspaceId) {
    return <p className="text-sm text-muted-foreground">Select a workspace to manage its keys.</p>;
  }

  const renderSection = (id: SectionId) => {
    switch (id) {
      case 'finance':
        return (
          <>
            <SectionHead
              icon={Landmark}
              title="Finance & Tax"
              description="Your Greek tax + e-invoicing credentials and the account payments settle into. Leave blank to use the platform defaults."
            />
            <AadeCredentialsCard workspaceId={activeWorkspaceId} />
            <InboundSetupCard workspaceId={activeWorkspaceId} />
            <VivaConfigCard workspaceId={activeWorkspaceId} />
            <Card>
              <CardContent className="p-5">
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
              </CardContent>
            </Card>
          </>
        );
      case 'email':
        return (
          <>
            <SectionHead
              icon={Mail}
              title="Email"
              description="Send transactional + marketing email from your own Resend account and verified sender."
            />
            <WorkspaceEmailConfigCard workspaceId={activeWorkspaceId} />
          </>
        );
      case 'documents':
        return (
          <>
            <SectionHead
              icon={FileImage}
              title="Document templates"
              description="The branded cover / background / back-cover for your quotes, catalogs and proformas. Invoices & receipts keep their own fiscal design."
            />
            <WorkspacePdfTemplateCard />
          </>
        );
      case 'hr':
        return (
          <>
            <SectionHead
              icon={Users}
              title="HR & Payroll"
              description="Connect ΕΡΓΑΝΗ so absences and work-schedule submissions run under your entity."
            />
            <ErganiCredentialsCard workspaceId={activeWorkspaceId} />
          </>
        );
      case 'shipping':
        return (
          <>
            <SectionHead
              icon={Truck}
              title="Shipping"
              description="Your courier credentials so dispatch labels and tracking use your own account."
            />
            <ShippingCredentialsCard workspaceId={activeWorkspaceId} />
          </>
        );
      case 'social':
        return (
          <>
            <SectionHead
              icon={Share2}
              title="Social & Messaging"
              description="Authorized by connecting an account — no key to paste."
            />
            <Card>
              <CardContent className="space-y-3 p-5">
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
          </>
        );
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader icon={KeyRound} title="Keys & connections" subtitle="API keys, integrations and per-workspace credentials." />

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Sidebar — horizontal scroll on mobile, left column on desktop */}
        <nav
          className="flex gap-1 overflow-x-auto pb-1 md:w-56 md:shrink-0 md:flex-col md:overflow-visible md:pb-0"
          aria-label="Key sections"
        >
          {sections.map((s) => {
            const Icon = s.icon;
            const isActive = s.id === active;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActive(s.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{s.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Content pane */}
        <section className="min-w-0 flex-1 space-y-4">
          {renderSection(active)}
        </section>
      </div>
    </div>
  );
};

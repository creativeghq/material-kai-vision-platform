/**
 * Email Marketing module page (tenant-facing, EntitlementGuard-wrapped). Three tabs:
 *   Setup     — workspace BYOK Resend config (required before sending).
 *   Templates — workspace-scoped GrapesJS templates.
 *   Campaigns — bulk email campaigns to CRM audiences, BYOK-only.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Megaphone, Settings, FileText, Send, Users } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import { Skeleton } from '@/components/core/ui/skeleton';
import { emailService } from '@/modules/email/services/emailService';
import { MarketingSetupCard } from '../components/MarketingSetupCard';
import { MarketingTemplatesTab } from '../components/MarketingTemplatesTab';
import { MarketingCampaignsTab } from '../components/MarketingCampaignsTab';
import { MarketingContactsTab } from '../components/MarketingContactsTab';

export default function EmailMarketingPage() {
  const { activeWorkspaceId, isRootWorkspace, loading: wsLoading } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'campaigns';
  const [byokReady, setByokReady] = useState(false);
  const [checking, setChecking] = useState(true);

  const setTab = (v: string) => {
    const p = new URLSearchParams(searchParams);
    p.set('tab', v);
    setSearchParams(p, { replace: true });
  };

  // "Ready to send" = the workspace has its OWN Resend (BYOK). The operator's ROOT workspace is
  // exempt: it legitimately sends from the platform default sender, so a configured platform
  // sender counts as ready there (BYOK-only is a TENANT rule, not an operator one).
  const senderReady = (cfg: Awaited<ReturnType<typeof emailService.getWorkspaceConfig>>) =>
    cfg?.source === 'workspace' || (isRootWorkspace && !!cfg?.platform_from_email);

  const recheckByok = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const cfg = await emailService.getWorkspaceConfig(activeWorkspaceId).catch(() => null);
    setByokReady(senderReady(cfg));
  }, [activeWorkspaceId, isRootWorkspace]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeWorkspaceId) return;
      setChecking(true);
      const cfg = await emailService.getWorkspaceConfig(activeWorkspaceId).catch(() => null);
      if (cancelled) return;
      setByokReady(senderReady(cfg));
      setChecking(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, isRootWorkspace]);

  if (wsLoading || checking) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  const ws = activeWorkspaceId;
  if (!ws) return <div className="p-6 text-sm text-muted-foreground">No active workspace.</div>;

  // BYOK is a HARD prerequisite: Email Marketing sends only from the workspace's own Resend.
  // Until it's configured, show ONLY the setup prompt — no campaigns/templates surface — so
  // activating the module lands the owner straight in "add your Resend keys".
  if (!byokReady) {
    return (
      <div className="min-h-screen">
        <PageHeader icon={Megaphone} title="Email Marketing" subtitle="Connect your Resend account to start sending" />
        <div className="p-3 sm:p-6 max-w-2xl mx-auto space-y-4">
          <div className="dashboard-card">
            <h3 className="text-lg font-semibold mb-1">One step to activate</h3>
            <p className="text-sm text-muted-foreground">
              Email Marketing sends from <strong>your own</strong> verified Resend domain — there's no shared platform
              sender. Add your Resend API key and a verified sender below, then your Templates and Campaigns unlock.
            </p>
          </div>
          <MarketingSetupCard workspaceId={ws} byokReady={false} onConfigured={async () => { await recheckByok(); setTab('campaigns'); }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader icon={Megaphone} title="Email Marketing" subtitle="Design templates and send bulk campaigns from your own Resend domain" />

      <div className="p-3 sm:p-6">
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="campaigns"><Send className="h-4 w-4 mr-2" /> Campaigns</TabsTrigger>
            <TabsTrigger value="templates"><FileText className="h-4 w-4 mr-2" /> Templates</TabsTrigger>
            <TabsTrigger value="contacts"><Users className="h-4 w-4 mr-2" /> Contacts</TabsTrigger>
            <TabsTrigger value="setup"><Settings className="h-4 w-4 mr-2" /> Setup</TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="mt-0"><MarketingCampaignsTab workspaceId={ws} byokReady={byokReady} /></TabsContent>
          <TabsContent value="templates" className="mt-0"><MarketingTemplatesTab workspaceId={ws} /></TabsContent>
          <TabsContent value="contacts" className="mt-0"><MarketingContactsTab workspaceId={ws} /></TabsContent>
          <TabsContent value="setup" className="mt-0"><MarketingSetupCard workspaceId={ws} byokReady={byokReady} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

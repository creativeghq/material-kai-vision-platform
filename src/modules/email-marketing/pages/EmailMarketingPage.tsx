/**
 * #255 — Email Marketing module page (tenant-facing, EntitlementGuard-wrapped). Three tabs:
 *   Setup     — workspace BYOK Resend config (required before sending).
 *   Templates — workspace-scoped GrapesJS templates.
 *   Campaigns — bulk email campaigns to CRM audiences, BYOK-only.
 */
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Megaphone, Settings, FileText, Send } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import { Badge } from '@/components/core/ui/badge';
import { Skeleton } from '@/components/core/ui/skeleton';
import { emailService } from '@/modules/email/services/emailService';
import { MarketingSetupCard } from '../components/MarketingSetupCard';
import { MarketingTemplatesTab } from '../components/MarketingTemplatesTab';
import { MarketingCampaignsTab } from '../components/MarketingCampaignsTab';

export default function EmailMarketingPage() {
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'campaigns';
  const [byokReady, setByokReady] = useState(false);
  const [checking, setChecking] = useState(true);

  const setTab = (v: string) => {
    const p = new URLSearchParams(searchParams);
    p.set('tab', v);
    setSearchParams(p, { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeWorkspaceId) return;
      setChecking(true);
      const cfg = await emailService.getWorkspaceConfig(activeWorkspaceId).catch(() => null);
      if (cancelled) return;
      setByokReady(cfg?.source === 'workspace');
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [activeWorkspaceId]);

  if (wsLoading || checking) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  const ws = activeWorkspaceId;
  if (!ws) return <div className="p-6 text-sm text-muted-foreground">No active workspace.</div>;

  return (
    <div className="min-h-screen">
      <PageHeader icon={Megaphone} title="Email Marketing" subtitle="Design templates and send bulk campaigns from your own Resend domain" />

      <div className="p-3 sm:p-6">
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="campaigns"><Send className="h-4 w-4 mr-2" /> Campaigns</TabsTrigger>
            <TabsTrigger value="templates"><FileText className="h-4 w-4 mr-2" /> Templates</TabsTrigger>
            <TabsTrigger value="setup">
              <Settings className="h-4 w-4 mr-2" /> Setup
              {!byokReady && <Badge className="ml-2 bg-amber-500 text-white">Action needed</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="mt-0"><MarketingCampaignsTab workspaceId={ws} byokReady={byokReady} /></TabsContent>
          <TabsContent value="templates" className="mt-0"><MarketingTemplatesTab workspaceId={ws} /></TabsContent>
          <TabsContent value="setup" className="mt-0"><MarketingSetupCard workspaceId={ws} byokReady={byokReady} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

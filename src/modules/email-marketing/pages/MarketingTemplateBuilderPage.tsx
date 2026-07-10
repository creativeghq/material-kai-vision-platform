/**
 * #255 — workspace-scoped wrapper around the shared GrapesJS EmailTemplateBuilder. Passes the
 * active workspace so "Send Test" goes out via the workspace's own Resend (BYOK, strict, marketing),
 * and routes "Back" to the module's Templates tab.
 */
import React from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Skeleton } from '@/components/core/ui/skeleton';
import { EmailTemplateBuilder } from '@/modules/email/pages/EmailTemplateBuilderPage';

export default function MarketingTemplateBuilderPage() {
  const { activeWorkspaceId, loading } = useWorkspace();
  if (loading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  return (
    <EmailTemplateBuilder
      marketing
      workspaceId={activeWorkspaceId ?? undefined}
      backPath="/marketing/email?tab=templates"
    />
  );
}

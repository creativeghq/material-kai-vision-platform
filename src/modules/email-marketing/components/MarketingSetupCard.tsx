/**
 * Email Marketing setup step. Surfaces the workspace BYOK Resend status and mounts the
 * shared WorkspaceEmailConfigCard so activation flows straight into configuring the sender.
 * Marketing is BYOK-ONLY: until the workspace has its own Resend key + verified sender, campaigns
 * can't send (enforced server-side too via requireWorkspaceSender).
 */
import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { WorkspaceEmailConfigCard } from '@/modules/email/components/WorkspaceEmailConfigCard';

export const MarketingSetupCard: React.FC<{ workspaceId: string; byokReady: boolean; onConfigured?: () => void }> = ({ workspaceId, byokReady, onConfigured }) => (
  <div className="space-y-4">
    {byokReady ? (
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">Your Resend sender is configured.</p>
          <p className="text-xs text-muted-foreground">Campaigns will send from your own verified domain, metered by your platform daily cap.</p>
        </div>
      </div>
    ) : (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">Configure your Resend account to start sending.</p>
          <p className="text-xs text-muted-foreground">
            Email Marketing sends only from <strong>your own</strong> verified Resend domain — there is no shared platform fallback.
            Add your Resend API key + a verified sender below to unlock campaign sending.
          </p>
        </div>
      </div>
    )}
    <WorkspaceEmailConfigCard workspaceId={workspaceId} onSaved={onConfigured} requireOwnSender />
  </div>
);

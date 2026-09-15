import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2, Copy, Send, X, ExternalLink } from 'lucide-react';
import { InvitePartyDialog } from '@/modules/crm/components/InvitePartyDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/core/errors/utils';
import { formatDate } from '@/utils/datetime';
import {
  workspaceManagementService, inviteUrlFor, type CompanyWorkspaceStatus,
} from '@/services/workspaceManagementService';

interface Props {
  workspaceId: string;
  workspaceName: string;
  companyId: string;
  companyName: string;
  defaultEmail?: string | null;
  defaultContactId?: string | null;
  defaultContactName?: string | null;
}

const STATE_TONE = {
  active: { variant: 'success' as const, label: 'Running their own workspace' },
  invited: { variant: 'info' as const, label: 'Invitation sent' },
  stalled: { variant: 'warning' as const, label: 'Invitation expired' },
  none: { variant: 'neutral' as const, label: 'Not on the platform' },
};

export const CompanyWorkspaceCard: React.FC<Props> = ({
  workspaceId, workspaceName, companyId, companyName,
  defaultEmail, defaultContactId, defaultContactName,
}) => {
  const { toast } = useToast();
  const [status, setStatus] = useState<CompanyWorkspaceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setStatus(await workspaceManagementService.companyWorkspaceStatus(companyId));
      setForbidden(false);
    } catch (err) {
      // A refusal is a permission answer, not a failure to report as one.
      if ((err as { code?: string })?.code === '42501') setForbidden(true);
      else toast({ title: 'Could not read platform access', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setLoading(false); }
  }, [companyId, toast]);

  useEffect(() => { void load(); }, [load]);

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).catch(() => {});
    toast({ title: 'Link copied' });
  };

  const revoke = async () => {
    if (!status?.invite_id) return;
    setBusy(true);
    try {
      const ok = await workspaceManagementService.revokeInvite(status.invite_id);
      toast(ok
        ? { title: 'Invitation revoked' }
        : { title: 'Could not revoke that invitation', variant: 'destructive' });
      await load();
    } catch (err) {
      toast({ title: 'Could not revoke that invitation', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  if (forbidden) return null;

  const state = status?.state ?? 'none';
  const tone = STATE_TONE[state];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />Platform access
          </CardTitle>
          <CardDescription>
            Give this business its own workspace on the platform, run by their own people.
          </CardDescription>
        </div>
        <Badge variant={tone.variant}>{tone.label}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : state === 'active' ? (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              {status?.workspace_name} is live. Add or remove their people from their own
              Profile → Team; you keep oversight from Network.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href="/network"><ExternalLink className="h-3.5 w-3.5 mr-2" />Open Network</a>
              </Button>
            </div>
          </div>
        ) : state === 'invited' ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Sent to <strong className="text-foreground">{status?.invite_email}</strong>
              {status?.invited_at ? ` on ${formatDate(status.invited_at)}` : ''}
              {status?.expires_at ? `, expires ${formatDate(status.expires_at)}` : ''}. Their
              workspace exists and is waiting for them to claim it.
            </p>
            {status?.invite_code && (
              <div className="flex items-center gap-2">
                <Input readOnly value={inviteUrlFor(status.invite_code)} className="h-8 text-xs" />
                <Button size="sm" variant="outline" onClick={() => copy(inviteUrlFor(status.invite_code!))}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setDialogOpen(true)}>
                <Send className="h-3.5 w-3.5 mr-2" />Send again
              </Button>
              <Button size="sm" variant="outline" onClick={revoke} disabled={busy}>
                <X className="h-3.5 w-3.5 mr-2" />Revoke
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {state === 'stalled' && (
              <p className="text-sm text-muted-foreground">
                Their workspace was created but the invitation lapsed before anyone claimed it.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              They become the owner of a separate business on the platform. You are not added to
              it — oversight stays on Network, so their customers and prices are theirs alone.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Send className="h-4 w-4 mr-2" />
              {state === 'stalled' ? 'Send a fresh invitation' : 'Send invitation'}
            </Button>
          </div>
        )}
      </CardContent>
      <InvitePartyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        party={{
          contactId: defaultContactId ?? null,
          companyId,
          companyName,
          name: defaultContactName ?? null,
          email: defaultEmail ?? null,
        }}
        onDone={load}
      />
    </Card>
  );
};

export default CompanyWorkspaceCard;

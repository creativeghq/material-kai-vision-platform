import React, { useCallback, useEffect, useState } from 'react';
import {
  Mail,
  Plus,
  Loader2,
  Trash2,
  Send,
  Copy,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { statusTone } from '@/utils/statusTone';
import { useToast } from '@/hooks/use-toast';
import { projectsService, type ProjectCollaborator } from '../services/projectsService';

interface InviteCollaboratorsModalProps {
  projectId: string;
  projectName: string;
  open: boolean;
  onClose: () => void;
}

export const InviteCollaboratorsModal: React.FC<InviteCollaboratorsModalProps> = ({
  projectId,
  projectName,
  open,
  onClose,
}) => {
  const { toast } = useToast();
  const [collaborators, setCollaborators] = useState<ProjectCollaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setCollaborators(await projectsService.listCollaborators(projectId));
    } catch (err) {
      toast({ title: 'Failed to load collaborators', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const handleSend = async () => {
    if (!email.trim()) {
      toast({ title: 'Enter an email address', variant: 'destructive' });
      return;
    }
    try {
      setSending(true);
      await projectsService.inviteCollaborator({
        project_id: projectId,
        email: email.trim(),
        message: message.trim() || undefined,
      });
      toast({ title: 'Invitation sent', description: `${email} will receive an email shortly.` });
      setEmail('');
      setMessage('');
      await load();
    } catch (err) {
      toast({
        title: 'Failed to send invitation',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (id: string, email: string) => {
    if (!confirm(`Revoke access for ${email}? They will lose access immediately.`)) return;
    try {
      await projectsService.revokeCollaborator(id);
      toast({ title: 'Access revoked' });
      await load();
    } catch (err) {
      toast({ title: 'Failed to revoke', variant: 'destructive' });
    }
  };

  const handleResend = async (id: string, email: string) => {
    try {
      await projectsService.resendCollaboratorInvite(id);
      toast({ title: 'Invitation re-sent', description: email });
    } catch (err) {
      toast({ title: 'Failed to re-send', variant: 'destructive' });
    }
  };

  const handleCopyLink = (shareToken: string) => {
    const appUrl = (import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');
    const url = `${appUrl}/projects/invite/${shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: 'Link copied' });
    }).catch(() => {
      toast({ title: 'Copy failed', description: url, variant: 'destructive' });
    });
  };

  const statusBadge = (c: ProjectCollaborator) => {
    if (c.revoked_at) return <span className={`text-xs capitalize ${statusTone('revoked')}`}>Revoked</span>;
    if (new Date(c.expires_at) < new Date()) return <span className={`text-xs capitalize ${statusTone('expired')}`}>Expired</span>;
    if (c.accepted_at) return <span className={`text-xs capitalize ${statusTone('active')}`}>Active</span>;
    return <span className={`text-xs capitalize ${statusTone('pending')}`}>Pending</span>;
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite Clients to View This Project</DialogTitle>
          <DialogDescription>
            Invitees get an email with a link. They sign in with just their email — no password.
            They see the project overview, rooms, moodboards, sheets, and any tasks you've marked client-visible.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Send form */}
          <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
            <div>
              <Label className="text-xs">Email address</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="client@example.com"
                disabled={sending}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Personal message (optional)</Label>
              <Textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={`Hi! Here's the latest on "${projectName}" — take a look when you have a moment.`}
                rows={2}
                disabled={sending}
                className="mt-1"
              />
            </div>
            <Button onClick={handleSend} disabled={sending || !email.trim()} className="w-full">
              {sending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</> : <><Send className="h-4 w-4 mr-2" />Send invitation</>}
            </Button>
          </div>

          {/* List */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {loading ? 'Loading...' : `${collaborators.length} ${collaborators.length === 1 ? 'invitation' : 'invitations'}`}
            </Label>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : collaborators.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                <Mail className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                No collaborators yet. Send an invitation above.
              </div>
            ) : (
              <ul className="divide-y divide-white/8 rounded-lg border border-border">
                {collaborators.map(c => (
                  <li key={c.id} className="p-3 flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{c.email}</p>
                        {statusBadge(c)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Invited {new Date(c.invited_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        {c.accepted_at && ` · Accepted ${new Date(c.accepted_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!c.revoked_at && (
                        <>
                          <Button variant="ghost" size="sm" title="Copy link" onClick={() => handleCopyLink(c.share_token)}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Re-send invite" onClick={() => handleResend(c.id, c.email)}>
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Revoke access" onClick={() => handleRevoke(c.id, c.email)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

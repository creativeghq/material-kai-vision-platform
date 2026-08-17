/**
 * Team & Portals — the ONE surface for "who is on this team and what do they see".
 *
 * Replaces the pair of finance-scoped cards (MembersCard + TeamInviteCard) that could only mint a
 * link and list names: this one invites by email or link, shows what is still outstanding so an
 * invite can be taken back, and re-roles or removes an existing member. Every role's label, portal
 * and description comes from `WORKSPACE_ROLE_META` so the invite picker, the member rows and the
 * pending list can never disagree.
 *
 * Mounted at Profile → Team and Finance → Settings → Team. Owner/admin only (the write RPCs
 * re-check that server-side and return false rather than throwing).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, Loader2, Copy, Link2, Mail, X, Trash2, ShieldCheck, Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { Input } from '@/components/core/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/core/errors/utils';
import { supabase } from '@/integrations/supabase/client';
import { useModule } from '@/modules/_core';
import { formatDate } from '@/utils/datetime';
import {
  workspaceManagementService, type WorkspaceInvite,
} from '@/services/workspaceManagementService';
import {
  WORKSPACE_INVITE_ROLES, WORKSPACE_ROLE_META, workspaceRoleLabel,
  type WorkspaceInviteRole, type WorkspaceMemberRole, type RoleModuleSlug,
} from '@/auth/workspaceRoles';

interface MemberRow {
  user_id: string;
  role: string;
  status: string;
  full_name: string | null;
  email: string | null;
}

/** Roles an owner/admin may assign to an EXISTING member — the invitable set plus admin. */
const ASSIGNABLE_ROLES: WorkspaceMemberRole[] = ['admin', ...WORKSPACE_INVITE_ROLES];

export const TeamPanel: React.FC<{ workspaceId: string; workspaceName?: string }> = ({
  workspaceId, workspaceName,
}) => {
  const { toast } = useToast();
  // One useModule per slug in ROLE_MODULE_SLUGS — hooks can't be called in a loop, and that list is
  // what the guard test checks this call site against.
  const { enabled: hrEnabled } = useModule('hr');
  const { enabled: stockEnabled } = useModule('stock');
  const { enabled: emailMarketingEnabled } = useModule('email-marketing');
  const { enabled: realEstateEnabled } = useModule('real-estate');
  const { enabled: quotesEnabled } = useModule('quotes');
  const { enabled: salesFinanceEnabled } = useModule('sales-finance');

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [role, setRole] = useState<WorkspaceInviteRole>('member');
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);

  /** A role is offerable only if the module behind its portal is actually on — otherwise the
   *  invitee would land on a surface this workspace has not enabled. */
  const moduleEnabled = useMemo<Record<RoleModuleSlug, boolean>>(() => ({
    hr: hrEnabled,
    stock: stockEnabled,
    'email-marketing': emailMarketingEnabled,
    'real-estate': realEstateEnabled,
    quotes: quotesEnabled,
    'sales-finance': salesFinanceEnabled,
  }), [hrEnabled, stockEnabled, emailMarketingEnabled, realEstateEnabled, quotesEnabled, salesFinanceEnabled]);

  const offerableRoles = useMemo(() => WORKSPACE_INVITE_ROLES.filter((r) => {
    const slug = WORKSPACE_ROLE_META[r].requiresModule as RoleModuleSlug | undefined;
    return slug ? moduleEnabled[slug] : true;
  }), [moduleEnabled]);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setLoading(true);
      // workspace_members has no FK to user_profiles, so PostgREST can't embed it — resolve
      // profiles in a second query and join in JS.
      const [{ data: rows, error }, pending] = await Promise.all([
        supabase.from('workspace_members')
          .select('user_id, role, status').eq('workspace_id', workspaceId).order('role'),
        workspaceManagementService.listPendingInvites(workspaceId).catch(() => [] as WorkspaceInvite[]),
      ]);
      if (error) throw error;
      const userIds = (rows ?? []).map((m) => m.user_id).filter(Boolean) as string[];
      let byId: Record<string, { full_name: string | null; email: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles').select('user_id, full_name, email').in('user_id', userIds);
        byId = Object.fromEntries((profiles ?? []).map((p: any) => [p.user_id, { full_name: p.full_name, email: p.email }]));
      }
      setMembers((rows ?? []).map((m: any) => ({
        user_id: m.user_id, role: m.role, status: m.status,
        full_name: byId[m.user_id]?.full_name ?? null,
        email: byId[m.user_id]?.email ?? null,
      })));
      setInvites(pending);
    } catch (err) {
      toast({ title: 'Failed to load the team', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setLoading(false); }
  }, [workspaceId, toast]);

  useEffect(() => { load(); }, [load]);

  const sendEmailInvite = async () => {
    const addr = email.trim();
    if (!addr) return;
    setBusy('invite-email');
    try {
      const { url } = await workspaceManagementService.inviteByEmail({
        workspaceId, workspaceName: workspaceName || 'the team', role, email: addr,
      });
      setLink(url);
      setEmail('');
      toast({
        title: `Invitation sent to ${addr}`,
        description: `They will join as ${WORKSPACE_ROLE_META[role].label} — ${WORKSPACE_ROLE_META[role].portal}.`,
      });
      load();
    } catch (err) {
      toast({ title: 'Could not send the invitation', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const generateLink = async () => {
    setBusy('invite-link');
    try {
      const code = await workspaceManagementService.createInvite(workspaceId, role);
      const url = `${window.location.origin}/auth?mode=signup&invite=${code}`;
      setLink(url);
      await navigator.clipboard.writeText(url).catch(() => {});
      toast({ title: 'Invite link created', description: 'Copied to clipboard. Anyone with the link can claim it once.' });
      load();
    } catch (err) {
      toast({ title: 'Failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const revoke = async (invite: WorkspaceInvite) => {
    setBusy(`revoke-${invite.id}`);
    try {
      const ok = await workspaceManagementService.revokeInvite(invite.id);
      if (!ok) throw new Error('You do not have permission to revoke this invitation.');
      toast({ title: 'Invitation revoked' });
      load();
    } catch (err) {
      toast({ title: 'Could not revoke', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const changeRole = async (m: MemberRow, next: WorkspaceMemberRole) => {
    if (next === m.role) return;
    setBusy(`role-${m.user_id}`);
    try {
      const ok = await workspaceManagementService.setMemberRole(workspaceId, m.user_id, next);
      if (!ok) throw new Error('You do not have permission to change this member’s role.');
      toast({ title: `Now ${WORKSPACE_ROLE_META[next].label}`, description: WORKSPACE_ROLE_META[next].portal });
      load();
    } catch (err) {
      toast({ title: 'Could not change the role', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const remove = async (m: MemberRow) => {
    const who = m.full_name || m.email || 'this member';
    if (!window.confirm(`Remove ${who} from the workspace? They lose access immediately. Their records stay.`)) return;
    setBusy(`remove-${m.user_id}`);
    try {
      const ok = await workspaceManagementService.removeMember(workspaceId, m.user_id);
      if (!ok) throw new Error('You do not have permission to remove this member.');
      toast({ title: `${who} removed` });
      load();
    } catch (err) {
      toast({ title: 'Could not remove', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const meta = WORKSPACE_ROLE_META[role];

  return (
    <div className="space-y-6">
      {/* ── Invite ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Invite a Team Member</CardTitle>
          <p className="text-xs text-muted-foreground pt-1">
            The role decides which portal they land on. Email invitations are tied to that address, so a
            forwarded link cannot be claimed by anyone else.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Role &amp; portal</Label>
              <Select value={role} onValueChange={(v: WorkspaceInviteRole) => { setRole(v); setLink(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {offerableRoles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {WORKSPACE_ROLE_META[r].label} — {WORKSPACE_ROLE_META[r].portal}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Email (optional)</Label>
              <Input
                type="email" value={email} placeholder="colleague@company.com"
                onChange={(e) => { setEmail(e.target.value); setLink(null); }}
                onKeyDown={(e) => e.key === 'Enter' && sendEmailInvite()}
              />
            </div>
          </div>

          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
            <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <span>{meta.description}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="rounded-full" onClick={sendEmailInvite} disabled={!!busy || !email.trim()}>
              {busy === 'invite-email' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              Send invitation
            </Button>
            <Button size="sm" variant="outline" className="rounded-full" onClick={generateLink} disabled={!!busy}>
              {busy === 'invite-link' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
              Generate link instead
            </Button>
          </div>

          {link && (
            <div className="space-y-1">
              <Label className="text-xs">Invite link (valid 30 days)</Label>
              <div className="flex gap-2">
                <Input readOnly value={link} className="text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button
                  variant="outline" size="icon" aria-label="Copy invite link" title="Copy invite link"
                  onClick={() => { navigator.clipboard.writeText(link); toast({ title: 'Copied' }); }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Outstanding invitations ────────────────────────────────────────── */}
      {invites.length > 0 && (
        <Card>
          <CardHeader className="border-b border-border/60 px-5 py-3">
            <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> Awaiting Acceptance ({invites.length})</CardTitle>
            <p className="text-xs text-muted-foreground pt-1">Not yet claimed. Revoking stops the link working.</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/40">
              {invites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {inv.email || inv.invitee_name || 'Open link (anyone with it)'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {workspaceRoleLabel(inv.role)} · expires {formatDate(inv.expires_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8" title="Copy invite link"
                      aria-label="Copy invite link"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/auth?mode=signup&invite=${inv.code}`);
                        toast({ title: 'Copied' });
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8" title="Revoke invitation"
                      aria-label="Revoke invitation"
                      onClick={() => revoke(inv)} disabled={busy === `revoke-${inv.id}`}
                    >
                      {busy === `revoke-${inv.id}`
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <X className="h-3.5 w-3.5 text-destructive" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Members ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Members ({members.length})</CardTitle>
          <p className="text-xs text-muted-foreground pt-1">
            Changing a role changes the portal that person sees on their next page load.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : members.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No members yet.</div>
          ) : (
            <div className="divide-y divide-border/40">
              {members.map((m) => {
                const isOwner = m.role === 'owner';
                return (
                  <div key={m.user_id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {m.full_name || m.email || m.user_id.slice(0, 8)}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {m.email}
                        {m.status !== 'active' && <span className="ml-2 text-amber-600">{m.status}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isOwner ? (
                        // The owner's role is not re-assignable from here — transferring ownership is a
                        // separate, deliberate action, and the RPC refuses to strip the last owner anyway.
                        <span className="text-xs text-muted-foreground">Owner</span>
                      ) : (
                        <Select
                          value={ASSIGNABLE_ROLES.includes(m.role as WorkspaceMemberRole) ? m.role : undefined}
                          onValueChange={(v: WorkspaceMemberRole) => changeRole(m, v)}
                          disabled={busy === `role-${m.user_id}`}
                        >
                          <SelectTrigger className="h-8 w-[190px] text-xs">
                            <SelectValue placeholder={workspaceRoleLabel(m.role)} />
                          </SelectTrigger>
                          <SelectContent>
                            {ASSIGNABLE_ROLES.map((r) => (
                              <SelectItem key={r} value={r} className="text-xs">
                                {WORKSPACE_ROLE_META[r].label} — {WORKSPACE_ROLE_META[r].portal}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        title="Remove from workspace" aria-label="Remove from workspace"
                        onClick={() => remove(m)} disabled={busy === `remove-${m.user_id}` || isOwner}
                      >
                        {busy === `remove-${m.user_id}`
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5 text-destructive" />}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamPanel;

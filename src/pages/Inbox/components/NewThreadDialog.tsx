import React, { useEffect, useState } from 'react';
import { Loader2, Search, BadgeCheck, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { CRM_SEARCH_COLUMN, foldedLike } from '@/services/crmSearch';
import { fetchDisplayProfiles } from '@/services/displayProfilesService';
import { UserAvatar } from '@/components/core/ui/UserAvatar';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/core/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/core/ui/dialog';
import { inboxApi } from '@/services/inboxApi';
import { avatarTint, initials } from '../inboxFormat';
import { WorkspaceMemberOption } from './InboxPrimitives';

export interface ContactOption { id: string; label: string; email: string | null; hasAccount: boolean; }

export const NewThreadDialog: React.FC<{
  workspaceId: string;
  initialMode: 'team' | 'customer';
  scopedLabelId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}> = ({ workspaceId, initialMode, scopedLabelId, onClose, onCreated }) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<'team' | 'customer'>(initialMode);
  const [busy, setBusy] = useState(false);

  // Team
  const [subject, setSubject] = useState('');
  const [members, setMembers] = useState<WorkspaceMemberOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  // Customer
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [contactQuery, setContactQuery] = useState('');
  const [contactId, setContactId] = useState<string | null>(null);
  const [custSubject, setCustSubject] = useState('');
  const [custMessage, setCustMessage] = useState('');

  // Success (customer without an account → share link)
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [createdThreadId, setCreatedThreadId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: mem } = await supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId);
      const ids = (mem || []).map((r: { user_id: string }) => r.user_id);
      if (ids.length === 0) return;
      const profs = await fetchDisplayProfiles(ids);
      const byId = new Map(profs.map((p) => [p.userId, p]));
      const me = (await supabase.auth.getUser()).data.user?.id;
      setMembers(ids.filter((id) => id !== me).map((id) => ({
        user_id: id,
        label: byId.get(id)?.fullName || byId.get(id)?.email || id.slice(0, 8),
      })));
    })();
  }, [workspaceId]);

  // Load CRM contacts for the Customer tab (server-side search when the query is specific).
  useEffect(() => {
    if (mode !== 'customer') return;
    let cancelled = false;
    (async () => {
      let q = supabase.from('crm_contacts')
        .select('id, name, first_name, last_name, email, user_id')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(40);
      const term = contactQuery.trim();
      if (term.length >= 2) {
        q = q.ilike(CRM_SEARCH_COLUMN, foldedLike(term));
      }
      const { data } = await q;
      if (cancelled) return;
      setContacts((data || []).map((r: { id: string; name?: string; first_name?: string; last_name?: string; email?: string; user_id?: string }) => ({
        id: r.id,
        label: r.name || [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || 'Contact',
        email: r.email ?? null,
        hasAccount: !!r.user_id,
      })));
    })();
    return () => { cancelled = true; };
  }, [mode, workspaceId, contactQuery]);

  const applyScopedLabel = async (threadId: string) => {
    if (!scopedLabelId) return;
    try {
      await inboxApi.setThreadLabels(threadId, [scopedLabelId]);
    } catch (e) {
      toast({ title: 'Conversation created, but the label was not applied', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const createTeam = async () => {
    setBusy(true);
    try {
      const { thread } = await inboxApi.createThread({
        thread_type: 'internal', workspace_id: workspaceId, subject: subject.trim() || undefined,
        participants: selected.map((user_id) => ({ type: 'member' as const, user_id })),
      });
      await applyScopedLabel(thread.id);
      onCreated(thread.id);
    } catch (e) {
      toast({ title: 'Could not create', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const createCustomer = async () => {
    if (!contactId) return;
    setBusy(true);
    try {
      const res = await inboxApi.createCustomerThread({
        workspace_id: workspaceId, contact_id: contactId,
        subject: custSubject.trim() || undefined, message: custMessage.trim() || undefined,
      });
      await applyScopedLabel(res.thread_id);
      if (res.share_url) { setShareUrl(res.share_url); setCreatedThreadId(res.thread_id); }
      else onCreated(res.thread_id);
    } catch (e) {
      toast({ title: 'Could not start conversation', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const modeBtn = (m: 'team' | 'customer', label: string) => (
    <button
      onClick={() => setMode(m)}
      className={`flex-1 text-xs py-1.5 rounded-full transition-colors ${mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
    >
      {label}
    </button>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {shareUrl ? (
          <>
            <DialogHeader>
              <DialogTitle>Share This Conversation</DialogTitle>
              <DialogDescription>
                This customer has no account yet. Send them this private link — they can read and reply with no login.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input readOnly value={shareUrl} className="text-sm" onFocus={(e) => e.currentTarget.select()} />
              <Button className="shrink-0" onClick={() => { navigator.clipboard.writeText(shareUrl); toast({ title: 'Link copied' }); }}>
                Copy
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button onClick={() => createdThreadId && onCreated(createdThreadId)}>Open conversation</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New Conversation</DialogTitle>
              <DialogDescription>Start a private team chat, or reach out to a customer.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-1 p-0.5 rounded-full bg-muted/40">
              {modeBtn('team', 'Team')}
              {modeBtn('customer', 'Customer')}
            </div>

            {mode === 'team' ? (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="inboxpage-topic" className="text-xs text-muted-foreground">Topic</label>
                  <Input id="inboxpage-topic" placeholder="e.g. Follow up on the Andronikos quote" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">Who's in this conversation?</div>
                  <div className="max-h-48 overflow-y-auto space-y-1 rounded-sm border border-hairline p-1.5">
                    {members.map((m) => (
                      <label key={m.user_id} className="flex items-center gap-2.5 text-sm px-2 py-1.5 rounded-sm hover:bg-surface-hover cursor-pointer transition-colors">
                        <Checkbox checked={selected.includes(m.user_id)}
                          onCheckedChange={(v) => setSelected((prev) => v === true ? [...prev, m.user_id] : prev.filter((x) => x !== m.user_id))} />
                        <UserAvatar userId={m.user_id} name={m.label} className="h-7 w-7" fallbackClassName={`text-[10px] ${avatarTint(m.label)}`} />
                        {m.label}
                      </label>
                    ))}
                    {members.length === 0 && <div className="text-xs text-muted-foreground px-2 py-2">No other team members in this workspace yet.</div>}
                  </div>
                  {selected.length === 0 && <p className="text-[11px] text-muted-foreground mt-1.5">Pick at least one teammate to start the conversation with.</p>}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={onClose}>Cancel</Button>
                  <Button onClick={createTeam} disabled={busy || selected.length === 0}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Start conversation'}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="inboxpage-customer" className="text-xs text-muted-foreground">Customer</label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input id="inboxpage-customer" placeholder="Search contacts by name or email" value={contactQuery} onChange={(e) => { setContactQuery(e.target.value); setContactId(null); }} className="pl-9" />
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-0.5 rounded-sm border border-hairline p-1.5">
                    {contacts.map((ct) => (
                      <button
                        key={ct.id}
                        onClick={() => setContactId(ct.id)}
                        className={`w-full flex items-center gap-2.5 text-sm px-2 py-1.5 rounded-lg transition-colors text-left ${contactId === ct.id ? 'bg-primary/15 text-primary' : 'hover:bg-surface-hover'}`}
                      >
                        <Avatar className="h-7 w-7"><AvatarFallback className={`text-[10px] ${avatarTint(ct.label)}`}>{initials(ct.label)}</AvatarFallback></Avatar>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate">{ct.label}</span>
                          {ct.email && <span className="block text-[11px] text-muted-foreground truncate">{ct.email}</span>}
                        </span>
                        {ct.hasAccount
                          ? <span className="inline-flex items-center text-[10px] shrink-0 text-muted-foreground"><BadgeCheck className="w-2.5 h-2.5 mr-0.5" />Account</span>
                          : <span className="text-[10px] shrink-0 text-muted-foreground">Link</span>}
                        {contactId === ct.id && <Check className="w-4 h-4 shrink-0" />}
                      </button>
                    ))}
                    {contacts.length === 0 && <div className="text-xs text-muted-foreground px-2 py-2">No contacts found.</div>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="inboxpage-subject-optional" className="text-xs text-muted-foreground">Subject (optional)</label>
                  <Input id="inboxpage-subject-optional" placeholder="What's this about?" value={custSubject} onChange={(e) => setCustSubject(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="inboxpage-first-message-optional" className="text-xs text-muted-foreground">First message (optional)</label>
                  <Textarea id="inboxpage-first-message-optional" placeholder="Write the first message to the customer…" value={custMessage} onChange={(e) => setCustMessage(e.target.value)} className="min-h-[72px] resize-none" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Contacts with an account see this in their inbox. For others you'll get a private link to send them.
                </p>
                <DialogFooter>
                  <Button variant="outline" onClick={onClose}>Cancel</Button>
                  <Button onClick={createCustomer} disabled={busy || !contactId}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Start conversation'}
                  </Button>
                </DialogFooter>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

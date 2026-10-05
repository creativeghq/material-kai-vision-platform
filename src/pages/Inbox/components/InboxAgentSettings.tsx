import React, { useEffect, useState } from 'react';
import { Loader2, Mail, Settings2, Check, Link2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Separator } from '@/components/core/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { Switch } from '@/components/core/ui/switch';
import { Label } from '@/components/core/ui/label';
import { inboxApi, type InboxAgentSettings, type UserEmailAddress } from '@/services/inboxApi';

// ──────────────────────────────────────────────────────────────────────────
// Dialogs
// ──────────────────────────────────────────────────────────────────────────

/** Per-workspace AI-assistant settings, read/written via inbox-api. Edits gated to owner/admin. */
export const InboxAgentSettingsButton: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [settings, setSettings] = useState<InboxAgentSettings | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    inboxApi.getAgentSettings(workspaceId)
      .then((r) => { setSettings(r.settings); setCanEdit(r.can_edit); })
      .catch((e) => toast({ title: 'Failed to load settings', description: (e as Error).message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [open, workspaceId, toast]);

  const update = async (key: keyof InboxAgentSettings, value: boolean) => {
    if (!settings) return;
    const prev = settings;
    setSettings({ ...settings, [key]: value });
    setSaving(key);
    try {
      const r = await inboxApi.setAgentSettings(workspaceId, { [key]: value });
      setSettings(r.settings);
    } catch (e) {
      setSettings(prev);
      toast({ title: 'Failed to save', description: (e as Error).message, variant: 'destructive' });
    } finally { setSaving(null); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9" title="AI assistant settings">
          <Settings2 className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium">AI assistant</div>
            <div className="text-xs text-muted-foreground">
              Applies to every customer conversation in this workspace. Replies run on the full
              assistant and are metered per turn, like a chat in the Studio — a short answer costs
              a fraction of a researched one.
            </div>
          </div>
          {loading || !settings ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="text-sm">Auto-respond to new chats</Label>
                  {/* Off by default and spelled out, because the cost of a wrong guess here is
                      paid by the CUSTOMER, not by the operator: the assistant writes to them
                      under the business's name and a sent message cannot be unsent. */}
                  <div className="text-xs text-muted-foreground">
                    The assistant answers first, on its own, on every new customer conversation —
                    including WhatsApp numbers and social DMs. Off unless you turn it on.
                  </div>
                </div>
                <Switch
                  checked={settings.auto_respond}
                  disabled={!canEdit || saving === 'auto_respond'}
                  onCheckedChange={(v) => update('auto_respond', v)}
                />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="text-sm">Answer account &amp; billing</Label>
                  <div className="text-xs text-muted-foreground">
                    Let it share the customer’s own statement, open invoices, and pay links. On WhatsApp the
                    customer is identified by phone number.
                  </div>
                </div>
                <Switch
                  checked={settings.allow_account_data}
                  disabled={!canEdit || saving === 'allow_account_data'}
                  onCheckedChange={(v) => update('allow_account_data', v)}
                />
              </div>
              {!canEdit && (
                <div className="text-xs text-muted-foreground">Only a workspace owner or admin can change these.</div>
              )}
            </>
          )}
          <Separator className="bg-hairline" />
          <MyEmailAddressSection workspaceId={workspaceId} />
        </div>
      </PopoverContent>
    </Popover>
  );
};

/**
 * The user's own inbound email address (#342). Their address, not the workspace's — mail sent to it
 * lands in this workspace's Inbox as an `email` thread.
 *
 * Allocation is a deliberate click rather than something that happens on first render: the address
 * is a published identity you print on a business card, so it appears when the person asks for it.
 */
export const MyEmailAddressSection: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState<UserEmailAddress | null>(null);
  const [domain, setDomain] = useState('');
  const [copied, setCopied] = useState(false);
  // Set when the derived handle is already someone else's. Nothing is allocated in that case and
  // the person picks their own, rather than being handed `basilis.kanonidis2@`.
  const [conflict, setConflict] = useState<string | null>(null);
  const [chosen, setChosen] = useState('');

  useEffect(() => {
    let alive = true;
    // Reading allocates. A member who opens the Inbox can receive mail immediately, without
    // first finding and pressing a button — the address only ever comes back null when the
    // derived handle collides with someone else's and this person has to pick their own.
    inboxApi.getMyEmailAddress(workspaceId)
      .then((r) => {
        if (!alive) return;
        setAddress(r.address);
        setDomain(r.domain);
        if (!r.address && r.conflict) {
          setConflict(r.conflict === 'invalid'
            ? 'We could not build an address from your name. Please choose one.'
            : 'That name is taken. Choose another.');
          if (r.suggested_local_part) setChosen(r.suggested_local_part);
        }
      })
      .catch(() => { /* the address surface is optional chrome — never block the popover on it */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [workspaceId]);

  const REJECTION: Record<string, string> = {
    plus: 'A plus sign is reserved — it is how replies find their conversation.',
    reserved: 'That name is reserved. Please pick another.',
    shape: 'Use letters, numbers, dots, dashes and underscores, starting and ending with a letter or number.',
    empty: 'Please type a name.',
  };

  const allocate = async (localPart?: string) => {
    setBusy(true);
    try {
      const r = await inboxApi.getMyEmailAddress(workspaceId, localPart);
      if (!r.address) {
        // A conflict is an answer, not an error: two people share a name, so this one chooses.
        setConflict(r.invalid_reason ? (REJECTION[r.invalid_reason] ?? 'That name cannot be used.')
          : 'That name is taken. Choose another.');
        if (!localPart && r.suggested_local_part) setChosen(r.suggested_local_part);
        return;
      }
      setAddress(r.address);
      setConflict(null);
      toast({ title: 'Your email address is ready', description: r.address.full_address });
    } catch (e) {
      toast({ title: 'Could not create an address', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address.full_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard is best-effort; the address is selectable either way */ }
  };

  const toggleAutoReply = async (v: boolean) => {
    if (!address) return;
    const prev = address;
    setAddress({ ...address, auto_reply_enabled: v });
    try {
      const r = await inboxApi.setEmailAddressSettings({ auto_reply_enabled: v });
      setAddress(r.address);
    } catch (e) {
      setAddress(prev);
      toast({ title: 'Failed to save', description: (e as Error).message, variant: 'destructive' });
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-medium">Your email address</div>
        <div className="text-xs text-muted-foreground">
          Mail sent here arrives in this Inbox. Replies go out from the workspace and thread back
          automatically.
        </div>
      </div>

      {!address && !conflict ? (
        // Reaching here means the read failed outright — the allocation itself cannot leave the
        // address null without also setting a conflict.
        <div className="text-xs text-muted-foreground">
          Your address could not be loaded. Reopen this panel to try again.
        </div>
      ) : !address ? (
        <div className="space-y-2">
          <div className="text-xs text-destructive">{conflict}</div>
          <div className="flex items-center gap-1.5">
            <Input
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && chosen.trim()) allocate(chosen.trim()); }}
              placeholder="firstname.lastname"
              className="h-8 text-xs"
              autoFocus
            />
            <span className="text-xs text-muted-foreground shrink-0">@{domain}</span>
          </div>
          <Button
            size="sm" variant="outline" className="w-full"
            disabled={busy || !chosen.trim()}
            onClick={() => allocate(chosen.trim())}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Use this address'}
          </Button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={copy}
            className="w-full flex items-center gap-2 text-xs rounded-sm border border-hairline bg-surface-sunken px-2.5 py-2 hover:bg-surface-hover transition-colors"
            title="Copy to clipboard"
          >
            <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="flex-1 truncate text-left">{address.full_address}</span>
            {copied ? <Check className="w-3.5 h-3.5 text-success shrink-0" /> : <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
          </button>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label className="text-sm">Assistant answers email</Label>
              <div className="text-xs text-muted-foreground">
                Replies to mail sent here without waiting for you.
              </div>
            </div>
            <Switch checked={address.auto_reply_enabled} onCheckedChange={toggleAutoReply} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Already have an address customers use? Forward it here instead of changing your MX.
          </p>
        </>
      )}
    </div>
  );
};

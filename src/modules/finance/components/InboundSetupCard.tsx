/**
 * #206 — per-workspace myDATA received-docs (inbound) credentials. Manager-only; the
 * subscription key is stored in workspace_inbound_credentials (not finance_settings) so
 * the read-only accountant never sees it. Once set + enabled, the finance-inbound-sync
 * poller pulls this workspace's received documents into the Expenses Inbox.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Loader2, Save, Inbox } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { inboundService } from '@/modules/finance/services/inboundService';

export const InboundSetupCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [userId, setUserId] = useState('');
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const c = await inboundService.getCreds(workspaceId).catch(() => null);
      if (cancelled) return;
      setUserId(c?.aade_user_id ?? '');
      setKey(''); // never prefill the secret — the server only tells us whether one is set
      setHasKey(!!c?.has_key);
      setEnabled(c?.enabled ?? true);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  const save = async () => {
    setSaving(true);
    try {
      // Only send the key when the manager typed a new one — blank preserves the stored key.
      // Base URL is always production (myDATA RequestDocs) — the poller defaults to it.
      await inboundService.saveCreds(workspaceId, { aadeUserId: userId, subscriptionKey: key.trim() || undefined, enabled });
      if (key.trim()) setHasKey(true);
      setKey('');
      toast({ title: 'Inbound credentials saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <Card><CardContent className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2"><Inbox className="h-4 w-4" /> myDATA Inbox (Received Documents)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Enter your <strong>myDATA REST API</strong> credentials — a <strong>User ID</strong> and a <strong>Subscription Key</strong> you get by registering an application in the AADE myDATA REST API portal (<a href="https://www1.aade.gr/saadeapps2/bookkeeper-web/" target="_blank" rel="noreferrer" className="text-primary underline">bookkeeper-web</a> → Registration → REST API). These are <strong>not</strong> the Special Access Codes used for VAT/registry lookups (those are username+password). Once enabled, documents suppliers issue to you appear under <strong>Documents → Expenses</strong>, ready to turn into supplier bills or warehouse intake.
        </p>
        <p className="text-xs text-muted-foreground">
          Unlike VAT lookups and email, the Expenses Inbox has <strong>no platform default</strong> — myDATA tags every received document to a specific issuer, so each workspace must use its own credentials. Enter yours below to switch it on.
        </p>
        <div className="space-y-1">
          <Label className="text-xs">User ID <span className="text-muted-foreground">(sent as <code>aade-user-id</code>)</span></Label>
          <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="your myDATA REST API user id" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Subscription Key <span className="text-muted-foreground">(<code>Ocp-Apim-Subscription-Key</code>)</span></Label>
          <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={hasKey ? '•••••••• (configured — leave blank to keep)' : 'your myDATA REST API subscription key'} />
        </div>
        <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
          <div className="text-sm">Enabled</div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div>
          <Button size="sm" onClick={save} disabled={saving} className="rounded-full">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

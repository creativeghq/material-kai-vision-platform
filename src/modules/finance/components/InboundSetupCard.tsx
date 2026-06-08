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
  const [baseUrl, setBaseUrl] = useState('');
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
      setBaseUrl(c?.base_url ?? '');
      setEnabled(c?.enabled ?? true);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  const save = async () => {
    setSaving(true);
    try {
      // Only send the key when the manager typed a new one — blank preserves the stored key.
      await inboundService.saveCreds(workspaceId, { aadeUserId: userId, subscriptionKey: key.trim() || undefined, baseUrl, enabled });
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
        <CardTitle className="text-sm flex items-center gap-2"><Inbox className="h-4 w-4" /> myDATA inbox (received documents)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Enter your AADE myDATA <strong>received-docs</strong> credentials (Special Access Codes with the RequestDocs scope — different from the VAT-lookup codes). Once enabled, documents suppliers issue to you appear under <strong>Documents → Expenses</strong>, ready to turn into supplier bills or warehouse intake.
        </p>
        <div className="space-y-1">
          <Label className="text-xs">aade-user-id</Label>
          <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="your myDATA user id" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Subscription key</Label>
          <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={hasKey ? '•••••••• (configured — leave blank to keep)' : 'Ocp-Apim-Subscription-Key'} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Base URL (optional)</Label>
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://mydatapi.aade.gr/myDATA" />
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

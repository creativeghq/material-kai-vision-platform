/**
 * Per-workspace ΑΑΔΕ Special Access Codes (username + password) for the RgWsPublic2
 * registry/VAT lookup. Finance-manager-gated; the password is stored in
 * workspace_aade_credentials and never returned to the browser (only `has_password`).
 *
 * These are the "Ειδικοί Κωδικοί Πρόσβασης ΑΑΔΕ" — distinct from the myDATA REST API
 * credentials in InboundSetupCard (those are aade-user-id + subscription-key for the
 * received-documents poller). Each workspace runs lookups under its OWN codes, against
 * its own TAXISnet quota and audit inbox; only the operator's root workspace falls back
 * to the platform env default.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Loader2, Save, KeyRound, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { aadeService } from '../services/aadeService';

const TOKEN_SERVICES_APP_URL = 'https://www1.gsis.gr/sgsisapps/tokenservices/';

export const AadeCredentialsCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [afmCalledBy, setAfmCalledBy] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const c = await aadeService.getCreds(workspaceId).catch(() => null);
      if (cancelled) return;
      setUsername(c?.username ?? '');
      setAfmCalledBy(c?.afm_called_by ?? '');
      setPassword(''); // never prefill the secret — the server only tells us whether one is set
      setHasPassword(!!c?.has_password);
      setEnabled(c?.enabled ?? true);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  const save = async () => {
    if (!username.trim()) {
      toast({ title: 'Username required', description: 'Enter your ΑΑΔΕ Special Access Codes username.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // Blank password preserves the stored one (the masked field never wipes a saved secret).
      await aadeService.saveCreds(workspaceId, {
        username: username.trim(),
        password: password.trim() || undefined,
        afmCalledBy: afmCalledBy.trim() || null,
        enabled,
      });
      if (password.trim()) setHasPassword(true);
      setPassword('');
      toast({ title: 'ΑΑΔΕ credentials saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <Card><CardContent className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-sm flex items-center gap-2"><KeyRound className="h-4 w-4" /> myAADE — Business Lookup Credentials</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Enter <strong>your own</strong> ΑΑΔΕ <strong>Special Access Codes</strong> (username + password) — created at the{' '}
          <a href={TOKEN_SERVICES_APP_URL} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
            AADE token services portal <ExternalLink className="h-3 w-3" />
          </a>{' '}and authorized for <strong>RgWsPublic2</strong>. Used to look up Greek businesses by VAT number (your own business, CRM companies, invoice counterparties). Every lookup runs under <strong>your</strong> TAXISnet account — your monthly quota, your audit inbox. These are <strong>not</strong> the myDATA REST API credentials used by the Expenses Inbox.
        </p>
        <div className="space-y-1">
          <Label className="text-xs">Username</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ΑΑΔΕ special-access username" autoComplete="off" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Password</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder={hasPassword ? '•••••••• (configured — leave blank to keep)' : 'ΑΑΔΕ special-access password'} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Caller VAT <span className="text-muted-foreground">(optional — your ΑΦΜ, named in the lookup audit)</span></Label>
          <Input value={afmCalledBy} onChange={(e) => setAfmCalledBy(e.target.value)} placeholder="e.g. 094019245" className="font-mono" maxLength={9} />
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

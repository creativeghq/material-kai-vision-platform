/**
 * Per-workspace BYOK shipment-tracking credentials (Profile → Keys). The tenant pastes their OWN
 * ShipsGo (or compatible) API key; the platform NEVER provides one. Opt-in — inbound container/BL
 * tracking only works once a key is saved + enabled. Finance-manager-gated via RLS; the key is stored
 * in workspace_shipping_credentials and never returned to the browser (only a masked tail).
 *
 * Why BYOK-only: container-milestone tracking has no free production API (AIS/vessel-position free
 * tiers give only vessel location, not container events), and each provider bills per container — so
 * the tenant runs it on their own account + their own bill, not ours.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Badge } from '@/components/core/ui/badge';
import { Loader2, Save, Ship, ExternalLink, Calculator } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { stockService } from '../services/stockService';

export const ShippingCredentialsCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  // SeaRates is operator-only (the operator prices shipping + keeps the margin); only the root
  // workspace configures it. Tenants get ShipsGo tracking BYOK only.
  const { isRootWorkspace } = useWorkspace();
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [keyMasked, setKeyMasked] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  // SeaRates (freight-rate quotes) BYOK.
  const [srId, setSrId] = useState('');
  const [srKey, setSrKey] = useState('');
  const [srHasKey, setSrHasKey] = useState(false);
  const [srMasked, setSrMasked] = useState<string | null>(null);
  const [savingSr, setSavingSr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const s = await stockService.getShippingStatus(workspaceId).catch(() => null);
      if (cancelled) return;
      setHasKey(!!s?.configured);
      setKeyMasked(s?.key_masked ?? null);
      setEnabled(s?.enabled ?? true);
      setBaseUrl(s?.base_url ?? '');
      setApiKey('');
      setSrHasKey(!!s?.searates_configured);
      setSrMasked(s?.searates_key_masked ?? null);
      setSrId(s?.searates_platform_id ?? '');
      setSrKey('');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  const saveSearates = async () => {
    if (!srHasKey && !srKey.trim()) { toast({ title: 'SeaRates API key required', variant: 'destructive' }); return; }
    setSavingSr(true);
    try {
      await stockService.saveSearatesCreds(workspaceId, { platformId: srId.trim() || null, apiKey: srKey.trim() || null });
      if (srKey.trim()) setSrHasKey(true);
      setSrKey('');
      toast({ title: 'SeaRates credentials saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setSavingSr(false); }
  };

  const save = async () => {
    if (!hasKey && !apiKey.trim()) {
      toast({ title: 'API key required', description: 'Paste your ShipsGo API key to enable tracking.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // Blank key preserves the stored one (the masked field never wipes a saved secret).
      await stockService.saveShippingCreds(workspaceId, {
        provider: 'shipsgo', apiKey: apiKey.trim() || null, enabled, baseUrl: baseUrl.trim() || null,
      });
      if (apiKey.trim()) setHasKey(true);
      setApiKey('');
      toast({ title: 'Shipment tracking saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <Card><CardContent className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Ship className="h-4 w-4" /> Shipment tracking (ShipsGo)
          {hasKey && <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">{enabled ? 'Active' : 'Disabled'}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Bring <strong>your own</strong> ShipsGo API token to track inbound containers / bills of lading in the
          Stock module. Create one in your{' '}
          <a href="https://shipsgo.com/" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
            ShipsGo account <ExternalLink className="h-3 w-3" />
          </a>. Tracking runs on <strong>your</strong> ShipsGo plan — the platform does not provide a key and
          does not charge credits for it. This is entirely optional; leave it empty and inbound tracking stays off.
        </p>
        <div className="space-y-1">
          <Label className="text-xs">ShipsGo API key</Label>
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="new-password"
            placeholder={hasKey ? `${keyMasked ?? '••••'} (configured — leave blank to keep)` : 'Paste your ShipsGo API token'} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Base URL <span className="text-muted-foreground">(optional — only if your plan uses a different endpoint)</span></Label>
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.shipsgo.com/v2" className="font-mono text-xs" />
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

        {/* SeaRates — OPERATOR ONLY (root workspace). The operator prices tenant shipping requests
            with SeaRates and keeps the margin; tenants never call SeaRates directly. */}
        {isRootWorkspace && (
        <div className="border-t border-border/60 pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Freight rates (SeaRates) — operator</span>
            {srHasKey && <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Configured</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Operator tool. Add the platform's <a href="https://www.searates.com/integrations/api-logistics-explorer/" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">SeaRates <ExternalLink className="h-3 w-3" /></a> credentials — used in <strong>Admin → Freight quote requests</strong> to price tenant shipping requests (compares 100+ forwarders). Tenants never call SeaRates directly, so shipping quotes always come through you.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Platform ID <span className="text-muted-foreground">(optional)</span></Label><Input value={srId} onChange={(e) => setSrId(e.target.value)} placeholder="SeaRates account id" autoComplete="off" /></div>
            <div className="space-y-1"><Label className="text-xs">API key</Label><Input type="password" value={srKey} onChange={(e) => setSrKey(e.target.value)} autoComplete="new-password" placeholder={srHasKey ? `${srMasked ?? '••••'} (configured — blank keeps)` : 'SeaRates API key / token'} /></div>
          </div>
          <div>
            <Button size="sm" variant="outline" onClick={saveSearates} disabled={savingSr} className="rounded-full">
              {savingSr ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save SeaRates
            </Button>
          </div>
        </div>
        )}
      </CardContent>
    </Card>
  );
};

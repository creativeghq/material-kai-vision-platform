/**
 * e-Invoicing (myDATA / AADE) settings — mounted inside Finance → Settings.
 *
 * Two blocks:
 *  1. Operator master key (platform-operator only): the single Novus key every
 *     tenant transmits through. Stored on the root workspace; env NOVUS_API_KEY
 *     wins at runtime if set.
 *  2. Per-workspace enablement: bind this workspace's `legal_invoice` capability
 *     to a connector. Reminder that the workspace VAT must be authorized in the
 *     master Novus portal first.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, ShieldCheck, KeyRound, Info, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  fiscalConnectorService,
  type FiscalConnector,
  type MasterCredentialStatus,
} from '@/services/fiscalConnectorService';

interface Props {
  workspaceId: string;
}

export const FiscalConnectorSettings: React.FC<Props> = ({ workspaceId }) => {
  const { toast } = useToast();
  const { isPlatformOperator, memberships } = useWorkspace();
  const rootWorkspaceId = useMemo(
    () => memberships.find((m) => m.workspace.isRoot)?.workspaceId ?? null,
    [memberships],
  );

  const [connectors, setConnectors] = useState<FiscalConnector[]>([]);
  const [boundSlug, setBoundSlug] = useState<string>('none');
  const [loading, setLoading] = useState(true);
  const [savingBinding, setSavingBinding] = useState(false);

  // master key (operator)
  const [masterStatus, setMasterStatus] = useState<MasterCredentialStatus>({ is_sandbox: true, is_configured: false });
  const [apiKey, setApiKey] = useState('');
  const [sandbox, setSandbox] = useState(true);
  const [savingKey, setSavingKey] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [conns, binding] = await Promise.all([
          fiscalConnectorService.listConnectors(),
          fiscalConnectorService.getBinding(workspaceId, 'legal_invoice'),
        ]);
        if (cancelled) return;
        setConnectors(conns);
        setBoundSlug(binding?.connector_slug ?? 'none');
        if (isPlatformOperator && rootWorkspaceId) {
          const status = await fiscalConnectorService.getMasterCredentialStatus(rootWorkspaceId);
          if (!cancelled) {
            setMasterStatus(status);
            setSandbox(status.is_sandbox);
          }
        }
      } catch (err: any) {
        if (!cancelled) toast({ title: 'Failed to load e-Invoicing settings', description: err?.message, variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId, isPlatformOperator, rootWorkspaceId]);

  const legalConnectors = connectors.filter((c) => c.capabilities.includes('legal_invoice'));

  const saveBinding = async (slug: string) => {
    setBoundSlug(slug);
    try {
      setSavingBinding(true);
      await fiscalConnectorService.setBinding(workspaceId, 'legal_invoice', slug === 'none' ? null : slug);
      toast({ title: slug === 'none' ? 'e-Invoicing disabled for this workspace' : `Bound to ${slug}` });
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingBinding(false);
    }
  };

  const saveKey = async () => {
    if (!rootWorkspaceId) return;
    if (!masterStatus.is_configured && !apiKey.trim()) {
      toast({ title: 'Enter the master Novus API key', variant: 'destructive' });
      return;
    }
    try {
      setSavingKey(true);
      await fiscalConnectorService.saveMasterCredential(rootWorkspaceId, { apiKey: apiKey.trim() || undefined, isSandbox: sandbox });
      setApiKey('');
      setMasterStatus({ is_configured: masterStatus.is_configured || !!apiKey.trim(), is_sandbox: sandbox });
      toast({ title: 'Master key saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingKey(false);
    }
  };

  if (loading) {
    return (
      <Card className="lg:col-span-2">
        <CardContent className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> e-Invoicing (myDATA / AADE)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        {/* Operator master key */}
        {isPlatformOperator && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="h-4 w-4 text-primary" /> Master Novus key (operator)
              {masterStatus.is_configured ? (
                <Badge variant="secondary" className="ml-1">Configured</Badge>
              ) : (
                <Badge variant="outline" className="ml-1 border-amber-500/50 text-amber-500">Key needed</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              One key for the whole platform. Every tenant transmits through it with their own VAT as issuer.
              The environment variable <code>NOVUS_API_KEY</code> takes precedence if set on the backend.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>API key {masterStatus.is_configured && <span className="text-muted-foreground">(leave blank to keep current)</span>}</Label>
                <Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                  placeholder={masterStatus.is_configured ? '••••••••••••' : 'Paste the Novus API key'} />
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Switch checked={sandbox} onCheckedChange={setSandbox} />
                  <span className="text-sm">{sandbox ? 'Sandbox (provider-dev)' : 'Production'}</span>
                </div>
                <Button onClick={saveKey} disabled={savingKey}>
                  {savingKey ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save key
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Per-workspace enablement */}
        <div className="space-y-2">
          <Label>Legal invoice connector for this workspace</Label>
          <div className="flex items-center gap-3">
            <Select value={boundSlug} onValueChange={saveBinding} disabled={savingBinding}>
              <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Disabled (no e-Invoicing)</SelectItem>
                {legalConnectors.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {savingBinding && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {boundSlug !== 'none' && (
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div className="leading-snug text-muted-foreground">
                This workspace's VAT (set in <strong>Business identity</strong> below) must be registered as an
                authorized issuer in the master Novus portal before invoices will transmit. In the Live
                environment each new VAT is requested via the portal.
                <a href="https://portal.timologisi.online" target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline ml-1">
                  Novus portal <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

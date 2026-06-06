/**
 * e-Invoicing (myDATA / AADE) settings — mounted inside Finance → Settings.
 *
 * Two blocks:
 *  1. Master keys (platform-operator only): the standard SecretsManagerCard for the
 *     sales-finance module — NOVUS_API_KEY / NOVUS_SANDBOX / NOVUS_API_BASE_URL, the
 *     same env-first/DB-second mechanism as every other key. One operator key; all
 *     tenants transmit through it.
 *  2. Per-workspace enablement: bind this workspace's `legal_invoice` capability to a
 *     connector, with the VAT-authorization reminder.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Info, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { SecretsManagerCard } from '@/components/Admin/Secrets/SecretsManagerCard';
import { fiscalConnectorService, type FiscalConnector } from '@/services/fiscalConnectorService';

interface Props {
  workspaceId: string;
}

export const FiscalConnectorSettings: React.FC<Props> = ({ workspaceId }) => {
  const { toast } = useToast();
  const { isPlatformOperator } = useWorkspace();

  const [connectors, setConnectors] = useState<FiscalConnector[]>([]);
  const [boundSlug, setBoundSlug] = useState<string>('none');
  const [loading, setLoading] = useState(true);
  const [savingBinding, setSavingBinding] = useState(false);

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
      } catch (err: any) {
        if (!cancelled) toast({ title: 'Failed to load e-Invoicing settings', description: err?.message, variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

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

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-sm flex items-center gap-2">e-Invoicing (myDATA / AADE)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        {/* Operator master keys — standard secrets registry */}
        {isPlatformOperator && (
          <SecretsManagerCard
            scope={{ mode: 'module', moduleSlug: 'sales-finance' }}
            title="e-Invoicing keys (operator)"
            description="One master Novus key for the whole platform — every tenant transmits through it with their own issuer VAT. NOVUS_SANDBOX=false switches to production."
          />
        )}

        {/* Per-workspace enablement */}
        <div className="space-y-2">
          <Label>Legal invoice connector for this workspace</Label>
          <div className="flex items-center gap-3">
            <Select value={boundSlug} onValueChange={saveBinding} disabled={savingBinding || loading}>
              <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Disabled (no e-Invoicing)</SelectItem>
                {legalConnectors.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(savingBinding || loading) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
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

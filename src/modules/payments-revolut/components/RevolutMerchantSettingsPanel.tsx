/**
 * Revolut Checkout (Merchant API) configuration — BYOK, per-workspace.
 * Two steps: paste the Merchant secret API key, then activate the settlement webhook.
 * The provider is offered to buyers only when BOTH are done (registry gate).
 */
import React from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  activateRevolutMerchantWebhook,
  getRevolutMerchantStatus,
  saveRevolutMerchantConfig,
  type RevolutMerchantEnvironment,
  type RevolutMerchantStatus,
} from '../services/revolutMerchantConfigService';

const ConfigCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [status, setStatus] = React.useState<RevolutMerchantStatus | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [secretKey, setSecretKey] = React.useState('');
  const [environment, setEnvironment] = React.useState<RevolutMerchantEnvironment>('sandbox');

  const refresh = React.useCallback(async () => {
    try {
      const s = await getRevolutMerchantStatus(workspaceId);
      setStatus(s);
      setEnvironment(s.environment);
    } catch (e) {
      toast({ title: 'Could not load Revolut Checkout settings', description: (e as Error).message, variant: 'destructive' });
    }
  }, [workspaceId, toast]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); await refresh(); }
    catch (e) { toast({ title: `${label} failed`, description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  if (!status) {
    return <Card><CardContent className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4" /> Revolut Checkout</CardTitle>
          <CardDescription>
            Buyers pay by card, Revolut Pay, Apple/Google Pay or Pay by Bank on Revolut&apos;s hosted page.{' '}
            {status.configured
              ? <span className="text-success">Ready</span>
              : status.has_secret_key
                ? <span className="text-warning">Webhook pending</span>
                : <span className="text-muted-foreground">Not connected</span>}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="revm-enabled" className="text-xs text-muted-foreground">Enabled</Label>
          <Switch id="revm-enabled" checked={status.enabled}
            onCheckedChange={(v) => run('Toggle', async () => { await saveRevolutMerchantConfig(workspaceId, { enabled: v }); })} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label htmlFor="revm-key" className="text-xs">Merchant secret API key</Label>
            <Input id="revm-key" type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)}
              placeholder={status.has_secret_key ? '•••••••• (saved — leave blank to keep)' : 'sk_… from Revolut → Merchant API'} />
          </div>
          <div>
            <Label htmlFor="revm-env" className="text-xs">Environment</Label>
            <Select value={environment} onValueChange={(v) => setEnvironment(v as RevolutMerchantEnvironment)}>
              <SelectTrigger id="revm-env"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox</SelectItem>
                <SelectItem value="production">Production</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={busy}
            onClick={() => run('Save', async () => {
              await saveRevolutMerchantConfig(workspaceId, { secret_key: secretKey, environment });
              setSecretKey('');
              toast({ title: 'Revolut Checkout settings saved' });
            })}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}Save
          </Button>
          <Button size="sm" disabled={busy || !status.has_secret_key}
            onClick={() => run('Activate webhook', async () => {
              await activateRevolutMerchantWebhook(workspaceId);
              toast({ title: 'Webhook active', description: 'Completed checkouts now settle invoices automatically.' });
            })}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            {status.webhook_ready ? 'Re-register webhook' : 'Activate webhook'}
          </Button>
          {status.webhook_ready && <span className="text-xs text-success">webhook active</span>}
        </div>
      </CardContent>
    </Card>
  );
};

interface Props { embedded?: boolean }

export const RevolutMerchantSettingsPanel: React.FC<Props> = (_props) => {
  const { activeWorkspaceId } = useWorkspace();
  if (!activeWorkspaceId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Select a workspace to configure Revolut Checkout.
        </CardContent>
      </Card>
    );
  }
  return <div className="space-y-4"><ConfigCard workspaceId={activeWorkspaceId} /></div>;
};

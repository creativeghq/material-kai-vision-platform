/**
 * #273 — Viva.com BYOK setup card.
 *
 * Mounted in Profile → Keys (WorkspaceKeysTab) alongside the other per-workspace BYOK
 * cards, and on the payments-viva module settings page.
 *
 * The webhook step is given equal weight to the credentials, deliberately: Viva has no
 * API to register merchant-level webhooks, so if the seller skips it their customers'
 * payments succeed at Viva and their invoices silently never mark paid. The card refuses
 * to show "Connected" until we have actually received a delivery from their merchant id.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Copy, CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  getVivaStatus,
  saveVivaConfig,
  vivaWebhookUrl,
  type VivaConfigStatus,
  type VivaEnvironment,
  type VivaMethod,
} from '../services/vivaConfigService';

interface Props {
  workspaceId: string;
}

export const VivaConfigCard: React.FC<Props> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [status, setStatus] = useState<VivaConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Secrets are write-only: the inputs start blank even when a value is stored, and a
  // blank field on save means "leave the stored one alone".
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [sourceCode, setSourceCode] = useState('Default');
  const [environment, setEnvironment] = useState<VivaEnvironment>('demo');

  const refresh = useCallback(async () => {
    try {
      const s = await getVivaStatus(workspaceId);
      setStatus(s);
      setSourceCode(s.source_code);
      setEnvironment(s.environment);
    } catch (err) {
      toast({
        title: 'Could not load Viva settings',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = async (extra: Partial<{ enabled: boolean; methods: VivaMethod[] }> = {}) => {
    setSaving(true);
    try {
      await saveVivaConfig(workspaceId, {
        client_id: clientId,
        client_secret: clientSecret,
        merchant_id: merchantId,
        api_key: apiKey,
        source_code: sourceCode,
        environment,
        ...extra,
      });
      setClientSecret('');
      setApiKey('');
      await refresh();
      toast({ title: 'Viva settings saved' });
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const copyWebhookUrl = async () => {
    await navigator.clipboard.writeText(vivaWebhookUrl(workspaceId));
    toast({ title: 'Webhook URL copied' });
  };

  // Where Viva sends the customer after checkout. Configured per payment source in
  // their dashboard (Viva has no per-call return URL), so it's the same for everyone.
  const returnUrl = `${window.location.origin}/pay/return`;
  const copyReturnUrl = async () => {
    await navigator.clipboard.writeText(returnUrl);
    toast({ title: 'Return URL copied' });
  };

  const toggleMethod = (method: VivaMethod, on: boolean) => {
    const current = new Set(status?.methods ?? ['card']);
    if (on) current.add(method); else current.delete(method);
    void save({ methods: Array.from(current) as VivaMethod[] });
  };

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const credsReady = status?.configured ?? false;
  const webhookReady = !!status?.webhook_verified_at;
  const fullyConnected = credsReady && webhookReady;

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="text-base font-light flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          Viva.com
          {fullyConnected ? (
            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30">
              <AlertCircle className="h-3 w-3 mr-1" />
              {credsReady ? 'Webhook not verified' : 'Not connected'}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Your own Viva merchant account. Payments settle directly to your Viva wallet — we
          never hold your funds. Credentials are write-only: once saved they are never sent
          back to your browser.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Step 1 — credentials */}
        <div className="space-y-3">
          <p className="text-sm font-medium">1. Credentials</p>
          <p className="text-xs text-muted-foreground">
            Viva issues <strong>two different pairs</strong>. Both are required: the Smart
            Checkout pair authorises payments, the Merchant pair is used to look orders up and
            to verify the webhook.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Client ID {status?.has_client_id && <span className="text-emerald-400">· saved</span>}
              </Label>
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="…apps.vivapayments.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Client Secret {status?.has_client_secret && <span className="text-emerald-400">· saved</span>}
              </Label>
              <Input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={status?.has_client_secret ? 'leave blank to keep' : ''}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Merchant ID {status?.merchant_id_hint && (
                  <span className="text-emerald-400">· {status.merchant_id_hint}</span>
                )}
              </Label>
              <Input
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                placeholder="uuid from Settings → API Access"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                API Key {status?.has_api_key && <span className="text-emerald-400">· saved</span>}
              </Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={status?.has_api_key ? 'leave blank to keep' : ''}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Payment source code</Label>
              <Input
                value={sourceCode}
                onChange={(e) => setSourceCode(e.target.value)}
                placeholder="Default"
                autoComplete="off"
              />
              <p className="text-[11px] text-muted-foreground">
                Case-sensitive. Your customer's return URL is configured on this source in
                Viva, not by us — see below.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Environment</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as VivaEnvironment)}
              >
                <option value="demo">Demo (testing)</option>
                <option value="production">Production (live money)</option>
              </select>
            </div>
          </div>

          <Button onClick={() => void save()} disabled={saving} size="sm">
            {saving && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
            Save credentials
          </Button>
        </div>

        {/* Step 1b — the source's return URLs */}
        <div className="space-y-2 border-t border-white/8 pt-5">
          <p className="text-sm font-medium">2. Set your payment source's return URL</p>
          <p className="text-xs text-muted-foreground">
            Viva sends customers back to the URL on your <strong>payment source</strong>, not
            one we can pass per payment. Set both the success and failure URL of the{' '}
            <code className="text-[11px]">{sourceCode || 'Default'}</code> source to:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] bg-muted/40 rounded px-2 py-1.5 truncate">
              {returnUrl}
            </code>
            <Button variant="outline" size="sm" onClick={() => void copyReturnUrl()}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Viva appends the order reference, which is how we land the customer back on the
            right invoice.
          </p>
        </div>

        {/* Step 3 — the manual webhook registration */}
        <div className="space-y-3 border-t border-white/8 pt-5">
          <p className="text-sm font-medium flex items-center gap-2">
            3. Register the webhook in Viva
            {webhookReady ? (
              <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Verified
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30">Required</Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Viva provides no way for us to do this for you. Until it's done,{' '}
            <strong>payments will succeed but your invoices will never be marked paid.</strong>
          </p>

          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] bg-muted/40 rounded px-2 py-1.5 truncate">
              {vivaWebhookUrl(workspaceId)}
            </code>
            <Button variant="outline" size="sm" onClick={() => void copyWebhookUrl()}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>

          <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
            <li>Open your Viva banking app → <strong>Settings → API Access → Webhooks</strong>.</li>
            <li>Create a webhook, paste the URL above, and press <strong>Verify</strong>.</li>
            <li>
              Add one webhook per event type: <strong>Transaction Payment Created (1796)</strong>,{' '}
              <strong>Transaction Failed (1798)</strong>, and — if you take RF bank transfers —{' '}
              <strong>Account Transaction Created (2054)</strong>.
            </li>
            <li>Set each to Active and save.</li>
          </ol>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="https://developer.viva.com/webhooks-for-payments/setting-up-webhooks/" target="_blank" rel="noreferrer">
                Viva's guide <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              Check status
            </Button>
          </div>
          {!webhookReady && (
            <p className="text-[11px] text-muted-foreground">
              This turns green as soon as Viva's <strong>Verify</strong> step reaches us —
              press Verify in Viva, then press Check status here.
            </p>
          )}
        </div>

        {/* Step 3 — methods + go live */}
        <div className="space-y-3 border-t border-white/8 pt-5">
          <p className="text-sm font-medium">4. Payment methods</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Card (Smart Checkout)</p>
              <p className="text-xs text-muted-foreground">EUR, RON, PLN, CZK, HUF, SEK, DKK, GBP.</p>
            </div>
            <Switch
              checked={(status?.methods ?? []).includes('card')}
              onCheckedChange={(on) => toggleMethod('card', on)}
              disabled={saving || !credsReady}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">RF code (bank transfer) <span className="text-amber-500">— coming soon</span></p>
              <p className="text-xs text-muted-foreground">
                Greek merchants only. The buyer pays from their banking app using a 20-digit
                reference — no IBAN needed. Temporarily unavailable while we finish verifying the
                bank-transfer settlement flow; only card is offered at checkout for now.
              </p>
            </div>
            <Switch
              checked={false}
              onCheckedChange={(on) => toggleMethod('bank_reference', on)}
              disabled
            />
          </div>

          <div className="flex items-center justify-between border-t border-white/8 pt-4">
            <div>
              <p className="text-sm">Offer Viva at checkout</p>
              <p className="text-xs text-muted-foreground">
                {fullyConnected
                  ? 'Buyers can pay with Viva on your invoices.'
                  : 'Finish steps 1–3 before enabling.'}
              </p>
            </div>
            <Switch
              checked={status?.enabled ?? false}
              onCheckedChange={(on) => void save({ enabled: on })}
              disabled={saving || !fullyConnected}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

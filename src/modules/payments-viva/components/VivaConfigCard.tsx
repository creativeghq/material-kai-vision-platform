/**
 * Viva.com BYOK setup card.
 *
 * Mounted in Profile → Keys (WorkspaceKeysTab) alongside the other per-workspace BYOK
 * cards, and on the payments-viva module settings page.
 *
 * THE STEP ORDER IS LOAD-BEARING. Creating the payment source comes first because it is
 * what MINTS the 4-digit source code the credentials step asks for — the previous version
 * asked for the code in step 1 and only mentioned the source in step 2, so there was no
 * order in which a first-time reader could follow it.
 *
 * Two things get equal weight to the credentials, deliberately, because both fail SILENTLY:
 *   - the webhook, since Viva has no API to register one for the tenant. Skip it and their
 *     customers' payments succeed at Viva while their invoices never mark paid;
 *   - the connection test, since a wrong source code authenticates, saves, and is accepted
 *     everywhere right up until the first real sale.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, CreditCard, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import {
  getVivaStatus,
  listVivaMappableAccounts,
  mapVivaWallet,
  saveVivaConfig,
  testVivaConnection,
  vivaWebhookUrl,
  VIVA_EVENT_LABELS,
  VIVA_WEBHOOK_EVENTS,
  type VivaConfigStatus,
  type VivaEnvironment,
  type VivaMappableAccount,
  type VivaMethod,
  type VivaTestResult,
} from '../services/vivaConfigService';

interface Props {
  workspaceId: string;
}

/** The events this platform acts on. Anything else Viva delivers is acknowledged and dropped. */
const ACTIONABLE_EVENT_IDS = ['1796', '1797', '1798', '2054'];

const formatWhen = (iso: string | null): string =>
  formatDate(iso, { withTime: true });

export const VivaConfigCard: React.FC<Props> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [status, setStatus] = useState<VivaConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<VivaTestResult | null>(null);

  // Secrets are write-only: the inputs start blank even when a value is stored, and a
  // blank field on save means "leave the stored one alone".
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [sourceCode, setSourceCode] = useState('');
  const [environment, setEnvironment] = useState<VivaEnvironment>('demo');
  // Money OUT. A SECOND client pair — Viva issues "Account Transactions" credentials separately,
  // and the Smart Checkout pair above cannot send however well it charges cards.
  const [transferClientId, setTransferClientId] = useState('');
  const [transferClientSecret, setTransferClientSecret] = useState('');
  // Which of our accounts draws on which Viva wallet.
  const [mappableAccounts, setMappableAccounts] = useState<VivaMappableAccount[]>([]);
  const [mapAccountId, setMapAccountId] = useState('');
  const [mapWalletId, setMapWalletId] = useState('');
  const mappedAccountIsRevolut = Boolean(
    mappableAccounts.find((a) => a.id === mapAccountId)?.revolut_account_id,
  );

  const linkWallet = async () => {
    setSaving(true);
    try {
      await mapVivaWallet(mapAccountId, Number(mapWalletId));
      setMappableAccounts(await listVivaMappableAccounts(workspaceId));
      toast({
        title: 'Wallet linked',
        description: 'That account can now send payments through Viva.',
      });
    } catch (err) {
      toast({
        title: 'Could not link the wallet',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const refresh = useCallback(async () => {
    try {
      const s = await getVivaStatus(workspaceId);
      setStatus(s);
      setSourceCode(s.source_code);
      setEnvironment(s.environment);
      // Loaded unconditionally: the mapping is what an operator checks when the dialog says an
      // account cannot send, so it has to be readable before the connection test has been run.
      setMappableAccounts(await listVivaMappableAccounts(workspaceId).catch(() => []));
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
        transfer_client_id: transferClientId,
        transfer_client_secret: transferClientSecret,
        ...extra,
      });
      setClientSecret('');
      setApiKey('');
      setTransferClientSecret('');
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

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testVivaConnection(workspaceId));
    } catch (err) {
      toast({
        title: 'Test failed to run',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  const copy = async (value: string, title: string) => {
    await navigator.clipboard.writeText(value);
    toast({ title });
  };

  const toggleMethod = (method: VivaMethod, on: boolean) => {
    const current = new Set(status?.methods ?? ['card']);
    if (on) current.add(method); else current.delete(method);
    void save({ methods: Array.from(current) as VivaMethod[] });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Where Viva sends the customer after checkout. Configured per payment source in their
  // dashboard (Viva has no per-call return URL), so the string is the same for every
  // tenant — the order code in the query resolves which invoice it belongs to.
  const returnUrl = `${window.location.origin}/pay/return`;

  const credsReady = status?.configured ?? false;
  const webhookReady = !!status?.webhook_verified_at;
  const fullyConnected = credsReady && webhookReady;

  const deliveries = status?.webhook_event_types ?? {};
  const deliveredIds = Object.keys(deliveries).sort();
  const hasSettlementEvent = deliveredIds.includes('1796');
  const deliveredButIgnored = deliveredIds.filter((id) => !ACTIONABLE_EVENT_IDS.includes(id));
  // The exact failure this panel exists to catch: Viva IS delivering, so everything looks
  // wired up, but not the event that settles an invoice.
  const wrongEventRegistered = deliveredIds.length > 0 && !hasSettlementEvent;

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          Viva.com
          {fullyConnected ? (
            <span className="text-xs font-normal text-success">Connected</span>
          ) : (
            <span className="text-xs font-normal text-warning">{credsReady ? 'Webhook not verified' : 'Not connected'}</span>
          )}
        </CardTitle>
        <CardDescription>
          Your own Viva merchant account. Payments settle directly to your Viva wallet — we
          never hold your funds. Credentials are write-only: once saved they are never sent
          back to your browser.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Step 1 — the payment source, because it mints the code step 2 needs */}
        <div className="space-y-2">
          <p className="text-sm font-medium">1. Create your payment source in Viva</p>
          <p className="text-xs text-muted-foreground">
            In your Viva banking app go to <strong>Sales → Online payments → Websites/Apps</strong>{' '}
            and press <strong>Add Website/App</strong>. This is also the only place the return
            URLs below exist — they are not in Settings.
          </p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
            <li>
              <strong>Code</strong> — a four-digit number Viva generates (e.g. <code className="text-[11px]">2241</code>).
              Write it down; it goes in the next step.
            </li>
            <li><strong>Domain Name</strong> — <code className="text-[11px]">{window.location.host}</code>, with no protocol and no trailing slash.</li>
            <li><strong>Protocol</strong> — https. <strong>Integration method</strong> — Redirection/Native Checkout v2.</li>
            <li><strong>Company Logo</strong> — shown to your customer on the payment page.</li>
            <li><strong>Success URL</strong> and <strong>Failure URL</strong> — both set to the URL below.</li>
          </ul>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] bg-muted/40 rounded px-2 py-1.5 truncate">{returnUrl}</code>
            <Button variant="outline" size="sm" onClick={() => void copy(returnUrl, 'Return URL copied')}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Both URLs are the same on purpose — Viva signals a failure by omitting a parameter,
            not by using a different address. In <strong>Advanced Configuration</strong>, leave the
            URL parameter names untouched: we read the ones Viva sends by default, and renaming
            them strands every returning customer.
          </p>
        </div>

        {/* Step 2 — credentials */}
        <div className="space-y-3 border-t border-border pt-5">
          <p className="text-sm font-medium">2. Credentials</p>
          <p className="text-xs text-muted-foreground">
            From <strong>Settings → API Access</strong>. Viva issues <strong>two different
            pairs</strong> and both are required: the Smart Checkout pair authorises payments,
            the Merchant pair looks orders up and verifies the webhook. Demo and production are
            separate accounts — their credentials are not interchangeable.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Client ID {status?.has_client_id && <span className="text-success">· saved</span>}
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
                Client Secret {status?.has_client_secret && <span className="text-success">· saved</span>}
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
                  <span className="text-success">· {status.merchant_id_hint}</span>
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
                API Key {status?.has_api_key && <span className="text-success">· saved</span>}
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
                placeholder="e.g. 2241"
                autoComplete="off"
              />
              <p className="text-[11px] text-muted-foreground">
                The four-digit code from step 1 — not the source's name.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Environment</Label>
              <select
                className="w-full h-10 rounded-lg border border-hairline bg-white/5 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 transition-all duration-200 hover:border-white/20"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as VivaEnvironment)}
              >
                <option value="demo">Demo (testing)</option>
                <option value="production">Production (live money)</option>
              </select>
            </div>
          </div>

          {/*
            MONEY OUT — a separate pair, stated as such.

            The commonest way to get this wrong is to assume the credentials above cover it: they
            authenticate perfectly and then every transfer is refused with a 401 that names neither
            the scope nor the credential set. Viva issues these separately, under the same
            Settings → API Access page, as "Account Transactions credentials".
          */}
          <div className="mt-4 space-y-3 rounded-sm border border-hairline bg-surface-sunken p-3">
            <div>
              <h4 className="text-sm font-medium">Sending money</h4>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Paying suppliers out of your Viva balance needs a <strong>second</strong> client
                pair — Viva&rsquo;s <em>Account Transactions</em> credentials, from the same
                Settings&nbsp;→&nbsp;API&nbsp;Access page. The pair above takes card payments and
                cannot send. You also have to tick <em>Allow transfers between accounts</em> in the
                Viva banking app, or every transfer is refused.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Transfer Client ID{' '}
                  {status?.has_transfer_client_id && <span className="text-success">· saved</span>}
                </Label>
                <Input
                  value={transferClientId}
                  onChange={(e) => setTransferClientId(e.target.value)}
                  placeholder={status?.has_transfer_client_id ? 'leave blank to keep' : 'Account Transactions client id'}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Transfer Client Secret{' '}
                  {status?.has_transfer_client_secret && <span className="text-success">· saved</span>}
                </Label>
                <Input
                  type="password"
                  value={transferClientSecret}
                  onChange={(e) => setTransferClientSecret(e.target.value)}
                  placeholder={status?.has_transfer_client_secret ? 'leave blank to keep' : ''}
                  autoComplete="new-password"
                />
              </div>
            </div>
            {/*
              The verdict is DERIVED in SQL (`can_send_money`) and only formatted here. Saying
              "ready" off the presence of two text fields would be a second answer to the same
              question, and the one the server actually asks is the other one.
            */}
            <p className="text-[11px]">
              {status?.can_send_money ? (
                <span className="text-success">
                  Ready — a Viva account mapped to a wallet can send payments.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Not set up. Viva can take card payments but cannot send any.
                </span>
              )}
            </p>

            {/*
              THE SECOND HALF, and it is the one that gets forgotten.
              Credentials alone do not make an account able to send: `resolvePayoutSource` reads
              `finance_bank_accounts.viva_wallet_id`, so until a books account points at a wallet
              the payment dialog correctly refuses. The wallet list comes from the connection test,
              because listing wallets IS the test of these credentials.
            */}
            {testResult?.wallets && testResult.wallets.length > 0 && (
              <div className="space-y-2 border-t border-hairline pt-3">
                <Label className="text-xs">Pay from</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    className="h-9 w-full rounded-sm border border-hairline bg-card px-2 text-xs"
                    value={mapAccountId}
                    onChange={(e) => setMapAccountId(e.target.value)}
                  >
                    <option value="">— which of your accounts —</option>
                    {mappableAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.viva_wallet_id ? ` · wallet ${a.viva_wallet_id}` : ''}
                        {a.revolut_account_id ? ' · on Revolut' : ''}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 w-full rounded-sm border border-hairline bg-card px-2 text-xs"
                    value={mapWalletId}
                    onChange={(e) => setMapWalletId(e.target.value)}
                  >
                    <option value="">— which Viva wallet —</option>
                    {testResult.wallets.map((w) => (
                      <option key={w.walletId} value={String(w.walletId)}>
                        {w.friendlyName || `Wallet ${w.walletId}`}
                        {w.isPrimary ? ' (primary)' : ''}
                        {` · ${w.available.toFixed(2)}${w.currency ? ` ${w.currency}` : ''}`}
                      </option>
                    ))}
                  </select>
                </div>
                {/* An account already on a Revolut pocket must not silently become a Viva one:
                    the rail is derived from whichever id is set, so two would be ambiguous. */}
                {mappedAccountIsRevolut && (
                  <p className="text-[11px] text-destructive">
                    That account already sends through Revolut. Pick another, or unlink it there first.
                  </p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!mapAccountId || !mapWalletId || mappedAccountIsRevolut || saving}
                  onClick={() => void linkWallet()}
                >
                  Use this wallet
                </Button>
              </div>
            )}
          </div>

          <Button onClick={() => void save()} disabled={saving} size="sm">
            {saving && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
            Save credentials
          </Button>
        </div>

        {/* Step 3 — the manual webhook registration */}
        <div className="space-y-3 border-t border-border pt-5">
          <p className="text-sm font-medium flex items-center gap-2">
            3. Register the webhook in Viva
            {webhookReady ? (
              <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Verified
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Required</Badge>
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
            <Button variant="outline" size="sm" onClick={() => void copy(vivaWebhookUrl(workspaceId), 'Webhook URL copied')}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>

          <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
            <li>Open your Viva banking app → <strong>Settings → API Access → Webhooks</strong>.</li>
            <li>Create a webhook, paste the URL above, and press <strong>Verify</strong>.</li>
            <li>
              Viva registers <strong>one webhook per event type</strong>, so repeat with the same
              URL for each event below, picking a different Event Type each time.
            </li>
            <li>Set each to Active and save.</li>
          </ol>

          <div className="rounded-lg border border-border overflow-hidden">
            {VIVA_WEBHOOK_EVENTS.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 px-3 py-2 text-xs border-b border-border last:border-b-0">
                <code className="text-[11px] text-muted-foreground w-10 shrink-0">{ev.id}</code>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {ev.name}{' '}
                    {ev.required
                      ? <span className="text-warning font-normal">· required</span>
                      : <span className="text-muted-foreground font-normal">· optional</span>}
                  </p>
                  <p className="text-muted-foreground">{ev.purpose}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            <strong>Do not pick "Order Updated" (4865).</strong> It sounds like the payment event
            and is actually a cancellation notice — register it instead of 1796 and every payment
            will succeed at Viva while the invoice sits unpaid.
          </p>

          {/* Delivery health — what Viva ACTUALLY sends us, not what was configured */}
          <div className="rounded-lg bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-medium">Deliveries received</p>
            {deliveredIds.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Nothing yet. Expected until your first payment — a registered webhook stays
                silent until there is something to report.
              </p>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground">
                  Last delivery {formatWhen(status?.last_webhook_at ?? null)}.
                </p>
                <div className="space-y-1">
                  {deliveredIds.map((id) => {
                    const acted = ACTIONABLE_EVENT_IDS.includes(id);
                    return (
                      <div key={id} className="flex items-center gap-2 text-[11px]">
                        <code className="text-muted-foreground w-10 shrink-0">{id}</code>
                        <span className={acted ? 'text-foreground' : 'text-warning'}>
                          {VIVA_EVENT_LABELS[id] ?? 'Unknown event'}
                        </span>
                        <span className="text-muted-foreground">
                          · {deliveries[id]?.count ?? 0}×
                        </span>
                        {!acted && <span className="text-muted-foreground">· ignored</span>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {wrongEventRegistered && (
              <p className="text-[11px] text-destructive flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                <span>
                  Viva is delivering to us, but <strong>never event 1796</strong> — so no payment
                  can settle. {deliveredButIgnored.length > 0 && (
                    <>You appear to have registered {deliveredButIgnored.join(', ')} instead. </>
                  )}
                  Add <strong>Transaction Payment Created (1796)</strong> in Viva.
                </span>
              </p>
            )}
          </div>

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

        {/* Step 4 — prove it before a customer does */}
        <div className="space-y-3 border-t border-border pt-5">
          <p className="text-sm font-medium">4. Test the connection</p>
          <p className="text-xs text-muted-foreground">
            Runs your saved credentials against Viva for real: creates a 0.30 order on your
            payment source and reads it back. Nobody is charged, no customer sees anything, and
            the order expires in five minutes. This is the only check that catches a wrong
            source code before a customer's payment does.
          </p>
          <Button variant="outline" size="sm" onClick={() => void runTest()} disabled={testing || !credsReady}>
            {testing && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
            Test connection
          </Button>

          {testResult && (
            <div className="rounded-lg border border-border divide-y divide-border">
              {testResult.incomplete ? (
                <p className="text-xs text-warning px-3 py-2">{testResult.error}</p>
              ) : (
                testResult.checks.map((check) => (
                  <div key={check.key} className="flex items-start gap-2 px-3 py-2 text-xs">
                    {check.ok
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-px" />
                      : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-px" />}
                    <div className="min-w-0">
                      <p className="font-medium">{check.label}</p>
                      <p className="text-muted-foreground">{check.detail}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Step 5 — methods + go live */}
        <div className="space-y-3 border-t border-border pt-5">
          <p className="text-sm font-medium">5. Payment methods</p>
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
              <p className="text-sm">RF code (bank transfer) <span className="text-warning">— coming soon</span></p>
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

          <div className="flex items-center justify-between border-t border-border pt-4">
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

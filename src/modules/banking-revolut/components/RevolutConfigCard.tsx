/**
 * Revolut Business BYOK setup card (#315).
 *
 * Mounted in Profile → Keys (WorkspaceKeysTab) and on the banking-revolut module settings
 * page — one card, two entry points, no second implementation to drift.
 *
 * Setup is a strict ladder, and the card renders it as one:
 *   1. Generate keys   — the edge function mints the RSA pair; only the PUBLIC key is
 *                        shown here, for pasting into Revolut dashboard → Settings → API.
 *   2. Save client_id  — the dashboard hands it back after the key is added.
 *   3. Authorise       — full-page redirect to Revolut's consent screen; the callback
 *                        route exchanges the code and registers the webhook.
 *   4. Map accounts    — link each Revolut currency pocket to a Finance bank account so
 *                        synced transactions land against the right row.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Landmark, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  callRevolutApi,
  getRevolutStatus,
  revolutRedirectUri,
  saveRevolutConfig,
  type RevolutAccountInfo,
  type RevolutBankAccountRow,
  type RevolutConfigStatus,
  type RevolutEnvironment,
} from '../services/revolutConfigService';

interface Props {
  workspaceId: string;
}

export const RevolutConfigCard: React.FC<Props> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [status, setStatus] = useState<RevolutConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [environment, setEnvironment] = useState<RevolutEnvironment>('sandbox');
  const [revtag, setRevtag] = useState('');
  const [accounts, setAccounts] = useState<RevolutAccountInfo[] | null>(null);
  const [bankAccounts, setBankAccounts] = useState<RevolutBankAccountRow[]>([]);

  const refresh = useCallback(async () => {
    try {
      const s = await getRevolutStatus(workspaceId);
      setStatus(s);
      setEnvironment(s.environment);
    } catch (err) {
      toast({
        title: 'Could not load Revolut settings',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (err) {
      toast({
        title: `${label} failed`,
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const copy = (text: string, what: string) => {
    void navigator.clipboard.writeText(text);
    toast({ title: `${what} copied` });
  };

  const generateKeys = () =>
    run('Generate keys', async () => {
      await callRevolutApi('init', workspaceId, {
        redirect_uri: revolutRedirectUri(),
        force: status?.has_keypair ? true : undefined,
      });
      await refresh();
      toast({ title: 'Keypair generated', description: 'Paste the public key into the Revolut dashboard.' });
    });

  const saveSettings = () =>
    run('Save', async () => {
      await saveRevolutConfig(workspaceId, {
        client_id: clientId,
        environment,
        enabled: status?.enabled ?? true,
        revtag: revtag.replace(/^@/, ''),
      });
      setClientId('');
      await refresh();
      toast({ title: 'Revolut settings saved' });
    });

  const authorize = () =>
    run('Authorise', async () => {
      const out = await callRevolutApi<{ url: string }>('authorize-url', workspaceId);
      // Full-page redirect: the callback route completes the exchange and returns here.
      window.location.href = out.url;
    });

  const loadAccounts = () =>
    run('Load accounts', async () => {
      const out = await callRevolutApi<{ accounts: RevolutAccountInfo[]; bank_accounts: RevolutBankAccountRow[] }>(
        'accounts',
        workspaceId,
      );
      setAccounts(out.accounts);
      setBankAccounts(out.bank_accounts);
    });

  const mapAccount = (revolutAccountId: string, bankAccountId: string | null) =>
    run('Map account', async () => {
      await callRevolutApi('map-account', workspaceId, {
        revolut_account_id: revolutAccountId,
        bank_account_id: bankAccountId,
      });
      await loadAccounts();
      toast({ title: 'Account mapping updated' });
    });

  const syncNow = () =>
    run('Sync', async () => {
      const out = await callRevolutApi<{ fetched: number; upserted: number }>('sync-now', workspaceId);
      await refresh();
      toast({ title: 'Sync complete', description: `${out.fetched} transactions fetched.` });
    });

  const disconnect = () => {
    if (!window.confirm('Disconnect Revolut? The saved connection and webhook are removed and you will need to authorise again. Synced transactions are kept.')) return;
    return run('Disconnect', async () => {
      await callRevolutApi('disconnect', workspaceId);
      setAccounts(null);
      await refresh();
      toast({ title: 'Revolut disconnected' });
    });
  };

  if (loading || !status) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const stateWord = status.connected
    ? <span className="text-success">Connected</span>
    : status.configured
      ? <span className="text-warning">Awaiting authorisation</span>
      : <span className="text-muted-foreground">Not set up</span>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4" /> Revolut Business
          </CardTitle>
          <CardDescription>
            Bank feed and reconciliation from the workspace&apos;s own Revolut Business account. {stateWord}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="revolut-enabled" className="text-xs text-muted-foreground">Enabled</Label>
          <Switch
            id="revolut-enabled"
            checked={status.enabled}
            onCheckedChange={(v) =>
              run('Toggle', async () => {
                await saveRevolutConfig(workspaceId, { enabled: v });
                await refresh();
              })}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step 1 — keypair */}
        <div className="space-y-2">
          <div className="text-sm font-medium">1. Signing key</div>
          {status.has_keypair && status.public_key ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Add this certificate in Revolut dashboard → Settings → API, with redirect URI{' '}
                <code className="text-xs">{status.oauth_redirect_uri}</code>
                <Button variant="ghost" size="sm" className="ml-1 h-6 px-2" aria-label="Copy redirect URI" onClick={() => copy(status.oauth_redirect_uri ?? '', 'Redirect URI')}>
                  <Copy className="h-3 w-3" />
                </Button>
              </p>
              <div className="flex items-start gap-2">
                <pre className="max-h-24 flex-1 overflow-auto rounded-md bg-muted p-2 text-[10px] leading-tight">{status.public_key}</pre>
                <Button variant="outline" size="sm" onClick={() => copy(status.public_key ?? '', 'Certificate')}>
                  <Copy className="mr-1 h-3 w-3" /> Copy
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={generateKeys} disabled={busy !== null}>
              {busy === 'Generate keys' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Generate keys
            </Button>
          )}
        </div>

        {/* Step 2 — client id + environment */}
        <div className="space-y-2">
          <div className="text-sm font-medium">2. Application</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="revolut-client-id" className="text-xs">Client ID</Label>
              <Input
                id="revolut-client-id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={status.has_client_id ? `${status.client_id_hint ?? '••••••••'} (saved — leave blank to keep)` : 'From the Revolut dashboard after adding the key'}
              />
            </div>
            <div>
              <Label htmlFor="revolut-env" className="text-xs">Environment</Label>
              <Select value={environment} onValueChange={(v) => setEnvironment(v as RevolutEnvironment)}>
                <SelectTrigger id="revolut-env"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="revolut-revtag" className="text-xs">Revolut username (@revtag) — printed on invoices for instant in-app payment</Label>
              <Input
                id="revolut-revtag"
                value={revtag}
                onChange={(e) => setRevtag(e.target.value)}
                placeholder={status.revtag ? `@${status.revtag} (saved — leave blank to keep)` : '@yourbusiness'}
              />
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={saveSettings} disabled={busy !== null}>
            {busy === 'Save' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Save
          </Button>
        </div>

        {/* Step 3 — authorise */}
        <div className="space-y-2">
          <div className="text-sm font-medium">3. Authorise</div>
          {status.connected ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-success">Authorised</span>
              {status.webhook_ready
                ? <span className="text-success">· webhook active</span>
                : <span className="text-warning">· webhook missing</span>}
              <Button size="sm" variant="outline" disabled={busy !== null}
                onClick={() => run('Register webhook', async () => { await callRevolutApi('register-webhook', workspaceId); await refresh(); })}>
                {status.webhook_ready ? 'Re-register webhook' : 'Register webhook'}
              </Button>
              <Button size="sm" variant="outline" disabled={busy !== null}
                onClick={() => run('Sync labels', async () => {
                  const out = await callRevolutApi<{ created: number; total: number }>('sync-labels', workspaceId);
                  toast({ title: 'Labels synced', description: `${out.created} new label(s) of ${out.total} categories.` });
                })}>
                Sync labels
              </Button>
              <Button size="sm" variant="outline" onClick={syncNow} disabled={busy !== null}>
                {busy === 'Sync' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                Sync now
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={disconnect} disabled={busy !== null}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={authorize} disabled={busy !== null || !status.has_client_id || !status.has_keypair}>
              {busy === 'Authorise' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Authorise with Revolut
            </Button>
          )}
          {status.last_sync_error && (
            <p className="text-xs text-destructive">Last sync error: {status.last_sync_error}</p>
          )}
          {status.last_sync_at && !status.last_sync_error && (
            <p className="text-xs text-muted-foreground">Last synced {new Date(status.last_sync_at).toLocaleString()}</p>
          )}
        </div>

        {/* Step 4 — account mapping */}
        {status.connected && (
          <div className="space-y-2">
            <div className="text-sm font-medium">4. Account mapping</div>
            {accounts === null ? (
              <Button size="sm" variant="outline" onClick={loadAccounts} disabled={busy !== null}>
                {busy === 'Load accounts' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Load Revolut accounts
              </Button>
            ) : accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No accounts returned.</p>
            ) : (
              <div className="space-y-2">
                {accounts.map((a) => {
                  const mappedTo = bankAccounts.find((b) => b.revolut_account_id === a.id)?.id ?? '';
                  return (
                    <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-32 font-medium">{a.name || a.currency}</span>
                      <span className="text-muted-foreground">{a.balance.toFixed(2)} {a.currency}</span>
                      <Select value={mappedTo || 'none'} onValueChange={(v) => mapAccount(a.id, v === 'none' ? null : v)}>
                        <SelectTrigger aria-label={`Map ${a.name || a.currency} to a bank account`} className="h-9 w-48 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— not mapped —</SelectItem>
                          {bankAccounts.map((b) => (
                            <SelectItem key={b.id} value={b.id}>{b.name}{b.currency ? ` (${b.currency})` : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

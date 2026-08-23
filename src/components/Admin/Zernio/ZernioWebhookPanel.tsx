/**
 * Zernio delivery + plan headroom — the operator half of the social/WhatsApp integration.
 *
 * Mounted as a settings panel on BOTH the Social Media and Messaging modules, because one Zernio
 * account serves both and the webhook is registered once for the whole account. It lives here,
 * next to the Keys tab, because that is where an operator already is when they paste
 * ZERNIO_WEBHOOK_SECRET — the register button used to exist only inside the WhatsApp management
 * page, which is a tenant surface and is not reachable from the app menu at all.
 *
 * The secret is not something to copy out of Zernio: `ensureZernioWebhook` SENDS it as the signing
 * key when it registers. So the order is paste-then-register, and registering first would leave the
 * handler (which fails closed) rejecting every delivery until Zernio auto-disables the hook.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Webhook, Layers, AlertTriangle, CheckCircle2, Copy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import { messagingService } from '@/modules/messaging/services/messagingService';
import type { ZernioPlanStatus, ZernioWebhookStatus } from '@/modules/messaging/services/types';

export const ZernioWebhookPanel: React.FC = () => {
  const { toast } = useToast();
  const [webhook, setWebhook] = useState<ZernioWebhookStatus | null>(null);
  const [plan, setPlan] = useState<ZernioPlanStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  // Both reads hit Zernio, so an unset/invalid API key surfaces here rather than as a blank card.
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    // Settled, not all: the plan endpoint needs the analytics add-on on some tiers, and a plan
    // read that 402s must not blank the webhook status the operator came here for.
    const [w, p] = await Promise.allSettled([
      messagingService.getWebhookStatus(),
      messagingService.getPlanStatus(),
    ]);
    if (w.status === 'fulfilled') setWebhook(w.value);
    else setLoadError(w.reason instanceof Error ? w.reason.message : String(w.reason));
    setPlan(p.status === 'fulfilled' ? p.value : null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRegister = async () => {
    setRegistering(true);
    try {
      const status = await messagingService.registerWebhook();
      setWebhook(status);
      toast({
        title: 'Webhook registered',
        description: 'Zernio will now deliver post outcomes, comments and WhatsApp events.',
      });
    } catch (err) {
      toast({
        title: 'Could not register the webhook',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setRegistering(false);
    }
  };

  const copyUrl = async () => {
    if (!webhook?.url) return;
    await navigator.clipboard.writeText(webhook.url);
    toast({ title: 'Webhook URL copied' });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading Zernio…
        </CardContent>
      </Card>
    );
  }

  const missing = webhook?.missingEvents ?? [];
  const needsRepair = Boolean(webhook?.registered && (webhook.isActive === false || missing.length > 0));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-4 w-4" /> Event delivery
            </CardTitle>
            <CardDescription>
              Zernio posts here when something happens — a post publishes or fails, a comment
              arrives, an account disconnects, a WhatsApp number changes state. Without it those
              outcomes never reach the platform and a post stays &ldquo;scheduled&rdquo; forever.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadError && (
            <div className="flex items-start gap-2 rounded-sm border border-hairline bg-surface-sunken p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
              <div>
                <div className="font-medium">Could not reach Zernio</div>
                <div className="text-muted-foreground">{loadError}</div>
                <div className="text-muted-foreground mt-1">
                  Usually a missing or invalid <code className="font-mono">ZERNIO_API_KEY</code> — set it on the Keys tab.
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Status</span>
            {webhook?.registered
              ? <Badge variant={needsRepair ? 'warning' : 'success'}>
                  {webhook.isActive === false ? 'Disabled by Zernio' : needsRepair ? 'Needs repair' : 'Registered'}
                </Badge>
              : <Badge variant="error">Not registered</Badge>}
            <span className="text-sm text-muted-foreground">Signing secret</span>
            {webhook?.secretConfigured
              ? <Badge variant="success">Set</Badge>
              : <Badge variant="error">Missing</Badge>}
          </div>

          {!webhook?.secretConfigured && (
            <div className="rounded-sm border border-hairline bg-surface-sunken p-3 text-sm">
              <div className="font-medium">Set <code className="font-mono">ZERNIO_WEBHOOK_SECRET</code> first</div>
              <p className="text-muted-foreground mt-1">
                There is nothing to copy from Zernio — invent one (<code className="font-mono">openssl rand -hex 32</code>),
                save it on the Keys tab, then register below. Registering sends that value to Zernio as the
                signing key; the handler verifies every delivery against it and fails closed.
              </p>
            </div>
          )}

          {webhook?.url && (
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-sm bg-surface-sunken px-2 py-1.5 font-mono text-xs">
                {webhook.url}
              </code>
              <Button variant="ghost" size="sm" onClick={() => void copyUrl()} title="Copy URL">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}

          {webhook?.registered && (
            <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Last delivery</span>
                <span>{webhook.lastFiredAt ? formatDate(webhook.lastFiredAt, { withTime: true }) : '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Consecutive failures</span>
                <span className="tabular-nums">{webhook.failureCount ?? 0}</span>
              </div>
            </div>
          )}

          {missing.length > 0 && (
            <div className="rounded-sm border border-hairline bg-surface-sunken p-3 text-sm">
              <div className="font-medium">{missing.length} event{missing.length === 1 ? '' : 's'} not subscribed</div>
              <p className="text-muted-foreground mt-1">
                We branch on {missing.length === 1 ? 'it' : 'them'}, so {missing.length === 1 ? 'that branch is' : 'those branches are'} dead
                code until you repair the registration: <span className="font-mono text-xs">{missing.join(', ')}</span>
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={() => void handleRegister()} disabled={registering || !webhook?.secretConfigured}>
              {registering
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Registering…</>
                : webhook?.registered ? 'Repair registration' : 'Register webhook'}
            </Button>
            {webhook?.registered && !needsRepair && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" /> Subscribed to every event we handle
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4" /> Plan headroom
          </CardTitle>
          <CardDescription>
            Every workspace gets its OWN Zernio profile — that is what keeps one tenant&rsquo;s connected
            accounts, posts and analytics separate from another&rsquo;s. Run out of profiles and the next
            workspace silently shares the default one instead, while its connect still reports success.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!plan ? (
            <p className="text-sm text-muted-foreground">
              Plan usage is unavailable — Zernio did not answer, or the key is not set.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Plan</span>
                  <span>{plan.plan ?? '—'}{plan.status ? ` · ${plan.status}` : ''}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Workspaces mapped</span>
                  <span className="tabular-nums">{plan.workspacesMapped}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Profiles (= tenants)</span>
                  <span className="tabular-nums">
                    {plan.profiles.used} / {plan.profiles.limit ?? '∞'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Connected accounts</span>
                  <span className="tabular-nums">
                    {plan.accounts.used} / {plan.accounts.limit ?? '∞'}
                  </span>
                </div>
              </div>
              {plan.profileCeilingReached && (
                <div className="flex items-start gap-2 rounded-sm border border-hairline bg-surface-sunken p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--error))]" />
                  <div>
                    <div className="font-medium">Profile ceiling reached — tenant separation is at risk</div>
                    <p className="text-muted-foreground mt-1">
                      {plan.warning ?? 'The next workspace to connect an account will be put on the shared default profile.'}
                      {' '}Raise the profile limit on your Zernio plan before onboarding another tenant.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ZernioWebhookPanel;

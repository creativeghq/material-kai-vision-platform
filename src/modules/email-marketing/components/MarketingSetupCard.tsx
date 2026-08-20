/**
 * Email Marketing → Setup. A STATUS surface, not a second editor.
 *
 * The sender config lives in ONE place — Profile → Keys → Email (`/profile?tab=keys&section=email`),
 * the canonical home for every per-workspace BYOK credential. This card used to mount the same
 * `WorkspaceEmailConfigCard` a second time against the same `workspace_email_config` row, and the
 * duplication is what made it lie:
 *
 *   • It passed `requireOwnSender` unconditionally — in the activation gate AND in this settings
 *     tab — so "This is required to unlock Templates and Campaigns" kept showing after they were
 *     unlocked, as permanent copy rather than a one-time prompt.
 *   • `requireOwnSender` also SUPPRESSED the "platform default sender is active" box, which is the
 *     only thing on the page that says which address mail actually goes out from. On the operator's
 *     root workspace — exempt from BYOK, sending from the platform sender — that left a green
 *     "your Resend sender is configured" banner above a form with every field empty, and no
 *     explanation anywhere.
 *
 * So this states what a send resolves to RIGHT NOW, and links to the one place that changes it.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Mail, Send, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { emailService, isSenderNotConfigured } from '@/modules/email/services/emailService';

/** The one address that edits a workspace's Resend credentials. */
export const EMAIL_SENDER_SETTINGS_PATH = '/profile?tab=keys&section=email';

type Cfg = Awaited<ReturnType<typeof emailService.getWorkspaceConfig>>;

export const MarketingSetupCard: React.FC<{
  workspaceId: string;
  /** True when campaigns can send: own Resend, or the root workspace's platform sender. */
  byokReady: boolean;
  /** True when `byokReady` is satisfied by the PLATFORM sender rather than the workspace's own
   *  Resend — the operator's root workspace. Kept separate because the two are different facts
   *  and conflating them is what produced "configured" over an empty form. */
  platformExempt?: boolean;
}> = ({ workspaceId, byokReady, platformExempt = false }) => {
  const { toast } = useToast();
  const { can } = usePermissions();
  const canManage = can('finance.manage'); // matches the RLS on workspace_email_config
  const [cfg, setCfg] = useState<Cfg>(null);
  const [loading, setLoading] = useState(true);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const c = await emailService.getWorkspaceConfig(workspaceId).catch(() => null);
      if (cancelled) return;
      setCfg(c);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user?.email) setTestTo(data.user.email); });
  }, []);

  const sendTest = async () => {
    if (!testTo.trim()) { toast({ title: 'Enter a recipient', variant: 'destructive' }); return; }
    setTesting(true);
    try {
      await emailService.sendTestEmail(workspaceId, testTo.trim());
      toast({ title: 'Test email sent', description: `Check ${testTo.trim()} (and spam).` });
    } catch (err: any) {
      if (isSenderNotConfigured(err)) {
        toast({ title: 'Connect your email first', description: 'Add a Resend API key + verified sender in Profile → Keys → Email.', variant: 'destructive' });
      } else {
        toast({ title: 'Test failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
      }
    } finally { setTesting(false); }
  };

  if (loading) {
    return <Card><CardContent className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  const ownSender = cfg?.source === 'workspace';
  const senderLine = ownSender
    ? (cfg?.from_name ? `${cfg.from_name} <${cfg.from_email ?? ''}>` : cfg?.from_email ?? '')
    : (cfg?.platform_from_name ? `${cfg.platform_from_name} <${cfg.platform_from_email ?? ''}>` : cfg?.platform_from_email ?? '');

  return (
    <div className="space-y-4">
      {/* The banner states which sender is IN EFFECT — never "your own domain" when it is the
          platform's. Three distinct states, because they mean three different things. */}
      {ownSender ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Sending from your own Resend account.</p>
            <p className="text-xs text-muted-foreground">Campaigns go out from your verified domain, metered by your platform daily cap.</p>
          </div>
        </div>
      ) : platformExempt ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Sending from the platform sender.</p>
            <p className="text-xs text-muted-foreground">
              This is the operator workspace, so it is exempt from the bring-your-own-Resend rule that
              applies to tenants. Connect your own Resend only if you want campaigns to leave from a
              different domain.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Connect your Resend account to start sending.</p>
            <p className="text-xs text-muted-foreground">
              Bulk campaigns send only from <strong>your own</strong> verified Resend domain — there is no
              shared platform fallback for tenant campaigns.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email sender</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Recipients will see</span>
              <span className="text-muted-foreground">{ownSender ? 'Your Resend account' : 'Platform sender'}</span>
            </div>
            <div><code className="font-mono">{senderLine || '— not configured —'}</code></div>
            {(cfg?.reply_to || cfg?.platform_reply_to) && (
              <div>
                <span className="text-muted-foreground">Reply-to:</span>{' '}
                <code className="font-mono">{(ownSender ? cfg?.reply_to : cfg?.platform_reply_to) || senderLine}</code>
              </div>
            )}
          </div>

          {cfg?.effective_daily_limit != null && cfg.effective_daily_limit > 0 && (
            <p className="text-xs text-muted-foreground">
              Daily send limit: <strong>{cfg.sent_today}/{cfg.effective_daily_limit}</strong> used today. This cap is set by the platform.
            </p>
          )}

          {/* One editor, one address. Everything about the key, the from address, the name and the
              reply-to is set there — this tab reports, it does not duplicate. */}
          <div className="flex flex-wrap items-center gap-2">
            {canManage ? (
              <Button asChild size="sm" variant={byokReady ? 'outline' : 'default'}>
                <Link to={EMAIL_SENDER_SETTINGS_PATH}>
                  {ownSender ? 'Manage email sender' : 'Set up your Resend account'}
                  <ExternalLink className="h-3.5 w-3.5 ml-2" />
                </Link>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Your workspace's finance manager sets the email sender in Profile → Keys → Email.
              </p>
            )}
            <span className="text-[11px] text-muted-foreground">Profile → Keys → Email</span>
          </div>

          {byokReady && (
            <div className="border-t border-border/60 pt-4 space-y-1.5">
              <Label className="text-xs">Send a test email</Label>
              <div className="flex items-center gap-2">
                <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" type="email" className="flex-1" />
                <Button size="sm" variant="outline" onClick={sendTest} disabled={testing} className="shrink-0">
                  {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Send test
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Goes out through the sender shown above — the same path a campaign takes.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

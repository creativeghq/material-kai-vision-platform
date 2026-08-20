/**
 * Per-workspace Resend BYOK config. A workspace can bring its OWN Resend API key + verified
 * sender so its mail (invoices, statements, quotes, catalog sends) goes out from its own
 * account/domain. When unset, sends fall back to the platform sender.
 *
 * Finance-manager-gated; the API key is stored in workspace_email_config and never returned to
 * the browser (only `has_api_key`). The daily send cap is platform-controlled and shown
 * read-only here.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Badge } from '@/components/core/ui/badge';
import { Loader2, Save, Mail, ExternalLink, ShieldCheck, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { emailService, isSenderNotConfigured } from '@/modules/email/services/emailService';

export const WorkspaceEmailConfigCard: React.FC<{ workspaceId: string; onSaved?: () => void; requireOwnSender?: boolean }> = ({ workspaceId, onSaved, requireOwnSender = false }) => {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [limit, setLimit] = useState<number | null>(null);
  const [sentToday, setSentToday] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  // Set when sends currently resolve to the platform default sender (no own Resend in effect).
  const [platformSender, setPlatformSender] = useState<{ email: string | null; name: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const c = await emailService.getWorkspaceConfig(workspaceId).catch(() => null);
      if (cancelled) return;
      setFromEmail(c?.from_email ?? '');
      setFromName(c?.from_name ?? '');
      setReplyTo(c?.reply_to ?? '');
      setApiKey('');
      setHasKey(!!c?.has_api_key);
      setEnabled(c?.enabled ?? true);
      setLimit(c?.effective_daily_limit ?? null);
      setSentToday(c?.sent_today ?? 0);
      setPlatformSender(c?.source === 'platform' ? { email: c.platform_from_email, name: c.platform_from_name } : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  // Prefill the test recipient with the signed-in user's email.
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
        toast({ title: 'Connect your email first', description: 'Save a Resend API key + verified sender above, then test.', variant: 'destructive' });
      } else {
        toast({ title: 'Test failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
      }
    } finally { setTesting(false); }
  };

  const save = async () => {
    if (!fromEmail.trim()) {
      toast({ title: 'Sender email required', description: 'Enter the verified sender address on your Resend domain.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await emailService.saveWorkspaceConfig(workspaceId, {
        apiKey: apiKey.trim() || undefined,
        fromEmail: fromEmail.trim(),
        fromName: fromName.trim() || null,
        replyTo: replyTo.trim() || null,
        enabled,
      });
      if (apiKey.trim()) setHasKey(true);
      setApiKey('');
      toast({ title: 'Email settings saved' });
      onSaved?.();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <Card><CardContent className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email Sender (Bring Your Own Resend)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        {/* The platform default sender only applies to TRANSACTIONAL email (invoices/statements/
            quotes/catalog). In a BYOK-required context (Email Marketing #255 — bulk campaigns send
            ONLY from the workspace's own verified Resend), suppress the "nothing to set up" box so
            it doesn't contradict the "add your own Resend to activate" prompt. */}
        {!requireOwnSender && platformSender && (platformSender.email || platformSender.name) && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-medium">Platform default sender is active</span>
              <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">In use</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Your emails currently go out as{' '}
              <code className="font-mono">{platformSender.name ? `${platformSender.name} <${platformSender.email ?? ''}>` : platformSender.email}</code>.
              Nothing to set up — add your own Resend below only to send from your own domain instead.
            </p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {requireOwnSender ? (
            <>
              Bulk campaigns send only from <strong>your own</strong>{' '}
              <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
                Resend account <ExternalLink className="h-3 w-3" />
              </a>{' '}— paste a Resend API key and a sender address on a domain you've verified in Resend. This is required to unlock Templates and Campaigns.
            </>
          ) : (
            <>
              Optionally send your invoices, statements, quotes and catalog emails from <strong>your own</strong>{' '}
              <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
                Resend account <ExternalLink className="h-3 w-3" />
              </a>{' '}— paste a Resend API key and a sender address on a domain you've verified in Resend. Leave blank to use the platform default sender.
            </>
          )}
        </p>
        <div className="space-y-1">
          <Label className="text-xs">Resend API Key</Label>
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="new-password" placeholder={hasKey ? '•••••••• (configured — leave blank to keep)' : 're_...'} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From email</Label>
            <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="billing@yourdomain.com" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From name <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your Company" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Reply-to <span className="text-muted-foreground">(optional)</span></Label>
          <Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="Same as From email" type="email" />
          <p className="text-[11px] text-muted-foreground">
            Where customer replies go. Leave blank to reply to the From email. Applied to every email
            you send — quotes, invoices, statements, catalog and campaigns.
          </p>
        </div>
        {/* What the recipient actually sees on the message. */}
        {fromEmail.trim() && (
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs space-y-0.5">
            <div className="text-muted-foreground">Recipients will see:</div>
            <div><span className="text-muted-foreground">From:</span>{' '}
              <code className="font-mono">{fromName.trim() ? `${fromName.trim()} <${fromEmail.trim()}>` : fromEmail.trim()}</code></div>
            <div><span className="text-muted-foreground">Reply-to:</span>{' '}
              <code className="font-mono">{replyTo.trim() || fromEmail.trim()}</code></div>
          </div>
        )}
        <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
          <div className="text-sm">Use my Resend account</div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        {limit != null && (
          <p className="text-xs text-muted-foreground">
            Daily send limit: <strong>{sentToday}/{limit}</strong> used today. This cap is set by the platform.
          </p>
        )}
        <div>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save
          </Button>
        </div>

        {/* Test send — verifies the saved sender end-to-end (uses BYOK when configured). */}
        <div className="border-t border-border/60 pt-3 space-y-1.5">
          <Label className="text-xs">Send a test email</Label>
          <div className="flex items-center gap-2">
            <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" type="email" className="flex-1" />
            <Button size="sm" variant="outline" onClick={sendTest} disabled={testing} className="shrink-0">
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Send test
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Sends using your saved sender above. Save first if you just changed the key.</p>
        </div>
      </CardContent>
    </Card>
  );
};

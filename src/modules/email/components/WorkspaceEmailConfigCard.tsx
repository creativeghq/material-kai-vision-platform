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
import { Loader2, Save, Mail, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { emailService } from '@/modules/email/services/emailService';

export const WorkspaceEmailConfigCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [limit, setLimit] = useState<number | null>(null);
  const [sentToday, setSentToday] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const c = await emailService.getWorkspaceConfig(workspaceId).catch(() => null);
      if (cancelled) return;
      setFromEmail(c?.from_email ?? '');
      setFromName(c?.from_name ?? '');
      setApiKey('');
      setHasKey(!!c?.has_api_key);
      setEnabled(c?.enabled ?? true);
      setLimit(c?.effective_daily_limit ?? null);
      setSentToday(c?.sent_today ?? 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

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
        enabled,
      });
      if (apiKey.trim()) setHasKey(true);
      setApiKey('');
      toast({ title: 'Email settings saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <Card><CardContent className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-sm flex items-center gap-2"><Mail className="h-4 w-4" /> Email Sender (Bring Your Own Resend)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Optionally send your invoices, statements, quotes and catalog emails from <strong>your own</strong>{' '}
          <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
            Resend account <ExternalLink className="h-3 w-3" />
          </a>{' '}— paste a Resend API key and a sender address on a domain you've verified in Resend. Leave blank to use the platform default sender.
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
          <Button size="sm" onClick={save} disabled={saving} className="rounded-full">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

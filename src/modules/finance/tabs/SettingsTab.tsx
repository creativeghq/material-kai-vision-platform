import React, { useEffect, useRef, useState } from 'react';
import { Save, Upload, Loader2, ImageIcon, Mail, Send, ExternalLink, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Switch } from '@/components/core/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { financeService, type FinanceSettings } from '@/modules/finance/services/financeService';

interface Props { workspaceId: string; onSettingsChanged: (s: FinanceSettings) => void }

export const SettingsTab: React.FC<Props> = ({ workspaceId, onSettingsChanged }) => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'cover' | 'footer' | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [footerPreviewUrl, setFooterPreviewUrl] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const footerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void load(); }, [workspaceId]);

  const load = async () => {
    try {
      setLoading(true);
      const s = await financeService.getSettings(workspaceId);
      setSettings(s);
      onSettingsChanged(s);
      await refreshPreview(s);
    } catch (err: any) {
      toast({ title: 'Failed to load settings', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const refreshPreview = async (s: FinanceSettings) => {
    if (s.statement_template_cover_path) {
      const { data } = await supabase.storage.from('quote-templates').createSignedUrl(s.statement_template_cover_path, 60 * 60);
      setCoverPreviewUrl(data?.signedUrl ?? null);
    } else {
      setCoverPreviewUrl(null);
    }
    if (s.statement_template_footer_path) {
      const { data } = await supabase.storage.from('quote-templates').createSignedUrl(s.statement_template_footer_path, 60 * 60);
      setFooterPreviewUrl(data?.signedUrl ?? null);
    } else {
      setFooterPreviewUrl(null);
    }
  };

  const set = <K extends keyof FinanceSettings>(key: K, value: FinanceSettings[K]) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  const save = async () => {
    if (!settings) return;
    try {
      setSaving(true);
      const updated = await financeService.updateSettings(workspaceId, {
        statements_enabled: settings.statements_enabled,
        statement_email_subject: settings.statement_email_subject,
        statement_email_body: settings.statement_email_body,
        default_payment_terms_days: settings.default_payment_terms_days,
        default_vat_rate: settings.default_vat_rate,
      });
      setSettings(updated);
      onSettingsChanged(updated);
      toast({ title: 'Settings saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const upload = async (kind: 'cover' | 'footer', file: File) => {
    if (!settings) return;
    if (!/^image\/(png|jpeg|jpg)$/.test(file.type)) {
      toast({ title: 'Only PNG or JPG', variant: 'destructive' }); return;
    }
    try {
      setUploading(kind);
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const path = `statement/${workspaceId}-${kind}.${ext}`;
      const { error: upErr } = await supabase.storage.from('quote-templates').upload(path, file, {
        upsert: true, contentType: file.type,
      });
      if (upErr) throw upErr;
      const updated = await financeService.updateSettings(workspaceId, {
        [kind === 'cover' ? 'statement_template_cover_path' : 'statement_template_footer_path']: path,
      });
      setSettings(updated);
      onSettingsChanged(updated);
      await refreshPreview(updated);
      toast({ title: `${kind === 'cover' ? 'Cover' : 'Footer'} uploaded` });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.message, variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  const clearImage = async (kind: 'cover' | 'footer') => {
    if (!settings) return;
    try {
      const updated = await financeService.updateSettings(workspaceId, {
        [kind === 'cover' ? 'statement_template_cover_path' : 'statement_template_footer_path']: null,
      });
      setSettings(updated);
      onSettingsChanged(updated);
      await refreshPreview(updated);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    }
  };

  if (loading || !settings) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3"><CardTitle className="text-sm">Module settings</CardTitle></CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
            <div>
              <div className="text-sm font-medium">Account statements</div>
              <p className="text-xs text-muted-foreground">When enabled, you can email customers and suppliers a PDF statement of their open invoices/bills with the running balance.</p>
            </div>
            <Switch checked={settings.statements_enabled} onCheckedChange={(v) => set('statements_enabled', v)} />
          </div>

          <div className="space-y-1">
            <Label>Default email subject</Label>
            <Input value={settings.statement_email_subject ?? ''} onChange={(e) => set('statement_email_subject', e.target.value)} placeholder="Your account statement" />
          </div>

          <div className="space-y-1">
            <Label>Default email body</Label>
            <Textarea rows={4} value={settings.statement_email_body ?? ''} onChange={(e) => set('statement_email_body', e.target.value)} placeholder="Optional intro text shown above the PDF link." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Default payment terms (days)</Label>
              <Input type="number" min="0" value={settings.default_payment_terms_days}
                onChange={(e) => set('default_payment_terms_days', parseInt(e.target.value, 10) || 0)} />
            </div>
            <div className="space-y-1">
              <Label>Default VAT %</Label>
              <Input type="number" step="0.01" min="0" value={settings.default_vat_rate}
                onChange={(e) => set('default_vat_rate', parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3"><CardTitle className="text-sm">Statement PDF design</CardTitle></CardHeader>
        <CardContent className="space-y-4 p-5">
          <p className="text-xs text-muted-foreground">
            Same dimensions as quote PDFs: A4 (595 × 842 pt). The statement table renders on top of these backdrops. PNG or JPG.
          </p>

          <BackdropSlot
            title="Cover / page backdrop"
            previewUrl={coverPreviewUrl}
            uploading={uploading === 'cover'}
            onPick={() => coverInputRef.current?.click()}
            onClear={() => clearImage('cover')}
          />
          <input ref={coverInputRef} type="file" accept="image/png,image/jpeg" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload('cover', f); e.target.value = ''; }} />

          <BackdropSlot
            title="Footer (optional)"
            previewUrl={footerPreviewUrl}
            uploading={uploading === 'footer'}
            onPick={() => footerInputRef.current?.click()}
            onClear={() => clearImage('footer')}
          />
          <input ref={footerInputRef} type="file" accept="image/png,image/jpeg" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload('footer', f); e.target.value = ''; }} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle className="text-sm flex items-center gap-2"><Mail className="h-4 w-4" /> Finance digest</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <DigestPanel
            settings={settings}
            onPatch={(p) => setSettings({ ...settings, ...p })}
            onSave={save}
            saving={saving}
            workspaceId={workspaceId}
          />
        </CardContent>
      </Card>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Digest panel — toggle, frequency, day/hour, recipient list, send-now.
// ─────────────────────────────────────────────────────────────────

const DAY_OPTIONS = [
  { v: 0, label: 'Sunday' }, { v: 1, label: 'Monday' }, { v: 2, label: 'Tuesday' },
  { v: 3, label: 'Wednesday' }, { v: 4, label: 'Thursday' }, { v: 5, label: 'Friday' }, { v: 6, label: 'Saturday' },
];

interface DigestPanelProps {
  settings: FinanceSettings;
  onPatch: (p: Partial<FinanceSettings>) => void;
  onSave: () => Promise<void>;
  saving: boolean;
  workspaceId: string;
}

const DigestPanel: React.FC<DigestPanelProps> = ({ settings, onPatch, onSave, saving, workspaceId }) => {
  const { toast } = useToast();
  const [newRecipient, setNewRecipient] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState<'configured' | 'test' | null>(null);

  const recipients = settings.digest_recipients ?? [];

  const addRecipient = () => {
    const email = newRecipient.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: 'Not a valid email', variant: 'destructive' }); return;
    }
    if (recipients.includes(email)) return;
    onPatch({ digest_recipients: [...recipients, email] });
    setNewRecipient('');
  };

  const removeRecipient = (email: string) => {
    onPatch({ digest_recipients: recipients.filter((r) => r !== email) });
  };

  const sendNow = async (mode: 'configured' | 'test') => {
    try {
      setSending(mode);
      const override = mode === 'test'
        ? (testEmail.trim() ? [testEmail.trim()] : undefined)
        : undefined;
      if (mode === 'test' && !override) {
        toast({ title: 'Enter a test email', variant: 'destructive' });
        setSending(null);
        return;
      }
      const res = await financeService.sendDigestNow({ workspaceId, recipientsOverride: override });
      if (res.ok) {
        toast({
          title: `Digest sent to ${res.recipients_delivered}/${res.recipients_attempted}`,
          description: res.errors.length > 0 ? res.errors.join('; ') : undefined,
          variant: res.errors.length > 0 ? 'destructive' : 'default',
        });
      } else {
        toast({
          title: 'Send failed',
          description: res.errors.join('; ') || 'No recipients delivered',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSending(null);
    }
  };

  return (
    <>
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        <div className="flex-1">
          <div className="font-medium text-foreground">Composed from the platform pieces</div>
          <p className="mt-0.5 text-muted-foreground leading-snug">
            Layout lives in the <strong>finance.digest</strong> email template (edit in Email → Templates).
            Schedule lives in the <strong>Finance digest</strong> flow (edit cron in Flows).
            Per-workspace recipients, frequency, hour and on/off live here.
          </p>
          <div className="mt-2 flex gap-2">
            <Link to="/admin/flows" className="inline-flex items-center gap-1 text-primary hover:underline">
              Open flow editor <ExternalLink className="h-3 w-3" />
            </Link>
            <span className="text-muted-foreground">·</span>
            <Link to="/admin/email-templates" className="inline-flex items-center gap-1 text-primary hover:underline">
              Edit template design <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
        <div>
          <div className="text-sm font-medium">Internal digest emails</div>
          <p className="text-xs text-muted-foreground">
            AR, AP, cash-flow forecast, top open balances, planned payments. Goes to the recipients you list below.
          </p>
        </div>
        <Switch checked={settings.digest_enabled} onCheckedChange={(v) => onPatch({ digest_enabled: v })} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Frequency</Label>
          <Select value={settings.digest_frequency} onValueChange={(v) => onPatch({ digest_frequency: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly (1st of month)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {settings.digest_frequency === 'weekly' && (
          <div className="space-y-1">
            <Label>Day of week</Label>
            <Select
              value={settings.digest_day_of_week == null ? '1' : String(settings.digest_day_of_week)}
              onValueChange={(v) => onPatch({ digest_day_of_week: parseInt(v, 10) })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map((d) => <SelectItem key={d.v} value={String(d.v)}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label>Hour (UTC, 0–23)</Label>
          <Input type="number" min="0" max="23" value={settings.digest_hour_utc}
            onChange={(e) => onPatch({ digest_hour_utc: Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)) })} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Recipients</Label>
        {recipients.length === 0 ? (
          <p className="text-xs text-muted-foreground">No recipients yet. Add one below.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {recipients.map((r) => (
              <div key={r} className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs">
                <span>{r}</span>
                <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeRecipient(r)}>×</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input placeholder="finance@yourcompany.com" value={newRecipient} onChange={(e) => setNewRecipient(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRecipient(); } }} />
          <Button type="button" variant="outline" onClick={addRecipient}>Add</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onSave} disabled={saving} variant="default">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save digest settings
        </Button>
        <Button
          onClick={() => sendNow('configured')}
          disabled={sending !== null || recipients.length === 0}
          variant="outline"
        >
          {sending === 'configured' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Send now to recipients
        </Button>
      </div>

      <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
        <div className="text-xs font-medium">Preview / test</div>
        <div className="flex gap-2">
          <Input placeholder="your@email.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
          <Button type="button" variant="outline" onClick={() => sendNow('test')} disabled={sending !== null}>
            {sending === 'test' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Send test
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Sends the live digest right now to the address you type — without changing recipients or the next-send schedule.
        </p>
      </div>

      {settings.digest_last_sent_at && (
        <p className="text-[11px] text-muted-foreground">
          Last sent: {new Date(settings.digest_last_sent_at).toLocaleString()}
        </p>
      )}
    </>
  );
};

const BackdropSlot: React.FC<{
  title: string; previewUrl: string | null; uploading: boolean;
  onPick: () => void; onClear: () => void;
}> = ({ title, previewUrl, uploading, onPick, onClear }) => (
  <div className="space-y-2">
    <Label>{title}</Label>
    <div className="overflow-hidden rounded-md border border-border/60 bg-muted/20">
      {previewUrl ? (
        <img src={previewUrl} alt={title} className="block w-full max-h-[280px] object-contain" />
      ) : (
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
          <ImageIcon className="h-4 w-4 mr-2" /> No image uploaded
        </div>
      )}
    </div>
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={onPick} disabled={uploading}>
        {uploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
        {previewUrl ? 'Replace' : 'Upload'}
      </Button>
      {previewUrl && <Button size="sm" variant="ghost" onClick={onClear}>Remove</Button>}
    </div>
  </div>
);

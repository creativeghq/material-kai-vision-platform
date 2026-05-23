import React, { useEffect, useRef, useState } from 'react';
import { Save, Upload, Loader2, ImageIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Switch } from '@/components/core/ui/switch';
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
    </div>
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

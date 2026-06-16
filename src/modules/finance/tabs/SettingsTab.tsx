import React, { useEffect, useRef, useState } from 'react';
import { Save, Upload, Loader2, ImageIcon, Mail, Send, ExternalLink, Info, SlidersHorizontal, Building2, FileText, Tag, CreditCard, Wrench, Users, Tags, Store, FileSignature } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Switch } from '@/components/core/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { financeService, type FinanceSettings } from '@/modules/finance/services/financeService';
import { PaymentRoutingCard } from '@/modules/finance/components/PaymentRoutingCard';
import { BusinessIdentityCard } from '@/modules/finance/components/BusinessIdentityCard';
import { DocumentSetupCard } from '@/modules/finance/components/DocumentSetupCard';
import { PricingRulesCard } from '@/modules/finance/components/PricingRulesCard';
import { ServicesCard } from '@/modules/finance/components/ServicesCard';
import { TeamInviteCard } from '@/modules/finance/components/TeamInviteCard';
import { InboundSetupCard } from '@/modules/finance/components/InboundSetupCard';
import { CategoriesCard } from '@/modules/finance/components/CategoriesCard';
import { BranchesCard } from '@/modules/finance/components/BranchesCard';
import { PosTerminalsCard } from '@/modules/finance/components/PosTerminalsCard';
import { StorefrontCard } from '@/modules/finance/components/StorefrontCard';
import { MembersCard } from '@/modules/finance/components/MembersCard';
import { EInvoicingCard } from '@/modules/finance/components/EInvoicingCard';

interface Props { workspaceId: string; onSettingsChanged: (s: FinanceSettings) => void }

const SETTINGS_SECTIONS = [
  { value: 'general', label: 'General', icon: SlidersHorizontal },
  { value: 'identity', label: 'Business Identity', icon: Building2 },
  { value: 'documents', label: 'Documents', icon: FileText },
  { value: 'einvoicing', label: 'e-Invoicing', icon: FileSignature },
  { value: 'pricing', label: 'Pricing', icon: Tag },
  { value: 'categories', label: 'Categories', icon: Tags },
  { value: 'services', label: 'Services', icon: Wrench },
  { value: 'team', label: 'Team', icon: Users },
  { value: 'storefront', label: 'Online Store', icon: Store },
  { value: 'statements', label: 'Statement PDF', icon: ImageIcon },
  { value: 'digest', label: 'Finance Digest', icon: Mail },
  { value: 'payments', label: 'Payments', icon: CreditCard },
] as const;

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
        default_markup_pct: settings.default_markup_pct,
        auto_statement_enabled: settings.auto_statement_enabled,
        auto_statement_frequency: settings.auto_statement_frequency,
        auto_statement_interval_days: settings.auto_statement_interval_days,
        auto_statement_day_of_week: settings.auto_statement_day_of_week,
        auto_statement_day_of_month: settings.auto_statement_day_of_month,
        auto_statement_hour_utc: settings.auto_statement_hour_utc,
        auto_statement_only_outstanding: settings.auto_statement_only_outstanding,
        auto_statement_min_balance: settings.auto_statement_min_balance,
        auto_statement_side: settings.auto_statement_side,
        risk_block_inactive_vat: settings.risk_block_inactive_vat,
        risk_block_unvalidated_vat: settings.risk_block_unvalidated_vat,
        risk_warn_over_credit_limit: settings.risk_warn_over_credit_limit,
        risk_block_over_credit_limit: settings.risk_block_over_credit_limit,
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
    <Tabs defaultValue="general" className="space-y-4">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
        {SETTINGS_SECTIONS.map((s) => (
          <TabsTrigger
            key={s.value}
            value={s.value}
            className="flex items-center gap-2"
          >
            <s.icon className="h-4 w-4" /> {s.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="w-full min-w-0 space-y-4">
        <TabsContent value="identity" className="mt-0">
          <BusinessIdentityCard workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="documents" className="mt-0 space-y-4">
          <BranchesCard workspaceId={workspaceId} />
          <DocumentSetupCard workspaceId={workspaceId} />
          <PosTerminalsCard workspaceId={workspaceId} />
          <InboundSetupCard workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="einvoicing" className="mt-0">
          <EInvoicingCard workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="pricing" className="mt-0">
          <PricingRulesCard workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="categories" className="mt-0">
          <CategoriesCard workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="services" className="mt-0">
          <ServicesCard workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="team" className="mt-0 space-y-4">
          <MembersCard workspaceId={workspaceId} />
          <TeamInviteCard workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="storefront" className="mt-0">
          <StorefrontCard workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="payments" className="mt-0">
          <PaymentRoutingCard workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="general" className="mt-0">
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3"><CardTitle className="text-sm">Module Settings</CardTitle></CardHeader>
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

          {/* Automatic per-customer statement schedule (off by default) */}
          <div className="rounded-md border border-border/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Automatic customer statements</div>
                <p className="text-xs text-muted-foreground">
                  Email each customer their own ledger statement on a schedule. Off by default — nothing sends until you turn this on. Customers can be excluded per-party from their CRM record.
                </p>
              </div>
              <Switch
                checked={settings.auto_statement_enabled}
                disabled={!settings.statements_enabled}
                onCheckedChange={(v) => set('auto_statement_enabled', v)}
              />
            </div>

            {settings.auto_statement_enabled && (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Frequency</Label>
                    <Select value={settings.auto_statement_frequency} onValueChange={(v) => set('auto_statement_frequency', v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="every_n_days">Every N days</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly (day of month)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {settings.auto_statement_frequency === 'every_n_days' && (
                    <div className="space-y-1">
                      <Label>Interval (days)</Label>
                      <Input type="number" min="1" value={settings.auto_statement_interval_days ?? 30}
                        onChange={(e) => set('auto_statement_interval_days', Math.max(1, parseInt(e.target.value, 10) || 30))} />
                    </div>
                  )}
                  {settings.auto_statement_frequency === 'weekly' && (
                    <div className="space-y-1">
                      <Label>Day of week</Label>
                      <Select value={String(settings.auto_statement_day_of_week ?? 1)} onValueChange={(v) => set('auto_statement_day_of_week', parseInt(v, 10))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
                            <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {settings.auto_statement_frequency === 'monthly' && (
                    <div className="space-y-1">
                      <Label>Day of month (1–28)</Label>
                      <Input type="number" min="1" max="28" value={settings.auto_statement_day_of_month}
                        onChange={(e) => set('auto_statement_day_of_month', Math.min(28, Math.max(1, parseInt(e.target.value, 10) || 1)))} />
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label>Hour (UTC, 0–23)</Label>
                    <Input type="number" min="0" max="23" value={settings.auto_statement_hour_utc}
                      onChange={(e) => set('auto_statement_hour_utc', Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))} />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Send to</Label>
                    <Select value={settings.auto_statement_side} onValueChange={(v) => set('auto_statement_side', v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customer">Customers</SelectItem>
                        <SelectItem value="supplier">Suppliers</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Minimum balance</Label>
                    <Input type="number" step="0.01" min="0" value={settings.auto_statement_min_balance}
                      onChange={(e) => set('auto_statement_min_balance', parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch checked={settings.auto_statement_only_outstanding} onCheckedChange={(v) => set('auto_statement_only_outstanding', v)} />
                      Only customers with an outstanding balance
                    </label>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Statements cover the current calendar year. Runs hourly; each workspace fires once when its scheduled hour + day match.
                  {settings.auto_statement_last_run_at && ` Last run: ${new Date(settings.auto_statement_last_run_at).toLocaleString()}.`}
                </p>
              </>
            )}
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

          <div className="space-y-1">
            <Label>Default catalog markup %</Label>
            <Input type="number" step="0.5" min="0" value={settings.default_markup_pct ?? 0}
              onChange={(e) => set('default_markup_pct', parseFloat(e.target.value) || 0)} />
            <p className="text-[11px] text-muted-foreground">
              Blanket sell uplift applied over your cost when you add a catalog product to a quote (you can still edit each line).
            </p>
          </div>

          {/* Buyer risk checks enforced at invoice issuance (ΑΑΔΕ status + credit limit). */}
          <div className="rounded-md border border-border/60 p-3 space-y-3">
            <div>
              <div className="text-sm font-medium">Buyer risk checks</div>
              <p className="text-xs text-muted-foreground">
                Checked when you issue an invoice against a CRM customer. Uses the buyer's AADE status and credit limit (set per-company in CRM).
              </p>
            </div>
            <label className="flex items-center justify-between gap-3">
              <span className="text-xs">Block issuance when the buyer VAT number is <strong>AADE-inactive</strong></span>
              <Switch checked={settings.risk_block_inactive_vat} onCheckedChange={(v) => set('risk_block_inactive_vat', v)} />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-xs">Block issuance when the buyer VAT was <strong>never validated</strong> <span className="text-muted-foreground">(stricter)</span></span>
              <Switch checked={settings.risk_block_unvalidated_vat} onCheckedChange={(v) => set('risk_block_unvalidated_vat', v)} />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-xs"><strong>Warn</strong> when the invoice pushes the buyer over their credit limit</span>
              <Switch checked={settings.risk_warn_over_credit_limit} onCheckedChange={(v) => set('risk_warn_over_credit_limit', v)} />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-xs"><strong>Block</strong> (instead of warn) when over the credit limit</span>
              <Switch checked={settings.risk_block_over_credit_limit} onCheckedChange={(v) => set('risk_block_over_credit_limit', v)} />
            </label>
          </div>

          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save settings
          </Button>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="statements" className="mt-0">
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3"><CardTitle className="text-sm">Statement PDF Design</CardTitle></CardHeader>
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
        </TabsContent>

        <TabsContent value="digest" className="mt-0">
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle className="text-sm flex items-center gap-2"><Mail className="h-4 w-4" /> Finance Digest</CardTitle>
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
        </TabsContent>
      </div>
    </Tabs>
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

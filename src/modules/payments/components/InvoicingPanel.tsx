/**
 * Invoicing settings — built-in invoice provider configuration.
 *
 * Conditionally deactivated: when an ERP module (e.g. a future Xero/QB) is
 * enabled with `provides_invoicing=true`, this panel shows a banner explaining
 * that the ERP is the active provider and these settings are inactive. The
 * settings rows still exist in the DB so toggling the ERP off re-activates
 * everything — no data loss.
 *
 * Manages: numbering format + sequence, invoice template uploads.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2,
  Save,
  AlertTriangle,
  Hash,
  Image as ImageIcon,
  ExternalLink,
  Upload,
  X as XIcon,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useInvoiceProvider } from '../services/invoiceProviderService';

interface Props { embedded?: boolean }

interface InvoiceFields {
  invoice_number_prefix: string;
  invoice_next_number: number;
  invoice_number_pad: number;
  default_payment_terms_days: number;
  default_vat_rate: number;
  invoice_template_cover_path: string | null;
  invoice_template_footer_path: string | null;
}

const DEFAULTS: InvoiceFields = {
  invoice_number_prefix: 'INV-',
  invoice_next_number: 1,
  invoice_number_pad: 6,
  default_payment_terms_days: 30,
  default_vat_rate: 24,
  invoice_template_cover_path: null,
  invoice_template_footer_path: null,
};

const TEMPLATE_BUCKET = 'quote-templates';
const COVER_OBJECT = 'invoice-cover.png';
const FOOTER_OBJECT = 'invoice-footer.png';

export const InvoicingPanel: React.FC<Props> = (_props) => {
  const { toast } = useToast();
  const provider = useInvoiceProvider();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [fields, setFields] = useState<InvoiceFields>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [footerPreviewUrl, setFooterPreviewUrl] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingFooter, setUploadingFooter] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const footerInputRef = useRef<HTMLInputElement>(null);

  const refreshSignedUrl = async (path: string | null, setter: (s: string | null) => void) => {
    if (!path) { setter(null); return; }
    const { data } = await supabase.storage.from(TEMPLATE_BUCKET).createSignedUrl(path, 60 * 60);
    setter(data?.signedUrl ?? null);
  };

  const handleUpload = async (kind: 'cover' | 'footer', file: File) => {
    if (!workspaceId) return;
    try {
      kind === 'cover' ? setUploadingCover(true) : setUploadingFooter(true);
      const object = kind === 'cover' ? COVER_OBJECT : FOOTER_OBJECT;
      const path = `${workspaceId}/${object}`;
      const { error } = await supabase.storage.from(TEMPLATE_BUCKET).upload(path, file, {
        upsert: true,
        contentType: file.type || 'image/png',
      });
      if (error) throw error;

      const column = kind === 'cover' ? 'invoice_template_cover_path' : 'invoice_template_footer_path';
      await (supabase as any)
        .from('finance_settings')
        .upsert({ workspace_id: workspaceId, [column]: path }, { onConflict: 'workspace_id' });

      setFields(prev => ({ ...prev, [column]: path } as InvoiceFields));
      await refreshSignedUrl(path, kind === 'cover' ? setCoverPreviewUrl : setFooterPreviewUrl);
      toast({ title: `Invoice ${kind} uploaded` });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.message, variant: 'destructive' });
    } finally {
      kind === 'cover' ? setUploadingCover(false) : setUploadingFooter(false);
    }
  };

  const handleRemoveTemplate = async (kind: 'cover' | 'footer') => {
    if (!workspaceId) return;
    if (!confirm(`Remove the ${kind} template? Future invoices won't use it.`)) return;
    const column = kind === 'cover' ? 'invoice_template_cover_path' : 'invoice_template_footer_path';
    await (supabase as any)
      .from('finance_settings')
      .upsert({ workspace_id: workspaceId, [column]: null }, { onConflict: 'workspace_id' });
    setFields(prev => ({ ...prev, [column]: null } as InvoiceFields));
    if (kind === 'cover') setCoverPreviewUrl(null); else setFooterPreviewUrl(null);
    toast({ title: `Invoice ${kind} removed` });
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: member } = await (supabase as any)
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      const wsId = member?.workspace_id;
      if (!wsId) throw new Error('No workspace for this user');
      setWorkspaceId(wsId);

      const { data: settings } = await (supabase as any)
        .from('finance_settings')
        .select('invoice_number_prefix, invoice_next_number, invoice_number_pad, default_payment_terms_days, default_vat_rate')
        .eq('workspace_id', wsId)
        .maybeSingle();

      if (settings) {
        const next: InvoiceFields = {
          invoice_number_prefix: settings.invoice_number_prefix ?? DEFAULTS.invoice_number_prefix,
          invoice_next_number: settings.invoice_next_number ?? DEFAULTS.invoice_next_number,
          invoice_number_pad: settings.invoice_number_pad ?? DEFAULTS.invoice_number_pad,
          default_payment_terms_days: settings.default_payment_terms_days ?? DEFAULTS.default_payment_terms_days,
          default_vat_rate: Number(settings.default_vat_rate) || DEFAULTS.default_vat_rate,
          invoice_template_cover_path: settings.invoice_template_cover_path ?? null,
          invoice_template_footer_path: settings.invoice_template_footer_path ?? null,
        };
        setFields(next);
        await refreshSignedUrl(next.invoice_template_cover_path, setCoverPreviewUrl);
        await refreshSignedUrl(next.invoice_template_footer_path, setFooterPreviewUrl);
      }
    } catch (err: any) {
      toast({ title: 'Failed to load invoice settings', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!workspaceId) return;
    try {
      setSaving(true);
      const { error } = await (supabase as any)
        .from('finance_settings')
        .upsert({ workspace_id: workspaceId, ...fields }, { onConflict: 'workspace_id' });
      if (error) throw error;
      toast({ title: 'Invoice settings saved' });
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Render a preview of the next invoice number using the current settings.
  const previewNumber = `${fields.invoice_number_prefix}${String(fields.invoice_next_number).padStart(fields.invoice_number_pad, '0')}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // ─── ERP-active banner ─── shown when an ERP module owns invoicing ─────────
  const erpActive = provider && provider.isErp;

  return (
    <div className="space-y-4">
      {erpActive && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
              <div className="flex-1">
                <CardTitle className="font-medium">
                  Invoice issuance is handled by {provider.name}
                </CardTitle>
                <CardDescription className="mt-1 space-y-2">
                  <p>
                    The {provider.name} module is enabled and now issues every invoice end-to-end —
                    legal number, PDF, customer notification. The built-in invoice numbering +
                    template settings below are inactive while {provider.name} is on.
                  </p>
                  <p className="text-foreground/80">
                    <strong>Payment collection is unaffected.</strong> Customers still pay their
                    {' '}{provider.name}-issued invoices through this platform's Stripe checkout
                    (pay-tokens, customer portal, webhooks). Business details, Stripe configuration,
                    and the Keys tab all remain active.
                  </p>
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link to={`/admin/modules/${provider.slug}`}>
                Open {provider.name} settings <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className={`dashboard-card ${erpActive ? 'opacity-50 pointer-events-none' : ''}`}>
        <CardHeader>
          <CardTitle className="font-light flex items-center gap-2">
            <Hash className="h-4 w-4 text-primary" />
            Invoice Numbering
          </CardTitle>
          <CardDescription>
            How the built-in provider numbers invoices. The sequence is atomic — every
            issued invoice increments <code>invoice_next_number</code> in the DB so two
            concurrent issues can never collide.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Prefix</Label>
              <Input
                value={fields.invoice_number_prefix}
                onChange={e => setFields({ ...fields, invoice_number_prefix: e.target.value })}
                disabled={saving}
                placeholder="INV-"
              />
            </div>
            <div>
              <Label className="text-xs">Next number</Label>
              <Input
                type="number"
                min={1}
                value={fields.invoice_next_number}
                onChange={e => setFields({ ...fields, invoice_next_number: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                disabled={saving}
              />
            </div>
            <div>
              <Label className="text-xs">Zero padding</Label>
              <Input
                type="number"
                min={0}
                max={12}
                value={fields.invoice_number_pad}
                onChange={e => setFields({ ...fields, invoice_number_pad: Math.max(0, Math.min(12, parseInt(e.target.value || '0', 10))) })}
                disabled={saving}
              />
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Preview:</span>{' '}
            <code className="px-2 py-1 rounded bg-muted">{previewNumber}</code>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/8">
            <div>
              <Label className="text-xs">Default payment terms (days)</Label>
              <Input
                type="number"
                min={0}
                max={365}
                value={fields.default_payment_terms_days}
                onChange={e => setFields({ ...fields, default_payment_terms_days: Math.max(0, Math.min(365, parseInt(e.target.value || '0', 10))) })}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground mt-1">Stamped as <code>due_at</code> when an invoice is issued.</p>
            </div>
            <div>
              <Label className="text-xs">Default VAT rate (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={fields.default_vat_rate}
                onChange={e => setFields({ ...fields, default_vat_rate: Math.max(0, Math.min(100, parseFloat(e.target.value || '0'))) })}
                disabled={saving}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save numbering</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Invoice design — inline cover + footer uploads (stored in quote-templates bucket) */}
      <Card className={`dashboard-card ${erpActive ? 'opacity-50 pointer-events-none' : ''}`}>
        <CardHeader>
          <CardTitle className="font-light flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            Invoice Design
          </CardTitle>
          <CardDescription>
            Cover + footer images printed on every PDF invoice. PNG or JPG, recommended
            ≤ 2 MB. Files are stored privately and signed-URL'd at PDF generation time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TemplateUploadSlot
              label="Cover image"
              previewUrl={coverPreviewUrl}
              hasPath={!!fields.invoice_template_cover_path}
              uploading={uploadingCover}
              inputRef={coverInputRef}
              onPick={file => handleUpload('cover', file)}
              onRemove={() => handleRemoveTemplate('cover')}
            />
            <TemplateUploadSlot
              label="Footer image"
              previewUrl={footerPreviewUrl}
              hasPath={!!fields.invoice_template_footer_path}
              uploading={uploadingFooter}
              inputRef={footerInputRef}
              onPick={file => handleUpload('footer', file)}
              onRemove={() => handleRemoveTemplate('footer')}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const TemplateUploadSlot: React.FC<{
  label: string;
  previewUrl: string | null;
  hasPath: boolean;
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onPick: (file: File) => void;
  onRemove: () => void;
}> = ({ label, previewUrl, hasPath, uploading, inputRef, onPick, onRemove }) => (
  <div className="space-y-2">
    <Label className="text-xs">{label}</Label>
    <div className="border border-border rounded-lg p-3 bg-muted/30 min-h-[140px] flex items-center justify-center">
      {previewUrl ? (
        <img src={previewUrl} alt={label} className="max-h-32 object-contain" />
      ) : (
        <span className="text-xs text-muted-foreground">No image uploaded yet</span>
      )}
    </div>
    <input
      ref={inputRef}
      type="file"
      accept="image/png,image/jpeg"
      className="hidden"
      onChange={e => {
        const f = e.target.files?.[0];
        if (f) onPick(f);
        if (inputRef.current) inputRef.current.value = '';
      }}
    />
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading} className="flex-1">
        {uploading ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Uploading...</> : <><Upload className="h-3.5 w-3.5 mr-2" />{hasPath ? 'Replace' : 'Upload'}</>}
      </Button>
      {hasPath && !uploading && (
        <Button size="sm" variant="ghost" onClick={onRemove}>
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  </div>
);

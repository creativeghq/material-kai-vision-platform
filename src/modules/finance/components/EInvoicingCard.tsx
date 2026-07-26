/**
 * Finance → Settings → e-Invoicing. Per-workspace control surface for Novus → myDATA
 * transmission. Ties together the three things that make outbound e-invoicing work:
 *
 *  1. Master connection — the operator's single Novus API key (NOT per-tenant). This card
 *     only reports whether it's configured + sandbox/live; the key lives in platform_secrets
 *     and never reaches the browser.
 *  2. Enable toggle — writes workspace_fiscal_bindings (Novus across legal_invoice /
 *     pre_invoice_notice / tax_submission). On by default.
 *  3. Issuer completeness — every Novus invoice MUST carry a full issuer identity (name,
 *     profession, tax office, address, VAT). Flags any mandatory field still blank in the
 *     Business Identity card so submissions don't fail with a myDATA ValidationError.
 *  4. TaxisNet authorization — the manual Novus portal + signed-contract flow per issuer VAT
 *     (Provider docs §6). It's a STATE, not a key; tracked on finance_settings so the tenant
 *     can see where they are in onboarding.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Switch } from '@/components/core/ui/switch';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Loader2, Save, FileSignature, CheckCircle2, XCircle, AlertTriangle, ExternalLink, KeyRound, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { fiscalConnectorService } from '@/services/fiscalConnectorService';

// Mandatory Novus issuer fields (providerAdditionalInvoiceDetails.issuer — all YES in the
// Provider docs). branch comes from the invoice's establishment, not finance_settings.
const REQUIRED_ISSUER_FIELDS: { key: string; label: string }[] = [
  { key: 'business_name', label: 'Company name' },
  { key: 'business_vat', label: 'VAT number' },
  { key: 'business_profession', label: 'Activity / Profession'},
  { key: 'business_tax_office', label: 'Tax office (ΔΟΥ)' },
  { key: 'business_address', label: 'Street' },
  { key: 'business_street_number', label: 'Street number' },
  { key: 'business_postal_code', label: 'Postal code' },
  { key: 'business_city', label: 'City' },
  { key: 'business_country', label: 'Country' },
  { key: 'business_country_code', label: 'Country code' },
];

const AUTH_STEPS = [
  { value: 'not_requested', label: 'Not requested', hint: 'No VAT authorization has been requested from Novus yet.' },
  { value: 'requested', label: 'Requested', hint: 'Operator requested this VAT in the Novus Live portal; Novus emailed the business.' },
  { value: 'awaiting_authorization', label: 'Awaiting authorization', hint: 'Authorize Novus in TaxisNet + sign & upload the provider contract.' },
  { value: 'approved', label: 'Approved', hint: 'Novus approved — this VAT can now transmit invoices.' },
] as const;

type AuthStatus = 'not_requested' | 'requested' | 'awaiting_authorization' | 'approved' | 'rejected';

interface Props {
  workspaceId: string;
  /** Jump to the Business Identity settings tab (where the missing issuer fields live). */
  onGoToIdentity?: () => void;
}

export const EInvoicingCard: React.FC<Props> = ({ workspaceId, onGoToIdentity }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fs, setFs] = useState<Record<string, any>>({});
  const [enabled, setEnabled] = useState(true);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [status, setStatus] = useState<{ master_key_configured: boolean; is_sandbox: boolean; connector_slug: string } | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('not_requested');
  const [authNote, setAuthNote] = useState('');

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [row, enabledV, statusV] = await Promise.all([
        supabase.from('finance_settings').select('*').eq('workspace_id', workspaceId).maybeSingle().then((r) => r.data),
        fiscalConnectorService.getEInvoicingEnabled(workspaceId).catch(() => true),
        fiscalConnectorService.getStatus(workspaceId).catch(() => null),
      ]);
      if (cancelled) return;
      const r = row ?? {};
      setFs(r);
      setEnabled(enabledV);
      setStatus(statusV);
      setAuthStatus((r.einvoicing_authorization_status as AuthStatus) ?? 'not_requested');
      setAuthNote(r.einvoicing_authorization_note ?? '');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  const missing = REQUIRED_ISSUER_FIELDS.filter((f) => !String(fs[f.key] ?? '').trim());

  const toggleEnabled = async (v: boolean) => {
    setTogglingEnabled(true);
    try {
      await fiscalConnectorService.setEInvoicingEnabled(workspaceId, v);
      setEnabled(v);
      toast({ title: v ? 'e-Invoicing enabled' : 'e-Invoicing disabled' });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setTogglingEnabled(false); }
  };

  const saveAuth = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('finance_settings').upsert({
        workspace_id: workspaceId,
        einvoicing_authorization_status: authStatus,
        einvoicing_authorization_note: authNote || null,
        einvoicing_authorization_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id' });
      if (error) throw error;
      toast({ title: 'Authorization status saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) {
    return <Card><CardContent className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  const currentStepIdx = AUTH_STEPS.findIndex((s) => s.value === authStatus);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2"><FileSignature className="h-4 w-4" /> e-Invoicing (Novus → myDATA)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        {/* 1. Master connection status */}
        <div className="rounded-md border border-border/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium flex items-center gap-2"><KeyRound className="h-4 w-4" /> Provider connection</div>
            {status?.master_key_configured ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-500">
                <CheckCircle2 className="h-3.5 w-3.5" /> Connected{status.is_sandbox ? ' · Sandbox' : ' · Live'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5" /> Master key not configured
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Invoices transmit through the platform's single Novus provider key — there is no per-business key to enter here.
            {status?.master_key_configured
              ? ' The operator has configured it.'
              : ' The operator must set NOVUS_API_KEY (env or operator e-Invoicing settings) before any invoice can be transmitted.'}
          </p>
        </div>

        {/* 2. Enable toggle */}
        <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
          <div>
            <div className="text-sm font-medium">Transmit invoices to myDATA</div>
            <p className="text-xs text-muted-foreground">When on, issuing an invoice can transmit it to AADE via Novus. On by default.</p>
          </div>
          <div className="flex items-center gap-2">
            {togglingEnabled && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Switch checked={enabled} disabled={togglingEnabled} onCheckedChange={toggleEnabled} />
          </div>
        </div>

        {/* 3. Issuer completeness */}
        <div className="rounded-md border border-border/60 p-3 space-y-2">
          <div className="text-sm font-medium">Issuer identity</div>
          {missing.length === 0 ? (
            <p className="text-xs text-emerald-500 flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> All mandatory issuer fields are filled.</p>
          ) : (
            <>
              {onGoToIdentity ? (
                <button
                  type="button"
                  onClick={onGoToIdentity}
                  className="group flex items-center gap-1.5 text-left text-xs text-amber-500 hover:underline"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {missing.length} mandatory field{missing.length > 1 ? 's' : ''} missing — myDATA will reject transmission until filled.
                  <ArrowRight className="h-3 w-3 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5" />
                </button>
              ) : (
                <p className="text-xs text-amber-500 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> {missing.length} mandatory field{missing.length > 1 ? 's' : ''} missing — myDATA will reject transmission until filled.
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {missing.map((f) => (
                  <span key={f.key} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    <XCircle className="h-3 w-3" /> {f.label}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {onGoToIdentity ? (
                  <button type="button" onClick={onGoToIdentity} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                    Go to Business Identity <ArrowRight className="h-3 w-3" />
                  </button>
                ) : <span>Fill these in the <strong>Business Identity</strong> tab</span>}
                {' '}— it has a “Fetch from ΑΑΔΕ” button to auto-fill.
              </p>
            </>
          )}
        </div>

        {/* 4. TaxisNet authorization stepper */}
        <div className="rounded-md border border-border/60 p-3 space-y-3">
          <div className="text-sm font-medium">TaxisNet authorization</div>
          <p className="text-[11px] text-muted-foreground">
            Each issuer VAT must authorize Novus as its myDATA provider once (manual, in the Novus portal): the operator requests the VAT → the
            business authorizes Novus in TaxisNet and signs the provider contract → Novus approves. Track that progress here.
          </p>

          {/* stepper */}
          <ol className="flex flex-wrap gap-2">
            {AUTH_STEPS.map((s, i) => {
              const done = authStatus !== 'rejected' && i <= currentStepIdx;
              const isCurrent = s.value === authStatus;
              return (
                <li key={s.value} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${isCurrent ? 'border-primary text-primary font-medium' : done ? 'border-emerald-500/40 text-emerald-500' : 'border-border/60 text-muted-foreground'}`}>
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="grid h-3.5 w-3.5 place-items-center rounded-full border border-current text-[8px]">{i + 1}</span>}
                  {s.label}
                </li>
              );
            })}
          </ol>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={authStatus} onValueChange={(v) => setAuthStatus(v as AuthStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUTH_STEPS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{AUTH_STEPS.find((s) => s.value === authStatus)?.hint ?? 'Novus rejected the submitted data — fix and re-request.'}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Note (optional)</Label>
              <Textarea rows={3} value={authNote} onChange={(e) => setAuthNote(e.target.value)} placeholder="e.g. contract no., date submitted, who handled it…" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <a href="https://portal.timologisi.online" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Open Novus portal <ExternalLink className="h-3 w-3" />
            </a>
            <Button size="sm" onClick={saveAuth} disabled={saving} className="rounded-full">
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save status
            </Button>
          </div>
          {fs.einvoicing_authorization_updated_at && (
            <p className="text-[11px] text-muted-foreground">Last updated: {new Date(fs.einvoicing_authorization_updated_at).toLocaleString()}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

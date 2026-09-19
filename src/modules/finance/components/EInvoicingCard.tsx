/** Finance → Settings → e-Invoicing. Per-workspace Novus → myDATA transmission controls. */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Switch } from '@/components/core/ui/switch';
import { Loader2, FileSignature, CheckCircle2, XCircle, AlertTriangle, ExternalLink, KeyRound, ArrowRight } from 'lucide-react';
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

interface Props {
  workspaceId: string;
  /** Jump to the Business Identity settings tab (where the missing issuer fields live). */
  onGoToIdentity?: () => void;
}

export const EInvoicingCard: React.FC<Props> = ({ workspaceId, onGoToIdentity }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [fs, setFs] = useState<Record<string, any>>({});
  const [enabled, setEnabled] = useState(true);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [status, setStatus] = useState<{ master_key_configured: boolean; is_sandbox: boolean; connector_slug: string } | null>(null);

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

  if (loading) {
    return <Card><CardContent className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

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
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Connected{status.is_sandbox ? ' · Sandbox' : ' · Live'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-400">
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
            <p className="text-xs text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> All mandatory issuer fields are filled.</p>
          ) : (
            <>
              {onGoToIdentity ? (
                <button
                  type="button"
                  onClick={onGoToIdentity}
                  className="group flex items-center gap-1.5 text-left text-xs text-amber-800 dark:text-amber-400 hover:underline"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {missing.length} mandatory field{missing.length > 1 ? 's' : ''} missing — myDATA will reject transmission until filled.
                  <ArrowRight className="h-3 w-3 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5" />
                </button>
              ) : (
                <p className="text-xs text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
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

        {/* 4. Provider registration — derived from Novus, never typed here. The editable
            four-step dropdown this replaced was written and read by this card alone: nothing in
            the transmit path consulted it, so it could read "Approved" for a VAT Novus had never
            heard of. */}
        <div className="rounded-md border border-border/60 p-3 space-y-2">
          <div className="text-sm font-medium">Provider registration</div>
          <p className="text-[11px] text-muted-foreground">
            Whether this VAT may transmit is Novus&rsquo;s answer, not ours. It is tracked step by step
            under <strong>Register for e-invoicing</strong> above — including the signature and the ΑΑΔΕ
            declaration, which are done by people rather than by us.
          </p>
          <a href="https://portal.timologisi.online" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Open Novus portal <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
};

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Factory, Loader2, ShieldCheck, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { VAT_COUNTRY_OPTIONS } from '@/lib/vatCountries';
import { validateVatViaVies } from '@/services/viesService';
import { enrichCompany } from '@/services/companyEnrichService';
import { aadeService, type AadeLookupResult } from '@/modules/myaade';
import { useSessionDraft } from '@/hooks/useSessionDraft';
import { useWorkspace } from '@/contexts/WorkspaceContext';

type Role = 'customer' | 'supplier';

/**
 * Role-first company creation. The operator first picks what they're adding
 * (a customer we sell to, or a supplier we buy from / match to a factory), then
 * optionally researches the VAT number via VIES (EU) or ΑΑΔΕ (Greek ΑΦΜ). The
 * fetched identity prefills the create form so it can be reviewed before saving —
 * the row is NOT written here. On continue we navigate to the new-company form
 * with the role + prefill in router state.
 *
 * Suppliers land in a lean form (no pricing/invoicing schema); customers get the
 * full commercial card set. See CompanyDetailPage role gating.
 */
const isEu = (code: string) => VAT_COUNTRY_OPTIONS.find((o) => o.code === code)?.eu === true;

/** Map an ΑΑΔΕ lookup onto crm_companies columns (mirrors CompanyDetailPage.adoptAadeAll). */
function prefillFromAade(res: AadeLookupResult, vatNumber: string): Record<string, any> {
  const r = res.basic_rec;
  const primaryAct = res.activities.find((a) => a.kind === 1) ?? res.activities[0] ?? null;
  const secondaryActs = res.activities.filter((a) => a.kind !== 1);
  const combinedAddress = r.postal_address
    ? `${r.postal_address} ${r.postal_address_no ?? ''}`.replace(/\s+/g, ' ').trim()
    : null;
  return {
    name: r.onomasia ?? '',
    vat_number: vatNumber,
    country_code: 'EL',
    street: r.postal_address ?? null,
    street_number: r.postal_address_no ?? null,
    address: combinedAddress,
    postal_code: r.postal_zip_code ?? null,
    city: r.postal_area_description ?? null,
    country: r.postal_area_description ? 'Greece' : null,
    tax_office: r.doy_descr ?? null,
    profession: primaryAct?.description ?? null,
    commercial_title: r.commer_title,
    legal_status: r.legal_status_descr,
    kad_primary: primaryAct?.code ?? null,
    kad_primary_description: primaryAct?.description ?? null,
    kad_secondary: secondaryActs.length > 0 ? secondaryActs : null,
    // Normalized queryable ΚΑΔ (ΑΑΔΕ source; ΓΕΜΗ merges in later on the detail page).
    kad_all: res.activities
      .filter((a) => a.code)
      .map((a) => ({ code: String(a.code), description: a.description ?? null, source: 'aade', primary: a.kind === 1 })),
    kad_codes: [...new Set(res.activities.map((a) => a.code).filter(Boolean) as string[])],
    business_start_date: r.regist_date ? (r.regist_date.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null) : null,
    aade_data: { basic_rec: r, activities: res.activities },
    aade_data_at: res.checked_at,
    vat_validated: r.deactivation_flag === '1' ? true : (r.deactivation_flag === '2' ? false : null),
    vat_validated_at: res.checked_at,
    vat_validated_name: r.onomasia,
    vat_validated_address: combinedAddress
      ? `${combinedAddress} ${r.postal_zip_code ?? ''} ${r.postal_area_description ?? ''}`.replace(/\s+/g, ' ').trim()
      : null,
    vat_validation_source: 'aade',
  };
}

export const AddCompanyModal: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const [step, setStep] = useState<'role' | 'details'>('role');
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('EL');
  const [vatNumber, setVatNumber] = useState('');
  const [busy, setBusy] = useState(false);
  // Sub-phase label shown while the lookup button is busy (e.g. "Finding business info…").
  const [statusLine, setStatusLine] = useState<string | null>(null);
  // Prefill accumulated from a VAT lookup (carried into the create form).
  const [prefill, setPrefill] = useState<Record<string, any>>({});
  const [verified, setVerified] = useState<null | { name: string | null; address: string | null; source: 'aade' | 'vies' }>(null);

  // Draft persistence — a half-filled "add company" survives navigating away +
  // reopening; cleared once you continue to the create form.
  const clearDraft = useSessionDraft(
    'crm-add-company',
    open,
    { step, role, name, countryCode, vatNumber, prefill, verified },
    (d) => {
      setStep(d?.step ?? 'role');
      setRole(d?.role ?? null);
      setName(d?.name ?? '');
      setCountryCode(d?.countryCode ?? 'EL');
      setVatNumber(d?.vatNumber ?? '');
      setPrefill(d?.prefill ?? {});
      setVerified(d?.verified ?? null);
    },
  );

  const reset = () => {
    setStep('role'); setRole(null); setName(''); setCountryCode('EL'); setVatNumber('');
    setBusy(false); setStatusLine(null); setPrefill({}); setVerified(null);
  };

  /**
   * Auto-enrichment after a successful VAT lookup — fills the *soft* identity a VAT
   * registry never carries (website, socials, phone, email, description, industry).
   * Best-effort: only fills prefill slots that are still empty, and never throws, so a
   * failed enrichment can't undo the VIES/ΑΑΔΕ result the user just got.
   */
  const runEnrichment = async (companyName: string, countryName: string | null, vat: string) => {
    if (!companyName) return;
    setStatusLine('Finding business info…');
    try {
      const res = await enrichCompany({
        name: companyName,
        countryName: countryName ?? undefined,
        vatNumber: vat || undefined,
        workspaceId: activeWorkspaceId ?? undefined,
      });
      if (res.ok && res.fields) {
        const f = res.fields;
        setPrefill((p) => ({
          ...p,
          website: p.website || f.website || null,
          email: p.email || f.email || null,
          phone: p.phone || f.phone || null,
          linkedin: p.linkedin || f.linkedin || null,
          facebook: p.facebook || f.facebook || null,
          twitter: p.twitter || f.twitter || null,
          description: p.description || f.description || null,
          industry: p.industry || f.industry || null,
          employee_count: p.employee_count || f.employee_count || null,
          city: p.city || f.city || null,
          state: p.state || f.state || null,
          country: p.country || f.country || null,
        }));
        const filled = [
          f.website && 'website',
          f.phone && 'phone',
          f.email && 'email',
          (f.linkedin || f.facebook || f.twitter) && 'socials',
        ].filter(Boolean);
        if (filled.length) {
          toast({ title: 'Business info found', description: `Added ${filled.join(', ')}. Review on the next screen.` });
        }
      }
    } finally {
      setStatusLine(null);
    }
  };

  const close = (next: boolean) => { if (!next) reset(); onOpenChange(next); };

  const pickRole = (r: Role) => { setRole(r); setStep('details'); };

  const runLookup = async () => {
    const cc = countryCode.trim().toUpperCase();
    const vat = vatNumber.trim();
    if (!vat) {
      toast({ title: 'Enter a VAT number', description: 'Type the VAT / ΑΦΜ to research first.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const afm = vat.replace(/[^0-9]/g, '');
      // Greek ΑΦΜ → ΑΑΔΕ (richer: ΔΟΥ, ΚΑΔ, legal form, structured address). reason='crm_enrichment'
      // is legitimate — we only research a business we are about to onboard as a counterparty.
      if (cc === 'EL' && afm.length === 9) {
        const res = await aadeService.lookup({ afm, reason: 'crm_enrichment', workspaceId: activeWorkspaceId ?? undefined });
        if ('error' in res && res.error) {
          toast({ title: 'ΑΑΔΕ lookup failed', description: res.message || res.error, variant: 'destructive' });
          return;
        }
        if ('ok' in res && res.ok) {
          const pf = prefillFromAade(res, vat);
          setPrefill(pf);
          if (pf.name) setName(pf.name);
          setVerified({ name: pf.vat_validated_name ?? pf.name, address: pf.vat_validated_address, source: 'aade' });
          toast({ title: 'ΑΑΔΕ data fetched', description: pf.name ? `Imported ${pf.name}.` : 'Business details imported.' });
          await runEnrichment(pf.name || name, 'Greece', vat);
        }
        return;
      }
      // EU (non-Greek) → VIES. Non-EU countries are skipped (no registry to hit).
      if (!isEu(cc)) {
        toast({ title: 'No registry lookup', description: `${cc} is outside VIES/ΑΑΔΕ — fill the details manually.` });
        return;
      }
      const res = await validateVatViaVies({ countryCode: cc, vatNumber: vat });
      if (res.valid === true) {
        const adr = res.address_parsed;
        const legal = res.legal_name ?? res.name ?? null;
        const countryName = VAT_COUNTRY_OPTIONS.find((o) => o.code === cc)?.name ?? null;
        setPrefill((p) => ({
          ...p,
          name: legal ?? p.name ?? '',
          vat_number: vat,
          country_code: cc,
          country: countryName ?? p.country ?? null,
          state: adr?.state ?? p.state ?? null,
          address: res.address ?? null,
          street: adr?.street ?? null,
          street_number: adr?.street_number ?? null,
          postal_code: adr?.postal_code ?? null,
          city: adr?.city ?? null,
          vat_validated: true,
          vat_validated_at: res.checked_at,
          vat_validated_name: legal,
          vat_validated_address: res.address ?? null,
          vat_validation_source: 'vies',
        }));
        if (legal) setName(legal);
        setVerified({ name: legal, address: res.address ?? null, source: 'vies' });
        toast({ title: 'VAT verified', description: legal ? `Registered as ${legal}` : 'Number is valid.' });
        await runEnrichment(legal || name, countryName, vat);
      } else if (res.valid === false) {
        toast({ title: 'VAT not recognised', description: 'VIES does not recognise this number for the given country.', variant: 'destructive' });
      } else {
        toast({ title: 'VIES unavailable', description: res.message || 'Could not reach VIES. Try again or fill manually.', variant: 'destructive' });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () => {
    if (!role) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: 'Company name required', description: 'Enter a name (or run a VAT lookup to fetch it).', variant: 'destructive' });
      return;
    }
    const finalPrefill = {
      ...prefill,
      name: trimmed,
      vat_number: prefill.vat_number ?? (vatNumber.trim() || null),
      country_code: prefill.country_code ?? (countryCode.trim().toUpperCase() || null),
      is_supplier: role === 'supplier',
      is_customer: role === 'customer',
    };
    onOpenChange(false);
    clearDraft();
    reset();
    navigate('/admin/crm/companies/new', { state: { prefill: finalPrefill } });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        {step === 'role' ? (
          <>
            <DialogHeader>
              <DialogTitle>What are you adding?</DialogTitle>
              <DialogDescription>
                Pick the role first — it decides which form you get. Suppliers stay lean
                (no pricing/invoicing) and can be matched to a brand; customers get the full
                commercial profile.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-2">
              <button
                type="button"
                onClick={() => pickRole('customer')}
                className="group rounded-xl border border-border/60 p-4 text-left hover:border-primary hover:bg-primary/[0.04] transition-colors"
              >
                <Building2 className="h-6 w-6 mb-2 text-muted-foreground group-hover:text-primary" />
                <div className="font-medium">Customer</div>
                <p className="text-xs text-muted-foreground mt-1">A business we sell to — quotes, invoices, pricing & discounts.</p>
              </button>
              <button
                type="button"
                onClick={() => pickRole('supplier')}
                className="group rounded-xl border border-border/60 p-4 text-left hover:border-primary hover:bg-primary/[0.04] transition-colors"
              >
                <Factory className="h-6 w-6 mb-2 text-muted-foreground group-hover:text-primary" />
                <div className="font-medium">Supplier</div>
                <p className="text-xs text-muted-foreground mt-1">A business we buy from — match it to an ingested brand's products.</p>
              </button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {role === 'supplier' ? <Factory className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                New {role}
                <Badge variant="secondary" className="text-[10px]">{role === 'supplier' ? 'Supplier' : 'Customer'}</Badge>
              </DialogTitle>
              <DialogDescription>
                Research the VAT number to auto-fill the identity, then review it on the next screen.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-1">
              {/* VAT research */}
              <div className="space-y-2">
                <Label className="text-xs">VAT / ΑΦΜ lookup (optional)</Label>
                <div className="flex gap-2">
                  <Select value={countryCode} onValueChange={setCountryCode}>
                    <SelectTrigger className="w-28 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VAT_COUNTRY_OPTIONS.map((o) => (
                        <SelectItem key={o.code} value={o.code}>
                          <span className="font-mono text-[10px] mr-2">{o.code}</span>{o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value)}
                    placeholder={countryCode === 'EL' ? '9-digit ΑΦΜ' : 'VAT number'}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runLookup(); } }}
                  />
                  <Button type="button" variant="outline" onClick={runLookup} disabled={busy} className="shrink-0">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    <span className="ml-1">{countryCode === 'EL' ? 'ΑΑΔΕ' : 'VIES'}</span>
                  </Button>
                </div>
                {statusLine && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {statusLine}
                  </div>
                )}
                {verified && (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] p-2 text-xs flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-foreground font-medium">{verified.name || 'Verified'}</span>
                      {verified.address && <span className="text-muted-foreground"> · {verified.address}</span>}
                      <span className="text-muted-foreground"> ({verified.source.toUpperCase()})</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Name — required, prefilled from lookup */}
              <div className="space-y-1.5">
                <Label htmlFor="new-company-name" className="text-xs">Company name *</Label>
                <Input
                  id="new-company-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={role === 'supplier' ? 'e.g. Acme Tiles S.A.' : 'e.g. Acme LLC'}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
                />
              </div>
            </div>

            <DialogFooter className="flex-row justify-between sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep('role')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button type="button" onClick={handleCreate}>
                Continue <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddCompanyModal;

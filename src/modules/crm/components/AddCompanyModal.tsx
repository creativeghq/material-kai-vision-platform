import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Factory, Loader2, ShieldCheck, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { VAT_COUNTRY_OPTIONS } from '@/lib/vatCountries';
import { VatCountryCombobox } from '@/components/core/VatCountryCombobox';
import { validateVatViaVies } from '@/services/viesService';
import { researchCompany, summarizeResearch } from '@/modules/crm/services/companyResearch';
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
  const [verified, setVerified] = useState<null | { name: string | null; address: string | null; source: 'aade' | 'vies'; gemiNumber?: string | null }>(null);

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
   * Soft-identity enrichment (website, socials, phone, email, description, industry) for the
   * NON-Greek path, where VIES has already resolved the legal identity. Runs the shared chain
   * with the registry legs inert — a non-Greek VAT skips ΑΑΔΕ/ΓΕΜΗ by construction — so the
   * blank-only fill rules stay identical to every other CRM surface.
   */
  const runEnrichment = async (companyName: string, countryName: string | null, vat: string) => {
    if (!companyName) return;
    const res = await researchCompany({
      name: companyName,
      countryName: countryName ?? undefined,
      vatNumber: vat || undefined,
      workspaceId: activeWorkspaceId ?? undefined,
      reason: 'crm_enrichment',
      existing: prefill,
      onProgress: setStatusLine,
    });
    if (Object.keys(res.fields).length > 0) {
      setPrefill((p) => ({ ...p, ...res.fields }));
      toast({ title: 'Business info found', description: `${summarizeResearch(res.steps)} Review on the next screen.` });
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
      // Greek ΑΦΜ → the ONE shared research chain (ΑΑΔΕ → ΓΕΜΗ → business research), the same
      // routine the company/contact records and the Expenses-inbox "Add issuer to CRM" run.
      // No companyId: the row doesn't exist yet, so everything comes back as a field patch that
      // rides into the create form. reason='crm_enrichment' is legitimate — we only research a
      // business we are about to onboard as a counterparty.
      if (cc === 'EL' && afm.length === 9) {
        const res = await researchCompany({
          vatNumber: vat,
          countryCode: cc,
          name: name.trim() || undefined,
          workspaceId: activeWorkspaceId ?? undefined,
          reason: 'crm_enrichment',
          existing: prefill,
          onProgress: setStatusLine,
        });
        if (!res.ok) {
          toast({ title: 'Lookup found nothing', description: summarizeResearch(res.steps), variant: 'destructive' });
          return;
        }
        const pf: Record<string, any> = { ...prefill, ...res.fields, vat_number: vat, country_code: 'EL' };
        setPrefill(pf);
        if (res.resolvedName) setName(res.resolvedName);
        setVerified({
          name: (pf.vat_validated_name as string) ?? res.resolvedName,
          address: (pf.vat_validated_address as string) ?? null,
          source: 'aade',
          gemiNumber: (pf.gemi_number as string) ?? null,
        });
        toast({
          title: res.resolvedName ? `Imported ${res.resolvedName}` : 'Business details imported',
          description: summarizeResearch(res.steps),
        });
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
              <DialogTitle>What Are You Adding?</DialogTitle>
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
                  <VatCountryCombobox
                    value={countryCode}
                    onChange={(v) => setCountryCode(v || 'EL')}
                    triggerClassName="w-32 shrink-0"
                  />
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
                      {verified.gemiNumber && <span className="text-muted-foreground"> · Γ.Ε.ΜΗ. {verified.gemiNumber}</span>}
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

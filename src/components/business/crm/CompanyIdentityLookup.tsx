// The ONE "who is this business?" control: VAT/ΑΦΜ → ΑΑΔΕ → ΓΕΜΗ → web research (Greek), or
// VIES → web research (rest of EU), with a live progress line and a verified strip, then the
// company name it resolved.
//
// This exists because the same question was being asked in two very different ways: CRM's
// "Add company" ran the full research chain and arrived with ~25 populated columns, while the
// Expenses payee box created a supplier from a typed name and nothing else — same table, same
// counterparty, a quarter of the record. Any surface that creates a business uses THIS component
// so the identity we capture does not depend on which screen you happened to be on.
//
// It resolves; it never writes. The caller decides what to do with `value.fields` — prefill a
// review form (CRM) or insert straight away (QuickAddCompanyDialog).
import React, { useId, useState } from 'react';
import { Check, Loader2, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { VatCountryCombobox } from '@/components/core/VatCountryCombobox';
import { VAT_COUNTRY_OPTIONS } from '@/lib/vatCountries';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { lookupBusinessIdentity, providerFor } from '@/services/identity/registry';
import { researchCompany, summarizeResearch } from '@/modules/crm/services/companyResearch';
import type { CompanyIdentityDraft } from './companyIdentity';

// The draft shape + the pure derivations live in `./companyIdentity` so they are testable in the
// node test environment. Re-exported here so consumers have one import to reach for.
export {
  emptyCompanyIdentity,
  companyIdentityPayload,
  normalizeVat,
  CRM_VAT_COLUMN,
} from './companyIdentity';
export type { CompanyIdentityDraft, CompanyIdentityVerification } from './companyIdentity';

interface Props {
  value: CompanyIdentityDraft;
  onChange: (next: CompanyIdentityDraft) => void;
  /** Told when a lookup starts/ends so the host can disable its own Save while it runs. */
  onBusyChange?: (busy: boolean) => void;
  /** Enter in the name field. */
  onSubmit?: () => void;
  disabled?: boolean;
  nameLabel?: string;
  namePlaceholder?: string;
  autoFocusName?: boolean;
  /** Rendered under the verified strip — e.g. a "this VAT is already in CRM" warning. */
  children?: React.ReactNode;
}

export const CompanyIdentityLookup: React.FC<Props> = ({
  value,
  onChange,
  onBusyChange,
  onSubmit,
  disabled,
  nameLabel = 'Company name *',
  namePlaceholder = 'e.g. Acme Tiles S.A.',
  autoFocusName,
  children,
}) => {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  // Instance-scoped: the control is generic, so two could legitimately mount at once and a fixed
  // id would point both labels at the first input.
  const nameFieldId = useId();
  const [busy, setBusy] = useState(false);
  // Sub-phase label while the chain runs ("Checking ΓΕΜΗ registry…").
  const [statusLine, setStatusLine] = useState<string | null>(null);

  const patch = (p: Partial<CompanyIdentityDraft>) => onChange({ ...value, ...p });
  const setBusyBoth = (b: boolean) => { setBusy(b); onBusyChange?.(b); };

  /**
   * Soft-identity enrichment (website, socials, phone, email, description, industry) for the
   * NON-Greek path, where VIES has already resolved the legal identity. Runs the shared chain
   * with the registry legs inert — a non-Greek VAT skips ΑΑΔΕ/ΓΕΜΗ by construction — so the
   * blank-only fill rules stay identical to every other CRM surface.
   */
  const runEnrichment = async (
    draft: CompanyIdentityDraft,
    companyName: string,
    countryName: string | null,
    vat: string,
  ) => {
    if (!companyName) return;
    const res = await researchCompany({
      name: companyName,
      countryName: countryName ?? undefined,
      vatNumber: vat || undefined,
      workspaceId: activeWorkspaceId ?? undefined,
      reason: 'crm_enrichment',
      existing: draft.fields,
      onProgress: setStatusLine,
    });
    if (Object.keys(res.fields).length > 0) {
      onChange({ ...draft, fields: { ...draft.fields, ...res.fields } });
      toast({ title: 'Business info found', description: summarizeResearch(res.steps) });
    }
  };

  const runLookup = async () => {
    const cc = value.countryCode.trim().toUpperCase();
    const vat = value.vatNumber.trim();
    if (!vat) {
      toast({ title: 'Enter a VAT number', description: 'Type the VAT / ΑΦΜ to research first.', variant: 'destructive' });
      return;
    }
    setBusyBoth(true);
    try {
      // Which authority answers for this country is the registry's decision, not this
      // component's (#329). The old code hardcoded EL→ΑΑΔΕ / EU→VIES / else→shrug here, which
      // meant adding a country's registry required editing every call site that verifies a VAT.
      const provider = providerFor(cc);
      const res = await lookupBusinessIdentity({
        countryCode: cc,
        vatNumber: vat,
        name: value.name.trim() || undefined,
        workspaceId: activeWorkspaceId ?? undefined,
        onProgress: setStatusLine,
      });

      if (res.skippedReason === 'unsupported_country' || res.skippedReason === 'bad_input') {
        // A real answer, not a fallthrough: this country has no registry we can ask.
        toast({ title: 'No registry lookup', description: res.message });
        return;
      }
      if (res.valid === null) {
        toast({
          title: `${provider?.label ?? 'Registry'} unavailable`,
          description: res.message || 'Could not reach the registry. Try again or fill manually.',
          variant: 'destructive',
        });
        return;
      }
      if (res.valid === false) {
        toast({
          title: 'VAT not recognised',
          description: res.message || `${provider?.label ?? 'The registry'} does not recognise this number.`,
          variant: 'destructive',
        });
        return;
      }

      const fields: Record<string, any> = { ...value.fields, ...(res.fields ?? {}) };
      const next: CompanyIdentityDraft = {
        ...value,
        fields,
        name: res.legalName || value.name,
        verified: {
          name: (fields.vat_validated_name as string) ?? res.legalName ?? null,
          address: (fields.vat_validated_address as string) ?? res.address ?? null,
          source: res.provider,
          gemiNumber: (fields.gemi_number as string) ?? null,
        },
      };
      onChange(next);
      toast({
        title: res.legalName ? `Verified as ${res.legalName}` : 'VAT verified',
        // Registries answering in Cyrillic/Greek get the Latin rendering alongside, so the toast
        // is readable to a Latin-script user without displacing the authoritative name.
        description: res.legalNameLatin ? `(${res.legalNameLatin})` : res.message,
      });

      // Only when the provider has not already done it — ΑΑΔΕ's lookup IS the enrichment chain,
      // and running it twice would repeat the TAXISnet audit entry it writes to the business.
      if (!provider?.enrichesAutomatically) {
        const countryName = VAT_COUNTRY_OPTIONS.find((o) => o.code === cc)?.name ?? null;
        await runEnrichment(next, res.legalName || next.name, countryName, vat);
      }
    } finally {
      setBusyBoth(false);
      setStatusLine(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* VAT research */}
      <div className="space-y-2">
        <Label className="text-xs">VAT / ΑΦΜ lookup (optional)</Label>
        <div className="flex gap-2">
          <VatCountryCombobox
            value={value.countryCode}
            onChange={(v) => patch({ countryCode: v || 'EL' })}
            triggerClassName="w-32 shrink-0"
          />
          <Input
            value={value.vatNumber}
            onChange={(e) => patch({ vatNumber: e.target.value })}
            placeholder={value.countryCode === 'EL' ? '9-digit ΑΦΜ' : 'VAT number'}
            disabled={disabled || busy}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runLookup(); } }}
          />
          <Button type="button" variant="outline" onClick={() => void runLookup()} disabled={disabled || busy} className="shrink-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            <span className="ml-1">{value.countryCode === 'EL' ? 'ΑΑΔΕ' : 'VIES'}</span>
          </Button>
        </div>
        {busy && (
          <div className="space-y-1.5" aria-live="polite">
            <div className="progress-indeterminate" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {statusLine ?? 'Contacting the registry…'}
            </div>
          </div>
        )}
        {!busy && value.verified && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] p-2 text-xs">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <div>
              <span className="font-medium text-foreground">{value.verified.name || 'Verified'}</span>
              {value.verified.address && <span className="text-muted-foreground"> · {value.verified.address}</span>}
              <span className="text-muted-foreground"> ({value.verified.source.toUpperCase()})</span>
              {value.verified.gemiNumber && <span className="text-muted-foreground"> · Γ.Ε.ΜΗ. {value.verified.gemiNumber}</span>}
            </div>
          </div>
        )}
        {children}
      </div>

      {/* Name — required, prefilled from the lookup */}
      <div className="space-y-1.5">
        <Label htmlFor={nameFieldId} className="text-xs">{nameLabel}</Label>
        <Input
          id={nameFieldId}
          value={value.name}
          autoFocus={autoFocusName}
          disabled={disabled}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder={namePlaceholder}
          onKeyDown={(e) => { if (e.key === 'Enter' && onSubmit) { e.preventDefault(); onSubmit(); } }}
        />
      </div>
    </div>
  );
};

export default CompanyIdentityLookup;

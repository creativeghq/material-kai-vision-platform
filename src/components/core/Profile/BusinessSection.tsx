import React, { useEffect, useState } from 'react';
import { Building2, User as UserIcon, Pencil, Save, X, Loader2, ShieldCheck, ShieldAlert, ShieldQuestion, CornerDownLeft, CornerUpLeft, FileText, Link2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { VatCountryCombobox } from '@/components/core/VatCountryCombobox';
import { isAdmin } from '@/auth/roles';
import { toVatPrefix } from '@/lib/vatCountries';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { validateVatViaVies, type ViesValidationResult } from '@/services/viesService';
import { aadeService, type AadeLookupResult } from '@/modules/myaade';
import { MarketplaceParticipationCard } from './MarketplaceParticipationCard';
import { SupplierIdentityClaimCard } from './SupplierIdentityClaimCard';
import { formatDate } from '@/utils/datetime';

export type EntityType = 'solo' | 'business';

interface BusinessForm {
  name: string;
  vat_number: string;
  tax_office: string;
  profession: string;
  phone: string;
  email: string;
  website: string;
  country: string;
  country_code: string;
  city: string;
  postal_code: string;
  street: string;
  street_number: string;
}

const EMPTY_BUSINESS: BusinessForm = {
  name: '',
  vat_number: '',
  tax_office: '',
  profession: '',
  phone: '',
  email: '',
  website: '',
  country: '',
  country_code: '',
  city: '',
  postal_code: '',
  street: '',
  street_number: '',
};

/**
 * The columns of `finance_settings` that describe WHO IS ISSUING — the identity printed on every
 * invoice and transmitted to myDATA. Read here because "am I a business?" was answerable from three
 * unrelated places (`user_profiles.company` free text, `user_profiles.entity_type`+`business_id`,
 * and this) and only this one is load-bearing, so it is the one an operator actually fills in.
 * A workspace that invoices as a company while the profile calls the same person a solo entity is
 * not a preference — it is the profile copy never having been told.
 */
const INVOICING_COLUMNS =
  'business_name, business_name_en, business_vat, business_gemi, business_tax_office, business_tax_office_en, ' +
  'business_profession, business_profession_en, business_address, business_address_en, business_street_number, ' +
  'business_postal_code, business_city, business_city_en, business_country, business_country_en, ' +
  'business_country_code, business_phone, business_email, contact_website';

/** The workspace's invoicing identity, flattened to the shape this card edits. */
export interface InvoicingIdentity extends BusinessForm {
  gemi_number: string;
}

/**
 * Bilingual finance fields carry an `_en` twin. English is the platform default for UI and
 * documents, so the English value wins when it is filled and the native one is the fallback —
 * never a merge. Whitespace is collapsed because the ΑΑΔΕ lookup that fills these pads names
 * with runs of spaces (`MATERIALS   BANK   ΕΕ`), which is a formatting artefact, not the name.
 */
const preferEnglish = (english: unknown, native: unknown): string => {
  const en = typeof english === 'string' ? english.trim() : '';
  const raw = en || (typeof native === 'string' ? native : '');
  return raw.replace(/\s+/g, ' ').trim();
};

/**
 * Projects a `finance_settings` row onto the business form. Returns null for a row that exists but
 * holds no identity — every workspace that ever opened Finance has a row, and an empty one must not
 * be offered as "the company you already invoice as".
 */
export const readInvoicingIdentity = (row: Record<string, unknown> | null | undefined): InvoicingIdentity | null => {
  if (!row) return null;
  const vat = preferEnglish(null, row.business_vat).toUpperCase().replace(/\s+/g, '');
  // `country_code` on crm_companies is the VAT PREFIX (EL), `business_country_code` is ISO (GR).
  // Prefer the prefix the VAT number itself carries; fall back to translating the ISO code.
  const prefixFromVat = /^[A-Z]{2}/.exec(vat)?.[0] ?? '';
  const identity: InvoicingIdentity = {
    name: preferEnglish(row.business_name_en, row.business_name),
    vat_number: vat,
    tax_office: preferEnglish(row.business_tax_office_en, row.business_tax_office),
    profession: preferEnglish(row.business_profession_en, row.business_profession),
    phone: preferEnglish(null, row.business_phone),
    email: preferEnglish(null, row.business_email),
    website: preferEnglish(null, row.contact_website),
    country: preferEnglish(row.business_country_en, row.business_country),
    country_code: prefixFromVat || toVatPrefix(preferEnglish(null, row.business_country_code)),
    city: preferEnglish(row.business_city_en, row.business_city),
    postal_code: preferEnglish(null, row.business_postal_code),
    street: preferEnglish(row.business_address_en, row.business_address),
    street_number: preferEnglish(null, row.business_street_number),
    gemi_number: preferEnglish(null, row.business_gemi),
  };
  return identity.name || identity.vat_number ? identity : null;
};

/** The identity minus the fields this card does not edit — what the form and crm_companies take. */
const toBusinessForm = ({ gemi_number: _gemi, ...form }: InvoicingIdentity): BusinessForm => form;

/**
 * Which of the shared fields disagree between the profile copy and the invoicing copy. Both are
 * real records with real consumers (role applications read one, myDATA reads the other), so
 * neither can be silently overwritten — but a difference nobody is shown is how they rot apart.
 * Blank on one side is "not filled in here", not a conflict.
 */
const identityDrift = (profile: BusinessForm, invoicing: InvoicingIdentity): (keyof BusinessForm)[] => {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return (Object.keys(EMPTY_BUSINESS) as (keyof BusinessForm)[]).filter((key) => {
    const mine = profile[key] ?? '';
    const theirs = invoicing[key] ?? '';
    return !!mine && !!theirs && !same(mine, theirs);
  });
};

interface BusinessSectionProps {
  /** Notifies parent when entity_type / business_id flip so the parent can refresh anything that depends on it. */
  onEntityChanged?: (next: { entity_type: EntityType; business_id: string | null }) => void;
}

/**
 * The cached VIES verdict as stored on crm_companies, shown when there is no live result.
 * Named rather than inlined because three places consume it — the state hook and both status
 * components — and the shape had already been hand-copied twice.
 */
interface ViesCacheSnapshot {
  validated: boolean | null;
  validated_at: string | null;
  name: string | null;
  address: string | null;
  /** Latin transliteration of `name`; only set when the register answered in Cyrillic/Greek. */
  name_latin: string | null;
}

export const BusinessSection: React.FC<BusinessSectionProps> = ({ onEntityChanged }) => {
  const { user } = useAuth();
  const { activeWorkspaceId, workspaceRole } = useWorkspace();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [entityType, setEntityType] = useState<EntityType>('solo');
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [business, setBusiness] = useState<BusinessForm>(EMPTY_BUSINESS);
  const [businessForm, setBusinessForm] = useState<BusinessForm>(EMPTY_BUSINESS);
  const [pendingEntityType, setPendingEntityType] = useState<EntityType>('solo');

  // VIES validation state — cached snapshot from crm_companies, refreshed on demand
  const [viesCache, setViesCache] = useState<ViesCacheSnapshot | null>(null);
  const [viesChecking, setViesChecking] = useState(false);
  const [viesLastResult, setViesLastResult] = useState<ViesValidationResult | null>(null);

  const [aadeChecking, setAadeChecking] = useState(false);
  const [aadeLastResult, setAadeLastResult] = useState<AadeLookupResult | null>(null);

  /** The active workspace's invoicing identity, when it has one and this user is allowed to see it. */
  const [invoicing, setInvoicing] = useState<InvoicingIdentity | null>(null);
  const [adopting, setAdopting] = useState(false);

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeWorkspaceId]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('entity_type, business_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const et = (profile?.entity_type as EntityType) ?? 'solo';
    const bid = profile?.business_id ?? null;
    setEntityType(et);
    setPendingEntityType(et);
    setBusinessId(bid);

    if (bid) {
      const { data: company } = await supabase
        .from('crm_companies')
        .select('name, vat_number, tax_office, profession, phone, email, website, country, country_code, city, postal_code, street, street_number, vat_validated, vat_validated_at, vat_validated_name, vat_validated_address, vat_validated_name_latin')
        .eq('id', bid)
        .maybeSingle();
      if (company) {
        const next: BusinessForm = {
          name: company.name ?? '',
          vat_number: company.vat_number ?? '',
          tax_office: company.tax_office ?? '',
          profession: company.profession ?? '',
          phone: company.phone ?? '',
          email: company.email ?? '',
          website: company.website ?? '',
          country: company.country ?? '',
          country_code: company.country_code ?? '',
          city: company.city ?? '',
          postal_code: company.postal_code ?? '',
          street: company.street ?? '',
          street_number: company.street_number ?? '',
        };
        setBusiness(next);
        setBusinessForm(next);
        setViesCache({
          validated: (company as { vat_validated?: boolean | null }).vat_validated ?? null,
          validated_at: (company as { vat_validated_at?: string | null }).vat_validated_at ?? null,
          name: (company as { vat_validated_name?: string | null }).vat_validated_name ?? null,
          address: (company as { vat_validated_address?: string | null }).vat_validated_address ?? null,
          name_latin: (company as { vat_validated_name_latin?: string | null }).vat_validated_name_latin ?? null,
        });
      }
    } else {
      setViesCache(null);
    }

    // The invoicing identity is read through RLS on finance_settings, so a member with no finance
    // visibility simply gets nothing back and is never offered the company — the gate is the policy,
    // not a check written here. Adopting it additionally requires workspace admin (see canAdopt).
    if (activeWorkspaceId) {
      const { data: settings } = await supabase
        .from('finance_settings')
        .select(INVOICING_COLUMNS)
        .eq('workspace_id', activeWorkspaceId)
        .maybeSingle();
      setInvoicing(readInvoicingIdentity(settings as Record<string, unknown> | null));
    } else {
      setInvoicing(null);
    }

    setLoading(false);
  };

  const verifyVat = async () => {
    if (!businessForm.vat_number.trim() || !businessForm.country_code.trim()) {
      toast({ title: 'Add country code + VAT number first', variant: 'destructive' });
      return;
    }
    setViesChecking(true);
    const result = await validateVatViaVies({
      countryCode: businessForm.country_code,
      vatNumber: businessForm.vat_number,
      companyId: businessId ?? undefined,
    });
    setViesLastResult(result);
    setViesChecking(false);

    if (result.skipped_reason === 'non_eu') {
      toast({ title: 'VIES skipped', description: result.message || 'VIES only validates EU VAT numbers.' });
    } else if (result.skipped_reason === 'vies_unreachable') {
      toast({ title: 'VIES is currently unreachable', description: 'Please try again in a moment.', variant: 'destructive' });
    } else if (result.valid === true) {
      toast({ title: 'VAT verified', description: result.name ? `Registered as ${result.name}` : 'Number is valid.' });
      // Refresh cache from DB so the display shows the stored snapshot
      if (businessId) void load();
    } else if (result.valid === false) {
      toast({ title: 'VAT not valid', description: 'VIES does not recognise this VAT number for the given country.', variant: 'destructive' });
      if (businessId) void load();
    }
  };

  const adoptViesName = (name: string) => {
    setBusinessForm((p) => ({ ...p, name }));
    toast({ title: 'Company name updated to VIES-registered name' });
  };

  const adoptViesAddress = (parsed: NonNullable<ViesValidationResult['address_parsed']>, rawFallback: string | null) => {
    setBusinessForm((p) => ({
      ...p,
      street: parsed.street ?? (parsed.postal_code === null && rawFallback ? rawFallback : p.street),
      street_number: parsed.street_number ?? p.street_number,
      postal_code: parsed.postal_code ?? p.postal_code,
      city: parsed.city ?? p.city,
    }));
    toast({ title: 'Address pre-filled from VIES' });
  };

  /** Greek-only enrichment: pulls ΔΟΥ, ΚΑΔ, legal form, structured address from ΑΑΔΕ. */
  const lookupAade = async () => {
    const rawAfm = businessForm.vat_number.replace(/[^0-9]/g, '');
    if (rawAfm.length !== 9) {
      toast({ title: 'Need a 9-digit VAT number', description: 'Type the Greek VAT number (9 digits) in the VAT field first.', variant: 'destructive' });
      return;
    }
    setAadeChecking(true);
    const res = await aadeService.lookup({ afm: rawAfm, companyId: businessId ?? undefined, workspaceId: activeWorkspaceId ?? undefined });
    setAadeChecking(false);

    if ('error' in res && res.error) {
      const msg = res.message || res.error;
      toast({ title: 'AADE lookup failed', description: msg, variant: 'destructive' });
      setAadeLastResult(null);
      return;
    }
    if ('ok' in res && res.ok) {
      setAadeLastResult(res);
      toast({ title: 'AADE data fetched', description: res.basic_rec.onomasia ? `Registered as ${res.basic_rec.onomasia}` : 'Business details available.' });
      // Refresh the cache snapshot from DB so the read-only badges update
      if (businessId) void load();
    }
  };

  const adoptAadeAll = (res: AadeLookupResult) => {
    const r = res.basic_rec;
    const primaryAct = res.activities.find((a) => a.kind === 1) ?? res.activities[0] ?? null;
    setBusinessForm((p) => ({
      ...p,
      // Names — prefer AADE (authoritative for Greek businesses)
      name: r.onomasia ?? p.name,
      // Address — fully structured from AADE, no parsing needed
      street: r.postal_address ?? p.street,
      street_number: r.postal_address_no ?? p.street_number,
      postal_code: r.postal_zip_code ?? p.postal_code,
      city: r.postal_area_description ?? p.city,
      country: r.postal_area_description ? (p.country || 'Greece') : p.country,
      country_code: p.country_code || 'EL',
      // ΔΟΥ + profession
      tax_office: r.doy_descr ?? p.tax_office,
      profession: primaryAct?.description ?? p.profession,
    }));
    toast({ title: 'Business profile pre-filled from AADE' });
  };

  const [syncingInvoicing, setSyncingInvoicing] = useState(false);
  /** One-way sync: copy this saved business identity into the workspace's invoicing profile
   *  (finance_settings) — the copy invoices + myDATA actually use. Resolves the two-copies drift
   *  (Profile→crm_companies vs Finance→finance_settings) without forcing a canonical table. */
  const copyToInvoicing = async () => {
    if (!activeWorkspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    setSyncingInvoicing(true);
    try {
      const { error } = await supabase.from('finance_settings').upsert({
        workspace_id: activeWorkspaceId,
        business_name: business.name || null,
        business_vat: business.vat_number || null,
        business_tax_office: business.tax_office || null,
        business_profession: business.profession || null,
        business_address: business.street || null,
        business_street_number: business.street_number || null,
        business_postal_code: business.postal_code || null,
        business_city: business.city || null,
        business_country: business.country || null,
        business_phone: business.phone || null,
        business_email: business.email || null,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: 'workspace_id' });
      if (error) throw error;
      toast({ title: 'Copied to invoicing profile', description: 'Finance → Business Identity now matches this — that copy is what invoices + myDATA use.' });
    } catch (err: any) {
      toast({ title: 'Copy failed', description: err?.message, variant: 'destructive' });
    } finally { setSyncingInvoicing(false); }
  };

  /**
   * Adopting the workspace's company onto YOUR profile is an identity claim — it is what
   * `role-upgrade-requests` then checks to let you apply as a Dealer or Brand on that company's
   * behalf. Finance *visibility* is not enough for that; an accountant can read the identity and
   * must not be able to claim it. Workspace admin/owner only.
   */
  const canAdopt = !!invoicing && isAdmin(workspaceRole ?? undefined) && !!activeWorkspaceId;

  /** Fills the open edit form from the invoicing identity — the same mapping as adopt, unsaved. */
  const fillFromInvoicing = () => {
    if (!invoicing) return;
    setBusinessForm(toBusinessForm(invoicing));
    setPendingEntityType('business');
    toast({ title: 'Filled from your invoicing profile', description: 'Review it, then Save.' });
  };

  /**
   * One click from "Solo entity" to the company this workspace already invoices as: writes the CRM
   * company row the platform uses as your business identity and links it to the profile. It is a
   * COPY, not a live view — `crm_companies` is what role review and CRM read, `finance_settings` is
   * what myDATA reads — so the two are compared afterwards and any disagreement is shown rather
   * than left to rot.
   */
  const adoptInvoicingIdentity = async () => {
    if (!user || !invoicing || !activeWorkspaceId) return;
    if (!isAdmin(workspaceRole ?? undefined)) {
      toast({ title: 'Only a workspace admin can link the company', variant: 'destructive' });
      return;
    }
    setAdopting(true);
    try {
      const payload = {
        ...toBusinessForm(invoicing),
        gemi_number: invoicing.gemi_number || null,
      };

      let nextBusinessId = businessId;
      if (nextBusinessId) {
        const { error } = await supabase.from('crm_companies').update(payload).eq('id', nextBusinessId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from('crm_companies')
          .insert({ ...payload, workspace_id: activeWorkspaceId, created_by: user.id, is_customer: false, is_supplier: false })
          .select('id')
          .single();
        if (error) throw error;
        nextBusinessId = inserted.id;
      }

      const { error: profileErr } = await supabase
        .from('user_profiles')
        .update({ entity_type: 'business', business_id: nextBusinessId, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (profileErr) throw profileErr;

      toast({ title: 'Business linked', description: `Your profile now reads as ${invoicing.name || 'your registered company'}.` });
      onEntityChanged?.({ entity_type: 'business', business_id: nextBusinessId });
      await load();
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      toast({ title: 'Could not link the business', description: detail, variant: 'destructive' });
    } finally {
      setAdopting(false);
    }
  };

  const startEdit = () => {
    setBusinessForm({ ...business });
    setPendingEntityType(entityType);
    setEditing(true);
  };

  const cancelEdit = () => {
    setBusinessForm({ ...business });
    setPendingEntityType(entityType);
    setEditing(false);
  };

  const save = async () => {
    if (!user) return;

    if (pendingEntityType === 'business') {
      if (!businessForm.name.trim()) {
        toast({ title: 'Company name is required', variant: 'destructive' });
        return;
      }
    }

    setSaving(true);
    try {
      let nextBusinessId = businessId;

      if (pendingEntityType === 'business') {
        // If we have a fresh VIES result for the VAT they're saving, persist it inline.
        const freshVies =
          viesLastResult &&
          viesLastResult.vat_number &&
          businessForm.vat_number.replace(/\s+/g, '').toUpperCase().endsWith(viesLastResult.vat_number)
            ? viesLastResult
            : null;

        // Upsert the linked crm_companies row
        const payload = {
          name: businessForm.name.trim(),
          vat_number: businessForm.vat_number.trim() || null,
          tax_office: businessForm.tax_office.trim() || null,
          profession: businessForm.profession.trim() || null,
          phone: businessForm.phone.trim() || null,
          email: businessForm.email.trim() || null,
          website: businessForm.website.trim() || null,
          country: businessForm.country.trim() || null,
          country_code: businessForm.country_code.trim() ? businessForm.country_code.trim().slice(0, 2).toUpperCase() : null,
          city: businessForm.city.trim() || null,
          postal_code: businessForm.postal_code.trim() || null,
          street: businessForm.street.trim() || null,
          street_number: businessForm.street_number.trim() || null,
          updated_at: new Date().toISOString(),
          ...(freshVies && freshVies.skipped_reason === undefined
            ? {
                vat_validated: freshVies.valid,
                vat_validated_at: freshVies.checked_at,
                vat_validated_name: freshVies.name ?? null,
                vat_validated_address: freshVies.address ?? null,
                vat_validated_name_latin: freshVies.legal_name_latin ?? null,
                vat_validated_address_latin: freshVies.address_latin ?? null,
                vat_validation_source: 'vies',
              }
            : {}),
        };

        if (businessId) {
          const { error } = await supabase
            .from('crm_companies')
            .update(payload)
            .eq('id', businessId);
          if (error) throw error;
        } else {
          const { data: inserted, error } = await supabase
            .from('crm_companies')
            // workspace_id explicitly: the BEFORE-INSERT trigger stamps the user's DEFAULT
            // workspace, which is not necessarily the one they are looking at.
            .insert({ ...payload, ...(activeWorkspaceId ? { workspace_id: activeWorkspaceId } : {}), created_by: user.id, is_customer: false, is_supplier: false })
            .select('id')
            .single();
          if (error) throw error;
          nextBusinessId = inserted.id;
        }
      }
      // Solo: we keep business_id intact so they can flip back without losing the row,
      // but the CRM link is unset on the profile. If they re-pick Business later they
      // can either re-attach the existing row or edit it.

      const { error: profileErr } = await supabase
        .from('user_profiles')
        .update({
          entity_type: pendingEntityType,
          business_id: pendingEntityType === 'business' ? nextBusinessId : null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
      if (profileErr) throw profileErr;

      setEntityType(pendingEntityType);
      setBusinessId(pendingEntityType === 'business' ? nextBusinessId : null);
      setBusiness({ ...businessForm });
      setEditing(false);
      toast({ title: 'Business details saved' });
      onEntityChanged?.({
        entity_type: pendingEntityType,
        business_id: pendingEntityType === 'business' ? nextBusinessId : null,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      toast({ title: 'Could not save', description: detail, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const fullAddress = [
    [business.street, business.street_number].filter(Boolean).join(' '),
    [business.postal_code, business.city].filter(Boolean).join(' '),
    business.country,
  ].filter((s) => s && s.length > 0).join(', ');

  return (
    <div className="space-y-6">
    <Card className="rounded-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />Business
          </CardTitle>
          {!editing ? (
            <div className="flex gap-2">
              {entityType === 'business' && business.name && activeWorkspaceId && (
                <Button size="sm" variant="outline" onClick={copyToInvoicing} disabled={syncingInvoicing}
                  title="Copy this identity into Finance → Business Identity (the copy invoices + myDATA use)">
                  {syncingInvoicing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CornerDownLeft className="h-3.5 w-3.5 mr-1.5" />}
                  Copy to invoicing
                </Button>
              )}
              <Button size="sm" onClick={startEdit} disabled={loading}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={cancelEdit}>
                <X className="h-3.5 w-3.5 mr-1.5" />Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Save
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : editing ? (
          <>
            {/* Entity type picker */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPendingEntityType('solo')}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-colors ${
                  pendingEntityType === 'solo'
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-muted/20 hover:bg-muted/40'
                }`}
              >
                <UserIcon className={`h-5 w-5 mt-0.5 shrink-0 ${pendingEntityType === 'solo' ? 'text-primary' : 'text-muted-foreground'}`} />
                <div>
                  <p className="font-medium text-sm">Solo entity</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Independent individual. No company details required.
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setPendingEntityType('business')}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-colors ${
                  pendingEntityType === 'business'
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-muted/20 hover:bg-muted/40'
                }`}
              >
                <Building2 className={`h-5 w-5 mt-0.5 shrink-0 ${pendingEntityType === 'business' ? 'text-primary' : 'text-muted-foreground'}`} />
                <div>
                  <p className="font-medium text-sm">Business entity</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Registered company. Required to apply for Dealer or Brand roles.
                  </p>
                </div>
              </button>
            </div>

            {pendingEntityType === 'business' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Company name *">
                  <Input
                    value={businessForm.name}
                    onChange={(e) => setBusinessForm({ ...businessForm, name: e.target.value })}
                    placeholder="Acme Industries Ltd."
                    required
                  />
                </FormField>
                <FormField label="VAT number">
                  <div className="flex gap-2">
                    <Input
                      value={businessForm.vat_number}
                      onChange={(e) => setBusinessForm({ ...businessForm, vat_number: e.target.value })}
                      placeholder="EL123456789"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={verifyVat}
                      disabled={viesChecking || !businessForm.vat_number.trim()}
                    >
                      {viesChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      <span className="ml-1.5">Verify via VIES</span>
                    </Button>
                  </div>
                  <ViesStatusInline
                    cache={viesCache}
                    lastResult={viesLastResult}
                    onAdoptName={adoptViesName}
                    onAdoptAddress={adoptViesAddress}
                  />
                  <AadeInline
                    show={businessForm.country_code.toUpperCase() === 'EL' && businessForm.vat_number.replace(/[^0-9]/g, '').length === 9}
                    checking={aadeChecking}
                    result={aadeLastResult}
                    onLookup={lookupAade}
                    onAdopt={adoptAadeAll}
                  />
                </FormField>
                <FormField label="Tax office">
                  <Input
                    value={businessForm.tax_office}
                    onChange={(e) => setBusinessForm({ ...businessForm, tax_office: e.target.value })}
                    placeholder="Athens A"
                  />
                </FormField>
                <FormField label="Profession / Activity">
                  <Input
                    value={businessForm.profession}
                    onChange={(e) => setBusinessForm({ ...businessForm, profession: e.target.value })}
                    placeholder="Construction materials"
                  />
                </FormField>
                <FormField label="Phone">
                  <Input
                    value={businessForm.phone}
                    onChange={(e) => setBusinessForm({ ...businessForm, phone: e.target.value })}
                    placeholder="+30 210 0000000"
                  />
                </FormField>
                <FormField label="Business email">
                  <Input
                    type="email"
                    value={businessForm.email}
                    onChange={(e) => setBusinessForm({ ...businessForm, email: e.target.value })}
                    placeholder="info@acme.com"
                  />
                </FormField>
                <FormField label="Website" className="md:col-span-2">
                  <Input
                    value={businessForm.website}
                    onChange={(e) => setBusinessForm({ ...businessForm, website: e.target.value })}
                    placeholder="https://acme.com"
                  />
                </FormField>
                <FormField label="Street">
                  <Input
                    value={businessForm.street}
                    onChange={(e) => setBusinessForm({ ...businessForm, street: e.target.value })}
                    placeholder="Main Street"
                  />
                </FormField>
                <FormField label="Number">
                  <Input
                    value={businessForm.street_number}
                    onChange={(e) => setBusinessForm({ ...businessForm, street_number: e.target.value })}
                    placeholder="42"
                  />
                </FormField>
                <FormField label="Postal code">
                  <Input
                    value={businessForm.postal_code}
                    onChange={(e) => setBusinessForm({ ...businessForm, postal_code: e.target.value })}
                    placeholder="10678"
                  />
                </FormField>
                <FormField label="City">
                  <Input
                    value={businessForm.city}
                    onChange={(e) => setBusinessForm({ ...businessForm, city: e.target.value })}
                    placeholder="Athens"
                  />
                </FormField>
                <FormField label="Country">
                  <Input
                    value={businessForm.country}
                    onChange={(e) => setBusinessForm({ ...businessForm, country: e.target.value })}
                    placeholder="Greece"
                  />
                </FormField>
                <FormField label="VAT country">
                  <VatCountryCombobox
                    value={businessForm.country_code || ''}
                    onChange={(v) => setBusinessForm({ ...businessForm, country_code: v })}
                    allowUnset
                    triggerClassName="w-full"
                  />
                </FormField>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              {entityType === 'business' ? (
                <Badge className="bg-primary/10 text-primary border-primary/20 gap-1.5"><Building2 className="h-3 w-3" />Business entity</Badge>
              ) : (
                <Badge variant="secondary" className="gap-1.5"><UserIcon className="h-3 w-3" />Solo entity</Badge>
              )}
              {entityType === 'business' && business.name && (
                <span className="text-sm text-muted-foreground">{business.name}</span>
              )}
            </div>

            {entityType === 'business' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-y-4 gap-x-8">
                <FieldDisplay label="Company name" value={business.name} />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">VAT number</p>
                  <p className="text-sm">{business.vat_number || <span className="text-muted-foreground italic">Not set</span>}</p>
                  <ViesStatusBadge cache={viesCache} />
                </div>
                <FieldDisplay label="Tax office" value={business.tax_office} />
                <FieldDisplay label="Profession" value={business.profession} />
                <FieldDisplay label="Phone" value={business.phone} />
                <FieldDisplay label="Business email" value={business.email} />
                <FieldDisplay label="Website" value={business.website} className="md:col-span-3" />
                <FieldDisplay label="Address" value={fullAddress} className="md:col-span-3" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                You're registered as a solo entity. Switch to <strong>Business</strong> if you operate as a registered company, and you'll be able to apply for Dealer or Brand roles.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
    <MarketplaceParticipationCard />
    <SupplierIdentityClaimCard />
    </div>
  );
};

interface ViesStatusInlineProps {
  cache: ViesCacheSnapshot | null;
  lastResult: ViesValidationResult | null;
  onAdoptName: (name: string) => void;
  onAdoptAddress: (parsed: NonNullable<ViesValidationResult['address_parsed']>, rawFallback: string | null) => void;
}

/** Inline status under the VAT field, in edit mode. Prefers the latest live result over the cache. */
const ViesStatusInline: React.FC<ViesStatusInlineProps> = ({ cache, lastResult, onAdoptName, onAdoptAddress }) => {
  // Latest live result wins if present (just verified)
  if (lastResult) {
    if (lastResult.skipped_reason === 'non_eu') {
      return (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5 mt-1.5">
          <ShieldQuestion className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>VIES only validates EU VAT numbers — this one is outside scope. Admin will review manually.</span>
        </p>
      );
    }
    if (lastResult.skipped_reason === 'vies_unreachable') {
      return (
        <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5 mt-1.5">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>VIES is currently unreachable — please try again in a moment.</span>
        </p>
      );
    }
    if (lastResult.valid === true) {
      const legalName = lastResult.legal_name ?? lastResult.name;
      const tradeName = lastResult.trade_name;
      const parsed = lastResult.address_parsed;
      const hasParsedAddress = parsed && (parsed.street || parsed.postal_code || parsed.city);
      // Only present when the register answered in a non-Latin script (BG Cyrillic, EL/CY Greek).
      const latinName = lastResult.legal_name_latin;
      const latinAddress = lastResult.address_latin;
      return (
        <div className="mt-2 rounded-lg border border-green-500/30 bg-green-500/5 p-3 space-y-2">
          <p className="text-xs text-green-700 dark:text-green-400 flex items-start gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Verified via VIES{legalName ? <> — registered as <strong>{legalName}</strong></> : ''}{tradeName ? <> (trading as <em>{tradeName}</em>)</> : ''}.</span>
          </p>
          {latinName && (
            <p className="text-xs text-muted-foreground pl-5">
              <span className="text-muted-foreground/70">Latin: </span>{latinName}
              {lastResult.trade_name_latin ? <> (trading as <em>{lastResult.trade_name_latin}</em>)</> : ''}
            </p>
          )}
          {lastResult.address && (
            <p className="text-xs text-muted-foreground pl-5">
              <span className="text-muted-foreground/70">Registered address: </span>{lastResult.address}
              {latinAddress && <><br /><span className="text-muted-foreground/70">Latin: </span>{latinAddress}</>}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pl-4">
            {legalName && (
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAdoptName(legalName)}>
                <CornerDownLeft className="h-3 w-3 mr-1" />Use this name
              </Button>
            )}
            {latinName && (
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAdoptName(latinName)}>
                <CornerDownLeft className="h-3 w-3 mr-1" />Use Latin name
              </Button>
            )}
            {hasParsedAddress && (
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAdoptAddress(parsed!, lastResult.address ?? null)}>
                <CornerDownLeft className="h-3 w-3 mr-1" />Use this address
              </Button>
            )}
          </div>
        </div>
      );
    }
    if (lastResult.valid === false) {
      return (
        <p className="text-xs text-destructive flex items-start gap-1.5 mt-1.5">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>VIES does not recognise this VAT number. Double-check the country prefix and digits.</span>
        </p>
      );
    }
  }

  // Fallback to the cached snapshot
  if (cache?.validated === true && cache.validated_at) {
    return (
      <p className="text-xs text-green-700 dark:text-green-400 flex items-start gap-1.5 mt-1.5">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Verified via VIES on {formatDate(cache.validated_at)}{cache.name ? <> — registered as <strong>{cache.name}</strong></> : ''}
          {cache.name_latin ? <> (<span className="text-muted-foreground">{cache.name_latin}</span>)</> : ''}.
        </span>
      </p>
    );
  }
  if (cache?.validated === false && cache.validated_at) {
    return (
      <p className="text-xs text-destructive flex items-start gap-1.5 mt-1.5">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>Last VIES check on {formatDate(cache.validated_at)} returned invalid.</span>
      </p>
    );
  }
  return null;
};

interface AadeInlineProps {
  show: boolean;
  checking: boolean;
  result: AadeLookupResult | null;
  onLookup: () => void;
  onAdopt: (res: AadeLookupResult) => void;
}

/** Greek-only enrichment panel — only renders when country=EL + 9-digit ΑΦΜ. */
const AadeInline: React.FC<AadeInlineProps> = ({ show, checking, result, onLookup, onAdopt }) => {
  if (!show) return null;

  return (
    <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs font-medium">
          <span className="text-primary">myAADE:</span> auto-fill business profile from Greek tax registry
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onLookup}
          disabled={checking}
        >
          {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />}
          <span className="ml-1.5">Get full details from AADE</span>
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        ⓘ This will create a lookup audit entry in your own VAT number's TAXISnet inbox — that is expected and confirms it was you.
      </p>

      {result && (
        <div className="space-y-2 pt-2 border-t border-primary/15">
          <div className="flex items-center gap-2 flex-wrap">
            <ShieldCheck className="h-3.5 w-3.5 text-green-700 dark:text-green-400" />
            <span className="text-xs font-medium">{result.basic_rec.onomasia ?? '(no name)'}</span>
            {result.basic_rec.commer_title && (
              <span className="text-xs text-muted-foreground italic">trading as {result.basic_rec.commer_title}</span>
            )}
            {result.basic_rec.deactivation_flag === '1' ? (
              <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30 text-[10px]">Active</Badge>
            ) : (
              <Badge variant="destructive" className="text-[10px]">Inactive</Badge>
            )}
            {result.source === 'cache' && <Badge variant="secondary" className="text-[10px]">Cache</Badge>}
          </div>
          <div className="text-[11px] text-muted-foreground space-y-0.5 pl-5">
            {result.basic_rec.doy_descr && <div>Tax office: {result.basic_rec.doy_descr}</div>}
            {result.basic_rec.legal_status_descr && <div>Legal form: {result.basic_rec.legal_status_descr}</div>}
            {result.activities.find((a) => a.kind === 1) && (
              <div>Primary activity code: {result.activities.find((a) => a.kind === 1)?.code} — {result.activities.find((a) => a.kind === 1)?.description}</div>
            )}
            {result.basic_rec.postal_address && (
              <div>
                Address: {result.basic_rec.postal_address} {result.basic_rec.postal_address_no},
                {' '}{result.basic_rec.postal_zip_code} {result.basic_rec.postal_area_description}
              </div>
            )}
          </div>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs ml-4" onClick={() => onAdopt(result)}>
            <CornerDownLeft className="h-3 w-3 mr-1" />Pre-fill all fields from AADE
          </Button>
        </div>
      )}
    </div>
  );
};

/** Compact badge for the read-only display under VAT number. */
const ViesStatusBadge: React.FC<{ cache: ViesCacheSnapshot | null }> = ({ cache }) => {
  if (!cache || cache.validated_at === null) return null;
  if (cache.validated === true) {
    return (
      <Badge className="mt-1.5 bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30 gap-1.5">
        <ShieldCheck className="h-3 w-3" />VIES verified
      </Badge>
    );
  }
  if (cache.validated === false) {
    return (
      <Badge variant="destructive" className="mt-1.5 gap-1.5">
        <ShieldAlert className="h-3 w-3" />VIES says invalid
      </Badge>
    );
  }
  return null;
};

const FormField: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({ label, className, children }) => (
  <div className={`space-y-1.5 ${className ?? ''}`}>
    <Label className="text-xs text-muted-foreground">{label}</Label>
    {children}
  </div>
);

const FieldDisplay: React.FC<{ label: string; value: string; className?: string }> = ({ label, value, className }) => (
  <div className={className}>
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    <p className="text-sm">{value || <span className="text-muted-foreground italic">Not set</span>}</p>
  </div>
);

export default BusinessSection;

import React, { useEffect, useState } from 'react';
import { Building2, User as UserIcon, Pencil, Save, X, Loader2, ShieldCheck, ShieldAlert, ShieldQuestion, CornerDownLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { VAT_COUNTRY_OPTIONS } from '@/lib/vatCountries';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { validateVatViaVies, type ViesValidationResult } from '@/services/viesService';
import { aadeService, type AadeLookupResult } from '@/modules/myaade';

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

interface BusinessSectionProps {
  /** Notifies parent when entity_type / business_id flip so the parent can refresh anything that depends on it. */
  onEntityChanged?: (next: { entity_type: EntityType; business_id: string | null }) => void;
}

export const BusinessSection: React.FC<BusinessSectionProps> = ({ onEntityChanged }) => {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
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
  const [viesCache, setViesCache] = useState<{
    validated: boolean | null;
    validated_at: string | null;
    name: string | null;
    address: string | null;
  } | null>(null);
  const [viesChecking, setViesChecking] = useState(false);
  const [viesLastResult, setViesLastResult] = useState<ViesValidationResult | null>(null);

  const [aadeChecking, setAadeChecking] = useState(false);
  const [aadeLastResult, setAadeLastResult] = useState<AadeLookupResult | null>(null);

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
        .select('name, vat_number, tax_office, profession, phone, email, website, country, country_code, city, postal_code, street, street_number, vat_validated, vat_validated_at, vat_validated_name, vat_validated_address')
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
        });
      }
    } else {
      setViesCache(null);
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
            .insert({ ...payload, created_by: user.id, is_customer: false, is_supplier: false })
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
    <Card className="rounded-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />Business
          </CardTitle>
          {!editing ? (
            <Button size="sm" onClick={startEdit} disabled={loading}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
            </Button>
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
                  <Select
                    value={businessForm.country_code || '__unset'}
                    onValueChange={(v) => setBusinessForm({ ...businessForm, country_code: v === '__unset' ? '' : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset">Not set</SelectItem>
                      {VAT_COUNTRY_OPTIONS.map((o) => (
                        <SelectItem key={o.code} value={o.code}>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] w-7">{o.code}</span>
                            <span>{o.name}</span>
                            {o.eu && <Badge variant="outline" className="text-[9px] py-0">EU</Badge>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
  );
};

interface ViesStatusInlineProps {
  cache: { validated: boolean | null; validated_at: string | null; name: string | null; address: string | null } | null;
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
      return (
        <div className="mt-2 rounded-lg border border-green-500/30 bg-green-500/5 p-3 space-y-2">
          <p className="text-xs text-green-700 dark:text-green-400 flex items-start gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Verified via VIES{legalName ? <> — registered as <strong>{legalName}</strong></> : ''}{tradeName ? <> (trading as <em>{tradeName}</em>)</> : ''}.</span>
          </p>
          {lastResult.address && (
            <p className="text-xs text-muted-foreground pl-5">
              <span className="text-muted-foreground/70">Registered address: </span>{lastResult.address}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pl-4">
            {legalName && (
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAdoptName(legalName)}>
                <CornerDownLeft className="h-3 w-3 mr-1" />Use this name
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
        <span>Verified via VIES on {new Date(cache.validated_at).toLocaleDateString()}{cache.name ? <> — registered as <strong>{cache.name}</strong></> : ''}.</span>
      </p>
    );
  }
  if (cache?.validated === false && cache.validated_at) {
    return (
      <p className="text-xs text-destructive flex items-start gap-1.5 mt-1.5">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>Last VIES check on {new Date(cache.validated_at).toLocaleDateString()} returned invalid.</span>
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
const ViesStatusBadge: React.FC<{ cache: { validated: boolean | null; validated_at: string | null; name: string | null; address: string | null } | null }> = ({ cache }) => {
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

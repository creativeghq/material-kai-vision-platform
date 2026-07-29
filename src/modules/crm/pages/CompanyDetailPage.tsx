import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ModuleTabGate } from '@/components/core/ModuleTabGate';
import { ArrowLeft, Building2, MapPin, Globe, FileText, Save, Users, Trash2, Plus, Receipt, Percent, Package, Tag, Tags, Send, ShieldCheck, Loader2, Wallet, MessageSquare, Phone, ChevronDown, Clock, TrendingUp, RefreshCw, FolderKanban } from 'lucide-react';
import { PartyProjectsCard } from '@/modules/projects/components/PartyProjectsCard';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/core/ui/collapsible';
import {
  CustomerAccountOverview,
  CustomerTopItemsCard,
  PartyPaymentsCard,
} from '@/modules/finance/components/CustomerFinanceTabs';
import { PartyInboundDocsCard } from '@/modules/finance/components/PartyInboundDocsCard';
import { OrdersPanel } from '@/modules/finance/components/OrdersPanel';
import { CustomerFinanceRulesCard } from '@/modules/finance/components/CustomerFinanceRulesCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { companiesAPI } from '@/services/crm.service';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { financeService } from '@/modules/finance/services/financeService';
import { flowEventService } from '@/services/flows/flowEventService';
import { validateVatViaVies } from '@/services/viesService';
import { researchCompany, summarizeResearch, missingSoftIdentity } from '@/modules/crm/services/companyResearch';
import { CompanyRegistryDetails, type KadEntry } from '@/modules/crm/components/CompanyRegistryDetails';
import { crmActivitiesService } from '@/services/crmActivitiesService';
import { CategoryAssignmentPicker } from '@/components/business/catalogs/CategoryAssignmentPicker';
import { CollapsibleCard } from '@/components/business/crm/CollapsibleCard';
import { ContactSearchDropdown } from '@/components/business/crm/ContactSearchDropdown';
import { SupplierProductsTab } from '@/components/business/crm/SupplierProductsTab';
import { CompanyMarketTab } from '@/modules/crm/components/market/CompanyMarketTab';
import { type TimelinePerson } from '@/components/business/crm/CrmActivityTimeline';
import { CrmRecordActivity, type CrmRecordActivityHandle } from '@/components/business/crm/CrmRecordActivity';
import { CrmBankAccountsCard } from '@/components/business/crm/CrmBankAccountsCard';
import { CrmPhonesCard } from '@/components/business/crm/CrmPhonesCard';
import { AddressUnitsManager } from '@/modules/crm/components/AddressUnitsManager';
import { FactoryLinkCard } from '@/modules/crm/components/FactoryLinkCard';
import { IndustrySelect } from '@/components/business/crm/IndustrySelect';
import { Switch } from '@/components/core/ui/switch';
import { Checkbox } from '@/components/core/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { VAT_COUNTRY_OPTIONS } from '@/lib/vatCountries';
import { MYDATA_EXEMPTION_CATEGORIES } from '@/lib/mydataExemptionCategories';
import { InlineText, InlineSelect } from '@/components/business/crm/inline/InlineFields';

interface Company {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  industry?: string;
  employee_count?: string; // TEXT in database - can be ranges like "1-10", "50-100", "500+"
  annual_revenue?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  description?: string;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  discount_percent?: number | null;
  discount_notes?: string | null;
  credit_limit?: number | null;
  user_level_key?: string | null; // #227 — pricing level
  prices_vat_inclusive?: boolean | null; // #227 — gross display for this customer
  is_supplier?: boolean | null;
  is_customer?: boolean | null;
  factory_names?: string[] | null; // supplier↔factory pin (ingested metadata.factory_name values)
  // #207 — commercial depth
  contact_group?: string | null;
  include_in_myf?: boolean | null;
  vat_exemption_reason?: string | null;
  billing_name?: string | null;
  billing_vat?: string | null;
  billing_tax_office?: string | null;
  billing_street?: string | null;
  billing_street_number?: string | null;
  billing_postal_code?: string | null;
  billing_city?: string | null;
  billing_country_code?: string | null;
  vat_number?: string | null;
  country_code?: string | null;
  tax_office?: string | null;
  vat_validated?: boolean | null;
  vat_validated_at?: string | null;
  vat_validated_name?: string | null;
  vat_validated_address?: string | null;
  vat_validation_source?: string | null;
  // ΑΑΔΕ enrichment (Greek businesses) — mirrors the columns the myaade-rgwspublic2 fn writes
  commercial_title?: string | null;
  legal_status?: string | null;
  kad_primary?: string | null;
  kad_primary_description?: string | null;
  kad_secondary?: any;
  business_start_date?: string | null;
  profession?: string | null;
  street?: string | null;
  street_number?: string | null;
  aade_data?: any;
  aade_data_at?: string | null;
  // ΓΕΜΗ enrichment (Greek Commercial Registry) — mirrors columns the mygemi-opendata fn writes
  gemi_number?: string | null;
  gemi_legal_form?: string | null;
  gemi_status?: string | null;
  gemi_data?: any;
  gemi_data_at?: string | null;
  // Normalized queryable ΚΑΔ (merged ΑΑΔΕ + ΓΕΜΗ) — [{code, description, source, primary}]
  kad_all?: any;
  kad_codes?: string[] | null;
  created_at: string;
  updated_at?: string;
  created_by?: string;
  contacts?: any[];
}

/**
 * Company Detail Page
 * Full page view for a single CRM company with comprehensive information
 * Supports creating new companies when id is "new"
 */
export const CompanyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const [pricingLevels, setPricingLevels] = useState<Array<{ level_key: string; label: string }>>([]);
  const isNew = id === 'new';
  // The role-first Add Company modal hands off a prefill (chosen role + any VIES/ΑΑΔΕ lookup)
  // via router state so the create form opens pre-populated for review before saving.
  const prefill = (location.state as { prefill?: Partial<Company> } | null)?.prefill;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viesBusy, setViesBusy] = useState(false);
  const [aadeBusy, setAadeBusy] = useState(false);
  // Sub-phase label while the research chain runs ("Checking ΓΕΜΗ registry…").
  const [researchStatus, setResearchStatus] = useState<string | null>(null);
  /** Outcome of the last research run, kept visible after the toast is gone. */
  const [researchSummary, setResearchSummary] = useState<string | null>(null);
  // Which top-level record tab is showing (activity-first record layout, 2026-07).
  // Companies open on Activity — the unified feed (notes/calls/meetings/tracked actions),
  // aligned with the contact record.
  const [mainTab, setMainTab] = useState('activity');
  // Bump to force the Activity timeline to reload after the PAGE logs something
  // (registry enrichment, etc). Email logging is owned by CrmRecordActivity itself.
  const [activityRefresh, setActivityRefresh] = useState(0);
  // Imperative handle to open the shared Activity email composer from the sidebar /
  // Details quick-actions (works from any tab — the tab is force-mounted).
  const activityRef = useRef<CrmRecordActivityHandle>(null);
  const [company, setCompany] = useState<Company | null>(isNew ? {
    id: '',
    name: '',
    email: '',
    phone: '',
    website: '',
    industry: '',
    employee_count: '',
    annual_revenue: '',
    address: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
    description: '',
    linkedin: '',
    twitter: '',
    facebook: '',
    discount_percent: null,
    discount_notes: '',
    credit_limit: null,
    is_supplier: false,
    is_customer: false,
    factory_names: [],
    created_at: new Date().toISOString(),
    contacts: [],
    ...prefill,
  } : null);
  const [showAddContactDialog, setShowAddContactDialog] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [contactRole, setContactRole] = useState<string>('');
  const [isPrimaryContact, setIsPrimaryContact] = useState(false);
  const [contactNotes, setContactNotes] = useState<string>('');
  const [attachingContact, setAttachingContact] = useState(false);
  // Add-contact dialog can either link an existing contact or create a brand-new one
  // (created then attached in one step). New-contact fields:
  const [contactMode, setContactMode] = useState<'existing' | 'new'>('existing');
  const [newContactName, setNewContactName] = useState<string>('');
  const [newContactEmail, setNewContactEmail] = useState<string>('');
  const [newContactPhone, setNewContactPhone] = useState<string>('');
  const [newContactPosition, setNewContactPosition] = useState<string>('');

  useEffect(() => {
    if (id && !isNew) {
      loadCompany();
    }
  }, [id, isNew]);

  const loadCompany = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const response = await companiesAPI.getCompany(id);
      setCompany(response.data);
    } catch (error) {
      console.error('Error loading company:', error);
      toast({
        title: 'Error',
        description: 'Failed to load company details',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Create-new only. Existing companies self-save per field (view-first inline edit).
  const handleSave = async () => {
    if (!company) return;
    if (!company.name || company.name.trim() === '') {
      toast({ title: 'Validation Error', description: 'Company name is required', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      const response = await companiesAPI.createCompany(company);
      toast({ title: 'Success', description: 'Company created successfully' });
      navigate(`/admin/crm/companies/${response.data.id}`, { replace: true });
    } catch (error) {
      console.error('Error creating company:', error);
      toast({ title: 'Error', description: 'Failed to create company', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  /** #227 — pricing level/discount route through the approval RPC, not patchInline. */
  const savePricing = async (updates: { user_level_key?: string | null; discount_percent?: number | null }) => {
    if (!company) return;
    const next = { ...company, ...updates };
    setCompany(next);
    if (isNew || !id) return;
    try {
      const res = await financeService.proposeOrApplyCustomerPricing({
        subjectType: 'company', subjectId: id,
        userLevelKey: next.user_level_key ?? null,
        discountPercent: next.discount_percent ?? null,
      });
      if (res.status === 'pending') {
        const approvers = await financeService.listWorkspaceApproverIds(activeWorkspaceId!).catch(() => []);
        for (const uid of approvers) {
          flowEventService.emit('pricing_change_requested', {
            workspace_id: activeWorkspaceId, request_id: res.request_id, user_id: uid,
            subject_type: 'company', subject_id: id,
            title: 'Discount change needs approval',
            body: 'A sales team member proposed a customer discount/level change.',
          });
        }
        toast({ title: 'Discount change sent for approval' });
      }
    } catch (e: any) {
      toast({ title: 'Pricing change failed', description: e?.message, variant: 'destructive' });
      await loadCompany();
    }
  };

  // #227 — load this workspace's pricing levels for the customer-level dropdown.
  useEffect(() => {
    if (!activeWorkspaceId) return;
    financeService.listUserLevels(activeWorkspaceId)
      .then((rows) => setPricingLevels(rows.map((r) => ({ level_key: r.level_key, label: r.label }))))
      .catch(() => { /* non-fatal — dropdown just shows Default */ });
  }, [activeWorkspaceId]);

  /**
   * Validate the company's EU VAT number against VIES (reuses the existing
   * `vies-validate` edge function via viesService). On success the edge function
   * persists vat_validated* back onto crm_companies, so we reload to pick up the
   * authoritative snapshot. Greek ΑΦΜ numbers carry an "EL" prefix in VIES.
   */
  const handleVies = async () => {
    if (!company || !company.vat_number?.trim() || !company.country_code?.trim()) {
      toast({ title: 'VAT number required', description: 'Enter a country code and VAT number first.', variant: 'destructive' });
      return;
    }
    if (isNew || !id) {
      toast({ title: 'Save first', description: 'Create the company before validating its VAT number.', variant: 'destructive' });
      return;
    }
    setViesBusy(true);
    try {
      const result = await validateVatViaVies({
        countryCode: company.country_code,
        vatNumber: company.vat_number,
        companyId: id,
      });
      if (result.skipped_reason === 'non_eu') {
        toast({ title: 'VIES skipped', description: result.message || 'VIES only validates EU VAT numbers.' });
      } else if (result.skipped_reason === 'vies_unreachable') {
        toast({ title: 'VIES unavailable', description: result.message || 'Could not reach the VIES service. Try again later.', variant: 'destructive' });
      } else if (result.valid === true) {
        toast({ title: 'VAT verified', description: result.name ? `Registered as ${result.name}` : 'Number is valid.' });
        await loadCompany();
      } else if (result.valid === false) {
        toast({ title: 'VAT not valid', description: 'VIES does not recognise this VAT number for the given country.', variant: 'destructive' });
        await loadCompany();
      } else {
        toast({ title: 'VIES unavailable', description: result.message || 'Could not reach the VIES service. Try again later.', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Validation failed', description: err instanceof Error ? err.message : 'VIES request failed', variant: 'destructive' });
    } finally {
      setViesBusy(false);
    }
  };

  /**
   * Full research pass for this company — ΑΑΔΕ (Greek registry) → ΓΕΜΗ (Γ.Ε.ΜΗ. number, legal
   * form, status) → web/Apollo business research (website, phone, socials, industry). One shared
   * routine ([[researchCompany]]) drives every surface that researches a party, so the Tax-tab
   * buttons, the header refresh, Add Company and the Expenses inbox all produce the same result.
   *
   * Manual by design: the operator controls when the ΑΑΔΕ TAXISnet notification fires. Passing
   * companyId lets the edge functions cache their raw payloads server-side; we mirror the patch
   * into local state through patchInline so the form updates instantly.
   *
   * Counterparty lookup is legitimate here: we only research businesses we have a real
   * relationship with (a CRM customer/supplier we invoice or are invoiced by).
   *
   * @param opts.silentSkip suppress the "needs a VAT number" error — used by the header refresh,
   *   which falls back to name-only web research when there is no Greek ΑΦΜ.
   */
  const runResearch = async (opts?: { silentSkip?: boolean }) => {
    if (!company) return;
    const rawAfm = (company.vat_number || '').replace(/[^0-9]/g, '');
    const hasAfm = rawAfm.length === 9;
    if (!hasAfm && !opts?.silentSkip) {
      toast({ title: 'Need a 9-digit VAT number', description: 'Type the Greek VAT number (9 digits) in the VAT field first.', variant: 'destructive' });
      return;
    }
    if (!hasAfm && !company.name?.trim()) {
      toast({ title: 'Nothing to research', description: 'Add a VAT number or a company name first.', variant: 'destructive' });
      return;
    }
    setAadeBusy(true);
    try {
      const res = await researchCompany({
        vatNumber: company.vat_number,
        countryCode: company.country_code,
        name: company.name,
        countryName: company.country,
        companyId: isNew ? undefined : id,
        workspaceId: activeWorkspaceId ?? undefined,
        reason: 'crm_enrichment',
        existing: company as unknown as Record<string, unknown>,
        onProgress: setResearchStatus,
      });
      if (Object.keys(res.fields).length > 0) {
        await patchInline(res.fields as Partial<Company>);
      }
      const failed = res.steps.filter((s) => s.status === 'failed');
      const summary = summarizeResearch(res.steps);
      toast({
        title: res.ok ? 'Company refreshed' : 'Nothing new found',
        description: summary,
        variant: res.ok ? undefined : (failed.length ? 'destructive' : undefined),
      });
      // Keep the outcome on the record, not just in a toast that vanishes. A run where the
      // registries answered but the web pass found no phone/industry is a PARTIAL success, and
      // the operator has to be able to see that after the toast is gone.
      const stillMissing = missingSoftIdentity({ ...(company as any), ...res.fields });
      setResearchSummary(
        stillMissing.length ? `${summary} Still missing: ${stillMissing.join(', ')}.` : summary,
      );

      // Log a CRM activity so the enrichment shows up in the company timeline (fire-and-forget).
      if (res.ok && !isNew && id) {
        const sources = res.steps.filter((s) => s.status === 'ok').map((s) => ({ aade: 'ΑΑΔΕ', gemi: 'ΓΕΜΗ', enrich: 'business research' } as const)[s.step]);
        crmActivitiesService.log({ kind: 'company', id }, {
          activity_type: 'registry_enrichment',
          title: `Refreshed from ${sources.join(' + ')}`,
          description: `Updated ${Object.keys(res.fields).length} field${Object.keys(res.fields).length === 1 ? '' : 's'}${res.resolvedName ? ` for ${res.resolvedName}` : ''}.`,
          workspace_id: activeWorkspaceId ?? null,
        }).then(bumpActivity);
      }
    } finally {
      setAadeBusy(false);
      setResearchStatus(null);
    }
  };

  /** Tax-tab buttons keep their old name / behaviour (VAT is required there). */
  const lookupAade = () => runResearch();

  /**
   * Inline patch for fields that should save on change without entering the
   * page's "Edit" mode (admin role flags, etc). Optimistic update + revert on
   * failure. Skipped on the create-new flow (no id yet).
   */
  const patchInline = async (updates: Partial<Company>) => {
    if (!company || !id || isNew) {
      if (company) setCompany((prev) => prev ? { ...prev, ...updates } : prev);
      return;
    }
    let snapshot: Company | null = null;
    setCompany((prev) => { snapshot = prev; return prev ? { ...prev, ...updates } : prev; });
    try {
      const saved = await companiesAPI.updateCompany(id, updates);
      // The DB normalizes country/country_code/state on write (crm_normalize_country) — typing
      // "Greece" fills the VAT country as EL. Merge those three back so the Tax & VAT tab shows
      // the derived value immediately instead of only after a reload. Deliberately NOT a whole-row
      // overwrite: another field may have been edited optimistically while this request was in flight.
      const row = (saved as { data?: Partial<Company> } | undefined)?.data;
      if (row && ('country' in updates || 'country_code' in updates || 'state' in updates)) {
        setCompany((prev) => prev
          ? { ...prev, country: row.country ?? null, country_code: row.country_code ?? null, state: row.state ?? null }
          : prev);
      }
    } catch (error) {
      console.error('Inline patch failed:', error);
      if (snapshot) setCompany(snapshot);
      toast({
        title: 'Could not save',
        description: error instanceof Error ? error.message : 'Try again',
        variant: 'destructive',
      });
    }
  };

  const bumpActivity = () => setActivityRefresh((n) => n + 1);

  // Supplier↔factory pin. Persist the new pin list, then claim: re-point every matching
  // product's brand_company_id onto this company + fold in any duplicate auto-created brand
  // node. This makes the pin authoritative immediately (not just for future ingests) and keeps
  // the FK — read by SupplierProductsTab — as the single source of truth.
  const handleFactoryPinChange = async (names: string[]) => {
    await patchInline({ factory_names: names });
    if (isNew || !id || !activeWorkspaceId) return;
    try {
      const { data, error } = await supabase.rpc('claim_brand_for_company', {
        p_workspace_id: activeWorkspaceId, p_company_id: id, p_names: names,
      });
      if (error) throw error;
      const claimed = (data as any)?.claimed ?? 0;
      const merged = (data as any)?.merged ?? 0;
      if (claimed > 0 || merged > 0) {
        toast({ title: 'Products linked', description: `Claimed ${claimed} product${claimed === 1 ? '' : 's'}${merged ? `, merged ${merged} duplicate brand node${merged === 1 ? '' : 's'}` : ''}.` });
      }
      await loadCompany();
    } catch (e: any) {
      toast({ title: 'Could not link products', description: e?.message ?? 'Try again', variant: 'destructive' });
    }
  };

  const resetContactDialog = () => {
    setShowAddContactDialog(false);
    setContactMode('existing');
    setSelectedContactId('');
    setContactRole('');
    setIsPrimaryContact(false);
    setContactNotes('');
    setNewContactName('');
    setNewContactEmail('');
    setNewContactPhone('');
    setNewContactPosition('');
  };

  const handleAttachContact = async () => {
    if (!id) return;
    // In "new" mode we create the contact first, then attach the resulting id.
    if (contactMode === 'new' && !newContactName.trim()) return;
    if (contactMode === 'existing' && !selectedContactId) return;
    try {
      setAttachingContact(true);
      if (contactMode === 'new') {
        // Single round trip: the server creates the contact in this company's workspace
        // and attaches it, rolling the contact back if the attach fails.
        await companiesAPI.createAndAttachContact(
          id,
          {
            name: newContactName.trim(),
            email: newContactEmail.trim() || undefined,
            phone: newContactPhone.trim() || undefined,
            position: newContactPosition.trim() || undefined,
          },
          contactRole,
          isPrimaryContact,
          contactNotes,
        );
      } else {
        await companiesAPI.attachContact(
          id,
          selectedContactId,
          contactRole,
          isPrimaryContact,
          contactNotes,
        );
      }
      toast({
        title: 'Success',
        description: contactMode === 'new'
          ? 'Contact created and attached to company'
          : 'Contact attached to company successfully',
      });
      resetContactDialog();
      await loadCompany();
    } catch (error: any) {
      console.error('Error attaching contact:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to attach contact to company',
        variant: 'destructive',
      });
    } finally {
      setAttachingContact(false);
    }
  };

  const handleDetachContact = async (relationshipId: string) => {
    if (!id || !confirm('Are you sure you want to remove this contact from the company?')) return;
    try {
      await companiesAPI.detachContact(id, relationshipId);
      toast({
        title: 'Success',
        description: 'Contact removed from company successfully',
      });
      await loadCompany();
    } catch (error: any) {
      console.error('Error removing contact:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove contact from company',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-3 sm:p-6">
        <div className="text-center py-12">Loading company details...</div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader
          title="Company Not Found"
          description="The requested company could not be found"
          badge="CRM"
/>
        <div className="p-6">
          <Button variant="ghost" onClick={() => navigate('/admin/crm')}>
            <ArrowLeft className="h-4 w-4 mr-2"/>
            Back to CRM
          </Button>
        </div>
      </div>
    );
  }

  // Role gating: a pure supplier (is_supplier && !is_customer) hides the whole
  // commercial schema (pricing, discounts, invoicing, customer finance tabs) — we
  // buy from them, we don't sell to them. Customers (or both, or legacy rows with
  // neither flag) keep the full commercial profile. Supplier features (Products tab,
  // factory link) show whenever is_supplier is set.
  const isPureSupplier = !!company.is_supplier && !company.is_customer;
  const showCommercial = !isPureSupplier;
  const showSupplierFeatures = !!company.is_supplier;
  const initials = (company.name || '?').trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
  // People the Activity composer can email / add as meeting attendees: the company's own
  // inbox (emailable only) + each attached contact.
  const timelinePeople: TimelinePerson[] = [
    ...(company.email ? [{ id: company.id || 'company', name: company.name || 'Company', email: company.email, kind: 'company' as const }] : []),
    ...((company.contacts ?? []).map((c: any) => ({ id: c.contact_id, name: c.contact_name, email: c.contact_email, kind: 'contact' as const }))),
  ];

  return (
    <div className="min-h-screen">
      <div className="p-3 sm:p-6 space-y-5">
        {/* Header Actions */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button variant="ghost" onClick={() => navigate('/admin/crm')}>
            <ArrowLeft className="h-4 w-4 mr-2"/>
            Back to CRM
          </Button>
          {/* View-first: existing companies save per field inline. Only create needs Create/Cancel. */}
          {isNew ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/admin/crm')}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2"/>
                {saving ? 'Saving...' : 'Create Company'}
              </Button>
            </div>
          ) : (
            /* Refresh = re-run the whole research chain (ΑΑΔΕ → ΓΕΜΗ → business research) and
               write what it finds straight onto this record. Registry data overwrites; web
               research only fills blanks. */
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                {researchStatus && <span className="text-xs text-muted-foreground">{researchStatus}</span>}
                <Button
                  variant="outline"
                  onClick={() => runResearch({ silentSkip: true })}
                  disabled={aadeBusy}
                  title="Refresh from ΑΑΔΕ + ΓΕΜΗ registries and re-run business research (website, phone, socials)"
                >
                  {aadeBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <RefreshCw className="h-4 w-4 mr-2"/>}
                  {aadeBusy ? 'Researching…' : 'Refresh research'}
                </Button>
              </div>
              {researchSummary && !aadeBusy && (
                <p className="text-[11px] text-muted-foreground max-w-md text-right leading-snug">{researchSummary}</p>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
          {/* ── SIDEBAR: identity, quick actions, Company Details ── */}
          <aside className="space-y-3 lg:sticky lg:top-4">
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground text-lg font-medium">{initials}</div>
                  <div className="min-w-0">
                    <div className="text-lg font-medium leading-tight truncate">{company.name || 'Untitled Company'}</div>
                    <div className="text-sm text-muted-foreground truncate">{[company.city, company.country].filter(Boolean).join(', ') || 'Company'}</div>
                  </div>
                </div>
                {(company.is_customer || company.is_supplier) && (
                  <div className="flex flex-wrap gap-1.5">
                    {company.is_customer && <Badge variant="secondary">Customer</Badge>}
                    {company.is_supplier && <Badge variant="secondary">Supplier</Badge>}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-1.5">
                  <button type="button" onClick={() => activityRef.current?.composeEmail()} disabled={!timelinePeople.some((p) => p.email)}
                    className="flex flex-col items-center gap-1 rounded-lg border py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-40 disabled:pointer-events-none">
                    <Send className="h-4 w-4" /> Email
                  </button>
                  {company.phone ? (
                    <a href={`tel:${company.phone}`}
                      className="flex flex-col items-center gap-1 rounded-lg border py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                      <Phone className="h-4 w-4" /> Call
                    </a>
                  ) : (
                    <button type="button" disabled
                      className="flex flex-col items-center gap-1 rounded-lg border py-2 text-[10px] font-medium text-muted-foreground opacity-40 pointer-events-none">
                      <Phone className="h-4 w-4" /> Call
                    </button>
                  )}
                  <button type="button" onClick={() => setMainTab('activity')}
                    className="flex flex-col items-center gap-1 rounded-lg border py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                    <MessageSquare className="h-4 w-4" /> Note
                  </button>
                </div>
              </CardContent>
            </Card>

            <CollapsibleCard title="Company Details" icon={Building2} defaultOpen contentClassName="space-y-4">
                <div className="grid grid-cols-1 gap-y-2">
                  <div>
                    <InlineText alwaysEdit={isNew} label="Company Name *" value={company.name} onSave={(v) => patchInline({ name: (v as string) ?? '' })} placeholder="Acme LLC" copy={false} />
                  </div>
                  {isNew ? (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">Industry</div>
                      <p className="text-sm text-muted-foreground mt-0.5">Save the company first to assign industries.</p>
                    </div>
                  ) : (
                    <IndustrySelect label="Industry" companyId={id!} onChange={(names) => patchInline({ industry: names.join(', ') })} />
                  )}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <InlineText alwaysEdit={isNew} type="email" label="Email" value={company.email} onSave={(v) => patchInline({ email: v })} placeholder="contact@company.com" />
                    </div>
                    <Button type="button" size="icon" variant="ghost" onClick={() => activityRef.current?.composeEmail(company.email ? { email: company.email, name: company.name || null } : undefined)} disabled={!company.email}
                      title={company.email ? `Send email to ${company.email}` : 'No email on file'} className="shrink-0 mb-0.5 text-muted-foreground hover:bg-transparent hover:text-foreground">
                      <Send className="h-4 w-4"/>
                    </Button>
                  </div>
                  <InlineText alwaysEdit={isNew} type="tel" label="Phone" value={company.phone} onSave={(v) => patchInline({ phone: v })} placeholder="+1 (555) 123-4567" />
                  <InlineText alwaysEdit={isNew} type="url" label="Website" value={company.website} onSave={(v) => patchInline({ website: v })} placeholder="https://company.com" />
                  <InlineText alwaysEdit={isNew} label="Employee Count" value={company.employee_count} onSave={(v) => patchInline({ employee_count: v })} placeholder="e.g. 1-10, 50, 500+" copy={false} />
                  <InlineText alwaysEdit={isNew} label="Annual Revenue" value={company.annual_revenue} onSave={(v) => patchInline({ annual_revenue: v })} placeholder="e.g. $1M - $10M" copy={false} />
                  <div>
                    <InlineText alwaysEdit={isNew} multiline label="Description" value={company.description} onSave={(v) => patchInline({ description: v })} placeholder="Brief description of the company…" copy={false} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-3 mt-1 border-t">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Tag className="h-3.5 w-3.5"/>Role</span>
                    <label htmlFor="role_is_customer" className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox id="role_is_customer" checked={!!company.is_customer} onCheckedChange={(v) => patchInline({ is_customer: v === true })} />
                      Customer
                    </label>
                    <label htmlFor="role_is_supplier" className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox id="role_is_supplier" checked={!!company.is_supplier} onCheckedChange={(v) => patchInline({ is_supplier: v === true })} />
                      Supplier
                    </label>
                  </div>
                </div>
            </CollapsibleCard>

            <div className="px-1 text-xs text-muted-foreground">
              Created {new Date(company.created_at).toLocaleDateString()}{company.updated_at ? ` · Updated ${new Date(company.updated_at).toLocaleDateString()}` : ''}
            </div>
          </aside>

          {/* ── MAIN: activity-first tabs ── */}
          <div className="min-w-0">
            <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4">
              <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                <TabsTrigger value="activity" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Clock className="h-4 w-4 mr-2"/>Activity</TabsTrigger>
                <TabsTrigger value="details" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Building2 className="h-4 w-4 mr-2"/>Details</TabsTrigger>
                {(showCommercial || showSupplierFeatures) && (
                  <TabsTrigger value="account" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Wallet className="h-4 w-4 mr-2"/>Account</TabsTrigger>
                )}
                <TabsTrigger value="contacts" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Users className="h-4 w-4 mr-2"/>Contacts ({company.contacts?.length || 0})</TabsTrigger>
                <TabsTrigger value="projects" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><FolderKanban className="h-4 w-4 mr-2"/>Projects</TabsTrigger>
                {company.is_supplier && (
                  <TabsTrigger value="products" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Package className="h-4 w-4 mr-2"/>Products</TabsTrigger>
                )}
                {company.is_supplier && !isNew && (
                  <TabsTrigger value="market" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><TrendingUp className="h-4 w-4 mr-2"/>Market</TabsTrigger>
                )}
                <TabsTrigger value="social" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Globe className="h-4 w-4 mr-2"/>Social &amp; Web</TabsTrigger>
              </TabsList>

              {/* Details — section nav (left) + property panel (right). */}
              <TabsContent value="details">
                <Tabs defaultValue="address" orientation="vertical" className="flex flex-col gap-6 sm:flex-row sm:items-start">
                  <TabsList className="h-auto w-full shrink-0 flex-row flex-wrap justify-start gap-1 bg-transparent p-0 sm:w-52 sm:flex-col sm:flex-nowrap">
                    <TabsTrigger value="address" className="w-full justify-start data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><MapPin className="h-4 w-4 mr-2"/>Address &amp; Phone</TabsTrigger>
                    <TabsTrigger value="tax" className="w-full justify-start data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><ShieldCheck className="h-4 w-4 mr-2"/>Tax &amp; VAT</TabsTrigger>
                    {showCommercial && (
                      <TabsTrigger value="commercial" className="w-full justify-start data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Receipt className="h-4 w-4 mr-2"/>Commercial &amp; VAT</TabsTrigger>
                    )}
                    {company.id && (
                      <TabsTrigger value="categories" className="w-full justify-start data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Tags className="h-4 w-4 mr-2"/>Categories</TabsTrigger>
                    )}
                    {showSupplierFeatures && (
                      <TabsTrigger value="factory" className="w-full justify-start data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Package className="h-4 w-4 mr-2"/>Factory Link</TabsTrigger>
                    )}
                  </TabsList>

                  <div className="min-w-0 w-full flex-1 space-y-4">
                    <TabsContent value="address" className="mt-0 space-y-4">
                      <Card><CardContent className="p-4">
                        <div className="mb-3 text-xs font-medium text-muted-foreground">Main address</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                          <InlineText alwaysEdit={isNew} label="Street Address" value={company.address} onSave={(v) => patchInline({ address: v })} placeholder="123 Main Street" />
                          <InlineText alwaysEdit={isNew} label="City" value={company.city} onSave={(v) => patchInline({ city: v })} placeholder="San Francisco" />
                          <InlineText alwaysEdit={isNew} label="State / Province" value={company.state} onSave={(v) => patchInline({ state: v })} placeholder="CA" />
                          <InlineText alwaysEdit={isNew} label="Postal Code" value={company.postal_code} onSave={(v) => patchInline({ postal_code: v })} placeholder="94102" />
                          <InlineText alwaysEdit={isNew} label="Country" value={company.country} onSave={(v) => patchInline({ country: v })} placeholder="United States" />
                        </div>
                      </CardContent></Card>
                      <AddressUnitsManager companyId={isNew ? undefined : id} />
                      {activeWorkspaceId && (
                        <CrmPhonesCard workspaceId={activeWorkspaceId} companyId={isNew ? undefined : id} />
                      )}
                    </TabsContent>

                    <TabsContent value="tax" className="mt-0 space-y-4">
                      {!company.aade_data_at && (
                      <Card className="border-primary/30 bg-primary/5">
                        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-end gap-3">
                          <div className="flex-1 space-y-1.5">
                            <Label htmlFor="aade-vat" className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Import with myAADE</Label>
                            <p className="text-xs text-muted-foreground">Enter a Greek VAT number (ΑΦΜ) to pull the official business name, address, tax office (ΔΟΥ) and activity straight from the ΑΑΔΕ registry.</p>
                            <Input id="aade-vat" value={company.vat_number || ''} onChange={(e) => setCompany((prev) => prev ? { ...prev, vat_number: e.target.value } : prev)} onBlur={(e) => { if ((e.target.value || '') !== '') patchInline({ vat_number: e.target.value }); }} placeholder="9-digit ΑΦΜ" className="max-w-xs" />
                          </div>
                          <Button onClick={lookupAade} disabled={aadeBusy || (company.vat_number || '').replace(/[^0-9]/g, '').length !== 9}>
                            {aadeBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                            Import with myAADE
                          </Button>
                        </CardContent>
                      </Card>
                      )}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted-foreground"/>Tax &amp; VAT</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
                            <InlineSelect alwaysEdit={isNew} label="VAT Country" value={company.country_code ?? undefined} placeholder="Not set" options={VAT_COUNTRY_OPTIONS.map((o) => ({ value: o.code, searchText: `${o.code} ${o.name}`, label: <span className="flex items-center gap-2"><span className="font-mono text-[10px] w-7">{o.code}</span>{o.name}{o.eu && <Badge variant="outline" className="text-[9px] py-0">EU</Badge>}</span> }))} displayValue={company.country_code ? <span className="font-mono">{company.country_code}</span> : undefined} onSave={(v) => patchInline({ country_code: v })} />
                            <InlineText alwaysEdit={isNew} label="VAT Number" value={company.vat_number} onSave={(v) => patchInline({ vat_number: v })} placeholder="123456789" />
                            <InlineText alwaysEdit={isNew} label="Tax Office" value={company.tax_office} onSave={(v) => patchInline({ tax_office: v })} placeholder="Optional" />
                            <InlineText alwaysEdit={isNew} label="Γ.Ε.ΜΗ. (GEMI) Number" value={company.gemi_number} onSave={(v) => patchInline({ gemi_number: v })} placeholder="Auto-filled from ΓΕΜΗ" />
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            {(company.country_code || '').toUpperCase() === 'EL' && (company.vat_number || '').replace(/[^0-9]/g, '').length === 9 && (
                              <Button type="button" variant="outline" onClick={lookupAade} disabled={aadeBusy} title="Fetch full business details from AADE and pre-fill the form">
                                {aadeBusy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Building2 className="h-4 w-4"/>}
                                Fetch from AADE + ΓΕΜΗ
                              </Button>
                            )}
                            <Button type="button" variant="outline" onClick={handleVies} disabled={viesBusy || !company.vat_number?.trim() || !company.country_code?.trim()}>
                              {viesBusy ? <Loader2 className="h-4 w-4 animate-spin"/> : <ShieldCheck className="h-4 w-4"/>}
                              Validate (VIES)
                            </Button>
                            {company.vat_validated === true && (
                              <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">{company.vat_validation_source === 'aade' ? 'AADE Active' : 'VAT verified'}{company.vat_validated_at ? ` · ${new Date(company.vat_validated_at).toLocaleDateString()}` : ''}</Badge>
                            )}
                            {company.vat_validated === false && (
                              <Badge variant="destructive">{company.vat_validation_source === 'aade' ? 'AADE: business inactive' : 'VAT not recognised by VIES'}</Badge>
                            )}
                            {company.vat_validated_name && (<span className="text-sm text-muted-foreground">Registered as <span className="text-foreground">{company.vat_validated_name}</span></span>)}
                          </div>
                          {company.vat_validated_address && (<p className="text-xs text-muted-foreground">{company.vat_validated_address}</p>)}
                          {(company.kad_primary || company.legal_status || company.commercial_title || (Array.isArray(company.kad_all) && company.kad_all.length > 0) || company.gemi_data) && (
                            <div className="rounded-md border border-primary/15 bg-primary/[0.03] p-3 space-y-1 text-xs">
                              {company.commercial_title && (<div><span className="text-muted-foreground">Commercial title: </span><span className="text-foreground">{company.commercial_title}</span></div>)}
                              {company.legal_status && (<div><span className="text-muted-foreground">Legal form: </span><span className="text-foreground">{company.legal_status}</span></div>)}
                              {company.kad_primary && (<div><span className="text-muted-foreground">Primary activity code (KAD): </span><span className="text-foreground">{company.kad_primary}{company.kad_primary_description ? ` — ${company.kad_primary_description}` : ''}</span></div>)}
                              {company.business_start_date && (<div><span className="text-muted-foreground">Operating since: </span><span className="text-foreground">{company.business_start_date}</span></div>)}
                              <CompanyRegistryDetails companyId={isNew ? undefined : id} kadAll={company.kad_all as KadEntry[] | null | undefined} gemiData={company.gemi_data} onContactAdded={() => loadCompany()} />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      {!isNew && id && activeWorkspaceId && (
                        <CrmBankAccountsCard workspaceId={activeWorkspaceId} companyId={id} />
                      )}
                    </TabsContent>

                    {showCommercial && (
                      <TabsContent value="commercial" className="mt-0 space-y-4">
                        <Card>
                          <CardHeader><CardTitle className="flex items-center gap-2"><Percent className="h-4 w-4"/>Pricing</CardTitle></CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                              <InlineSelect alwaysEdit={isNew} label="Pricing level" value={company.user_level_key ?? undefined} unsetValue="__default__" placeholder="Standard" options={pricingLevels.map((l) => ({ value: l.level_key, label: l.label }))} onSave={(v) => savePricing({ user_level_key: v })} hint="Tier this customer buys at — discount applies off retail on quotes." />
                              <InlineText alwaysEdit={isNew} type="number" label="Customer discount % (override)" value={company.discount_percent ?? undefined} onSave={(v) => savePricing({ discount_percent: v })} placeholder="e.g. 50" copy={false} hint="Overrides the level's discount. Empty = use the level." />
                              <div className="md:col-span-2">
                                <InlineText alwaysEdit={isNew} multiline label="Discount notes" value={company.discount_notes} onSave={(v) => patchInline({ discount_notes: v })} placeholder="e.g. Long-term partner — 50% per 2025 agreement." copy={false} />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="h-4 w-4"/>Invoicing &amp; VAT</CardTitle></CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                              <InlineSelect alwaysEdit={isNew} label="Segment" value={company.contact_group ?? undefined} unsetValue="none" placeholder="Unsegmented" options={[{ value: 'b2b', label: 'B2B' }, { value: 'retail', label: 'Retail' }, { value: 'wholesale', label: 'Wholesale' }, { value: 'public_sector', label: 'Public sector' }]} onSave={(v) => patchInline({ contact_group: v })} hint="Groups this party for filtering and statement batches." />
                              <InlineSelect alwaysEdit={isNew} label="Default VAT-exemption category" value={company.vat_exemption_reason ?? undefined} unsetValue="__none" placeholder="None" options={MYDATA_EXEMPTION_CATEGORIES.map((c) => ({ value: String(c.code), searchText: `${c.code} ${c.label}`, label: <span><span className="font-mono text-[10px] mr-2">{c.code}</span>{c.label}</span> }))} displayValue={company.vat_exemption_reason ? <span><span className="font-mono text-[10px] mr-2">{company.vat_exemption_reason}</span>{MYDATA_EXEMPTION_CATEGORIES.find((c) => String(c.code) === company.vat_exemption_reason)?.label}</span> : undefined} onSave={(v) => patchInline({ vat_exemption_reason: v })} hint="Reason a line carries no separately-shown VAT (myDATA codes 1–31). The rate itself (24/13/6%) is set per product/line, not here." />
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <div className="space-y-1">
                                <Label htmlFor="include_in_myf" className="cursor-pointer">Include in MYF report</Label>
                                <p className="text-xs text-muted-foreground">Default for the “Include in MYF report” toggle when invoicing this party (the ΜΥΦ client/supplier ledger summary).</p>
                              </div>
                              <Switch id="include_in_myf" checked={company.include_in_myf !== false} onCheckedChange={(v) => patchInline({ include_in_myf: v })}/>
                            </div>
                            <Collapsible defaultOpen={!!(company.billing_name || company.billing_vat || company.billing_tax_office || company.billing_country_code || company.billing_street || company.billing_city || company.billing_postal_code)}>
                              <div className="rounded-md border border-border/60">
                                <CollapsibleTrigger className="group/bill flex w-full items-center justify-between gap-2 p-3 text-left">
                                  <span className="text-xs"><span className="text-foreground font-medium">Separate billing identity</span> <span className="text-muted-foreground">— only when invoices go to a different legal entity (different ΑΦΜ / name / address)</span></span>
                                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/bill:rotate-180" />
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 p-3 pt-0">
                                    <InlineText alwaysEdit={isNew} label="Billing name" value={company.billing_name} onSave={(v) => patchInline({ billing_name: v })} placeholder="Legal entity name" />
                                    <InlineText alwaysEdit={isNew} label="Billing VAT (ΑΦΜ)" value={company.billing_vat} onSave={(v) => patchInline({ billing_vat: v })} placeholder="EL123456789" />
                                    <InlineText alwaysEdit={isNew} label="Tax office (ΔΟΥ)" value={company.billing_tax_office} onSave={(v) => patchInline({ billing_tax_office: v })} />
                                    <InlineSelect alwaysEdit={isNew} label="VAT country" value={company.billing_country_code ?? undefined} placeholder="Not set" options={VAT_COUNTRY_OPTIONS.map((o) => ({ value: o.code, searchText: `${o.code} ${o.name}`, label: <span><span className="font-mono text-[10px] mr-2">{o.code}</span>{o.name}</span> }))} displayValue={company.billing_country_code ? <span className="font-mono">{company.billing_country_code}</span> : undefined} onSave={(v) => patchInline({ billing_country_code: v })} />
                                    <InlineText alwaysEdit={isNew} label="Street" value={company.billing_street} onSave={(v) => patchInline({ billing_street: v })} />
                                    <InlineText alwaysEdit={isNew} label="Number" value={company.billing_street_number} onSave={(v) => patchInline({ billing_street_number: v })} />
                                    <InlineText alwaysEdit={isNew} label="Postal code" value={company.billing_postal_code} onSave={(v) => patchInline({ billing_postal_code: v })} />
                                    <InlineText alwaysEdit={isNew} label="City" value={company.billing_city} onSave={(v) => patchInline({ billing_city: v })} />
                                  </div>
                                </CollapsibleContent>
                              </div>
                            </Collapsible>
                          </CardContent>
                        </Card>
                      </TabsContent>
                    )}

                    {company.id && (
                      <TabsContent value="categories" className="mt-0">
                        <Card><CardContent className="p-4">
                          <CategoryAssignmentPicker bare target={{ kind: 'company', id: company.id }}/>
                        </CardContent></Card>
                      </TabsContent>
                    )}

                    {showSupplierFeatures && (
                      <TabsContent value="factory" className="mt-0">
                        <FactoryLinkCard value={company.factory_names ?? []} supplierName={company.name} workspaceId={activeWorkspaceId ?? ''} onChange={handleFactoryPinChange} />
                      </TabsContent>
                    )}
                  </div>
                </Tabs>
              </TabsContent>

          {/* Products Tab — only when is_supplier=true. Matches products by name
              against products.metadata.factory_name / manufacturer / brand /
              supplier. Read-only view for now. */}
          {company.is_supplier && (
            <TabsContent value="products" className="space-y-4">
              <SupplierProductsTab workspaceId={activeWorkspaceId ?? ''} companyId={company.id}/>
            </TabsContent>
          )}

          {company.is_supplier && !isNew && (
            <TabsContent value="market" className="space-y-4">
              <CompanyMarketTab
                workspaceId={activeWorkspaceId ?? null}
                companyId={company.id}
                company={{
                  name: company.name,
                  industry: company.industry,
                  kad_codes: company.kad_codes,
                  city: company.city,
                  country: company.country,
                  vat_number: company.vat_number,
                  website: company.website,
                }}
              />
            </TabsContent>
          )}

          {/* Contacts Tab */}
          <TabsContent value="contacts" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Attached Contacts</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Contacts associated with this company
                  </p>
                </div>
                <Button onClick={() => setShowAddContactDialog(true)} size="sm">
                  <Plus className="h-4 w-4 mr-2"/>
                  Add contact
                </Button>
              </CardHeader>
              <CardContent>
                {!company.contacts || company.contacts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-2 opacity-50"/>
                    <p>No contacts attached to this company yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => setShowAddContactDialog(true)}
>
                      <Plus className="h-4 w-4 mr-2"/>
                      Add first contact
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Primary</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {company.contacts.map((contact: any) => (
                        <TableRow key={contact.relationship_id}>
                          <TableCell className="font-medium">
                            <button
                              onClick={() => navigate(`/admin/crm/contacts/${contact.contact_id}`)}
                              className="text-primary hover:underline"
>
                              {contact.contact_name}
                            </button>
                          </TableCell>
                          <TableCell>{contact.role || '-'}</TableCell>
                          <TableCell>
                            {contact.contact_email ? (
                              <a
                                href={`mailto:${contact.contact_email}`}
                                className="text-primary hover:underline"
>
                                {contact.contact_email}
                              </a>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            {contact.contact_phone ? (
                              <a
                                href={`tel:${contact.contact_phone}`}
                                className="text-primary hover:underline"
>
                                {contact.contact_phone}
                              </a>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            {contact.is_primary && (
                              <span className="text-xs text-muted-foreground capitalize">Primary</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDetachContact(contact.relationship_id)}
>
                              <Trash2 className="h-4 w-4 text-red-500"/>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Social & Web Tab */}
          <TabsContent value="social" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Social Media & Web Presence</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                  <InlineText alwaysEdit={isNew} type="url" label="LinkedIn" value={company.linkedin} onSave={(v) => patchInline({ linkedin: v })} placeholder="https://linkedin.com/company/…" />
                  <InlineText alwaysEdit={isNew} type="url" label="Twitter / X" value={company.twitter} onSave={(v) => patchInline({ twitter: v })} placeholder="https://twitter.com/…" />
                  <InlineText alwaysEdit={isNew} type="url" label="Facebook" value={company.facebook} onSave={(v) => patchInline({ facebook: v })} placeholder="https://facebook.com/…" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab — the shared record-activity element (identical to the
              contact record). forceMount keeps it (and its portalled email dialog)
              reachable from the sidebar / Details quick-actions on any tab. */}
          <TabsContent value="activity" forceMount className="space-y-4 data-[state=inactive]:hidden">
            {company.id ? (
              <CrmRecordActivity
                ref={activityRef}
                target={{ kind: 'company', id: company.id }}
                workspaceId={activeWorkspaceId}
                people={timelinePeople}
                recordLabel={company.name}
                refreshKey={activityRefresh}
              />
            ) : (
              <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Create this company to start logging activity.</CardContent></Card>
            )}
          </TabsContent>

          {/* Account = one flow: the money summary up top (orders, owed, paid, net + AR aging),
              then the Orders list itself as the working surface. An order tracks real cash only
              (open an order → Received / money in-out / Invoices / Payments); the per-order
              "virtual receivable/payable" concept was removed. Shown for customers AND suppliers
              — for a supplier the overview flips to "we owe them" + their bills & money-out, and
              the customer-only cards (repeat-buy, pricing rules) are hidden. */}
          {/* Projects — the same shared element the contact record mounts. Includes projects
              booked against this company's people, since that's still the company's work. */}
          <TabsContent value="projects" className="space-y-4">
            {company.id ? (
              <PartyProjectsCard
                companyId={company.id}
                partyName={company.name}
                memberContactIds={(company.contacts ?? []).map((c: any) => c.id).filter(Boolean)}
              />
            ) : (
              <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Save this company first to attach projects.</CardContent></Card>
            )}
          </TabsContent>

          {(showCommercial || showSupplierFeatures) && (
          <TabsContent value="account" className="space-y-4">
            <ModuleTabGate moduleSlug="sales-finance" moduleName="Sales & Finance"
              blurb="Track this company's orders, invoices, payments and balance.">
              {company.id ? (
                <>
                  {/* 1 — Money summary up top: orders count + value, owed (invoiced & on orders),
                         paid, net position, AR aging (or AP / "we owe" for a supplier). */}
                  <CustomerAccountOverview companyId={company.id} customerName={company.name} isSupplier={!!company.is_supplier} ledgerHref={`/finance?tab=parties&party=company:${company.id}`} />
                  {/* 2 — The orders themselves (customer + supplier orders). Click an order to manage
                         its receivables/payables, invoices, supplier bills, payments and dispatch. */}
                  <OrdersPanel workspaceId={activeWorkspaceId ?? ''} companyId={company.id} partyRoles={{ customer: !!company.is_customer, supplier: !!company.is_supplier }} />
                  {/* 2b — Itemised cash movements across all their orders (money in & out), so the
                         payments made to / received from this party are visible at the party level. */}
                  <PartyPaymentsCard companyId={company.id} customerName={company.name} roles={{ customer: !!company.is_customer, supplier: !!company.is_supplier }} />
                  {/* 2c — What this supplier filed against us on myDATA. Matched live by ΑΦΜ, so
                         it appears the moment the CRM record exists — including documents polled
                         long before it. Rows that aren't in Expenses yet say so: they are not in
                         Payables or the P&L until they are. */}
                  {company.is_supplier && activeWorkspaceId && (
                    <PartyInboundDocsCard
                      workspaceId={activeWorkspaceId}
                      companyId={company.id}
                      vatNumber={company.vat_number}
                      inboxHref="/finance?tab=doc_expenses"
                    />
                  )}
                  {/* 3 + 4 — Customer-only: repeat-buy suggestions + finance/pricing rules. */}
                  {showCommercial && <CustomerTopItemsCard companyId={company.id} />}
                  {showCommercial && <CustomerFinanceRulesCard companyId={company.id} />}
                </>
              ) : (
                <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Save this company first to see its account &amp; orders.</CardContent></Card>
              )}
            </ModuleTabGate>
          </TabsContent>
          )}
            </Tabs>
          </div>
        </div>
      </div>

      {/* Add Contact Dialog */}
      <Dialog open={showAddContactDialog} onOpenChange={(o) => { if (!o) resetContactDialog(); else setShowAddContactDialog(true); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Contact to Company</DialogTitle>
            <DialogDescription>
              Link an existing contact or create a new one, then set their role
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Existing vs New toggle */}
            <Tabs value={contactMode} onValueChange={(v) => setContactMode(v as 'existing' | 'new')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="existing">Existing Contact</TabsTrigger>
                <TabsTrigger value="new">New Contact</TabsTrigger>
              </TabsList>
              <TabsContent value="existing" className="mt-4 space-y-2">
                <Label>Contact *</Label>
                <ContactSearchDropdown
                  onSelect={setSelectedContactId}
                  excludeContactIds={company?.contacts?.map((c: any) => c.contact_id) || []}
                  placeholder="Search contacts..."
                  selectedContactId={selectedContactId || null}
/>
              </TabsContent>
              <TabsContent value="new" className="mt-4 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="new-contact-name">Name *</Label>
                  <Input
                    id="new-contact-name"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Jane Doe"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="new-contact-email">Email</Label>
                    <Input
                      id="new-contact-email"
                      type="email"
                      value={newContactEmail}
                      onChange={(e) => setNewContactEmail(e.target.value)}
                      placeholder="jane@company.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-contact-phone">Phone</Label>
                    <Input
                      id="new-contact-phone"
                      type="tel"
                      value={newContactPhone}
                      onChange={(e) => setNewContactPhone(e.target.value)}
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-contact-position">Position / Title</Label>
                  <Input
                    id="new-contact-position"
                    value={newContactPosition}
                    onChange={(e) => setNewContactPosition(e.target.value)}
                    placeholder="e.g. Procurement Manager"
                  />
                </div>
              </TabsContent>
            </Tabs>

            {/* Role */}
            <div className="space-y-2">
              <Label htmlFor="contact-role">Role at Company</Label>
              <Input
                id="contact-role"
                value={contactRole}
                onChange={(e) => setContactRole(e.target.value)}
                placeholder="e.g., CEO, Sales Manager, Developer"
/>
            </div>

            {/* Primary Contact */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is-primary-contact"
                checked={isPrimaryContact}
                onCheckedChange={(checked) => setIsPrimaryContact(checked === true)}
              />
              <Label htmlFor="is-primary-contact" className="cursor-pointer">
                Mark as primary contact for this company
              </Label>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="contact-notes">Notes</Label>
              <Textarea
                id="contact-notes"
                value={contactNotes}
                onChange={(e) => setContactNotes(e.target.value)}
                placeholder="Additional notes about this relationship..."
                rows={3}
/>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetContactDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleAttachContact}
              disabled={
                attachingContact ||
                (contactMode === 'existing' ? !selectedContactId : !newContactName.trim())
              }
>
              {attachingContact
                ? (contactMode === 'new' ? 'Creating...' : 'Attaching...')
                : (contactMode === 'new' ? 'Create & Attach' : 'Attach Contact')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};


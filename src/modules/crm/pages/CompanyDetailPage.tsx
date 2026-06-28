import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Building2, MapPin, Calendar, Globe, FileText, Save, Users, Trash2, Plus, Receipt, CreditCard, ScrollText, Percent, Package, Tag, Tags, Send, ShieldCheck, Loader2, Wallet, ShoppingCart } from 'lucide-react';
import {
  CustomerAccountOverview,
  CustomerTopItemsCard,
} from '@/modules/finance/components/CustomerFinanceTabs';
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
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { financeService } from '@/modules/finance/services/financeService';
import { flowEventService } from '@/services/flows/flowEventService';
import { validateVatViaVies } from '@/services/viesService';
import { aadeService, type AadeLookupResult } from '@/modules/myaade';
import { CategoryAssignmentPicker } from '@/components/business/catalogs/CategoryAssignmentPicker';
import { CollapsibleCard } from '@/components/business/crm/CollapsibleCard';
import { ContactSearchDropdown } from '@/components/business/crm/ContactSearchDropdown';
import { SupplierProductsTab } from '@/components/business/crm/SupplierProductsTab';
import { CrmNotesTimeline } from '@/components/business/crm/CrmNotesTimeline';
import { AddressUnitsManager } from '@/modules/crm/components/AddressUnitsManager';
import { FactoryLinkCard } from '@/modules/crm/components/FactoryLinkCard';
import { IndustrySelect } from '@/components/business/crm/IndustrySelect';
import { SendEmailDialog } from '@/components/business/crm/SendEmailDialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
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
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [contactRole, setContactRole] = useState<string>('');
  const [isPrimaryContact, setIsPrimaryContact] = useState(false);
  const [contactNotes, setContactNotes] = useState<string>('');
  const [attachingContact, setAttachingContact] = useState(false);

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
   * Greek-only enrichment via ΑΑΔΕ RgWsPublic2. Manual button (operator controls when the
   * TAXISnet notification fires). Prefills the form — including the structured myDATA-grade
   * address (street + number) + ΚΑΔ + legal form — which then persists on Save. For an existing
   * company we also pass companyId so the edge function caches the structured columns server-side.
   *
   * Counterparty lookup is legitimate here: we only enrich businesses we have a real relationship
   * with (a CRM customer/supplier we will invoice or be invoiced by). reason='crm_enrichment'.
   */
  const lookupAade = async () => {
    if (!company) return;
    const rawAfm = (company.vat_number || '').replace(/[^0-9]/g, '');
    if (rawAfm.length !== 9) {
      toast({ title: 'Need a 9-digit VAT number', description: 'Type the Greek VAT number (9 digits) in the VAT field first.', variant: 'destructive' });
      return;
    }
    setAadeBusy(true);
    try {
      const res = await aadeService.lookup({
        afm: rawAfm,
        companyId: isNew ? undefined : id,
        reason: 'crm_enrichment',
        workspaceId: activeWorkspaceId ?? undefined,
      });
      if ('error' in res && res.error) {
        toast({ title: 'AADE lookup failed', description: (res.message || res.error), variant: 'destructive' });
        return;
      }
      if ('ok' in res && res.ok) {
        adoptAadeAll(res);
        toast({
          title: res.source === 'cache' ? 'AADE data (cached)' : 'AADE data fetched',
          description: res.basic_rec.onomasia ? `Imported ${res.basic_rec.onomasia} from ΑΑΔΕ.` : 'Business details imported from ΑΑΔΕ.',
        });
      }
    } finally {
      setAadeBusy(false);
    }
  };

  /** Adopt every ΑΑΔΕ field. Self-saves via patchInline (persists for existing, local for new). */
  const adoptAadeAll = (res: AadeLookupResult) => {
    if (!company) return;
    const r = res.basic_rec;
    const primaryAct = res.activities.find((a) => a.kind === 1) ?? res.activities[0] ?? null;
    const secondaryActs = res.activities.filter((a) => a.kind !== 1);
    const combinedAddress = r.postal_address
      ? `${r.postal_address} ${r.postal_address_no ?? ''}`.replace(/\s+/g, ' ').trim()
      : null;
    patchInline({
      name: r.onomasia ?? company.name,
      street: r.postal_address ?? company.street,
      street_number: r.postal_address_no ?? company.street_number,
      address: combinedAddress ?? company.address,
      postal_code: r.postal_zip_code ?? company.postal_code,
      city: r.postal_area_description ?? company.city,
      country: r.postal_area_description ? (company.country || 'Greece') : company.country,
      country_code: company.country_code || 'EL',
      tax_office: r.doy_descr ?? company.tax_office,
      profession: primaryAct?.description ?? company.profession,
      commercial_title: r.commer_title,
      legal_status: r.legal_status_descr,
      kad_primary: primaryAct?.code ?? null,
      kad_primary_description: primaryAct?.description ?? null,
      kad_secondary: secondaryActs.length > 0 ? secondaryActs : null,
      business_start_date: r.regist_date ? (r.regist_date.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null) : null,
      aade_data: { basic_rec: r, activities: res.activities },
      aade_data_at: res.checked_at,
      vat_validated: r.deactivation_flag === '1' ? true : (r.deactivation_flag === '2' ? false : null),
      vat_validated_at: res.checked_at,
      vat_validated_name: r.onomasia,
      vat_validated_address: combinedAddress
        ? `${combinedAddress} ${r.postal_zip_code ?? ''} ${r.postal_area_description ?? ''}`.replace(/\s+/g, ' ').trim()
        : company.vat_validated_address,
      vat_validation_source: 'aade',
    } as Partial<Company>);
  };

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
      await companiesAPI.updateCompany(id, updates);
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

  const handleAttachContact = async () => {
    if (!id || !selectedContactId) return;
    try {
      setAttachingContact(true);
      await companiesAPI.attachContact(
        id,
        selectedContactId,
        contactRole,
        isPrimaryContact,
        contactNotes,
      );
      toast({
        title: 'Success',
        description: 'Contact attached to company successfully',
      });
      setShowAddContactDialog(false);
      setSelectedContactId('');
      setContactRole('');
      setIsPrimaryContact(false);
      setContactNotes('');
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

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title={isNew ? 'New Company' : company.name || 'Untitled Company'}
        description={isNew ? 'Create a new company' : `Company Details • Created ${new Date(company.created_at).toLocaleDateString()}`}
        badge="CRM"
/>

      <div className="p-3 sm:p-6 space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button variant="ghost" onClick={() => navigate('/admin/crm')}>
            <ArrowLeft className="h-4 w-4 mr-2"/>
            Back to CRM
          </Button>
          {/* View-first: existing companies save per field inline. Only create needs Create/Cancel. */}
          {isNew && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/admin/crm')}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2"/>
                {saving ? 'Saving...' : 'Create Company'}
              </Button>
            </div>
          )}
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="overview">
              <Building2 className="h-4 w-4 mr-2"/>
              Overview
            </TabsTrigger>
            <TabsTrigger value="contacts">
              <Users className="h-4 w-4 mr-2"/>
              Contacts ({company.contacts?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="social">
              <Globe className="h-4 w-4 mr-2"/>
              Social & Web
            </TabsTrigger>
            <TabsTrigger value="notes">
              <FileText className="h-4 w-4 mr-2"/>
              Notes
            </TabsTrigger>
            {showCommercial && (
              <>
                {/* One tab: the Account = balance/ledger + the Orders that drive it.
                    Quotes / Invoices / Payments live per-order (open an order). */}
                <TabsTrigger value="account">
                  <Wallet className="h-4 w-4 mr-2"/>
                  Account
                </TabsTrigger>
              </>
            )}
            {company.is_supplier && (
              <TabsTrigger value="products">
                <Package className="h-4 w-4 mr-2"/>
                Products
              </TabsTrigger>
            )}
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* item 7 — accessibility-first myAADE import: start from the ΑΦΜ at the top
                and prefill name / address / ΔΟΥ / activity. item 4 — hidden once ΑΑΔΕ
                data has already been imported (nothing left to import). */}
            {!company.aade_data_at && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="aade-vat" className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Import with myAADE</Label>
                  <p className="text-xs text-muted-foreground">
                    Enter a Greek VAT number (ΑΦΜ) to pull the official business name, address, tax office (ΔΟΥ) and activity straight from the ΑΑΔΕ registry.
                  </p>
                  <Input
                    id="aade-vat"
                    value={company.vat_number || ''}
                    onChange={(e) => setCompany((prev) => prev ? { ...prev, vat_number: e.target.value } : prev)}
                    onBlur={(e) => { if ((e.target.value || '') !== '') patchInline({ vat_number: e.target.value }); }}
                    placeholder="9-digit ΑΦΜ"
                    className="max-w-xs"
                  />
                </div>
                <Button
                  onClick={lookupAade}
                  disabled={aadeBusy || (company.vat_number || '').replace(/[^0-9]/g, '').length !== 9}
                >
                  {aadeBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                  Import with myAADE
                </Button>
              </CardContent>
            </Card>
            )}

            {/* CRM detail uses a compact 360px identity rail beside the detail column.
                The create form instead gets a centered, full-width layout — a data-entry
                form does not belong in a 360px sidebar (that was the source of the
                overlapping-fields break: viewport md: breakpoints firing inside a 360px box). */}
            <div className={isNew ? 'grid grid-cols-1 gap-6 max-w-3xl mx-auto' : 'grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start'}>
              {/* LEFT — company identity */}
              <div className={isNew ? 'space-y-4' : 'space-y-3 lg:sticky lg:top-4'}>
            <CollapsibleCard title="Company Information" icon={Building2} defaultOpen>
                <div className="grid grid-cols-1 gap-y-2">
                  <div>
                    <InlineText alwaysEdit={isNew} label="Company Name *" value={company.name} onSave={(v) => patchInline({ name: (v as string) ?? '' })} placeholder="Acme LLC" copy={false} />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Industry</div>
                    {isNew ? (
                      <p className="text-sm text-muted-foreground mt-0.5">Save the company first to assign industries.</p>
                    ) : (
                      <div className="mt-1"><IndustrySelect companyId={id!} onChange={(names) => patchInline({ industry: names.join(', ') })} /></div>
                    )}
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <InlineText alwaysEdit={isNew} type="email" label="Email" value={company.email} onSave={(v) => patchInline({ email: v })} placeholder="contact@company.com" />
                    </div>
                    <Button type="button" size="icon" variant="ghost" onClick={() => setShowEmailDialog(true)} disabled={!company.email}
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
                  {/* Role — a company can be a Customer, a Supplier, or BOTH (e.g. a
                      supplier you also need to invoice for returns / credit notes).
                      Editable anytime after onboarding; drives the Products tab +
                      customer/supplier lists + finance party type. */}
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

            {/* Address */}
            <CollapsibleCard title="Address" icon={MapPin} defaultOpen={isNew}>
                <div className={`grid grid-cols-1 gap-x-6 gap-y-2 ${isNew ? 'sm:grid-cols-2' : ''}`}>
                  <InlineText alwaysEdit={isNew} label="Street Address" value={company.address} onSave={(v) => patchInline({ address: v })} placeholder="123 Main Street" />
                  <InlineText alwaysEdit={isNew} label="City" value={company.city} onSave={(v) => patchInline({ city: v })} placeholder="San Francisco" />
                  <InlineText alwaysEdit={isNew} label="State / Province" value={company.state} onSave={(v) => patchInline({ state: v })} placeholder="CA" />
                  <InlineText alwaysEdit={isNew} label="Postal Code" value={company.postal_code} onSave={(v) => patchInline({ postal_code: v })} placeholder="94102" />
                  <InlineText alwaysEdit={isNew} label="Country" value={company.country} onSave={(v) => patchInline({ country: v })} placeholder="United States" />
                </div>
            </CollapsibleCard>

            {/* CRM Categories — moved here, below the Address */}
            {company.id && (
              <CollapsibleCard title="CRM Categories" icon={Tags}>
                <CategoryAssignmentPicker bare target={{ kind: 'company', id: company.id }}/>
              </CollapsibleCard>
            )}

            {/* Supplier↔factory pin — the relation to the ingested catalog. Suppliers only. */}
            {showSupplierFeatures && (
              <FactoryLinkCard
                value={company.factory_names ?? []}
                supplierName={company.name}
                onChange={(names) => patchInline({ factory_names: names })}
              />
            )}

            {/* Sub Units — secondary / branch / establishment addresses usable on documents */}
            <AddressUnitsManager companyId={isNew ? undefined : id} />
              </div>

              {/* RIGHT — detail */}
              <div className="space-y-4">
            {/* Tax & VAT Card — EU VAT validation via VIES (used before invoicing) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground"/>
                  Tax &amp; VAT
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
                  <InlineSelect
                    alwaysEdit={isNew}
                    label="VAT Country"
                    value={company.country_code ?? undefined}
                    placeholder="Not set"
                    options={VAT_COUNTRY_OPTIONS.map((o) => ({ value: o.code, label: <span className="flex items-center gap-2"><span className="font-mono text-[10px] w-7">{o.code}</span>{o.name}{o.eu && <Badge variant="outline" className="text-[9px] py-0">EU</Badge>}</span> }))}
                    displayValue={company.country_code ? <span className="font-mono">{company.country_code}</span> : undefined}
                    onSave={(v) => patchInline({ country_code: v })}
                  />
                  <InlineText alwaysEdit={isNew} label="VAT Number" value={company.vat_number} onSave={(v) => patchInline({ vat_number: v })} placeholder="123456789" />
                  <InlineText alwaysEdit={isNew} label="Tax Office" value={company.tax_office} onSave={(v) => patchInline({ tax_office: v })} placeholder="Optional" />
                </div>

                {/* Validation status + action */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Greek businesses → ΑΑΔΕ (richer: ΔΟΥ, ΚΑΔ, legal form, structured address).
                      Manual button so the operator controls when the TAXISnet notification fires. */}
                  {(company.country_code || '').toUpperCase() === 'EL'
                    && (company.vat_number || '').replace(/[^0-9]/g, '').length === 9 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={lookupAade}
                      disabled={aadeBusy}
                      title="Fetch full business details from AADE and pre-fill the form"
>
                      {aadeBusy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Building2 className="h-4 w-4"/>}
                      Fetch from AADE
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleVies}
                    disabled={viesBusy || !company.vat_number?.trim() || !company.country_code?.trim()}
>
                    {viesBusy ? <Loader2 className="h-4 w-4 animate-spin"/> : <ShieldCheck className="h-4 w-4"/>}
                    Validate (VIES)
                  </Button>

                  {company.vat_validated === true && (
                    <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                      {company.vat_validation_source === 'aade' ? 'AADE Active' : 'VAT verified'}{company.vat_validated_at ? ` · ${new Date(company.vat_validated_at).toLocaleDateString()}` : ''}
                    </Badge>
                  )}
                  {company.vat_validated === false && (
                    <Badge variant="destructive">
                      {company.vat_validation_source === 'aade' ? 'AADE: business inactive' : 'VAT not recognised by VIES'}
                    </Badge>
                  )}

                  {company.vat_validated_name && (
                    <span className="text-sm text-muted-foreground">
                      Registered as <span className="text-foreground">{company.vat_validated_name}</span>
                    </span>
                  )}
                </div>
                {company.vat_validated_address && (
                  <p className="text-xs text-muted-foreground">{company.vat_validated_address}</p>
                )}

                {/* ΑΑΔΕ enrichment readout (Greek businesses) */}
                {(company.kad_primary || company.legal_status || company.commercial_title) && (
                  <div className="rounded-md border border-primary/15 bg-primary/[0.03] p-3 space-y-1 text-xs">
                    {company.commercial_title && (
                      <div><span className="text-muted-foreground">Commercial title: </span><span className="text-foreground">{company.commercial_title}</span></div>
                    )}
                    {company.legal_status && (
                      <div><span className="text-muted-foreground">Legal form: </span><span className="text-foreground">{company.legal_status}</span></div>
                    )}
                    {company.kad_primary && (
                      <div><span className="text-muted-foreground">Primary activity code (KAD): </span><span className="text-foreground">{company.kad_primary}{company.kad_primary_description ? ` — ${company.kad_primary_description}` : ''}</span></div>
                    )}
                    {Array.isArray(company.kad_secondary) && company.kad_secondary.length> 0 && (
                      <div><span className="text-muted-foreground">Secondary activity codes: </span><span className="text-foreground">{company.kad_secondary.length} more</span></div>
                    )}
                    {company.business_start_date && (
                      <div><span className="text-muted-foreground">Operating since: </span><span className="text-foreground">{company.business_start_date}</span></div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pricing + Invoicing & VAT — customer commercial schema; hidden for a pure supplier. */}
            {showCommercial && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {/* Pricing — admin-managed default discount the AI applies on quotes for this customer */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-4 w-4"/>
                  Pricing
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                  <InlineSelect
                    alwaysEdit={isNew}
                    label="Pricing level"
                    value={company.user_level_key ?? undefined}
                    unsetValue="__default__"
                    placeholder="Standard"
                    options={pricingLevels.map((l) => ({ value: l.level_key, label: l.label }))}
                    onSave={(v) => savePricing({ user_level_key: v })}
                    hint="Tier this customer buys at — discount applies off retail on quotes."
                  />
                  <InlineText alwaysEdit={isNew} type="number" label="Customer discount % (override)" value={company.discount_percent ?? undefined} onSave={(v) => savePricing({ discount_percent: v })} placeholder="e.g. 50" copy={false} hint="Overrides the level's discount. Empty = use the level." />
                  {/* Credit limit lives in Account → Payment Rules (single editor of crm_companies.credit_limit). */}
                  <div className="md:col-span-2">
                    <InlineText alwaysEdit={isNew} multiline label="Discount notes" value={company.discount_notes} onSave={(v) => patchInline({ discount_notes: v })} placeholder="e.g. Long-term partner — 50% per 2025 agreement." copy={false} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Invoicing & VAT (commercial) — #207 parity with Oxygen contact card:
                segment, ΜΥΦ inclusion, default on-invoice VAT-exemption reason, and a
                separate billing identity (different legal entity / ΑΦΜ / address used on
                the myDATA counterpart when set). */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-4 w-4"/>
                  Invoicing &amp; VAT
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                  <InlineSelect
                    alwaysEdit={isNew}
                    label="Segment"
                    value={company.contact_group ?? undefined}
                    unsetValue="none"
                    placeholder="Unsegmented"
                    options={[
                      { value: 'b2b', label: 'B2B' },
                      { value: 'retail', label: 'Retail' },
                      { value: 'wholesale', label: 'Wholesale' },
                      { value: 'public_sector', label: 'Public sector' },
                    ]}
                    onSave={(v) => patchInline({ contact_group: v })}
                    hint="Groups this party for filtering and statement batches."
                  />
                  <InlineSelect
                    alwaysEdit={isNew}
                    label="Default VAT-exemption category"
                    value={company.vat_exemption_reason ?? undefined}
                    unsetValue="__none"
                    placeholder="None"
                    options={MYDATA_EXEMPTION_CATEGORIES.map((c) => ({ value: String(c.code), label: <span><span className="font-mono text-[10px] mr-2">{c.code}</span>{c.label}</span> }))}
                    displayValue={company.vat_exemption_reason ? <span><span className="font-mono text-[10px] mr-2">{company.vat_exemption_reason}</span>{MYDATA_EXEMPTION_CATEGORIES.find((c) => String(c.code) === company.vat_exemption_reason)?.label}</span> : undefined}
                    onSave={(v) => patchInline({ vat_exemption_reason: v })}
                    hint="Pre-fills the myDATA exemption category on 0%-VAT lines."
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="include_in_myf" className="cursor-pointer">Include in ΜΥΦ</Label>
                    <p className="text-xs text-muted-foreground">Default for the “Include in MYF report” toggle when invoicing this party.</p>
                  </div>
                  <Switch
                    id="include_in_myf"
                    checked={company.include_in_myf !== false}
                    onCheckedChange={(v) => patchInline({ include_in_myf: v })}
/>
                </div>

                {/* Separate billing identity */}
                <div className="rounded-md border border-border/60 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="text-foreground font-medium">Separate billing identity</span> — fill only when invoices must be issued to a different legal entity than above (different ΑΦΜ / name / address). Leave blank to invoice the party as-is.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                    <InlineText alwaysEdit={isNew} label="Billing name" value={company.billing_name} onSave={(v) => patchInline({ billing_name: v })} placeholder="Legal entity name" />
                    <InlineText alwaysEdit={isNew} label="Billing VAT (ΑΦΜ)" value={company.billing_vat} onSave={(v) => patchInline({ billing_vat: v })} placeholder="EL123456789" />
                    <InlineText alwaysEdit={isNew} label="Tax office (ΔΟΥ)" value={company.billing_tax_office} onSave={(v) => patchInline({ billing_tax_office: v })} />
                    <InlineSelect alwaysEdit={isNew} label="VAT country" value={company.billing_country_code ?? undefined} placeholder="Not set"
                      options={VAT_COUNTRY_OPTIONS.map((o) => ({ value: o.code, label: <span><span className="font-mono text-[10px] mr-2">{o.code}</span>{o.name}</span> }))}
                      displayValue={company.billing_country_code ? <span className="font-mono">{company.billing_country_code}</span> : undefined}
                      onSave={(v) => patchInline({ billing_country_code: v })} />
                    <InlineText alwaysEdit={isNew} label="Street" value={company.billing_street} onSave={(v) => patchInline({ billing_street: v })} />
                    <InlineText alwaysEdit={isNew} label="Number" value={company.billing_street_number} onSave={(v) => patchInline({ billing_street_number: v })} />
                    <InlineText alwaysEdit={isNew} label="Postal code" value={company.billing_postal_code} onSave={(v) => patchInline({ billing_postal_code: v })} />
                    <InlineText alwaysEdit={isNew} label="City" value={company.billing_city} onSave={(v) => patchInline({ billing_city: v })} />
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
            )}
              </div>
            </div>

          </TabsContent>

          {/* Products Tab — only when is_supplier=true. Matches products by name
              against products.metadata.factory_name / manufacturer / brand /
              supplier. Read-only view for now. */}
          {company.is_supplier && (
            <TabsContent value="products" className="space-y-4">
              <SupplierProductsTab workspaceId={activeWorkspaceId ?? ''} supplierName={company.name} factoryNames={company.factory_names ?? []}/>
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
                  Add Contact
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
                      Add First Contact
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
                                className="text-blue-600 hover:underline"
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
                                className="text-blue-600 hover:underline"
>
                                {contact.contact_phone}
                              </a>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            {contact.is_primary && (
                              <Badge variant="secondary">Primary</Badge>
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

          {/* Notes Tab — timeline of separate note entries (replaced the
              single-textarea blob in 2026-05-25). */}
          <TabsContent value="notes" className="space-y-4">
            <CrmNotesTimeline targetKind="company" targetId={company.id || null}/>
          </TabsContent>

          {/* Customer-only commercial tabs — hidden for a pure supplier. */}
          {showCommercial && (
            <>
          {/* Account = one flow: the money summary up top (orders, owed, paid, net + AR aging),
              then the Orders list itself as the working surface. An order tracks real cash only
              (open an order → Received / money in-out / Invoices / Payments); the per-order
              "virtual receivable/payable" concept was removed. */}
          <TabsContent value="account" className="space-y-4">
            {company.id ? (
              <>
                {/* 1 — Money summary up top: orders count + value, owed (invoiced & on orders),
                       paid, net position, AR aging. */}
                <CustomerAccountOverview companyId={company.id} customerName={company.name} isSupplier={!!company.is_supplier} ledgerHref={`/finance?tab=parties&party=company:${company.id}`} />
                {/* 2 — The orders themselves. Click an order to manage its receivables/payables,
                       invoices, payments and dispatch. */}
                <OrdersPanel workspaceId={activeWorkspaceId ?? ''} companyId={company.id} />
                {/* 3 — Repeat-buy suggestions (in-stock), below the orders list. */}
                <CustomerTopItemsCard companyId={company.id} />
                {/* 4 — Secondary settings. */}
                <CustomerFinanceRulesCard companyId={company.id} />
              </>
            ) : (
              <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Save this company first to see its account &amp; orders.</CardContent></Card>
            )}
          </TabsContent>
            </>
          )}
        </Tabs>
      </div>

      {/* Send Email Dialog */}
      <SendEmailDialog
        open={showEmailDialog}
        onClose={() => setShowEmailDialog(false)}
        toEmail={company.email || ''}
        toName={company.name || null}
        recipientLabel={company.name || 'Company'}
/>

      {/* Add Contact Dialog */}
      <Dialog open={showAddContactDialog} onOpenChange={setShowAddContactDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Attach Contact to Company</DialogTitle>
            <DialogDescription>
              Link a contact to this company and specify their role
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Contact Search */}
            <div className="space-y-2">
              <Label>Contact *</Label>
              <ContactSearchDropdown
                onSelect={setSelectedContactId}
                excludeContactIds={company?.contacts?.map((c: any) => c.contact_id) || []}
                placeholder="Search contacts..."
                selectedContactId={selectedContactId || null}
/>
            </div>

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
              <input
                type="checkbox"
                id="is-primary-contact"
                checked={isPrimaryContact}
                onChange={(e) => setIsPrimaryContact(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
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
            <Button
              variant="outline"
              onClick={() => {
                setShowAddContactDialog(false);
                setSelectedContactId('');
                setContactRole('');
                setIsPrimaryContact(false);
                setContactNotes('');
              }}
>
              Cancel
            </Button>
            <Button
              onClick={handleAttachContact}
              disabled={!selectedContactId || attachingContact}
>
              {attachingContact ? 'Attaching...' : 'Attach Contact'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};


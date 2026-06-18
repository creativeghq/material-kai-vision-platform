import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Building2, MapPin, Calendar, Globe, FileText, Save, Edit2, Users, Trash2, Plus, Search, Receipt, CreditCard, ScrollText, Percent, Package, Tag, Send, ShieldCheck, Loader2, Wallet } from 'lucide-react';
import {
  CustomerFinanceSummary,
  CustomerAccountOverview,
  CustomerQuotesTab,
  CustomerInvoicesTab,
  CustomerPaymentsTab,
} from '@/modules/finance/components/CustomerFinanceTabs';
import CompanySEOPanel from '@/components/business/seo-toolkit/CompanySEOPanel';
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
import { validateVatViaVies } from '@/services/viesService';
import { aadeService, type AadeLookupResult } from '@/modules/myaade';
import { CategoryAssignmentPicker } from '@/components/business/catalogs/CategoryAssignmentPicker';
import { ContactSearchDropdown } from '@/components/business/crm/ContactSearchDropdown';
import { SupplierProductsTab } from '@/components/business/crm/SupplierProductsTab';
import { CrmNotesTimeline } from '@/components/business/crm/CrmNotesTimeline';
import { SendEmailDialog } from '@/components/business/crm/SendEmailDialog';
import { Switch } from '@/components/core/ui/switch';
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
  is_supplier?: boolean | null;
  is_customer?: boolean | null;
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
  const { toast } = useToast();
  const isNew = id === 'new';
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viesBusy, setViesBusy] = useState(false);
  const [aadeBusy, setAadeBusy] = useState(false);
  const [editing, setEditing] = useState(isNew); // Start in editing mode for new companies
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
    created_at: new Date().toISOString(),
    contacts: [],
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

  const handleSave = async () => {
    if (!company) return;

    // Validate required fields
    if (!company.name || company.name.trim() === '') {
      toast({
        title: 'Validation Error',
        description: 'Company name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);

      if (isNew) {
        // Create new company
        const response = await companiesAPI.createCompany(company);
        toast({
          title: 'Success',
          description: 'Company created successfully',
        });
        // Navigate to the new company's page
        navigate(`/admin/crm/companies/${response.data.id}`, { replace: true });
      } else {
        // Update existing company
        await companiesAPI.updateCompany(id!, company);
        toast({
          title: 'Success',
          description: 'Company updated successfully',
        });
        setEditing(false);
        await loadCompany();
      }
    } catch (error) {
      console.error('Error saving company:', error);
      toast({
        title: 'Error',
        description: isNew ? 'Failed to create company' : 'Failed to save company',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof Company, value: any) => {
    if (!company) return;
    setCompany({ ...company, [field]: value });
  };

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
      });
      if ('error' in res && res.error) {
        toast({ title: 'AADE lookup failed', description: (res.message || res.error), variant: 'destructive' });
        return;
      }
      if ('ok' in res && res.ok) {
        adoptAadeAll(res);
        if (!editing) setEditing(true);
        toast({
          title: res.source === 'cache' ? 'AADE data (cached)' : 'AADE data fetched',
          description: res.basic_rec.onomasia ? `Registered as ${res.basic_rec.onomasia} — review and Save.` : 'Business details pre-filled — review and Save.',
        });
      }
    } finally {
      setAadeBusy(false);
    }
  };

  /** Adopt every ΑΑΔΕ field into the form. Persisted on Save (createCompany/updateCompany). */
  const adoptAadeAll = (res: AadeLookupResult) => {
    const r = res.basic_rec;
    const primaryAct = res.activities.find((a) => a.kind === 1) ?? res.activities[0] ?? null;
    const secondaryActs = res.activities.filter((a) => a.kind !== 1);
    const combinedAddress = r.postal_address
      ? `${r.postal_address} ${r.postal_address_no ?? ''}`.replace(/\s+/g, ' ').trim()
      : null;
    setCompany((prev) => prev ? {
      ...prev,
      // Authoritative for Greek businesses
      name: r.onomasia ?? prev.name,
      // Structured myDATA-grade address + the combined display address
      street: r.postal_address ?? prev.street,
      street_number: r.postal_address_no ?? prev.street_number,
      address: combinedAddress ?? prev.address,
      postal_code: r.postal_zip_code ?? prev.postal_code,
      city: r.postal_area_description ?? prev.city,
      country: r.postal_area_description ? (prev.country || 'Greece') : prev.country,
      country_code: prev.country_code || 'EL',
      tax_office: r.doy_descr ?? prev.tax_office,
      profession: primaryAct?.description ?? prev.profession,
      // ΑΑΔΕ structured columns (mirror what the edge function persists)
      commercial_title: r.commer_title,
      legal_status: r.legal_status_descr,
      kad_primary: primaryAct?.code ?? null,
      kad_primary_description: primaryAct?.description ?? null,
      kad_secondary: secondaryActs.length> 0 ? secondaryActs : null,
      business_start_date: r.regist_date ? (r.regist_date.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null) : null,
      aade_data: { basic_rec: r, activities: res.activities },
      aade_data_at: res.checked_at,
      // ΑΑΔΕ active-flag is authoritative — fill the VIES-style verification columns too
      vat_validated: r.deactivation_flag === '1' ? true : (r.deactivation_flag === '2' ? false : null),
      vat_validated_at: res.checked_at,
      vat_validated_name: r.onomasia,
      vat_validated_address: combinedAddress
        ? `${combinedAddress} ${r.postal_zip_code ?? ''} ${r.postal_area_description ?? ''}`.replace(/\s+/g, ' ').trim()
        : prev.vat_validated_address,
      vat_validation_source: 'aade',
    } : prev);
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
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button variant="outline" onClick={() => {
                  if (isNew) {
                    navigate('/admin/crm');
                  } else {
                    setEditing(false);
                    loadCompany();
                  }
                }}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2"/>
                  {saving ? 'Saving...' : (isNew ? 'Create Company' : 'Save Changes')}
                </Button>
              </>
            ) : (
              <Button onClick={() => setEditing(true)}>
                <Edit2 className="h-4 w-4 mr-2"/>
                Edit Company
              </Button>
            )}
          </div>
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
            <TabsTrigger value="seo">
              <Search className="h-4 w-4 mr-2"/>
              SEO
            </TabsTrigger>
            <TabsTrigger value="account">
              <Wallet className="h-4 w-4 mr-2"/>
              Account
            </TabsTrigger>
            <TabsTrigger value="quotes">
              <ScrollText className="h-4 w-4 mr-2"/>
              Quotes
            </TabsTrigger>
            <TabsTrigger value="invoices">
              <Receipt className="h-4 w-4 mr-2"/>
              Invoices
            </TabsTrigger>
            <TabsTrigger value="payments">
              <CreditCard className="h-4 w-4 mr-2"/>
              Payments
            </TabsTrigger>
            {company.is_supplier && (
              <TabsTrigger value="products">
                <Package className="h-4 w-4 mr-2"/>
                Products
              </TabsTrigger>
            )}
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Company Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Name */}
                  <div className="space-y-2">
                    <Label htmlFor="name">Company Name *</Label>
                    <Input
                      id="name"
                      value={company.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      disabled={!editing}
                      required
/>
                  </div>

                  {/* Industry */}
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Input
                      id="industry"
                      value={company.industry || ''}
                      onChange={(e) => updateField('industry', e.target.value)}
                      disabled={!editing}
                      placeholder="e.g., Technology, Healthcare"
/>
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="flex gap-2 items-start">
                      <Mail className="h-4 w-4 mt-3 text-muted-foreground"/>
                      <Input
                        id="email"
                        type="email"
                        value={company.email || ''}
                        onChange={(e) => updateField('email', e.target.value)}
                        disabled={!editing}
                        placeholder="contact@company.com"
/>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => setShowEmailDialog(true)}
                        disabled={!company.email}
                        title={company.email ? `Send email to ${company.email}` : 'No email on file'}
                        className="shrink-0"
>
                        <Send className="h-4 w-4"/>
                      </Button>
                    </div>
                  </div>

                  {/* Phone */}
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <div className="flex gap-2">
                      <Phone className="h-4 w-4 mt-3 text-muted-foreground"/>
                      <Input
                        id="phone"
                        type="tel"
                        value={company.phone || ''}
                        onChange={(e) => updateField('phone', e.target.value)}
                        disabled={!editing}
                        placeholder="+1 (555) 123-4567"
/>
                    </div>
                  </div>

                  {/* Website */}
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <div className="flex gap-2">
                      <Globe className="h-4 w-4 mt-3 text-muted-foreground"/>
                      <Input
                        id="website"
                        type="url"
                        value={company.website || ''}
                        onChange={(e) => updateField('website', e.target.value)}
                        disabled={!editing}
                        placeholder="https://company.com"
/>
                    </div>
                  </div>

                  {/* Employee Count */}
                  <div className="space-y-2">
                    <Label htmlFor="employee_count">Employee Count</Label>
                    <Input
                      id="employee_count"
                      type="text"
                      value={company.employee_count || ''}
                      onChange={(e) => updateField('employee_count', e.target.value)}
                      disabled={!editing}
                      placeholder="e.g., 50, 1-10, 100-500, 500+"
/>
                  </div>

                  {/* Annual Revenue */}
                  <div className="space-y-2">
                    <Label htmlFor="annual_revenue">Annual Revenue</Label>
                    <Input
                      id="annual_revenue"
                      value={company.annual_revenue || ''}
                      onChange={(e) => updateField('annual_revenue', e.target.value)}
                      disabled={!editing}
                      placeholder="e.g., $1M - $10M"
/>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={company.description || ''}
                    onChange={(e) => updateField('description', e.target.value)}
                    disabled={!editing}
                    placeholder="Brief description of the company..."
                    rows={3}
/>
                </div>
              </CardContent>
            </Card>

            {/* Tax & VAT Card — EU VAT validation via VIES (used before invoicing) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground"/>
                  Tax &amp; VAT
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Country code */}
                  <div className="space-y-2">
                    <Label htmlFor="country_code">Country Code</Label>
                    <Input
                      id="country_code"
                      value={company.country_code || ''}
                      onChange={(e) => updateField('country_code', e.target.value.toUpperCase().slice(0, 2))}
                      disabled={!editing}
                      placeholder="EL, DE, FR…"
                      maxLength={2}
/>
                  </div>

                  {/* VAT number */}
                  <div className="space-y-2">
                    <Label htmlFor="vat_number">VAT Number</Label>
                    <Input
                      id="vat_number"
                      value={company.vat_number || ''}
                      onChange={(e) => updateField('vat_number', e.target.value)}
                      disabled={!editing}
                      placeholder="123456789"
/>
                  </div>

                  {/* Tax office */}
                  <div className="space-y-2">
                    <Label htmlFor="tax_office">Tax Office</Label>
                    <Input
                      id="tax_office"
                      value={company.tax_office || ''}
                      onChange={(e) => updateField('tax_office', e.target.value)}
                      disabled={!editing}
                      placeholder="Optional"
/>
                  </div>
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

            {/* Address Card */}
            <Card>
              <CardHeader>
                <CardTitle>Address</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Address */}
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address">Street Address</Label>
                    <Input
                      id="address"
                      value={company.address || ''}
                      onChange={(e) => updateField('address', e.target.value)}
                      disabled={!editing}
                      placeholder="123 Main Street"
/>
                  </div>

                  {/* City */}
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={company.city || ''}
                      onChange={(e) => updateField('city', e.target.value)}
                      disabled={!editing}
                      placeholder="San Francisco"
/>
                  </div>

                  {/* State */}
                  <div className="space-y-2">
                    <Label htmlFor="state">State/Province</Label>
                    <Input
                      id="state"
                      value={company.state || ''}
                      onChange={(e) => updateField('state', e.target.value)}
                      disabled={!editing}
                      placeholder="CA"
/>
                  </div>

                  {/* Postal Code */}
                  <div className="space-y-2">
                    <Label htmlFor="postal_code">Postal Code</Label>
                    <Input
                      id="postal_code"
                      value={company.postal_code || ''}
                      onChange={(e) => updateField('postal_code', e.target.value)}
                      disabled={!editing}
                      placeholder="94102"
/>
                  </div>

                  {/* Country */}
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={company.country || ''}
                      onChange={(e) => updateField('country', e.target.value)}
                      disabled={!editing}
                      placeholder="United States"
/>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pricing — admin-managed default discount the AI applies on quotes for this customer */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-4 w-4"/>
                  Pricing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="discount_percent">Default discount %</Label>
                    <Input
                      id="discount_percent"
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      value={company.discount_percent ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateField('discount_percent', v === '' ? null : Number(v));
                      }}
                      disabled={!editing}
                      placeholder="e.g. 50"
/>
                    <p className="text-xs text-muted-foreground">
                      Applied automatically by the AI price lookup when this company is the quote customer. Leave empty for no customer discount.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="credit_limit">Credit limit</Label>
                    <Input
                      id="credit_limit"
                      type="number"
                      step="0.01"
                      min={0}
                      value={company.credit_limit ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateField('credit_limit', v === '' ? null : Number(v));
                      }}
                      disabled={!editing}
                      placeholder="e.g. 10000"
/>
                    <p className="text-xs text-muted-foreground">
                      Max outstanding receivable. Finance flags this customer when their open balance exceeds it. Leave empty for no limit.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discount_notes">Discount notes</Label>
                  <Textarea
                    id="discount_notes"
                    value={company.discount_notes || ''}
                    onChange={(e) => updateField('discount_notes', e.target.value)}
                    disabled={!editing}
                    placeholder="e.g. Long-term partner — 50% per 2025 agreement, valid until renewal."
                    rows={2}
/>
                </div>
              </CardContent>
            </Card>

            {/* Role — who this party is to the workspace. Controls which tabs
                (Products / supplier-bills) appear and how the finance Parties
                view classifies them. */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-4 w-4"/>
                  Role
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="is_supplier" className="cursor-pointer">This is a supplier</Label>
                    <p className="text-xs text-muted-foreground">
                      Enables the Products tab below. Includes manufacturers, brands and distributors —
                      anyone who supplies products to us.
                    </p>
                  </div>
                  <Switch
                    id="is_supplier"
                    checked={!!company.is_supplier}
                    onCheckedChange={(v) => patchInline({ is_supplier: v })}
/>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="is_customer" className="cursor-pointer">This is a customer</Label>
                    <p className="text-xs text-muted-foreground">
                      Means we sell to them — quotes / invoices / statements get raised against this company.
                    </p>
                  </div>
                  <Switch
                    id="is_customer"
                    checked={!!company.is_customer}
                    onCheckedChange={(v) => patchInline({ is_customer: v })}
/>
                </div>
              </CardContent>
            </Card>

            {company.id && <CategoryAssignmentPicker target={{ kind: 'company', id: company.id }}/>}
          </TabsContent>

          {/* Products Tab — only when is_supplier=true. Matches products by name
              against products.metadata.factory_name / manufacturer / brand /
              supplier. Read-only view for now. */}
          {company.is_supplier && (
            <TabsContent value="products" className="space-y-4">
              <SupplierProductsTab supplierName={company.name}/>
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
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  {/* LinkedIn */}
                  <div className="space-y-2">
                    <Label htmlFor="linkedin">LinkedIn</Label>
                    <Input
                      id="linkedin"
                      value={company.linkedin || ''}
                      onChange={(e) => updateField('linkedin', e.target.value)}
                      disabled={!editing}
                      placeholder="https://linkedin.com/company/..."
/>
                  </div>

                  {/* Twitter */}
                  <div className="space-y-2">
                    <Label htmlFor="twitter">Twitter/X</Label>
                    <Input
                      id="twitter"
                      value={company.twitter || ''}
                      onChange={(e) => updateField('twitter', e.target.value)}
                      disabled={!editing}
                      placeholder="https://twitter.com/..."
/>
                  </div>

                  {/* Facebook */}
                  <div className="space-y-2">
                    <Label htmlFor="facebook">Facebook</Label>
                    <Input
                      id="facebook"
                      value={company.facebook || ''}
                      onChange={(e) => updateField('facebook', e.target.value)}
                      disabled={!editing}
                      placeholder="https://facebook.com/..."
/>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notes Tab — timeline of separate note entries (replaced the
              single-textarea blob in 2026-05-25). */}
          <TabsContent value="notes" className="space-y-4">
            <CrmNotesTimeline targetKind="company" targetId={company.id || null}/>
          </TabsContent>

          {/* SEO Tab — DataForSEO Domain Rank + persistent monitoring */}
          <TabsContent value="seo" className="space-y-4">
            <CompanySEOPanel
              companyId={company.id}
              companyName={company.name}
              website={company.website || null}
              countryCode={(company as any).country_code || null}
/>
          </TabsContent>

          {/* Account overview Tab */}
          <TabsContent value="account" className="space-y-4">
            {company.id && <CustomerAccountOverview companyId={company.id}/>}
          </TabsContent>

          {/* Quotes Tab */}
          <TabsContent value="quotes" className="space-y-4">
            {company.id && <CustomerFinanceSummary companyId={company.id}/>}
            {company.id && <CustomerQuotesTab companyId={company.id}/>}
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-4">
            {company.id && <CustomerFinanceSummary companyId={company.id}/>}
            {company.id && <CustomerInvoicesTab companyId={company.id}/>}
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="space-y-4">
            {company.id && <CustomerFinanceSummary companyId={company.id}/>}
            {company.id && <CustomerPaymentsTab companyId={company.id}/>}
          </TabsContent>
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


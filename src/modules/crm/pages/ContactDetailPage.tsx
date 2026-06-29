import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Building2, MapPin, Calendar, User, FileText, Save, Link as LinkIcon, Unlink, UserPlus, Receipt, Percent, Tag, Tags, Send, Wallet, X } from 'lucide-react';
import { CustomerAccountOverview, CustomerTopItemsCard, PartyPaymentsCard } from '@/modules/finance/components/CustomerFinanceTabs';
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
import { contactsAPI, usersAPI, companiesAPI } from '@/services/crm.service';
import { CategoryAssignmentPicker } from '@/components/business/catalogs/CategoryAssignmentPicker';
import { UserSearchDropdown } from '@/components/business/crm/UserSearchDropdown';
import { CompanySearchDropdown } from '@/components/business/crm/CompanySearchDropdown';
import { CrmActivityTimeline } from '@/components/business/crm/CrmActivityTimeline';
import { CollapsibleCard } from '@/components/business/crm/CollapsibleCard';
import { crmActivitiesService } from '@/services/crmActivitiesService';
import { ContactTaxVatCard } from '@/components/business/crm/ContactTaxVatCard';
import { SendEmailDialog } from '@/components/business/crm/SendEmailDialog';
import { Switch } from '@/components/core/ui/switch';
import { Checkbox } from '@/components/core/ui/checkbox';
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
import { LeadFieldSelect } from '@/components/business/crm/LeadFieldSelect';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { financeService } from '@/modules/finance/services/financeService';
import { flowEventService } from '@/services/flows/flowEventService';

interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  mobile?: string;
  company?: string;
  position?: string;
  department?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  lead_source?: string | null;
  lead_status?: string | null;
  industry?: string;
  annual_revenue?: string;
  employee_count?: string;
  tags?: string[];
  discount_percent?: number | null;
  discount_notes?: string | null;
  credit_limit?: number | null;
  user_level_key?: string | null; // #227 — pricing level
  prices_vat_inclusive?: boolean | null; // #227 — gross display for this customer
  is_supplier?: boolean | null;
  is_client?: boolean | null;
  contact_type?: string | null;
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
  date_of_birth?: string | null; // birthday — for greetings / birthday messages
  created_at: string;
  updated_at?: string;
  created_by?: string;
  user_id?: string;
  linked_at?: string;
  linked_by?: string;
  companies?: any[];
}

/**
 * Contact Detail Page
 * Full page view for a single CRM contact with comprehensive information
 * Supports creating new contacts when id is "new"
 */
export const ContactDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const [pricingLevels, setPricingLevels] = useState<Array<{ level_key: string; label: string }>>([]);
  const isNew = id === 'new';
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contact, setContact] = useState<Contact | null>(isNew ? {
    id: '',
    name: '',
    email: '',
    phone: '',
    mobile: '',
    company: '',
    position: '',
    department: '',
    website: '',
    address: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
    linkedin: '',
    twitter: '',
    facebook: '',
    lead_source: '',
    lead_status: '',
    industry: '',
    annual_revenue: '',
    employee_count: '',
    tags: [],
    discount_percent: null,
    discount_notes: '',
    credit_limit: null,
    is_supplier: false,
    is_client: false,
    contact_type: null,
    vat_number: '',
    country_code: '',
    tax_office: '',
    created_at: new Date().toISOString(),
  } : null);
  const [linkedUser, setLinkedUser] = useState<any>(null);
  // items 6/7/8 — the contact's primary company (full row), used to display the
  // inherited Pricing / Invoicing / Tax & VAT values when overrides are off.
  const [primaryCompany, setPrimaryCompany] = useState<any>(null);
  const [linking, setLinking] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviting, setInviting] = useState(false);
  // item 5 — company chosen while creating a brand-new contact, attached right after create.
  const [pendingCompanyId, setPendingCompanyId] = useState<string>('');
  const [creatingBusiness, setCreatingBusiness] = useState(false);
  // Bump to force the Activity timeline to reload after we log a new activity.
  const [activityRefresh, setActivityRefresh] = useState(0);
  const bumpActivity = () => setActivityRefresh((n) => n + 1);
  const logActivity = (activity_type: string, title: string, description?: string, metadata?: Record<string, unknown>) => {
    if (!id || isNew) return;
    crmActivitiesService
      .log({ kind: 'contact', id }, { activity_type, title, description, metadata })
      .then(bumpActivity);
  };

  useEffect(() => {
    if (id && !isNew) {
      loadContact();
    }
  }, [id, isNew]);

  // Load linked user when contact loads
  useEffect(() => {
    if (contact?.user_id) {
      loadLinkedUser(contact.user_id);
    } else {
      setLinkedUser(null);
    }
  }, [contact?.user_id]);

  // Resolve the contact's primary company (is_primary, else first attached) so the
  // Pricing / Invoicing / Tax & VAT cards can show inherited values when overrides are off.
  useEffect(() => {
    const companies = contact?.companies ?? [];
    const primary = companies.find((c: any) => c.is_primary) ?? companies[0] ?? null;
    if (!primary?.company_id) { setPrimaryCompany(null); return; }
    let cancelled = false;
    companiesAPI.getCompany(primary.company_id)
      .then((res: any) => { if (!cancelled) setPrimaryCompany(res?.data ?? res ?? null); })
      .catch(() => { if (!cancelled) setPrimaryCompany(null); });
    return () => { cancelled = true; };
  }, [contact?.companies]);

  const loadContact = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const response = await contactsAPI.getContact(id);
      setContact(response.data);
    } catch (error) {
      console.error('Error loading contact:', error);
      toast({
        title: 'Error',
        description: 'Failed to load contact details',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Create-new only. Existing contacts self-save per field (view-first inline edit).
  const handleSave = async () => {
    if (!contact) return;
    if (!contact.name || contact.name.trim() === '') {
      toast({ title: 'Validation Error', description: 'Contact name is required', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      const response = await contactsAPI.createContact(contact);
      // item 5 — attach the company picked during creation, now that we have an id.
      if (pendingCompanyId) {
        await companiesAPI.attachContact(pendingCompanyId, response.data.id, undefined, true, '').catch(() => {});
      }
      toast({ title: 'Success', description: 'Contact created successfully' });
      navigate(`/admin/crm/contacts/${response.data.id}`, { replace: true });
    } catch (error) {
      console.error('Error creating contact:', error);
      toast({ title: 'Error', description: 'Failed to create contact', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  /**
   * #227 — pricing level/discount must NOT be patched directly: route through the
   * approval RPC (sales → pending approval, others → applied immediately). Optimistic
   * local update; on a pending verdict, fan out a notify event to finance approvers.
   */
  const savePricing = async (updates: { user_level_key?: string | null; discount_percent?: number | null }) => {
    if (!contact) return;
    const next = { ...contact, ...updates };
    setContact(next);
    if (isNew || !id) return; // create flow persists everything via handleSave
    try {
      const res = await financeService.proposeOrApplyCustomerPricing({
        subjectType: 'contact', subjectId: id,
        userLevelKey: next.user_level_key ?? null,
        discountPercent: next.discount_percent ?? null,
      });
      if (res.status === 'pending') {
        const approvers = await financeService.listWorkspaceApproverIds(activeWorkspaceId!).catch(() => []);
        for (const uid of approvers) {
          flowEventService.emit('pricing_change_requested', {
            workspace_id: activeWorkspaceId, request_id: res.request_id, user_id: uid,
            subject_type: 'contact', subject_id: id,
            title: 'Discount change needs approval',
            body: 'A sales team member proposed a customer discount/level change.',
          });
        }
        toast({ title: 'Discount change sent for approval' });
      }
    } catch (e: any) {
      toast({ title: 'Pricing change failed', description: e?.message, variant: 'destructive' });
      await loadContact();
    }
  };


  // #227 — load this workspace's pricing levels for the customer-level dropdown.
  useEffect(() => {
    if (!activeWorkspaceId) return;
    financeService.listUserLevels(activeWorkspaceId)
      .then((rows) => setPricingLevels(rows.map((r) => ({ level_key: r.level_key, label: r.label }))))
      .catch(() => { /* non-fatal — dropdown just shows Standard */ });
  }, [activeWorkspaceId]);

  /**
   * Inline patch for fields that should save on change without entering the
   * page's "Edit" mode (admin role flags, contact type). Optimistic update +
   * revert on failure. Skipped on the create-new flow (handleSave persists
   * the whole row there).
   */
  const patchInline = async (updates: Partial<Contact>) => {
    if (!contact || !id || isNew) {
      if (contact) setContact((prev) => prev ? { ...prev, ...updates } : prev);
      return;
    }
    let snapshot: Contact | null = null;
    setContact((prev) => { snapshot = prev; return prev ? { ...prev, ...updates } : prev; });
    try {
      await contactsAPI.updateContact(id, updates);
    } catch (error) {
      console.error('Inline patch failed:', error);
      if (snapshot) setContact(snapshot);
      toast({
        title: 'Could not save',
        description: error instanceof Error ? error.message : 'Try again',
        variant: 'destructive',
      });
    }
  };

  const loadLinkedUser = async (userId: string) => {
    try {
      const response = await usersAPI.getUser(userId);
      setLinkedUser(response.data);
    } catch (error) {
      console.error('Error loading linked user:', error);
      setLinkedUser(null);
    }
  };

  const handleLinkUser = async (userId: string) => {
    if (!id) return;
    try {
      setLinking(true);
      await contactsAPI.linkUserToContact(id, userId);
      toast({
        title: 'Success',
        description: 'User linked to contact successfully',
      });
      await loadContact();
    } catch (error: any) {
      console.error('Error linking user:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to link user to contact',
        variant: 'destructive',
      });
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkUser = async () => {
    if (!id) return;
    try {
      setLinking(true);
      await contactsAPI.unlinkUserFromContact(id);
      toast({
        title: 'Success',
        description: 'User unlinked from contact successfully',
      });
      await loadContact();
    } catch (error: any) {
      console.error('Error unlinking user:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to unlink user from contact',
        variant: 'destructive',
      });
    } finally {
      setLinking(false);
    }
  };

  const openInviteDialog = () => {
    setInviteEmail(contact?.email || '');
    setInviteFullName(contact?.name || '');
    setShowInviteDialog(true);
  };

  const handleInviteUser = async () => {
    if (!inviteEmail) {
      toast({ title: 'Email required', description: 'Please enter an email address', variant: 'destructive' });
      return;
    }
    try {
      setInviting(true);
      await usersAPI.inviteUser(inviteEmail, inviteFullName || undefined, id);
      toast({
        title: 'Invitation sent',
        description: `An invite email has been sent to ${inviteEmail}. They can set their own password via the link.`,
      });
      setShowInviteDialog(false);
      await loadContact(); // refresh to show linked user
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to invite user', variant: 'destructive' });
    } finally {
      setInviting(false);
    }
  };

  // item 5 — attach a company straight from the Lead Information picker (no dialog).
  // New contacts: stash the choice and attach it right after the contact is created.
  const attachCompanyById = async (companyId: string) => {
    if (!companyId) return;
    if (isNew || !id) { setPendingCompanyId(companyId); return; }
    if ((contact?.companies ?? []).some((c: any) => c.company_id === companyId)) return;
    try {
      const isFirst = (contact?.companies ?? []).length === 0;
      await companiesAPI.attachContact(companyId, id, undefined, isFirst, '');
      await loadContact();
      logActivity('company_attached', 'Company attached', undefined, { company_id: companyId });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to attach company', variant: 'destructive' });
    }
  };

  // Solopreneur → business: create a company prefilled from this contact and attach
  // it as primary. The reassign-financials trigger then rolls the contact's existing
  // quotes/invoices up to the new business automatically.
  const createBusinessFromContact = async () => {
    if (!id || isNew || !contact) return;
    setCreatingBusiness(true);
    try {
      const res = await companiesAPI.createCompany({
        name: contact.billing_name || contact.company || contact.name,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
        vat_number: contact.vat_number ?? null,
        country_code: contact.country_code ?? null,
        tax_office: contact.tax_office ?? null,
        address: contact.address ?? null,
        city: contact.city ?? null,
        state: contact.state ?? null,
        postal_code: contact.postal_code ?? null,
        country: contact.country ?? null,
        is_customer: !!contact.is_client,
        is_supplier: !!contact.is_supplier,
      });
      const companyId = res?.data?.id ?? res?.id;
      if (!companyId) throw new Error('Company was not created');
      await companiesAPI.attachContact(companyId, id, undefined, true, '');
      await loadContact();
      logActivity('company_attached', 'Business created from contact', undefined, { company_id: companyId });
      toast({ title: 'Business created', description: 'The contact is now attached; their quotes & invoices moved to the business.' });
    } catch (error: any) {
      toast({ title: 'Could not create business', description: error?.message, variant: 'destructive' });
    } finally {
      setCreatingBusiness(false);
    }
  };

  // (legacy multi-field attach dialog removed in item 5 — Lead Information now
  // attaches a company inline via attachCompanyById.)
  const handleDetachCompany = async (relationshipId: string) => {
    if (!confirm('Are you sure you want to remove this company from the contact?')) return;
    try {
      // We need to find the company ID from the relationship
      const companyRelationship = contact?.companies?.find(
        (c: any) => c.relationship_id === relationshipId,
      );
      if (!companyRelationship) return;

      await companiesAPI.detachContact(companyRelationship.company_id, relationshipId);
      toast({
        title: 'Success',
        description: 'Company removed from contact successfully',
      });
      await loadContact();
      logActivity('company_detached', 'Company removed', companyRelationship.company_name ?? undefined, { company_id: companyRelationship.company_id });
    } catch (error: any) {
      console.error('Error removing company:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove company from contact',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-3 sm:p-6">
        <div className="text-center py-12">Loading contact details...</div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader
          title="Contact Not Found"
          description="The requested contact could not be found"
          badge="CRM"
        />
        <div className="p-6">
          <Button variant="ghost" onClick={() => navigate('/admin/crm')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to CRM
          </Button>
        </div>
      </div>
    );
  }

  // A contact attached to a business has no separate commercial identity — the
  // business owns pricing / VAT / tax, so those sections are hidden when attached.
  const hasCompany = !!primaryCompany;

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title={isNew ? 'New Contact' : contact.name || 'Untitled Contact'}
        description={contact.company || 'Contact Details'}
        badge="CRM"
      />

      <div className="p-3 sm:p-6 space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button variant="ghost" onClick={() => navigate('/admin/crm')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to CRM
          </Button>
          {/* View-first: existing contacts save per field inline. Only the create
              flow needs an explicit Create/Cancel. */}
          {isNew && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/admin/crm')}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Create Contact'}
              </Button>
            </div>
          )}
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList className="h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="overview">
              <User className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            {/* When the contact belongs to a business, every financial surface lives on
                the company — use the "Check Company" link. Standalone contacts get the
                same single Orders-first Account tab as a company (orders drive invoices /
                payments / receivables, all viewed by opening an order). */}
            {!hasCompany && (
              <TabsTrigger value="account">
                <Wallet className="h-4 w-4 mr-2" />
                Account
              </TabsTrigger>
            )}
          </TabsList>
          {hasCompany && primaryCompany?.id && (
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => navigate(`/admin/crm/companies/${primaryCompany.id}`)}>
              <Building2 className="h-4 w-4" /> {primaryCompany.name}
            </Button>
          )}
          </div>

          {/* Overview Tab — CRM two-column layout: a compact info column on the
              left, the commercial detail on the right. */}
          <TabsContent value="overview" className="space-y-6">
            {/* Sidebar of independently collapsible info cards on the left; the Activity
                feed (+ commercial when there's no business) is the main column. */}
            <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
              {/* LEFT — identity & quick info (collapsible cards) */}
              <div className="space-y-3 lg:sticky lg:top-4">
              {/* Contact Information — open by default */}
              <CollapsibleCard title="Contact Information" icon={User} defaultOpen contentClassName="space-y-4">
                  <div className="grid grid-cols-1 gap-x-6 gap-y-2">
                    <div>
                      <InlineText alwaysEdit={isNew} label="Full Name *" value={contact.name} onSave={(v) => patchInline({ name: (v as string) ?? '' })} placeholder="Jane Smith" copy={false} />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <InlineText alwaysEdit={isNew} type="email" label="Email" value={contact.email} onSave={(v) => patchInline({ email: v })} placeholder="jane@example.com" />
                      </div>
                      <Button type="button" size="icon" variant="ghost" onClick={() => setShowEmailDialog(true)} disabled={!contact.email}
                        title={contact.email ? `Send email to ${contact.email}` : 'No email on file'} className="shrink-0 mb-0.5 text-muted-foreground hover:bg-transparent hover:text-foreground">
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                    <InlineText alwaysEdit={isNew} type="tel" label="Phone" value={contact.phone} onSave={(v) => patchInline({ phone: v })} placeholder="+44 7445 264362" />
                    <InlineText alwaysEdit={isNew} type="tel" label="Mobile" value={contact.mobile} onSave={(v) => patchInline({ mobile: v })} placeholder="+44 7445 264362" />
                    <InlineText alwaysEdit={isNew} label="Position / Title" value={contact.position} onSave={(v) => patchInline({ position: v })} placeholder="e.g. Procurement Manager" copy={false} />
                    <InlineText alwaysEdit={isNew} label="Department" value={contact.department} onSave={(v) => patchInline({ department: v })} placeholder="e.g. Operations" copy={false} />
                    <InlineText alwaysEdit={isNew} type="date" label="Birthday" value={contact.date_of_birth} onSave={(v) => patchInline({ date_of_birth: v })} placeholder="" copy={false} />
                  </div>

                  {/* Role — only for contacts NOT attached to a business. A person who
                      belongs to a company has no separate role/billing identity; the
                      business owns it, so the whole section is hidden when attached. */}
                  {!hasCompany && (
                  <div className="pt-4 border-t space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Tag className="h-3.5 w-3.5" /> Role
                    </div>
                    {/* Customer / Supplier — checkboxes (a sole trader can be both),
                        matching the company page. */}
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                      <label htmlFor="is_client" className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox id="is_client" checked={!!contact.is_client} onCheckedChange={(v) => patchInline({ is_client: v === true })} />
                        Customer
                      </label>
                      <label htmlFor="is_supplier" className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox id="is_supplier" checked={!!contact.is_supplier} onCheckedChange={(v) => patchInline({ is_supplier: v === true })} />
                        Supplier
                      </label>
                    </div>
                    <div className="flex items-center justify-between gap-4 pt-2 border-t">
                      <div className="space-y-1">
                        <Label htmlFor="contact_type" className="cursor-pointer">Contact type</Label>
                        <p className="text-xs text-muted-foreground">Drives B2C vs B2B VAT logic.</p>
                      </div>
                      <Select
                        value={contact.contact_type ?? '__unset'}
                        onValueChange={(v) => patchInline({ contact_type: v === '__unset' ? null : v })}
                      >
                        <SelectTrigger id="contact_type" className="w-44">
                          <SelectValue placeholder="Not set" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unset">Not set</SelectItem>
                          <SelectItem value="private">Private (B2C)</SelectItem>
                          <SelectItem value="company">Company (B2B)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  )}
              </CollapsibleCard>

              {/* Lead Information */}
              <CollapsibleCard title="Lead Information" icon={FileText} defaultOpen={isNew} contentClassName="space-y-4">
                  {/* item 5 — attach a company right here (replaces the separate Companies tab). */}
                  <div>
                    <Label className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Company</Label>
                    <div className="mt-1.5 space-y-2">
                      {/* Once a company is attached, hide the search and show it with an
                          X to remove. Removing it brings the search back (no point showing
                          a search bar when the slot is already filled). */}
                      {(contact.companies ?? []).length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {(contact.companies ?? []).map((c: any) => (
                            <Badge key={c.relationship_id} variant="secondary" className="gap-1.5 py-1 pl-2.5 pr-1.5">
                              <button type="button" onClick={() => navigate(`/admin/crm/companies/${c.company_id}`)} className="hover:underline">
                                {c.company_name}
                              </button>
                              {c.is_primary && <span className="text-[9px] uppercase opacity-70">primary</span>}
                              <button type="button" onClick={() => handleDetachCompany(c.relationship_id)} aria-label="Remove company" className="rounded-full p-0.5 opacity-70 hover:bg-muted hover:opacity-100">
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <>
                          <CompanySearchDropdown
                            onSelect={attachCompanyById}
                            excludeCompanyIds={(contact.companies ?? []).map((c: any) => c.company_id)}
                            placeholder="Search & attach a company…"
                            selectedCompanyId={isNew ? (pendingCompanyId || null) : null}
                          />
                          {/* Solopreneur opening a business: spin up a company from this
                              contact's details + move their existing quotes/invoices to it. */}
                          {!isNew && (
                            <button
                              type="button"
                              onClick={createBusinessFromContact}
                              disabled={creatingBusiness}
                              className="text-xs text-primary hover:underline disabled:opacity-50"
                            >
                              {creatingBusiness ? 'Creating business…' : '+ Open a business from this contact'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-2">
                    <LeadFieldSelect alwaysEdit={isNew} kind="lead_status" label="Lead Status" value={contact.lead_status} onSave={(v) => { patchInline({ lead_status: v }); if (v) logActivity('lead_status_changed', `Lead status set to "${v}"`); }} placeholder="Not set" />
                    <LeadFieldSelect alwaysEdit={isNew} kind="lead_source" label="Lead Source" value={contact.lead_source} onSave={(v) => patchInline({ lead_source: v })} placeholder="Not set" />
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">Created</div>
                      <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground"><Calendar className="h-3.5 w-3.5" />{new Date(contact.created_at).toLocaleDateString()}</div>
                    </div>
                    {contact.updated_at && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">Last Updated</div>
                        <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground"><Calendar className="h-3.5 w-3.5" />{new Date(contact.updated_at).toLocaleDateString()}</div>
                      </div>
                    )}
                  </div>
              </CollapsibleCard>

              {/* Address */}
              <CollapsibleCard title="Address" icon={MapPin} defaultOpen={isNew}>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-2">
                    <div>
                      <InlineText alwaysEdit={isNew} label="Street Address" value={contact.address} onSave={(v) => patchInline({ address: v })} placeholder="123 Main Street" />
                    </div>
                    <InlineText alwaysEdit={isNew} label="City" value={contact.city} onSave={(v) => patchInline({ city: v })} placeholder="London" />
                    <InlineText alwaysEdit={isNew} label="Postal Code" value={contact.postal_code} onSave={(v) => patchInline({ postal_code: v })} placeholder="N21 1QP" />
                    <InlineText alwaysEdit={isNew} label="State / Province" value={contact.state} onSave={(v) => patchInline({ state: v })} placeholder="Greater London" />
                    <InlineText alwaysEdit={isNew} label="Country" value={contact.country} onSave={(v) => patchInline({ country: v })} placeholder="United Kingdom" />
                  </div>
              </CollapsibleCard>

              {/* CRM Categories — moved here, below the Address */}
              {contact.id && (
                <CollapsibleCard title="CRM Categories" icon={Tags}>
                  <CategoryAssignmentPicker bare target={{ kind: 'contact', id: contact.id }} />
                </CollapsibleCard>
              )}

              {/* Linked User Account */}
              <CollapsibleCard title="Linked User Account" icon={LinkIcon} defaultOpen={isNew}>
                  {linkedUser ? (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">{linkedUser.email}</span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={handleUnlinkUser} disabled={linking}
                        title="Unlink user" className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground">
                        <Unlink className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Button size="sm" onClick={openInviteDialog} className="w-full" disabled={!contact.email && !isNew}>
                        <UserPlus className="h-3.5 w-3.5 mr-2" /> Create &amp; invite user
                      </Button>
                      <UserSearchDropdown
                        onSelect={handleLinkUser}
                        placeholder="…or link an existing user"
                        selectedUserId={null}
                      />
                    </div>
                  )}
              </CollapsibleCard>
              </div>

              {/* RIGHT — main column: commercial (only when no business) + Activity feed. */}
              <div className="space-y-4">
            {!hasCompany && (
              <>
            {/* commercial info (Pricing + Invoicing & VAT) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Pricing — admin-managed default discount the AI applies on quotes for this customer */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Percent className="h-4 w-4" />
                  Pricing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                    {/* Pricing level + discount route through the approval RPC (savePricing), not patchInline. */}
                    <InlineSelect
                      alwaysEdit={isNew}
                      label="Pricing level"
                      value={contact.user_level_key ?? undefined}
                      unsetValue="__default__"
                      placeholder="Standard"
                      options={pricingLevels.map((l) => ({ value: l.level_key, label: l.label }))}
                      onSave={(v) => savePricing({ user_level_key: v })}
                      hint="Tier this customer buys at — discount applies off retail on quotes."
                    />
                    <InlineText
                      alwaysEdit={isNew}
                      type="number"
                      label="Customer discount % (override)"
                      value={contact.discount_percent ?? undefined}
                      onSave={(v) => savePricing({ discount_percent: v })}
                      placeholder="e.g. 30"
                      copy={false}
                      hint="Applied automatically by the AI price lookup. Empty = none."
                    />
                    <div className="md:col-span-2">
                      <InlineText
                        alwaysEdit={isNew}
                        multiline
                        label="Discount notes"
                        value={contact.discount_notes}
                        onSave={(v) => patchInline({ discount_notes: v })}
                        placeholder="e.g. Long-term partner — 30% per 2025 agreement."
                        copy={false}
                      />
                    </div>
                  </div>
                {/* Credit limit — contact-specific risk control. */}
                <InlineText
                  alwaysEdit={isNew}
                  type="number"
                  label="Credit limit"
                  value={contact.credit_limit ?? undefined}
                  onSave={(v) => patchInline({ credit_limit: v })}
                  placeholder="e.g. 5000"
                  copy={false}
                  hint="Max outstanding receivable; finance flags this customer when exceeded."
                />
              </CardContent>
            </Card>

            {/* Invoicing & VAT (commercial) — #207 parity: segment, ΜΥΦ inclusion,
                default on-invoice VAT-exemption reason, and a separate billing identity
                (used on the myDATA counterpart when set). */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4" />
                  Invoicing &amp; VAT
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                  <InlineSelect
                    alwaysEdit={isNew}
                    label="Segment"
                    value={contact.contact_group ?? undefined}
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
                    value={contact.vat_exemption_reason ?? undefined}
                    unsetValue="__none"
                    placeholder="None"
                    options={MYDATA_EXEMPTION_CATEGORIES.map((c) => ({ value: String(c.code), label: <span><span className="font-mono text-[10px] mr-2">{c.code}</span>{c.label}</span> }))}
                    displayValue={contact.vat_exemption_reason ? <span><span className="font-mono text-[10px] mr-2">{contact.vat_exemption_reason}</span>{MYDATA_EXEMPTION_CATEGORIES.find((c) => String(c.code) === contact.vat_exemption_reason)?.label}</span> : undefined}
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
                    checked={contact.include_in_myf !== false}
                    onCheckedChange={(v) => patchInline({ include_in_myf: v })}
                  />
                </div>
                <div className="rounded-md border border-border/60 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="text-foreground font-medium">Separate billing identity</span> — fill only when invoices must be issued to a different legal entity than this contact (different ΑΦΜ / name / address). Leave blank to invoice the contact as-is.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                    <InlineText alwaysEdit={isNew} label="Billing name" value={contact.billing_name} onSave={(v) => patchInline({ billing_name: v })} placeholder="Legal entity name" />
                    <InlineText alwaysEdit={isNew} label="Billing VAT (ΑΦΜ)" value={contact.billing_vat} onSave={(v) => patchInline({ billing_vat: v })} placeholder="EL123456789" />
                    <InlineText alwaysEdit={isNew} label="Tax office (ΔΟΥ)" value={contact.billing_tax_office} onSave={(v) => patchInline({ billing_tax_office: v })} placeholder="e.g. Tax Office Chalandriou" />
                    <InlineSelect alwaysEdit={isNew} label="VAT country" value={contact.billing_country_code ?? undefined} placeholder="Not set"
                      options={VAT_COUNTRY_OPTIONS.map((o) => ({ value: o.code, label: <span><span className="font-mono text-[10px] mr-2">{o.code}</span>{o.name}</span> }))}
                      displayValue={contact.billing_country_code ? <span className="font-mono">{contact.billing_country_code}</span> : undefined}
                      onSave={(v) => patchInline({ billing_country_code: v })} />
                    <InlineText alwaysEdit={isNew} label="Street" value={contact.billing_street} onSave={(v) => patchInline({ billing_street: v })} />
                    <InlineText alwaysEdit={isNew} label="Number" value={contact.billing_street_number} onSave={(v) => patchInline({ billing_street_number: v })} />
                    <InlineText alwaysEdit={isNew} label="Postal code" value={contact.billing_postal_code} onSave={(v) => patchInline({ billing_postal_code: v })} />
                    <InlineText alwaysEdit={isNew} label="City" value={contact.billing_city} onSave={(v) => patchInline({ billing_city: v })} />
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>

            {/* Tax & VAT — the contact's own identity (B2C / sole trader). */}
            <ContactTaxVatCard
              vatNumber={contact.vat_number ?? null}
              countryCode={contact.country_code ?? null}
              taxOffice={contact.tax_office ?? null}
              onPatch={(updates) => patchInline(updates as Partial<Contact>)}
            />
              </>
            )}
            {/* Unified Activity feed (notes live here too — "Add note" button). */}
            {contact.id && <CrmActivityTimeline target={{ kind: 'contact', id: contact.id }} refreshKey={activityRefresh} />}
              </div>
            </div>
          </TabsContent>


          {/* Account = one flow (same model as the company page): money summary up top, then the
              Orders list. Receivables/payables are managed PER ORDER — open an order to see them. */}
          <TabsContent value="account" className="space-y-4">
            {contact.id ? (
              <>
                <CustomerAccountOverview contactId={contact.id} customerName={contact.name} isSupplier={!!contact.is_supplier} ledgerHref={`/finance?tab=parties&party=contact:${contact.id}`} />
                <OrdersPanel workspaceId={activeWorkspaceId ?? ''} contactId={contact.id} />
                {/* Itemised cash movements (money in & out) across all this party's orders. */}
                <PartyPaymentsCard contactId={contact.id} />
                {/* Repeat-buy suggestions (in-stock), below the orders list. */}
                <CustomerTopItemsCard contactId={contact.id} />
                <CustomerFinanceRulesCard contactId={contact.id} />
              </>
            ) : (
              <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Save this contact first to see their account &amp; orders.</CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Send Email Dialog */}
      <SendEmailDialog
        open={showEmailDialog}
        onClose={() => setShowEmailDialog(false)}
        toEmail={contact.email || ''}
        toName={contact.name || null}
        recipientLabel={contact.name || 'Contact'}
        onSent={({ subject }) => logActivity('email_sent', `Email sent to ${contact.email}`, subject)}
      />

      {/* Invite User Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create &amp; Invite User</DialogTitle>
            <DialogDescription>
              An invite email will be sent so they can set their own password and access the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-name">Full Name</Label>
              <Input
                id="invite-name"
                value={inviteFullName}
                onChange={(e) => setInviteFullName(e.target.value)}
                placeholder="Jane Smith"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email *</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleInviteUser} disabled={inviting || !inviteEmail}>
              <UserPlus className="h-4 w-4 mr-2" />
              {inviting ? 'Sending invite...' : 'Send Invite'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default ContactDetailPage;


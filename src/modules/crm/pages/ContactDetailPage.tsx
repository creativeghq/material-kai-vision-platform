import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Building2, MapPin, Calendar, User, FileText, Save, Edit2, Link as LinkIcon, Unlink, Plus, Trash2, UserPlus, ClipboardList, Receipt, CreditCard, ScrollText, Percent, Tag, Send, Wallet } from 'lucide-react';
import {
  CustomerFinanceSummary,
  CustomerAccountOverview,
  CustomerQuotesTab,
  CustomerInvoicesTab,
  CustomerPaymentsTab,
} from '@/modules/finance/components/CustomerFinanceTabs';
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
import { CrmNotesTimeline } from '@/components/business/crm/CrmNotesTimeline';
import { ContactTaxVatCard } from '@/components/business/crm/ContactTaxVatCard';
import { SendEmailDialog } from '@/components/business/crm/SendEmailDialog';
import { AddressUnitsManager } from '@/modules/crm/components/AddressUnitsManager';
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
  lead_source?: string;
  lead_status?: string;
  industry?: string;
  annual_revenue?: string;
  employee_count?: string;
  tags?: string[];
  discount_percent?: number | null;
  discount_notes?: string | null;
  credit_limit?: number | null;
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
  const isNew = id === 'new';
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(isNew); // Start in editing mode for new contacts
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
  const [linking, setLinking] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [showAddCompanyDialog, setShowAddCompanyDialog] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [companyRole, setCompanyRole] = useState<string>('');
  const [isPrimaryContact, setIsPrimaryContact] = useState(false);
  const [companyNotes, setCompanyNotes] = useState<string>('');
  const [attachingCompany, setAttachingCompany] = useState(false);

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

  const handleSave = async () => {
    if (!contact) return;

    // Validate required fields
    if (!contact.name || contact.name.trim() === '') {
      toast({
        title: 'Validation Error',
        description: 'Contact name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);

      if (isNew) {
        // Create new contact
        const response = await contactsAPI.createContact(contact);
        toast({
          title: 'Success',
          description: 'Contact created successfully',
        });
        // Navigate to the new contact's page
        navigate(`/admin/crm/contacts/${response.data.id}`, { replace: true });
      } else {
        // Update existing contact
        await contactsAPI.updateContact(id!, contact);
        toast({
          title: 'Success',
          description: 'Contact updated successfully',
        });
        setEditing(false);
        await loadContact();
      }
    } catch (error) {
      console.error('Error saving contact:', error);
      toast({
        title: 'Error',
        description: isNew ? 'Failed to create contact' : 'Failed to save contact',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof Contact, value: any) => {
    if (!contact) return;
    setContact({ ...contact, [field]: value });
  };

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

  // Company attachment handlers
  const handleAttachCompany = async () => {
    if (!id || !selectedCompanyId) return;
    try {
      setAttachingCompany(true);
      await companiesAPI.attachContact(
        selectedCompanyId,
        id,
        companyRole,
        isPrimaryContact,
        companyNotes,
      );
      toast({
        title: 'Success',
        description: 'Company attached to contact successfully',
      });
      setShowAddCompanyDialog(false);
      setSelectedCompanyId('');
      setCompanyRole('');
      setIsPrimaryContact(false);
      setCompanyNotes('');
      await loadContact();
    } catch (error: any) {
      console.error('Error attaching company:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to attach company to contact',
        variant: 'destructive',
      });
    } finally {
      setAttachingCompany(false);
    }
  };

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
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button variant="outline" onClick={() => {
                  if (isNew) {
                    navigate('/admin/crm');
                  } else {
                    setEditing(false);
                    loadContact(); // Reload to discard changes
                  }
                }}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : (isNew ? 'Create Contact' : 'Save Changes')}
                </Button>
              </>
            ) : (
              <Button onClick={() => setEditing(true)}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit Contact
              </Button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="overview">
              <User className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="companies">
              <Building2 className="h-4 w-4 mr-2" />
              Companies
            </TabsTrigger>
            <TabsTrigger value="notes">
              <FileText className="h-4 w-4 mr-2" />
              Notes & Activity
            </TabsTrigger>
            <TabsTrigger value="account">
              <Wallet className="h-4 w-4 mr-2" />
              Account
            </TabsTrigger>
            <TabsTrigger value="quotes">
              <ScrollText className="h-4 w-4 mr-2" />
              Quotes
            </TabsTrigger>
            <TabsTrigger value="invoices">
              <Receipt className="h-4 w-4 mr-2" />
              Invoices
            </TabsTrigger>
            <TabsTrigger value="payments">
              <CreditCard className="h-4 w-4 mr-2" />
              Payments
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Contact Information Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <User className="h-4 w-4" />
                    Contact Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      value={contact.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      disabled={!editing}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <div className="relative flex items-center gap-2">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          value={contact.email || ''}
                          onChange={(e) => updateField('email', e.target.value)}
                          disabled={!editing}
                          className="mt-1 pl-10"
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => setShowEmailDialog(true)}
                        disabled={!contact.email}
                        title={contact.email ? `Send email to ${contact.email}` : 'No email on file'}
                        className="mt-1 shrink-0"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        value={contact.phone || ''}
                        onChange={(e) => updateField('phone', e.target.value)}
                        disabled={!editing}
                        className="mt-1 pl-10"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="mobile">Mobile</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="mobile"
                        value={contact.mobile || ''}
                        onChange={(e) => updateField('mobile', e.target.value)}
                        disabled={!editing}
                        className="mt-1 pl-10"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="position">Position/Title</Label>
                    <Input
                      id="position"
                      value={contact.position || ''}
                      onChange={(e) => updateField('position', e.target.value)}
                      disabled={!editing}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="department">Department</Label>
                    <Input
                      id="department"
                      value={contact.department || ''}
                      onChange={(e) => updateField('department', e.target.value)}
                      disabled={!editing}
                      className="mt-1"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Lead Information Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4" />
                    Lead Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="lead_status">Lead Status</Label>
                    <Input
                      id="lead_status"
                      value={contact.lead_status || ''}
                      onChange={(e) => updateField('lead_status', e.target.value)}
                      disabled={!editing}
                      className="mt-1"
                      placeholder="e.g., New, Qualified, Contacted"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lead_source">Lead Source</Label>
                    <Input
                      id="lead_source"
                      value={contact.lead_source || ''}
                      onChange={(e) => updateField('lead_source', e.target.value)}
                      disabled={!editing}
                      className="mt-1"
                      placeholder="e.g., Website, Referral, Trade Show"
                    />
                  </div>
                  <div>
                    <Label>Created</Label>
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {new Date(contact.created_at).toLocaleString()}
                    </div>
                  </div>
                  {contact.updated_at && (
                    <div>
                      <Label>Last Updated</Label>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {new Date(contact.updated_at).toLocaleString()}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Address Card */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPin className="h-4 w-4" />
                    Address
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label htmlFor="address" className="text-sm">Street Address</Label>
                    <Input
                      id="address"
                      value={contact.address || ''}
                      onChange={(e) => updateField('address', e.target.value)}
                      disabled={!editing}
                      className="mt-1"
                      placeholder="123 Main Street"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="city" className="text-sm">City</Label>
                      <Input
                        id="city"
                        value={contact.city || ''}
                        onChange={(e) => updateField('city', e.target.value)}
                        disabled={!editing}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="postal_code" className="text-sm">Postal Code</Label>
                      <Input
                        id="postal_code"
                        value={contact.postal_code || ''}
                        onChange={(e) => updateField('postal_code', e.target.value)}
                        disabled={!editing}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="state" className="text-sm">State/Province</Label>
                      <Input
                        id="state"
                        value={contact.state || ''}
                        onChange={(e) => updateField('state', e.target.value)}
                        disabled={!editing}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="country" className="text-sm">Country</Label>
                      <Input
                        id="country"
                        value={contact.country || ''}
                        onChange={(e) => updateField('country', e.target.value)}
                        disabled={!editing}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Sub Units — secondary / branch / establishment addresses usable on documents */}
              <AddressUnitsManager contactId={isNew ? undefined : id} readOnly={!editing} />

              {/* Link to User Account Card - Compact Design */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <LinkIcon className="h-4 w-4" />
                    Linked User Account
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {linkedUser ? (
                    <>
                      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm font-medium truncate">{linkedUser.email}</span>
                        </div>
                        {linkedUser.user_profiles?.subscription_tier && (
                          <Badge variant="outline" className="capitalize text-xs flex-shrink-0">
                            {linkedUser.user_profiles.subscription_tier}
                          </Badge>
                        )}
                      </div>
                      {linkedUser.user_profiles?.full_name && (
                        <p className="text-sm text-muted-foreground px-3">
                          {linkedUser.user_profiles.full_name}
                        </p>
                      )}
                      {contact.linked_at && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground px-3">
                          <Calendar className="h-3 w-3" />
                          Linked {new Date(contact.linked_at).toLocaleDateString()}
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/admin/quote-requests?user=${contact.user_id}`)}
                        className="w-full"
                      >
                        <ClipboardList className="h-3 w-3 mr-2" />
                        Create Quote
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleUnlinkUser}
                        disabled={linking}
                        className="w-full text-muted-foreground"
                      >
                        <Unlink className="h-3 w-3 mr-2" />
                        {linking ? 'Unlinking...' : 'Unlink User'}
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Link to a user account or create a new one to assign quotes and track activity.
                      </p>
                      <Button
                        size="sm"
                        onClick={openInviteDialog}
                        className="w-full"
                        disabled={!contact.email && !isNew}
                      >
                        <UserPlus className="h-3 w-3 mr-2" />
                        Create &amp; Invite User
                      </Button>
                      {!contact.email && (
                        <p className="text-xs text-muted-foreground text-center">
                          Add an email to the contact first
                        </p>
                      )}
                      <div className="relative flex items-center gap-2">
                        <div className="flex-1 border-t border-border" />
                        <span className="text-xs text-muted-foreground">or link existing</span>
                        <div className="flex-1 border-t border-border" />
                      </div>
                      <div>
                        <Label className="text-sm">Search User</Label>
                        <div className="mt-1.5">
                          <UserSearchDropdown
                            onSelect={handleLinkUser}
                            placeholder="Search by email..."
                            selectedUserId={null}
                          />
                        </div>
                      </div>
                      {linking && (
                        <p className="text-sm text-muted-foreground text-center">
                          Linking...
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Pricing — admin-managed default discount the AI applies on quotes for this customer */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Percent className="h-4 w-4" />
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
                      value={contact.discount_percent ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateField('discount_percent', v === '' ? null : Number(v));
                      }}
                      disabled={!editing}
                      placeholder="e.g. 30"
                    />
                    <p className="text-xs text-muted-foreground">
                      Applied automatically by the AI price lookup when this contact is the quote customer. Leave empty for no customer discount.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="credit_limit">Credit limit</Label>
                    <Input
                      id="credit_limit"
                      type="number"
                      step="0.01"
                      min={0}
                      value={contact.credit_limit ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateField('credit_limit', v === '' ? null : Number(v));
                      }}
                      disabled={!editing}
                      placeholder="e.g. 5000"
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
                    value={contact.discount_notes || ''}
                    onChange={(e) => updateField('discount_notes', e.target.value)}
                    disabled={!editing}
                    placeholder="e.g. Long-term partner — 30% per 2025 agreement, valid until renewal."
                    rows={2}
                  />
                </div>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact_group">Segment</Label>
                    <Select
                      value={contact.contact_group || 'none'}
                      onValueChange={(v) => updateField('contact_group', v === 'none' ? null : v)}
                      disabled={!editing}
                    >
                      <SelectTrigger id="contact_group"><SelectValue placeholder="Unsegmented" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unsegmented</SelectItem>
                        <SelectItem value="b2b">B2B</SelectItem>
                        <SelectItem value="retail">Retail</SelectItem>
                        <SelectItem value="wholesale">Wholesale</SelectItem>
                        <SelectItem value="public_sector">Public sector</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Groups this party for filtering and statement batches.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vat_exemption_reason">Default VAT-exemption category</Label>
                    <Input
                      id="vat_exemption_reason"
                      value={contact.vat_exemption_reason || ''}
                      onChange={(e) => updateField('vat_exemption_reason', e.target.value)}
                      disabled={!editing}
                      placeholder="myDATA category 1–31 (for 0% lines)"
                    />
                    <p className="text-xs text-muted-foreground">Pre-fills the exemption category on 0%-VAT invoice lines for this customer.</p>
                  </div>
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
                <div className="rounded-md border border-border/60 p-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    <span className="text-foreground font-medium">Separate billing identity</span> — fill only when invoices must be issued to a different legal entity than this contact (different ΑΦΜ / name / address). Leave blank to invoice the contact as-is.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1"><Label htmlFor="billing_name">Billing name</Label><Input id="billing_name" value={contact.billing_name || ''} onChange={(e) => updateField('billing_name', e.target.value)} disabled={!editing} placeholder="Legal entity name" /></div>
                    <div className="space-y-1"><Label htmlFor="billing_vat">Billing VAT (ΑΦΜ)</Label><Input id="billing_vat" value={contact.billing_vat || ''} onChange={(e) => updateField('billing_vat', e.target.value)} disabled={!editing} /></div>
                    <div className="space-y-1"><Label htmlFor="billing_tax_office">Tax office (ΔΟΥ)</Label><Input id="billing_tax_office" value={contact.billing_tax_office || ''} onChange={(e) => updateField('billing_tax_office', e.target.value)} disabled={!editing} /></div>
                    <div className="space-y-1"><Label htmlFor="billing_country_code">Country code</Label><Input id="billing_country_code" value={contact.billing_country_code || ''} onChange={(e) => updateField('billing_country_code', e.target.value.toUpperCase().slice(0, 2))} disabled={!editing} maxLength={2} placeholder="EL" /></div>
                    <div className="space-y-1"><Label htmlFor="billing_street">Street</Label><Input id="billing_street" value={contact.billing_street || ''} onChange={(e) => updateField('billing_street', e.target.value)} disabled={!editing} /></div>
                    <div className="space-y-1"><Label htmlFor="billing_street_number">Number</Label><Input id="billing_street_number" value={contact.billing_street_number || ''} onChange={(e) => updateField('billing_street_number', e.target.value)} disabled={!editing} /></div>
                    <div className="space-y-1"><Label htmlFor="billing_postal_code">Postal code</Label><Input id="billing_postal_code" value={contact.billing_postal_code || ''} onChange={(e) => updateField('billing_postal_code', e.target.value)} disabled={!editing} /></div>
                    <div className="space-y-1"><Label htmlFor="billing_city">City</Label><Input id="billing_city" value={contact.billing_city || ''} onChange={(e) => updateField('billing_city', e.target.value)} disabled={!editing} /></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tax & VAT — admin-managed billing details. If the contact is
                attached to a Company (B2B), the company's VAT takes priority
                for invoicing — this VAT is the contact's personal one (used
                for B2C / sole-trader / self-employed invoicing). */}
            <ContactTaxVatCard
              vatNumber={contact.vat_number ?? null}
              countryCode={contact.country_code ?? null}
              taxOffice={contact.tax_office ?? null}
              attachedCompanies={contact.companies ?? []}
              onPatch={(updates) => patchInline(updates as Partial<Contact>)}
            />

            {/* Role — who this contact is to the workspace. Drives how the
                finance Parties view classifies them. Note: contacts are people,
                not businesses — products live on the company (see "Companies"
                tab → open the company → Products). is_supplier is kept here
                for sole-trader / freelancer contacts who supply directly
                without a CRM company. */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Role
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="is_supplier" className="cursor-pointer">This is a supplier</Label>
                    <p className="text-xs text-muted-foreground">
                      Use for freelancers / sole traders who supply directly. If they belong to a business,
                      mark the company as supplier instead — products live on the business.
                    </p>
                  </div>
                  <Switch
                    id="is_supplier"
                    checked={!!contact.is_supplier}
                    onCheckedChange={(v) => patchInline({ is_supplier: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="is_client" className="cursor-pointer">This is a customer</Label>
                    <p className="text-xs text-muted-foreground">
                      Means we sell to them — quotes / invoices / statements get raised against this contact.
                    </p>
                  </div>
                  <Switch
                    id="is_client"
                    checked={!!contact.is_client}
                    onCheckedChange={(v) => patchInline({ is_client: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 pt-2 border-t">
                  <div className="space-y-1">
                    <Label htmlFor="contact_type" className="cursor-pointer">Contact type</Label>
                    <p className="text-xs text-muted-foreground">
                      Drives B2C vs B2B billing — used by quote VAT logic.
                    </p>
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
              </CardContent>
            </Card>

            {contact.id && <CategoryAssignmentPicker target={{ kind: 'contact', id: contact.id }} />}
          </TabsContent>

          {/* Companies Tab */}
          <TabsContent value="companies" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Attached Companies
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Companies associated with this contact
                  </p>
                </div>
                <Button onClick={() => setShowAddCompanyDialog(true)} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Company
                </Button>
              </CardHeader>
              <CardContent>
                {!contact.companies || contact.companies.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No companies attached to this contact yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => setShowAddCompanyDialog(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Company
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Industry</TableHead>
                        <TableHead>Website</TableHead>
                        <TableHead>Primary</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contact.companies.map((company: any) => (
                        <TableRow key={company.relationship_id}>
                          <TableCell className="font-medium">
                            <button
                              onClick={() => navigate(`/admin/crm/companies/${company.company_id}`)}
                              className="text-primary hover:underline"
                            >
                              {company.company_name}
                            </button>
                          </TableCell>
                          <TableCell>{company.role || '-'}</TableCell>
                          <TableCell>{company.company_industry || '-'}</TableCell>
                          <TableCell>
                            {company.company_website ? (
                              <a
                                href={company.company_website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                {company.company_website}
                              </a>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            {company.is_primary && (
                              <Badge variant="secondary">Primary</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDetachCompany(company.relationship_id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
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

          {/* Notes & Activity Tab — timeline of separate note entries
              (replaced the single-textarea blob in 2026-05-25). */}
          <TabsContent value="notes" className="space-y-4">
            <CrmNotesTimeline targetKind="contact" targetId={contact.id || null} />
          </TabsContent>

          {/* Account overview Tab */}
          <TabsContent value="account" className="space-y-4">
            {contact.id && <CustomerAccountOverview contactId={contact.id} isSupplier={!!contact.is_supplier} ledgerHref={`/finance?tab=parties&party=contact:${contact.id}`} />}
          </TabsContent>

          {/* Quotes Tab */}
          <TabsContent value="quotes" className="space-y-4">
            {contact.id && <CustomerFinanceSummary contactId={contact.id} />}
            {contact.id && <CustomerQuotesTab contactId={contact.id} />}
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-4">
            {contact.id && <CustomerFinanceSummary contactId={contact.id} />}
            {contact.id && <CustomerInvoicesTab contactId={contact.id} />}
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="space-y-4">
            {contact.id && <CustomerFinanceSummary contactId={contact.id} />}
            {contact.id && <CustomerPaymentsTab contactId={contact.id} />}
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

      {/* Add Company Dialog */}
      <Dialog open={showAddCompanyDialog} onOpenChange={setShowAddCompanyDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Attach Company to Contact</DialogTitle>
            <DialogDescription>
              Link this contact to a company and specify their role
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Company Search */}
            <div className="space-y-2">
              <Label>Company *</Label>
              <CompanySearchDropdown
                onSelect={setSelectedCompanyId}
                excludeCompanyIds={contact?.companies?.map((c: any) => c.company_id) || []}
                placeholder="Search companies..."
                selectedCompanyId={selectedCompanyId || null}
              />
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label htmlFor="company-role">Role at Company</Label>
              <Input
                id="company-role"
                value={companyRole}
                onChange={(e) => setCompanyRole(e.target.value)}
                placeholder="e.g., CEO, Sales Manager, Developer"
              />
            </div>

            {/* Primary Contact */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is-primary"
                checked={isPrimaryContact}
                onChange={(e) => setIsPrimaryContact(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="is-primary" className="cursor-pointer">
                Mark as primary contact for this company
              </Label>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="company-notes">Notes</Label>
              <Textarea
                id="company-notes"
                value={companyNotes}
                onChange={(e) => setCompanyNotes(e.target.value)}
                placeholder="Additional notes about this relationship..."
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddCompanyDialog(false);
                setSelectedCompanyId('');
                setCompanyRole('');
                setIsPrimaryContact(false);
                setCompanyNotes('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAttachCompany}
              disabled={!selectedCompanyId || attachingCompany}
            >
              {attachingCompany ? 'Attaching...' : 'Attach Company'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContactDetailPage;


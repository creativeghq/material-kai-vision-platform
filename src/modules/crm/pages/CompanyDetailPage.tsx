import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Building2, MapPin, Calendar, Globe, FileText, Save, Edit2, Users, Trash2, Plus, Search } from 'lucide-react';
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
import { CategoryAssignmentPicker } from '@/components/business/catalogs/CategoryAssignmentPicker';
import { ContactSearchDropdown } from '@/components/business/crm/ContactSearchDropdown';
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
  notes?: string;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
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
    notes: '',
    linkedin: '',
    twitter: '',
    facebook: '',
    created_at: new Date().toISOString(),
    contacts: [],
  } : null);
  const [showAddContactDialog, setShowAddContactDialog] = useState(false);
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
        title={isNew ? 'New Company' : company.name || 'Untitled Company'}
        description={isNew ? 'Create a new company' : `Company Details • Created ${new Date(company.created_at).toLocaleDateString()}`}
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
                    loadCompany();
                  }
                }}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : (isNew ? 'Create Company' : 'Save Changes')}
                </Button>
              </>
            ) : (
              <Button onClick={() => setEditing(true)}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit Company
              </Button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Building2 className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="contacts" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="h-4 w-4 mr-2" />
              Contacts ({company.contacts?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="social" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Globe className="h-4 w-4 mr-2" />
              Social & Web
            </TabsTrigger>
            <TabsTrigger value="notes" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FileText className="h-4 w-4 mr-2" />
              Notes
            </TabsTrigger>
            <TabsTrigger value="seo" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Search className="h-4 w-4 mr-2" />
              SEO
            </TabsTrigger>
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
                    <div className="flex gap-2">
                      <Mail className="h-4 w-4 mt-3 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={company.email || ''}
                        onChange={(e) => updateField('email', e.target.value)}
                        disabled={!editing}
                        placeholder="contact@company.com"
                      />
                    </div>
                  </div>

                  {/* Phone */}
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <div className="flex gap-2">
                      <Phone className="h-4 w-4 mt-3 text-muted-foreground" />
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
                      <Globe className="h-4 w-4 mt-3 text-muted-foreground" />
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

            <CategoryAssignmentPicker target={{ kind: 'company', id: company.id }} />
          </TabsContent>

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
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contact
                </Button>
              </CardHeader>
              <CardContent>
                {!company.contacts || company.contacts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No contacts attached to this company yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => setShowAddContactDialog(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
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

          {/* Notes Tab */}
          <TabsContent value="notes" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Internal Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={company.notes || ''}
                  onChange={(e) => updateField('notes', e.target.value)}
                  disabled={!editing}
                  placeholder="Add internal notes about this company..."
                  rows={10}
                  className="min-h-[200px]"
                />
              </CardContent>
            </Card>
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
        </Tabs>
      </div>

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


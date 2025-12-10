import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Building2, MapPin, Calendar, User, FileText, Save, Edit2, Link as LinkIcon, Unlink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { contactsAPI, usersAPI } from '@/services/crm.service';
import { UserSearchDropdown } from '@/components/CRM/UserSearchDropdown';

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
  notes?: string;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  lead_source?: string;
  lead_status?: string;
  industry?: string;
  annual_revenue?: string;
  employee_count?: string;
  tags?: string[];
  created_at: string;
  updated_at?: string;
  created_by?: string;
  user_id?: string;
  linked_at?: string;
  linked_by?: string;
}

/**
 * Contact Detail Page
 * Full page view for a single CRM contact with comprehensive information
 */
export const ContactDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState<Contact | null>(null);
  const [linkedUser, setLinkedUser] = useState<any>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (id) {
      loadContact();
    }
  }, [id]);

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
    if (!contact || !id) return;
    try {
      setSaving(true);
      await contactsAPI.updateContact(id, contact);
      toast({
        title: 'Success',
        description: 'Contact updated successfully',
      });
      setEditing(false);
      await loadContact();
    } catch (error) {
      console.error('Error saving contact:', error);
      toast({
        title: 'Error',
        description: 'Failed to save contact',
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

  if (loading) {
    return (
      <div className="min-h-screen p-6">
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
        title={contact.name}
        description={contact.company || 'Contact Details'}
        badge="CRM"
      />

      <div className="p-6 space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/admin/crm')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to CRM
          </Button>
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Changes'}
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
          <TabsList>
            <TabsTrigger value="overview">
              <User className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="company">
              <Building2 className="h-4 w-4 mr-2" />
              Company Info
            </TabsTrigger>
            <TabsTrigger value="address">
              <MapPin className="h-4 w-4 mr-2" />
              Address
            </TabsTrigger>
            <TabsTrigger value="notes">
              <FileText className="h-4 w-4 mr-2" />
              Notes & Activity
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Contact Information Card */}
              <Card className="dashboard-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
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
                    <div className="relative">
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
              <Card className="dashboard-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
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

            {/* Link to User Account Card */}
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="h-5 w-5" />
                  Link to User Account
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {linkedUser ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{linkedUser.email}</span>
                        </div>
                        {linkedUser.user_profiles?.subscription_tier && (
                          <Badge variant="outline" className="capitalize">
                            {linkedUser.user_profiles.subscription_tier}
                          </Badge>
                        )}
                      </div>
                      {linkedUser.user_profiles?.full_name && (
                        <div className="text-sm text-muted-foreground">
                          {linkedUser.user_profiles.full_name}
                        </div>
                      )}
                      {contact.linked_at && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          Linked on {new Date(contact.linked_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleUnlinkUser}
                      disabled={linking}
                      className="w-full"
                    >
                      <Unlink className="h-4 w-4 mr-2" />
                      {linking ? 'Unlinking...' : 'Unlink User Account'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Link this contact to an authenticated user account to track their subscription, credits, and activity.
                    </p>
                    <div>
                      <Label>Search for User</Label>
                      <div className="mt-2">
                        <UserSearchDropdown
                          onSelect={handleLinkUser}
                          placeholder="Search users by email or name..."
                          selectedUserId={null}
                        />
                      </div>
                    </div>
                    {linking && (
                      <div className="text-sm text-muted-foreground text-center">
                        Linking user...
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Company Info Tab */}
          <TabsContent value="company" className="space-y-4">
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Company Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="company">Company Name</Label>
                    <Input
                      id="company"
                      value={contact.company || ''}
                      onChange={(e) => updateField('company', e.target.value)}
                      disabled={!editing}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      type="url"
                      value={contact.website || ''}
                      onChange={(e) => updateField('website', e.target.value)}
                      disabled={!editing}
                      className="mt-1"
                      placeholder="https://example.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="industry">Industry</Label>
                    <Input
                      id="industry"
                      value={contact.industry || ''}
                      onChange={(e) => updateField('industry', e.target.value)}
                      disabled={!editing}
                      className="mt-1"
                      placeholder="e.g., Construction, Manufacturing"
                    />
                  </div>
                  <div>
                    <Label htmlFor="employee_count">Employee Count</Label>
                    <Input
                      id="employee_count"
                      value={contact.employee_count || ''}
                      onChange={(e) => updateField('employee_count', e.target.value)}
                      disabled={!editing}
                      className="mt-1"
                      placeholder="e.g., 50-100, 500+"
                    />
                  </div>
                  <div>
                    <Label htmlFor="annual_revenue">Annual Revenue</Label>
                    <Input
                      id="annual_revenue"
                      value={contact.annual_revenue || ''}
                      onChange={(e) => updateField('annual_revenue', e.target.value)}
                      disabled={!editing}
                      className="mt-1"
                      placeholder="e.g., $1M-$5M"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h3 className="text-sm font-medium mb-3">Social Media</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="linkedin">LinkedIn</Label>
                      <Input
                        id="linkedin"
                        value={contact.linkedin || ''}
                        onChange={(e) => updateField('linkedin', e.target.value)}
                        disabled={!editing}
                        className="mt-1"
                        placeholder="LinkedIn URL"
                      />
                    </div>
                    <div>
                      <Label htmlFor="twitter">Twitter</Label>
                      <Input
                        id="twitter"
                        value={contact.twitter || ''}
                        onChange={(e) => updateField('twitter', e.target.value)}
                        disabled={!editing}
                        className="mt-1"
                        placeholder="Twitter handle"
                      />
                    </div>
                    <div>
                      <Label htmlFor="facebook">Facebook</Label>
                      <Input
                        id="facebook"
                        value={contact.facebook || ''}
                        onChange={(e) => updateField('facebook', e.target.value)}
                        disabled={!editing}
                        className="mt-1"
                        placeholder="Facebook URL"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Address Tab */}
          <TabsContent value="address" className="space-y-4">
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Address Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="address">Street Address</Label>
                  <Input
                    id="address"
                    value={contact.address || ''}
                    onChange={(e) => updateField('address', e.target.value)}
                    disabled={!editing}
                    className="mt-1"
                    placeholder="123 Main Street"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={contact.city || ''}
                      onChange={(e) => updateField('city', e.target.value)}
                      disabled={!editing}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="state">State/Province</Label>
                    <Input
                      id="state"
                      value={contact.state || ''}
                      onChange={(e) => updateField('state', e.target.value)}
                      disabled={!editing}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="postal_code">Postal Code</Label>
                    <Input
                      id="postal_code"
                      value={contact.postal_code || ''}
                      onChange={(e) => updateField('postal_code', e.target.value)}
                      disabled={!editing}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="country">Country</Label>
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
          </TabsContent>

          {/* Notes & Activity Tab */}
          <TabsContent value="notes" className="space-y-4">
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Notes & Comments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div>
                  <Label htmlFor="notes">Internal Notes</Label>
                  <Textarea
                    id="notes"
                    value={contact.notes || ''}
                    onChange={(e) => updateField('notes', e.target.value)}
                    disabled={!editing}
                    className="mt-1 min-h-[200px]"
                    placeholder="Add notes about this contact..."
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ContactDetailPage;


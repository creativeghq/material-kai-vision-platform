/**
 * Create Campaign Modal
 * Form to create a new email campaign
 */

import React, { useState, useEffect } from 'react';
import { X, Users, Calendar, Search, UserPlus, Mail } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CreateCampaignModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface EmailTemplate {
  id: string;
  name: string;
  slug: string;
}

interface Recipient {
  id: string;
  email: string;
  name?: string;
  type: 'user' | 'contact';
}

export const CreateCampaignModal: React.FC<CreateCampaignModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [estimatedRecipients, setEstimatedRecipients] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    template_id: '',
    subject_line: '',
    preview_text: '',
    from_name: '',
    from_email: '',
    reply_to: '',
    audience_type: 'all_users', // 'all_users', 'all_contacts', 'both', 'specific', 'selected', 'filtered'
    specific_emails: '',
    audience_filter: {},
    schedule_type: 'now', // 'now', 'later'
    scheduled_at: '',
  });

  // Recipient selection state
  const [searchQuery, setSearchQuery] = useState('');
  const [availableRecipients, setAvailableRecipients] = useState<Recipient[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<Recipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    estimateAudience();
  }, [formData.audience_type, formData.specific_emails, formData.audience_filter, selectedRecipients]);

  useEffect(() => {
    if (formData.audience_type === 'selected') {
      loadRecipients();
    }
  }, [formData.audience_type, searchQuery]);

  const loadRecipients = async () => {
    try {
      setLoadingRecipients(true);

      // Load users
      const { data: users, error: usersError } = await supabase
        .from('user_profiles')
        .select('user_id, email, full_name')
        .ilike('email', `%${searchQuery}%`)
        .limit(50);

      if (usersError) throw usersError;

      // Load contacts
      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('id, email, name')
        .ilike('email', `%${searchQuery}%`)
        .limit(50);

      if (contactsError) throw contactsError;

      const userRecipients: Recipient[] = (users || []).map(u => ({
        id: u.user_id,
        email: u.email,
        name: u.full_name,
        type: 'user' as const,
      }));

      const contactRecipients: Recipient[] = (contacts || []).map(c => ({
        id: c.id,
        email: c.email,
        name: c.name,
        type: 'contact' as const,
      }));

      setAvailableRecipients([...userRecipients, ...contactRecipients]);
    } catch (error) {
      console.error('Error loading recipients:', error);
    } finally {
      setLoadingRecipients(false);
    }
  };

  const estimateAudience = async () => {
    try {
      let count = 0;

      if (formData.audience_type === 'all_users') {
        const { count: userCount, error } = await supabase
          .from('user_profiles')
          .select('*', { count: 'exact', head: true });

        if (error) throw error;
        count = userCount || 0;
      } else if (formData.audience_type === 'all_contacts') {
        const { count: contactCount, error } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true });

        if (error) throw error;
        count = contactCount || 0;
      } else if (formData.audience_type === 'both') {
        const [usersResult, contactsResult] = await Promise.all([
          supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
          supabase.from('contacts').select('*', { count: 'exact', head: true }),
        ]);

        if (usersResult.error) throw usersResult.error;
        if (contactsResult.error) throw contactsResult.error;

        count = (usersResult.count || 0) + (contactsResult.count || 0);
      } else if (formData.audience_type === 'specific') {
        const emails = formData.specific_emails
          .split('\n')
          .map(e => e.trim())
          .filter(e => e.length > 0);
        count = emails.length;
      } else if (formData.audience_type === 'selected') {
        count = selectedRecipients.length;
      }

      setEstimatedRecipients(count);
    } catch (error) {
      console.error('Error estimating audience:', error);
    }
  };

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('id, name, slug')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast({
        title: 'Error',
        description: 'Failed to load templates',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Campaign name is required',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.template_id) {
      toast({
        title: 'Validation Error',
        description: 'Please select a template',
        variant: 'destructive',
      });
      return;
    }

    if (estimatedRecipients === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please select at least one recipient',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();

      // Prepare audience filter
      let audienceFilter: any = { type: formData.audience_type };
      if (formData.audience_type === 'specific') {
        audienceFilter.emails = formData.specific_emails
          .split('\n')
          .map(e => e.trim())
          .filter(e => e.length > 0);
      } else if (formData.audience_type === 'selected') {
        audienceFilter.recipients = selectedRecipients.map(r => ({
          id: r.id,
          email: r.email,
          type: r.type,
        }));
      }

      // Determine status based on schedule
      const status = formData.schedule_type === 'now' ? 'draft' : 'scheduled';
      const scheduledAt = formData.schedule_type === 'later' ? formData.scheduled_at : null;

      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert({
          name: formData.name,
          description: formData.description || null,
          template_id: formData.template_id,
          subject_line: formData.subject_line || null,
          preview_text: formData.preview_text || null,
          from_name: formData.from_name || null,
          from_email: formData.from_email || null,
          reply_to: formData.reply_to || null,
          audience_filter: audienceFilter,
          status: status,
          scheduled_at: scheduledAt,
          created_by: user?.id,
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Create campaign recipients
      await createCampaignRecipients(campaign.id);

      toast({
        title: 'Success',
        description: 'Campaign created successfully',
      });

      onSuccess();
    } catch (error) {
      console.error('Error creating campaign:', error);
      toast({
        title: 'Error',
        description: 'Failed to create campaign',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const createCampaignRecipients = async (campaignId: string) => {
    try {
      let recipients: { email: string; user_id?: string; contact_id?: string }[] = [];

      if (formData.audience_type === 'all_users') {
        // Get all users
        const { data: users, error } = await supabase
          .from('user_profiles')
          .select('user_id, email:users(email)');

        if (error) throw error;
        recipients = users?.map((u: any) => ({
          email: u.email?.email || '',
          user_id: u.user_id,
        })).filter((r: any) => r.email) || [];
      } else if (formData.audience_type === 'all_contacts') {
        // Get all contacts
        const { data: contacts, error } = await supabase
          .from('contacts')
          .select('id, email');

        if (error) throw error;
        recipients = contacts?.map(c => ({
          email: c.email,
          contact_id: c.id,
        })) || [];
      } else if (formData.audience_type === 'both') {
        // Get both users and contacts
        const [usersResult, contactsResult] = await Promise.all([
          supabase.from('user_profiles').select('user_id, email:users(email)'),
          supabase.from('contacts').select('id, email'),
        ]);

        if (usersResult.error) throw usersResult.error;
        if (contactsResult.error) throw contactsResult.error;

        const userRecipients = usersResult.data?.map((u: any) => ({
          email: u.email?.email || '',
          user_id: u.user_id,
        })).filter((r: any) => r.email) || [];

        const contactRecipients = contactsResult.data?.map(c => ({
          email: c.email,
          contact_id: c.id,
        })) || [];

        recipients = [...userRecipients, ...contactRecipients];
      } else if (formData.audience_type === 'selected') {
        // Use selected recipients
        recipients = selectedRecipients.map(r => ({
          email: r.email,
          user_id: r.type === 'user' ? r.id : undefined,
          contact_id: r.type === 'contact' ? r.id : undefined,
        }));
      } else if (formData.audience_type === 'specific') {
        // Parse specific emails
        const emails = formData.specific_emails
          .split('\n')
          .map(e => e.trim())
          .filter(e => e.length > 0);

        recipients = emails.map(email => ({ email }));
      }

      // Insert recipients
      const recipientRecords = recipients.map(r => ({
        campaign_id: campaignId,
        email: r.email,
        user_id: r.user_id || null,
        contact_id: r.contact_id || null,
        status: 'pending',
      }));

      const { error } = await supabase
        .from('campaign_recipients')
        .insert(recipientRecords);

      if (error) throw error;
    } catch (error) {
      console.error('Error creating recipients:', error);
      throw error;
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Create New Campaign</span>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="audience">
                <Users className="h-4 w-4 mr-2" />
                Audience ({estimatedRecipients})
              </TabsTrigger>
              <TabsTrigger value="schedule">
                <Calendar className="h-4 w-4 mr-2" />
                Schedule
              </TabsTrigger>
            </TabsList>

            {/* Details Tab */}
            <TabsContent value="details" className="space-y-4">
          {/* Campaign Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Campaign Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Summer Sale 2025"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this campaign"
              rows={3}
            />
          </div>

          {/* Template Selection */}
          <div className="space-y-2">
            <Label htmlFor="template">Email Template *</Label>
            <select
              id="template"
              className="w-full px-3 py-2 border rounded-md"
              value={formData.template_id}
              onChange={(e) => setFormData({ ...formData, template_id: e.target.value })}
              required
            >
              <option value="">Select a template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>

          {/* Subject Line */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject Line</Label>
            <Input
              id="subject"
              value={formData.subject_line}
              onChange={(e) => setFormData({ ...formData, subject_line: e.target.value })}
              placeholder="Email subject line"
            />
          </div>

          {/* Preview Text */}
          <div className="space-y-2">
            <Label htmlFor="preview">Preview Text</Label>
            <Input
              id="preview"
              value={formData.preview_text}
              onChange={(e) => setFormData({ ...formData, preview_text: e.target.value })}
              placeholder="Preview text shown in inbox"
            />
          </div>

          {/* From Name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from_name">From Name</Label>
              <Input
                id="from_name"
                value={formData.from_name}
                onChange={(e) => setFormData({ ...formData, from_name: e.target.value })}
                placeholder="Material Kai"
              />
            </div>

            {/* From Email */}
            <div className="space-y-2">
              <Label htmlFor="from_email">From Email</Label>
              <Input
                id="from_email"
                type="email"
                value={formData.from_email}
                onChange={(e) => setFormData({ ...formData, from_email: e.target.value })}
                placeholder="noreply@example.com"
              />
            </div>
          </div>

          {/* Reply To */}
          <div className="space-y-2">
            <Label htmlFor="reply_to">Reply To</Label>
            <Input
              id="reply_to"
              type="email"
              value={formData.reply_to}
              onChange={(e) => setFormData({ ...formData, reply_to: e.target.value })}
              placeholder="support@example.com"
            />
          </div>
        </TabsContent>

        {/* Audience Tab */}
        <TabsContent value="audience" className="space-y-4">
          <div className="space-y-4">
            <div className="p-4 rounded-lg border bg-muted/50">
              <p className="text-sm font-medium mb-2">Estimated Recipients: {estimatedRecipients}</p>
              <p className="text-xs text-muted-foreground">
                Select who will receive this campaign
              </p>
            </div>

            {/* Audience Type Selection */}
            <div className="space-y-2">
              <Label>Audience Type</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    name="audience_type"
                    value="all_users"
                    checked={formData.audience_type === 'all_users'}
                    onChange={(e) => setFormData({ ...formData, audience_type: e.target.value })}
                  />
                  <div>
                    <p className="font-medium">All Users</p>
                    <p className="text-xs text-muted-foreground">Send to all registered users</p>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    name="audience_type"
                    value="all_contacts"
                    checked={formData.audience_type === 'all_contacts'}
                    onChange={(e) => setFormData({ ...formData, audience_type: e.target.value })}
                  />
                  <div>
                    <p className="font-medium">All Contacts</p>
                    <p className="text-xs text-muted-foreground">Send to all email contacts</p>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    name="audience_type"
                    value="both"
                    checked={formData.audience_type === 'both'}
                    onChange={(e) => setFormData({ ...formData, audience_type: e.target.value })}
                  />
                  <div>
                    <p className="font-medium">Users + Contacts</p>
                    <p className="text-xs text-muted-foreground">Send to both users and contacts</p>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    name="audience_type"
                    value="selected"
                    checked={formData.audience_type === 'selected'}
                    onChange={(e) => setFormData({ ...formData, audience_type: e.target.value })}
                  />
                  <div>
                    <p className="font-medium">Select Recipients</p>
                    <p className="text-xs text-muted-foreground">Search and select specific users/contacts</p>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    name="audience_type"
                    value="specific"
                    checked={formData.audience_type === 'specific'}
                    onChange={(e) => setFormData({ ...formData, audience_type: e.target.value })}
                  />
                  <div>
                    <p className="font-medium">Specific Emails</p>
                    <p className="text-xs text-muted-foreground">Enter email addresses manually</p>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 opacity-50">
                  <input
                    type="radio"
                    name="audience_type"
                    value="filtered"
                    disabled
                  />
                  <div>
                    <p className="font-medium">Filtered Audience (Coming Soon)</p>
                    <p className="text-xs text-muted-foreground">Filter by role, subscription, tags, etc.</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Recipient Selector */}
            {formData.audience_type === 'selected' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Search Recipients</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* Selected Recipients */}
                {selectedRecipients.length > 0 && (
                  <div className="space-y-2">
                    <Label>Selected ({selectedRecipients.length})</Label>
                    <div className="flex flex-wrap gap-2 p-3 border rounded-lg max-h-32 overflow-y-auto">
                      {selectedRecipients.map((recipient) => (
                        <Badge
                          key={recipient.id}
                          variant="secondary"
                          className="flex items-center gap-1"
                        >
                          {recipient.type === 'user' ? <Users className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                          {recipient.email}
                          <X
                            className="h-3 w-3 cursor-pointer hover:text-destructive"
                            onClick={() => setSelectedRecipients(selectedRecipients.filter(r => r.id !== recipient.id))}
                          />
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Available Recipients */}
                <div className="space-y-2">
                  <Label>Available Recipients</Label>
                  <div className="border rounded-lg max-h-64 overflow-y-auto">
                    {loadingRecipients ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Loading...
                      </div>
                    ) : availableRecipients.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No recipients found. Try a different search.
                      </div>
                    ) : (
                      <div className="divide-y">
                        {availableRecipients
                          .filter(r => !selectedRecipients.find(sr => sr.id === r.id))
                          .map((recipient) => (
                            <div
                              key={recipient.id}
                              className="p-3 hover:bg-muted/50 cursor-pointer flex items-center justify-between"
                              onClick={() => setSelectedRecipients([...selectedRecipients, recipient])}
                            >
                              <div className="flex items-center gap-2">
                                {recipient.type === 'user' ? (
                                  <Users className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Mail className="h-4 w-4 text-muted-foreground" />
                                )}
                                <div>
                                  <p className="text-sm font-medium">{recipient.email}</p>
                                  {recipient.name && (
                                    <p className="text-xs text-muted-foreground">{recipient.name}</p>
                                  )}
                                </div>
                              </div>
                              <UserPlus className="h-4 w-4 text-muted-foreground" />
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Specific Emails Input */}
            {formData.audience_type === 'specific' && (
              <div className="space-y-2">
                <Label htmlFor="specific_emails">Email Addresses (one per line)</Label>
                <Textarea
                  id="specific_emails"
                  value={formData.specific_emails}
                  onChange={(e) => setFormData({ ...formData, specific_emails: e.target.value })}
                  placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
                  rows={8}
                />
                <p className="text-xs text-muted-foreground">
                  Enter one email address per line
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Schedule Tab */}
        <TabsContent value="schedule" className="space-y-4">
          <div className="space-y-4">
            {/* Schedule Type Selection */}
            <div className="space-y-2">
              <Label>When to Send</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    name="schedule_type"
                    value="now"
                    checked={formData.schedule_type === 'now'}
                    onChange={(e) => setFormData({ ...formData, schedule_type: e.target.value })}
                  />
                  <div>
                    <p className="font-medium">Save as Draft</p>
                    <p className="text-xs text-muted-foreground">Create campaign and send manually later</p>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    name="schedule_type"
                    value="later"
                    checked={formData.schedule_type === 'later'}
                    onChange={(e) => setFormData({ ...formData, schedule_type: e.target.value })}
                  />
                  <div>
                    <p className="font-medium">Schedule for Later</p>
                    <p className="text-xs text-muted-foreground">Set a specific date and time</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Schedule Date/Time Input */}
            {formData.schedule_type === 'later' && (
              <div className="space-y-2">
                <Label htmlFor="scheduled_at">Schedule Date & Time</Label>
                <Input
                  id="scheduled_at"
                  type="datetime-local"
                  value={formData.scheduled_at}
                  onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
                  min={new Date().toISOString().slice(0, 16)}
                />
                <p className="text-xs text-muted-foreground">
                  Campaign will be sent automatically at the scheduled time
                </p>
              </div>
            )}

            {/* Send Rate Info */}
            <div className="p-4 rounded-lg border bg-muted/50">
              <h4 className="font-medium mb-2">Sending Information</h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>• Emails will be sent at a rate of ~500 per hour</p>
                <p>• Estimated time: {Math.ceil(estimatedRecipients / 500)} hour(s)</p>
                <p>• You can pause or cancel the campaign at any time</p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Campaign'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateCampaignModal;


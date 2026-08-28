/**
 * Create Campaign Modal
 * Form to create a new email campaign.
 *
 * The audience radio is a WRITER for the one canonical audience shape (`CampaignAudience`); the
 * resolve and the recipient insert both happen in SQL. This page used to store its own
 * `{ type, emails, recipients }` variant in the same jsonb column and materialize recipients with a
 * private copy of the logic — so a campaign created here resolved to zero recipients everywhere
 * else, its "estimate" counted rows the send would not use, an address held by both a user and a
 * contact was emailed twice, and no recipient ever got merge vars.
 */

import React, { useState, useEffect } from 'react';
import { X, Users, Calendar, Search, UserPlus, Mail } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Badge } from '@/components/core/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { marketingService, type CampaignAudience } from '@/modules/email-marketing/services/marketingService';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from '@/components/core/ui/radio-group';

import { onEnterOrSpace } from '@/utils/a11y';

/** The two radio lists, as data — six near-identical option blocks were copied out by hand,
 *  which is how one of them ended up with no handler at all (the disabled "filtered" row). */
const AUDIENCE_OPTIONS: Array<{ value: string; title: string; hint: string; disabled?: boolean }> = [
  { value: 'all_users', title: 'All users', hint: 'Send to all registered users' },
  { value: 'all_contacts', title: 'All contacts', hint: 'Send to all email contacts' },
  { value: 'both', title: 'Users + contacts', hint: 'Send to both users and contacts' },
  { value: 'selected', title: 'Select recipients', hint: 'Search and select specific users/contacts' },
  { value: 'specific', title: 'Specific emails', hint: 'Enter email addresses manually' },
  { value: 'filtered', title: 'Filtered audience (coming soon)', hint: 'Filter by role, subscription, tags, etc.', disabled: true },
];

const SCHEDULE_OPTIONS: Array<{ value: string; title: string; hint: string }> = [
  { value: 'now', title: 'Save as draft', hint: 'Create campaign and send manually later' },
  { value: 'later', title: 'Schedule for later', hint: 'Set a specific date and time' },
];

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
  const { activeWorkspaceId } = useWorkspace();

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

      // Load contacts.
      // `contacts` does not exist — it is `crm_contacts`. PostgREST rejected every call and the
      // error was thrown, so the whole recipient picker failed rather than half-loading; the
      // users half above never rendered either. (audit #270)
      const { data: contacts, error: contactsError } = await supabase
        .from('crm_contacts')
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

  /** The audience radio, expressed as the one canonical shape the resolver reads. */
  const buildAudience = (): CampaignAudience => {
    const t = formData.audience_type;
    return {
      category_ids: [],
      manual_emails: t === 'specific'
        ? formData.specific_emails.split('\n').map(e => e.trim()).filter(Boolean)
        : [],
      contact_ids: t === 'selected'
        ? selectedRecipients.filter(r => r.type === 'contact').map(r => r.id)
        : [],
      member_user_ids: t === 'selected'
        ? selectedRecipients.filter(r => r.type === 'user').map(r => r.id)
        : [],
      include_all_contacts: t === 'all_contacts' || t === 'both',
      include_all_members: t === 'all_users' || t === 'both',
    };
  };

  /** Estimate = the real resolve. Counting the source tables by hand is how the estimate came to
   *  disagree with the send: it double-counted an address held by both a user and a contact, never
   *  dropped unsubscribes, and counted every tenant's users rather than this workspace's. */
  const estimateAudience = async () => {
    if (!activeWorkspaceId) { setEstimatedRecipients(0); return; }
    try {
      const rows = await marketingService.resolveAudience(activeWorkspaceId, buildAudience());
      setEstimatedRecipients(rows.length);
    } catch (error) {
      console.error('Error estimating audience:', error);
      setEstimatedRecipients(0);
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

  /**
   * Synchronous in-flight latch (#357 AE-17).
   *
   * `loading` is React state, so it cannot stop a submit that is already queued — a double-click
   * or a double Enter fires the handler twice before the first `setLoading(true)` has rendered,
   * and `disabled={loading}` on the button is the same state one render behind. A campaign
   * created twice is two campaigns to the SAME audience, and `campaign-processor` will
   * cheerfully send both: they are distinct rows, so the per-recipient claim added in AE-4
   * cannot absorb them — exactly the distinction #355 WH-3 records about duplicate POs.
   *
   * A ref is set and read in the same synchronous turn. State is not.
   */
  const submitting = React.useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;

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

    // Latched after validation and before the first await: latching earlier would strand the
    // form on a validation bounce, later would let the queued submit past.
    submitting.current = true;
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();

      // Determine status based on schedule
      const status = formData.schedule_type === 'now' ? 'draft' : 'scheduled';
      const scheduledAt = formData.schedule_type === 'later' ? formData.scheduled_at : null;

      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert({
          workspace_id: activeWorkspaceId,
          name: formData.name,
          description: formData.description || null,
          template_id: formData.template_id,
          subject_line: formData.subject_line || null,
          preview_text: formData.preview_text || null,
          from_name: formData.from_name || null,
          from_email: formData.from_email || null,
          reply_to: formData.reply_to || null,
          audience_filter: buildAudience() as unknown as never,
          status: status,
          scheduled_at: scheduledAt,
          created_by: user?.id,
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Materialize through the shared derivation — the same rows the estimate showed.
      await marketingService.ensureRecipients(campaign.id);

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
      submitting.current = false;
      setLoading(false);
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
            <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
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
            <Select value={formData.template_id || undefined} onValueChange={(v) => setFormData({ ...formData, template_id: v })}>
              <SelectTrigger id="template"><SelectValue placeholder="Select a template" /></SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                placeholder="Materials Hub"
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
              <Label>Audience type</Label>
              <RadioGroup
                value={formData.audience_type}
                onValueChange={(v) => setFormData({ ...formData, audience_type: v })}
              >
                {AUDIENCE_OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    htmlFor={`audience-${o.value}`}
                    className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50${o.disabled ? ' opacity-50' : ''}`}
                  >
                    <RadioGroupItem id={`audience-${o.value}`} value={o.value} disabled={o.disabled} />
                    <div>
                      <p className="font-medium">{o.title}</p>
                      <p className="text-xs text-muted-foreground">{o.hint}</p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
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
                              role="button"
                              tabIndex={0}
                              onKeyDown={onEnterOrSpace(() => setSelectedRecipients([...selectedRecipients, recipient]))}
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
              <Label>When to send</Label>
              <RadioGroup
                value={formData.schedule_type}
                onValueChange={(v) => setFormData({ ...formData, schedule_type: v })}
              >
                {SCHEDULE_OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    htmlFor={`schedule-${o.value}`}
                    className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
                  >
                    <RadioGroupItem id={`schedule-${o.value}`} value={o.value} />
                    <div>
                      <p className="font-medium">{o.title}</p>
                      <p className="text-xs text-muted-foreground">{o.hint}</p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
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


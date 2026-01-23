/**
 * Messaging Templates Tab
 * Create and manage SMS and WhatsApp message templates via Twilio
 */

import React, { useState, useEffect } from 'react';
import { Plus, FileText, Phone, MessageCircle, Edit2, Trash2, Copy, Eye } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { messagingService, MessagingTemplate, MessagingChannelType } from '@/services/messaging';

const channelIcons: Record<MessagingChannelType, React.ReactNode> = {
  sms: <Phone className="h-4 w-4" />,
  whatsapp: <MessageCircle className="h-4 w-4 text-green-500" />,
};

const categoryColors: Record<string, string> = {
  marketing: 'bg-blue-500',
  transactional: 'bg-green-500',
  otp: 'bg-orange-500',
  notification: 'bg-purple-500',
};

export const MessagingTemplatesTab: React.FC = () => {
  const [templates, setTemplates] = useState<MessagingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessagingTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<MessagingTemplate | null>(null);
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const { toast } = useToast();

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await messagingService.getTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast({
        title: 'Error',
        description: 'Failed to load messaging templates',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      await messagingService.deleteTemplate(id);
      toast({
        title: 'Success',
        description: 'Template deleted successfully',
      });
      loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete template',
        variant: 'destructive',
      });
    }
  };

  const handleDuplicateTemplate = async (template: MessagingTemplate) => {
    try {
      await messagingService.createTemplate({
        ...template,
        name: `${template.name} (Copy)`,
        slug: `${template.slug}-copy-${Date.now()}`,
        is_approved: false,
        approval_status: template.channel_type === 'whatsapp' ? 'pending' : 'not_required',
      });
      toast({
        title: 'Success',
        description: 'Template duplicated successfully',
      });
      loadTemplates();
    } catch (error) {
      console.error('Error duplicating template:', error);
      toast({
        title: 'Error',
        description: 'Failed to duplicate template',
        variant: 'destructive',
      });
    }
  };

  const filteredTemplates = filterChannel === 'all'
    ? templates
    : templates.filter(t => t.channel_type === filterChannel);

  if (loading) {
    return (
      <div className="dashboard-card">
        <div className="py-8 text-center text-muted-foreground">
          Loading templates...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="dashboard-card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Message Templates</h3>
            <p className="text-sm text-muted-foreground">
              Create reusable templates for SMS and WhatsApp
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={filterChannel} onValueChange={setFilterChannel}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </div>
        </div>
      </div>

      {/* Templates List */}
      {filteredTemplates.length === 0 ? (
        <div className="dashboard-card">
          <div className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No templates found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first message template to get started
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </div>
        </div>
      ) : (
        <div className="dashboard-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Template</th>
                  <th className="text-left py-3 px-4 font-medium">Channel</th>
                  <th className="text-left py-3 px-4 font-medium">Category</th>
                  <th className="text-left py-3 px-4 font-medium">Variables</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-right py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTemplates.map((template) => (
                  <tr key={template.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 px-4">
                      <div className="font-medium">{template.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{template.slug}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {channelIcons[template.channel_type]}
                        <span className="capitalize">{template.channel_type}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={categoryColors[template.category]}>
                        {template.category}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {template.variables.slice(0, 3).map((v) => (
                          <Badge key={v} variant="outline" className="text-xs">
                            {`{{${v}}}`}
                          </Badge>
                        ))}
                        {template.variables.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{template.variables.length - 3}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {template.channel_type === 'whatsapp' ? (
                        <Badge
                          variant={template.is_approved ? 'default' : 'secondary'}
                          className={template.is_approved ? 'bg-green-500' : ''}
                        >
                          {template.approval_status}
                        </Badge>
                      ) : (
                        <Badge variant={template.is_active ? 'default' : 'secondary'}>
                          {template.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewTemplate(template)}
                          title="Preview"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDuplicateTemplate(template)}
                          title="Duplicate"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingTemplate(template)}
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTemplate(template.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || editingTemplate) && (
        <TemplateModal
          template={editingTemplate}
          onClose={() => {
            setShowCreateModal(false);
            setEditingTemplate(null);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            setEditingTemplate(null);
            loadTemplates();
          }}
        />
      )}

      {/* Preview Modal */}
      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
        />
      )}
    </div>
  );
};

// Template Modal Component
interface TemplateModalProps {
  template: MessagingTemplate | null;
  onClose: () => void;
  onSuccess: () => void;
}

const TemplateModal: React.FC<TemplateModalProps> = ({ template, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: template?.name || '',
    slug: template?.slug || '',
    description: template?.description || '',
    channel_type: template?.channel_type || 'sms' as MessagingChannelType,
    content: template?.content || '',
    category: template?.category || 'marketing',
    media_url: template?.media_url || '',
    whatsapp_template_name: template?.whatsapp_template_name || '',
    whatsapp_language_code: template?.whatsapp_language_code || 'en',
    is_active: template?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Extract variables from content
  const variables = (formData.content.match(/{{(\w+)}}/g) || []).map(v => v.replace(/[{}]/g, ''));

  // Calculate SMS segments
  const smsSegments = formData.channel_type === 'sms'
    ? messagingService.calculateSmsSegments(formData.content)
    : null;

  const handleContentChange = (content: string) => {
    setFormData({ ...formData, content });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.content) {
      toast({
        title: 'Error',
        description: 'Name and content are required',
        variant: 'destructive',
      });
      return;
    }

    // Generate slug if empty
    const slug = formData.slug || formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    try {
      setSaving(true);

      const templateData = {
        ...formData,
        slug,
        variables,
        buttons: [],
        is_approved: formData.channel_type !== 'whatsapp',
        approval_status: formData.channel_type === 'whatsapp' ? 'pending' as const : 'not_required' as const,
      };

      if (template) {
        await messagingService.updateTemplate(template.id, templateData);
        toast({
          title: 'Success',
          description: 'Template updated successfully',
        });
      } else {
        await messagingService.createTemplate(templateData);
        toast({
          title: 'Success',
          description: 'Template created successfully',
        });
      }

      onSuccess();
    } catch (error) {
      console.error('Error saving template:', error);
      toast({
        title: 'Error',
        description: 'Failed to save template',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {template ? 'Edit Template' : 'Create Message Template'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Welcome Message"
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="welcome-message"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Channel Type</Label>
              <Select
                value={formData.channel_type}
                onValueChange={(value) => setFormData({ ...formData, channel_type: value as MessagingChannelType })}
                disabled={!!template}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="transactional">Transactional</SelectItem>
                  <SelectItem value="otp">OTP</SelectItem>
                  <SelectItem value="notification">Notification</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description (Optional)</Label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the template"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Message Content</Label>
              {smsSegments && (
                <span className="text-xs text-muted-foreground">
                  {formData.content.length} chars | {smsSegments.segments} segment(s) | {smsSegments.encoding.toUpperCase()}
                </span>
              )}
            </div>
            <Textarea
              value={formData.content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Hello {{name}}, your order #{{order_id}} has been shipped!"
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              Use {'{{variable}}'} for dynamic content. Detected variables: {variables.join(', ') || 'none'}
            </p>
          </div>

          {formData.channel_type === 'whatsapp' && (
            <div className="space-y-2">
              <Label>Media URL (Optional)</Label>
              <Input
                value={formData.media_url}
                onChange={(e) => setFormData({ ...formData, media_url: e.target.value })}
                placeholder="https://example.com/image.jpg"
              />
            </div>
          )}

          {formData.channel_type === 'whatsapp' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>WhatsApp Template Name</Label>
                <Input
                  value={formData.whatsapp_template_name}
                  onChange={(e) => setFormData({ ...formData, whatsapp_template_name: e.target.value })}
                  placeholder="approved_template_name"
                />
                <p className="text-xs text-muted-foreground">
                  Pre-approved template name from Meta Business
                </p>
              </div>
              <div className="space-y-2">
                <Label>Language Code</Label>
                <Input
                  value={formData.whatsapp_language_code}
                  onChange={(e) => setFormData({ ...formData, whatsapp_language_code: e.target.value })}
                  placeholder="en"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
            <Label>Active</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : template ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// Template Preview Modal
interface TemplatePreviewModalProps {
  template: MessagingTemplate;
  onClose: () => void;
}

const TemplatePreviewModal: React.FC<TemplatePreviewModalProps> = ({ template, onClose }) => {
  const [variables, setVariables] = useState<Record<string, string>>({});

  // Initialize variables with sample values
  useEffect(() => {
    const initial: Record<string, string> = {};
    template.variables.forEach(v => {
      initial[v] = `[${v}]`;
    });
    setVariables(initial);
  }, [template]);

  const renderedContent = messagingService.renderTemplate(template.content, variables);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Template Preview</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {channelIcons[template.channel_type]}
            <span className="font-medium">{template.name}</span>
            <Badge className={categoryColors[template.category]}>{template.category}</Badge>
          </div>

          {template.variables.length > 0 && (
            <div className="space-y-2">
              <Label>Variables</Label>
              <div className="grid grid-cols-2 gap-2">
                {template.variables.map(v => (
                  <div key={v}>
                    <Label className="text-xs text-muted-foreground">{`{{${v}}}`}</Label>
                    <Input
                      size={1}
                      value={variables[v] || ''}
                      onChange={(e) => setVariables({ ...variables, [v]: e.target.value })}
                      placeholder={v}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Preview</Label>
            <div className="bg-muted p-4 rounded-lg">
              <p className="whitespace-pre-wrap">{renderedContent}</p>
            </div>
          </div>

          {template.media_url && (
            <div className="space-y-2">
              <Label>Media</Label>
              <img
                src={template.media_url}
                alt="Media preview"
                className="max-h-48 rounded-lg object-contain"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MessagingTemplatesTab;

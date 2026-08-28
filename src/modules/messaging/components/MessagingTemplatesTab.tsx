/**
 * Messaging Templates Tab
 * Create and manage WhatsApp message templates (Zernio / Meta Cloud API).
 */

import React, { useState, useEffect } from 'react';
import { Plus, FileText, MessageCircle, Edit2, Trash2, Copy, Eye } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { Switch } from '@/components/core/ui/switch';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { useToast } from '@/hooks/use-toast';
import { statusTone } from '@/utils/statusTone';
import { messagingService, MessagingTemplate } from '../services';
import type { MessageType } from '../services/types';
import { useWorkspace } from '@/contexts/WorkspaceContext';

const WhatsAppIcon = <MessageCircle className="h-4 w-4 text-green-500" />;

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
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();

  // A template belongs to ONE business (#359 CM-4) — switching workspace must not leave the
  // previous tenant's copy on screen.
  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await messagingService.getTemplates(activeWorkspaceId ?? '');
      setTemplates(data);
      // Deleting a template can shrink the list — don't strand the user on a now-empty page.
      setPage((p) => clampPage(p, data.length));
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
      // A COPY is not approved, whatever the original was: Meta approved that name, not this one.
      // `is_approved` is derived from `approval_status` in SQL now, so it is not set by hand.
      const { id: _id, created_at: _c, updated_at: _u, is_approved: _a, ...base } = template as MessagingTemplate & {
        created_at?: string; updated_at?: string;
      };
      await messagingService.createTemplate(activeWorkspaceId ?? '', {
        ...base,
        name: `${template.name} (Copy)`,
        slug: `${template.slug}-copy-${Date.now()}`,
        approval_status: 'pending',
      } as never);
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

  const filteredTemplates = templates;

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
      <SectionHeader
        title="Message Templates"
        subtitle="Create reusable WhatsApp templates (must map to a Meta-approved template)"
        actions={
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create template
          </Button>
        }
      />

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
              Create template
            </Button>
          </div>
        </div>
      ) : (
        <div className="dashboard-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                <tr>
                  <th className="text-left py-3 px-4 font-medium">Template</th>
                  <th className="text-left py-3 px-4 font-medium">Channel</th>
                  <th className="text-left py-3 px-4 font-medium">Category</th>
                  <th className="text-left py-3 px-4 font-medium">Variables</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-right py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginate(filteredTemplates, page).map((template) => (
                  <tr key={template.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 px-4">
                      <div className="font-medium">{template.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{template.slug}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {WhatsAppIcon}
                        <span className="capitalize">{template.channel_type}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm capitalize text-muted-foreground">
                        {template.category}
                      </span>
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
                      <span className={`text-sm capitalize ${statusTone(template.approval_status)}`}>
                        {template.approval_status}
                      </span>
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
          <TablePagination
            page={page}
            total={filteredTemplates.length}
            onPageChange={setPage}
            label="templates"
          />
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || editingTemplate) && (
        <TemplateModal
          workspaceId={activeWorkspaceId ?? ''}
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
  /** The business this template belongs to (#359 CM-4). */
  workspaceId: string;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Our category vocabulary → Meta's. AUTHENTICATION is deliberately unreachable from here:
 * Meta only accepts it for one-time-passcode templates with a fixed, non-editable body, so
 * offering it on a freeform editor would produce a rejection nobody could act on.
 */
const META_CATEGORY: Record<string, 'UTILITY' | 'MARKETING'> = {
  transactional: 'UTILITY',
  notification: 'UTILITY',
  otp: 'UTILITY',
  marketing: 'MARKETING',
};

/**
 * Rewrite `{{name}}` placeholders into Meta's positional `{{1}}`, `{{2}}` in ORDER OF
 * APPEARANCE — the same order `variables` is derived in, and the same order the edge's
 * orderedTemplateParams() emits values in. Keeping all three keyed on appearance is what
 * makes the substitution correct without a shared schema: get it wrong and every message
 * renders with its values swapped, which is a valid string, so nothing raises.
 */
function toMetaBody(content: string): string {
  let n = 0;
  return content.replace(/\{\{(\w+)\}\}/g, () => `{{${++n}}}`);
}

const TemplateModal: React.FC<TemplateModalProps> = ({ template, workspaceId, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: template?.name || '',
    slug: template?.slug || '',
    description: template?.description || '',
    channel_type: 'whatsapp' as const,
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
  const [submittingToMeta, setSubmittingToMeta] = useState(false);

  /**
   * Submit this template to Meta and bind the approved name back onto the row.
   *
   * Before this, the field below asked for a name that could only exist if you left the app,
   * built the template in WhatsApp Manager, waited up to 24h and came back to type it in —
   * the same dead end the connect flow had. A template with no bound name cannot be used for
   * a cold send at all, so an unsubmitted template is a template that silently never sends.
   */
  const handleSubmitToMeta = async () => {
    const metaCategory = META_CATEGORY[formData.category] ?? 'UTILITY';
    // Meta's own constraint: lowercase, letters/numbers/underscore, must start with a letter.
    const metaName = (formData.whatsapp_template_name || formData.name)
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^[^a-z]+/, '').slice(0, 60);

    if (!metaName) {
      toast({ title: 'Name it first', description: 'Meta template names must start with a letter.', variant: 'destructive' });
      return;
    }
    if (!formData.content.trim()) {
      toast({ title: 'Add the message body first', variant: 'destructive' });
      return;
    }

    try {
      setSubmittingToMeta(true);
      const { template: created } = await messagingService.createWhatsAppTemplate({
        name: metaName,
        category: metaCategory,
        language: formData.whatsapp_language_code || 'en',
        components: [{ type: 'BODY', text: toMetaBody(formData.content) }],
      });
      setFormData((prev) => ({ ...prev, whatsapp_template_name: metaName }));
      const status = String((created as { status?: string })?.status ?? 'PENDING').toUpperCase();
      toast({
        title: status === 'APPROVED' ? 'Approved by Meta' : 'Submitted to Meta',
        description: status === 'APPROVED'
          ? 'Usable immediately. Save the template to bind it.'
          : 'Review can take up to 24h. Save the template — the name is bound now, and the webhook updates the status when Meta decides.',
      });
    } catch (error: any) {
      toast({
        title: 'Meta rejected the submission',
        description: error?.message || String(error),
        variant: 'destructive',
      });
    } finally {
      setSubmittingToMeta(false);
    }
  };

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
        // `is_approved` is GENERATED from `approval_status` in SQL now (#359 CM-3) — two columns
        // holding one fact were free to disagree, and a send path reading the wrong one is a
        // message Meta rejects or, worse, accepts under the wrong category.
        approval_status: 'pending' as const,
      };

      if (template) {
        await messagingService.updateTemplate(template.id, templateData);
        toast({
          title: 'Success',
          description: 'Template updated successfully',
        });
      } else {
        await messagingService.createTemplate(workspaceId, templateData);
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

          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value as MessageType })}
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
              <span className="text-xs text-muted-foreground">{formData.content.length} chars</span>
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
                  {formData.whatsapp_template_name
                    ? 'Bound. Cold sends will use this template.'
                    : 'Required for a cold send — WhatsApp refuses an untemplated first message.'}
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

          {formData.channel_type === 'whatsapp' && (
            <div className="rounded-lg border border-border/60 p-3 flex items-start gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium">Submit to Meta</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Creates the template on your WhatsApp Business Account and binds the name here,
                  so you don&apos;t have to build it in WhatsApp Manager and come back. Review can
                  take up to 24h; the status updates itself when Meta decides.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleSubmitToMeta}
                disabled={submittingToMeta || !formData.content.trim()}
              >
                {submittingToMeta ? 'Submitting...' : 'Submit'}
              </Button>
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
            {WhatsAppIcon}
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

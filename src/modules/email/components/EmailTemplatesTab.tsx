/**
 * Email Templates Tab
 * Manage email templates
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Eye, Trash2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import CreateTemplateModal from './CreateTemplateModal';

interface EmailTemplate {
  id: string;
  name: string;
  slug: string;
  description?: string;
  category: string;
  is_active: boolean;
  variables: string[];
  html_template?: string;
  created_at: string;
}

export const EmailTemplatesTab: React.FC = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast({
        title: 'Error',
        description: 'Failed to load email templates',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (template: EmailTemplate) => {
    if (!confirm(`Delete "${template.name}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('email_templates').delete().eq('id', template.id);
      if (error) throw error;
      toast({ title: 'Deleted', description: `"${template.name}" has been deleted.` });
      loadTemplates();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete template', variant: 'destructive' });
    }
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, 'default' | 'secondary' | 'outline'> = {
      transactional: 'default',
      marketing: 'secondary',
      notification: 'outline',
    };
    return <Badge variant={colors[category] || 'outline'}>{category}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Email Templates</h3>
          <p className="text-sm text-muted-foreground">
            Manage reusable email templates built with React Email
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Template
        </Button>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="dashboard-card">
            <div className="py-8 text-center text-muted-foreground">
              Loading templates...
            </div>
          </div>
        ) : templates.length === 0 ? (
          <div className="dashboard-card">
            <div className="py-8 text-center text-muted-foreground">
              No templates found. Create your first template to get started.
            </div>
          </div>
        ) : (
          templates.map((template) => (
            <div key={template.id} className="dashboard-card">
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-lg font-semibold">{template.name}</h4>
                      {!template.is_active && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{template.description || 'No description'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getCategoryBadge(template.category)}
                  </div>
                </div>
              </div>
              <div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Slug:</span>
                    <code className="rounded bg-muted px-2 py-1">{template.slug}</code>
                  </div>

                  {template.variables && template.variables.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-sm text-muted-foreground">Variables:</span>
                      <div className="flex flex-wrap gap-2">
                        {template.variables.map((variable) => (
                          <Badge key={variable} variant="outline">
                            {`{{${variable}}}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setPreviewTemplate(template)}>
                      <Eye className="mr-2 h-4 w-4" />
                      Preview
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/admin/email-templates/${template.id}/edit`)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(template)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Template Modal */}
      {showCreateModal && (
        <CreateTemplateModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadTemplates();
          }}
        />
      )}

      {/* HTML Preview Dialog */}
      {previewTemplate && (
        <Dialog open onOpenChange={() => setPreviewTemplate(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>{previewTemplate.name} — Preview</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden rounded border bg-white">
              {previewTemplate.html_template ? (
                <iframe
                  srcDoc={previewTemplate.html_template}
                  className="w-full h-[600px]"
                  sandbox="allow-same-origin"
                  title="Email preview"
                />
              ) : (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  No preview available — open the editor and save the template first.
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default EmailTemplatesTab;


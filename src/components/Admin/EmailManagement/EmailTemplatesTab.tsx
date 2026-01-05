/**
 * Email Templates Tab
 * Manage email templates
 */

import React, { useState, useEffect } from 'react';
import { Plus, Edit, Eye, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
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
  created_at: string;
}

export const EmailTemplatesTab: React.FC = () => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
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
                    <Button size="sm" variant="outline">
                      <Eye className="mr-2 h-4 w-4" />
                      Preview
                    </Button>
                    <Button size="sm" variant="outline">
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button size="sm" variant="outline">
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

      {/* Template Builder Info */}
      <div className="dashboard-card">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">About Email Templates</h3>
        </div>
        <div className="space-y-2 text-sm">
          <p>
            Email templates are stored in the database and can be edited by administrators.
            All templates use HTML with inline CSS for maximum email client compatibility.
          </p>
          <p className="text-muted-foreground">
            Templates support dynamic variables using the <code className="rounded bg-muted px-1">{'{{variable}}'}</code> syntax.
            Variables are replaced with actual values when sending emails.
          </p>
        </div>
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
    </div>
  );
};

export default EmailTemplatesTab;


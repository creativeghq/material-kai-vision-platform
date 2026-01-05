/**
 * Assign Template Modal
 * Assign or change the template for an email action
 */

import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface EmailAction {
  id: string;
  action_key: string;
  action_name: string;
  template_id?: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  slug: string;
  description?: string;
  category: string;
  is_active: boolean;
}

interface AssignTemplateModalProps {
  action: EmailAction;
  onClose: () => void;
  onSuccess: () => void;
}

export const AssignTemplateModal: React.FC<AssignTemplateModalProps> = ({
  action,
  onClose,
  onSuccess,
}) => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(action.template_id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('email_actions')
        .update({ template_id: selectedTemplateId || null })
        .eq('id', action.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Template assigned successfully',
      });

      onSuccess();
    } catch (error) {
      console.error('Error assigning template:', error);
      toast({
        title: 'Error',
        description: 'Failed to assign template',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Assign Template: {action.action_name}</span>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading templates...
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select a template to use for this email action. Only active templates are shown.
            </p>

            {/* Template List */}
            <div className="space-y-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedTemplateId === template.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => setSelectedTemplateId(template.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{template.name}</h4>
                        <Badge variant="outline" className="text-xs">
                          {template.category}
                        </Badge>
                      </div>
                      {template.description && (
                        <p className="text-sm text-muted-foreground">{template.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">Slug: {template.slug}</p>
                    </div>
                    {selectedTemplateId === template.id && (
                      <Check className="h-5 w-5 text-primary flex-shrink-0" />
                    )}
                  </div>
                </div>
              ))}

              {templates.length === 0 && (
                <div className="py-8 text-center text-muted-foreground">
                  No active templates available
                </div>
              )}
            </div>

            {/* Option to unassign */}
            {action.template_id && (
              <div
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  selectedTemplateId === undefined
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => setSelectedTemplateId(undefined)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">No Template</h4>
                    <p className="text-sm text-muted-foreground">Remove template assignment</p>
                  </div>
                  {selectedTemplateId === undefined && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AssignTemplateModal;


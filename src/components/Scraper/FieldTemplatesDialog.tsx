import React, { useState, useEffect } from 'react';
import { Save, Trash2, Download, Star, Globe, User } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface FieldMapping {
  name: string;
  label: string;
  type: 'text' | 'number' | 'array' | 'object' | 'boolean';
  description: string;
  required: boolean;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    enum?: string[];
  };
}

export interface FieldTemplate {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  fields: { fields: FieldMapping[] };
  is_global: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  usage_count: number;
}

interface FieldTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentFields: FieldMapping[];
  onApplyTemplate: (fields: FieldMapping[]) => void;
  workspaceId: string;
}

export const FieldTemplatesDialog: React.FC<FieldTemplatesDialogProps> = ({
  open,
  onOpenChange,
  currentFields,
  onApplyTemplate,
  workspaceId,
}) => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'browse' | 'save'>('browse');
  
  // Save template state
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadTemplates();
    }
  }, [open]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `https://v1api.materialshub.gr/scraping/field-templates?workspace_id=${workspaceId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load templates');

      const data = await response.json();
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast({
        title: 'Error',
        description: 'Failed to load field templates',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a template name',
        variant: 'destructive',
      });
      return;
    }

    if (currentFields.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Cannot save template with no fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(
        'https://v1api.materialshub.gr/scraping/field-templates',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({
            workspace_id: workspaceId,
            name: templateName,
            description: templateDescription || null,
            fields: { fields: currentFields },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save template');
      }

      toast({
        title: 'Success',
        description: 'Field template saved successfully',
      });

      setTemplateName('');
      setTemplateDescription('');
      setActiveTab('browse');
      loadTemplates();
    } catch (error: any) {
      console.error('Error saving template:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save template',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleApplyTemplate = async (template: FieldTemplate) => {
    try {
      // Increment usage count
      await fetch(
        `https://v1api.materialshub.gr/scraping/field-templates/${template.id}/use`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      onApplyTemplate(template.fields.fields);
      onOpenChange(false);

      toast({
        title: 'Template Applied',
        description: `Applied "${template.name}" template with ${template.fields.fields.length} fields`,
      });
    } catch (error) {
      console.error('Error applying template:', error);
      toast({
        title: 'Error',
        description: 'Failed to apply template',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteTemplate = async (templateId: string, templateName: string) => {
    if (!confirm(`Are you sure you want to delete "${templateName}"?`)) {
      return;
    }

    try {
      const response = await fetch(
        `https://v1api.materialshub.gr/scraping/field-templates/${templateId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to delete template');

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

  const globalTemplates = templates.filter((t) => t.is_global);
  const myTemplates = templates.filter((t) => !t.is_global);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Field Templates</DialogTitle>
          <DialogDescription>
            Save and reuse field configurations across scraping sessions
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="browse">Browse Templates</TabsTrigger>
            <TabsTrigger value="save">Save Current Fields</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-4">
            <ScrollArea className="h-[400px] pr-4">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading templates...
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Global Templates */}
                  {globalTemplates.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Globe className="h-4 w-4 text-blue-600" />
                        <h3 className="font-semibold text-sm">Global Templates</h3>
                      </div>
                      <div className="space-y-2">
                        {globalTemplates.map((template) => (
                          <TemplateCard
                            key={template.id}
                            template={template}
                            onApply={handleApplyTemplate}
                            onDelete={handleDeleteTemplate}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* My Templates */}
                  {myTemplates.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <User className="h-4 w-4 text-green-600" />
                        <h3 className="font-semibold text-sm">My Templates</h3>
                      </div>
                      <div className="space-y-2">
                        {myTemplates.map((template) => (
                          <TemplateCard
                            key={template.id}
                            template={template}
                            onApply={handleApplyTemplate}
                            onDelete={handleDeleteTemplate}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {templates.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No templates found. Create your first template!
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="save" className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="template-name">Template Name *</Label>
                <Input
                  id="template-name"
                  placeholder="e.g., Tile Products, Furniture Specs"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="template-description">Description</Label>
                <Textarea
                  id="template-description"
                  placeholder="Describe what this template is for..."
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Fields to Save</CardTitle>
                  <CardDescription>
                    {currentFields.length} field{currentFields.length !== 1 ? 's' : ''} will be saved in this template
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {currentFields.map((field, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                        <div>
                          <span className="font-medium text-sm">{field.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">({field.type})</span>
                        </div>
                        {field.required && (
                          <Badge variant="secondary" className="text-xs">Required</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveTemplate} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Template'}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

// Template Card Component
interface TemplateCardProps {
  template: FieldTemplate;
  onApply: (template: FieldTemplate) => void;
  onDelete: (id: string, name: string) => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, onApply, onDelete }) => {
  return (
    <Card className="hover:border-primary transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{template.name}</CardTitle>
              {template.is_global && (
                <Badge variant="secondary" className="text-xs">
                  <Globe className="h-3 w-3 mr-1" />
                  Global
                </Badge>
              )}
            </div>
            {template.description && (
              <CardDescription className="mt-1">{template.description}</CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{template.fields.fields.length} fields</span>
          <span>•</span>
          <span>Used {template.usage_count} times</span>
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={() => onApply(template)} className="flex-1">
            <Download className="h-3 w-3 mr-1" />
            Apply Template
          </Button>
          {!template.is_global && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDelete(template.id, template.name)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};


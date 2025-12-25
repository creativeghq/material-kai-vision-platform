/**
 * Create Template Modal
 * Modal for creating new email templates
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CreateTemplateModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateTemplateModal: React.FC<CreateTemplateModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    category: 'transactional',
    subject: '',
    html_content: '',
    text_content: '',
    variables: '',
  });
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Template name is required',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.slug.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Template slug is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();

      // Parse variables
      const variables = formData.variables
        .split(',')
        .map(v => v.trim())
        .filter(v => v.length > 0);

      const { error } = await supabase
        .from('email_templates')
        .insert({
          name: formData.name,
          slug: formData.slug,
          description: formData.description || null,
          category: formData.category,
          subject: formData.subject || null,
          html_content: formData.html_content || null,
          text_content: formData.text_content || null,
          variables: variables,
          is_active: true,
          created_by: user?.id,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Template created successfully',
      });

      onSuccess();
    } catch (error: any) {
      console.error('Error creating template:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create template',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Email Template</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Template Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Welcome Email"
              required
            />
          </div>

          {/* Slug */}
          <div className="space-y-2">
            <Label htmlFor="slug">Slug *</Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
              placeholder="welcome-email"
              required
            />
            <p className="text-xs text-muted-foreground">
              Unique identifier for this template (lowercase, hyphens only)
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this template"
              rows={2}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="transactional">Transactional</option>
              <option value="marketing">Marketing</option>
              <option value="notification">Notification</option>
            </select>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Default Subject Line</Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              placeholder="Welcome to {{company_name}}!"
            />
          </div>

          {/* HTML Content */}
          <div className="space-y-2">
            <Label htmlFor="html_content">HTML Content</Label>
            <Textarea
              id="html_content"
              value={formData.html_content}
              onChange={(e) => setFormData({ ...formData, html_content: e.target.value })}
              placeholder="<html>...</html>"
              rows={8}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Use &#123;&#123;variable_name&#125;&#125; for dynamic content
            </p>
          </div>

          {/* Text Content */}
          <div className="space-y-2">
            <Label htmlFor="text_content">Plain Text Content</Label>
            <Textarea
              id="text_content"
              value={formData.text_content}
              onChange={(e) => setFormData({ ...formData, text_content: e.target.value })}
              placeholder="Plain text version of the email"
              rows={6}
            />
          </div>

          {/* Variables */}
          <div className="space-y-2">
            <Label htmlFor="variables">Template Variables</Label>
            <Input
              id="variables"
              value={formData.variables}
              onChange={(e) => setFormData({ ...formData, variables: e.target.value })}
              placeholder="user_name, company_name, action_url"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of variables used in this template
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateTemplateModal;


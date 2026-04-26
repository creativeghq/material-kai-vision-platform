/**
 * Email Templates Tab
 * Manage email templates
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Eye, Trash2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import CreateTemplateModal from './CreateTemplateModal';

/**
 * Topic groups — derived from the template's slug prefix. Lets admins filter
 * the (otherwise flat) templates list by feature area without changing the DB
 * schema. Add a new entry here when a feature seeds its own templates.
 */
const TOPIC_GROUPS: Array<{ id: string; label: string; matchSlug: (slug: string) => boolean }> = [
  {
    id: 'price-monitoring',
    label: 'Price Monitoring',
    matchSlug: (s) => s.startsWith('price_alert.') || s.startsWith('api_broadcast.price_'),
  },
  {
    id: 'auth',
    label: 'Authentication',
    matchSlug: (s) => s.startsWith('auth.') || s.startsWith('account.'),
  },
  {
    id: 'quotes',
    label: 'Quotes',
    matchSlug: (s) => s.startsWith('quote.') || s.startsWith('quotes.'),
  },
];

const topicOf = (slug: string): string => {
  const hit = TOPIC_GROUPS.find((g) => g.matchSlug(slug));
  return hit?.id ?? 'other';
};

const topicLabelOf = (topicId: string): string =>
  TOPIC_GROUPS.find((g) => g.id === topicId)?.label ?? 'Other';

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

interface EmailDefaults {
  fromEmail: string;
  fromName: string;
}

export const EmailTemplatesTab: React.FC = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [emailDefaults, setEmailDefaults] = useState<EmailDefaults>({ fromEmail: '', fromName: '' });
  const { toast } = useToast();

  useEffect(() => {
    loadTemplates();
    loadEmailDefaults();
  }, []);

  /**
   * Pull the platform's default sender (configured in EmailSettingsModal).
   * Surfaced read-only on every template card so admins can see exactly who
   * the email will appear to be from before they enable it for sending.
   * Editing happens in the Email Settings dialog, not per-template.
   */
  const loadEmailDefaults = async () => {
    const { data } = await supabase
      .from('email_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['default_from_email', 'default_from_name']);
    if (!data) return;
    const next: EmailDefaults = { fromEmail: '', fromName: '' };
    for (const row of data) {
      if (row.setting_key === 'default_from_email') next.fromEmail = row.setting_value;
      if (row.setting_key === 'default_from_name') next.fromName = row.setting_value;
    }
    setEmailDefaults(next);
  };

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

  // Topics that actually have at least one template in the current list,
  // so the filter dropdown only offers groups that aren't empty.
  const availableTopics = useMemo(() => {
    const present = new Set<string>();
    for (const t of templates) present.add(topicOf(t.slug));
    return TOPIC_GROUPS.filter((g) => present.has(g.id))
      .map((g) => ({ id: g.id, label: g.label }));
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    if (topicFilter === 'all') return templates;
    return templates.filter((t) => topicOf(t.slug) === topicFilter);
  }, [templates, topicFilter]);

  // Group filtered templates by topic for the section headers.
  const groupedTemplates = useMemo(() => {
    const groups: Record<string, EmailTemplate[]> = {};
    for (const t of filteredTemplates) {
      const id = topicOf(t.slug);
      (groups[id] ||= []).push(t);
    }
    // Stable order: known topics first (in TOPIC_GROUPS order), then 'other'.
    const ordered: Array<{ id: string; label: string; items: EmailTemplate[] }> = [];
    for (const g of TOPIC_GROUPS) if (groups[g.id]?.length) ordered.push({ id: g.id, label: g.label, items: groups[g.id] });
    if (groups['other']?.length) ordered.push({ id: 'other', label: 'Other', items: groups['other'] });
    return ordered;
  }, [filteredTemplates]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Email Templates</h3>
          <p className="text-sm text-muted-foreground">
            Manage reusable email templates built with React Email
          </p>
          {(emailDefaults.fromEmail || emailDefaults.fromName) && (
            <p className="text-xs text-muted-foreground mt-1">
              Default sender:{' '}
              <span className="font-mono">
                {emailDefaults.fromName ? `${emailDefaults.fromName} <${emailDefaults.fromEmail}>` : emailDefaults.fromEmail}
              </span>
              {' '}— change in Email Settings.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={topicFilter} onValueChange={setTopicFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All topics" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All topics</SelectItem>
              {availableTopics.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {loading ? (
          <div className="dashboard-card">
            <div className="py-8 text-center text-muted-foreground">
              Loading templates...
            </div>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="dashboard-card">
            <div className="py-8 text-center text-muted-foreground">
              {topicFilter === 'all'
                ? 'No templates found. Create your first template to get started.'
                : 'No templates in this topic yet.'}
            </div>
          </div>
        ) : (
          groupedTemplates.flatMap((group) => [
            <div key={`${group.id}-heading`} className="flex items-center gap-2 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h4>
              <Badge variant="outline" className="text-[10px]">{group.items.length}</Badge>
            </div>,
            ...group.items.map((template) => (
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
          ])
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


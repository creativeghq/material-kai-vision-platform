/**
 * workspace-scoped marketing template list. Create → auto-slugged workspace template →
 * open the shared GrapesJS builder. Reuses email_templates (workspace_id set, is_system=false).
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, FileText, Loader2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { useToast } from '@/hooks/use-toast';
import { statusTone } from '@/utils/statusTone';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { marketingService, type MarketingTemplate } from '../services/marketingService';

export const MarketingTemplatesTab: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);

  const copySlug = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(slug);
      setCopied(slug);
      setTimeout(() => setCopied((c) => (c === slug ? null : c)), 1500);
    } catch {
      toast({ title: 'Copy failed', description: slug, variant: 'destructive' });
    }
  };

  // App Launcher deep-link: /marketing/email?tab=templates&new=template opens the create modal.
  useEffect(() => {
    if (searchParams.get('new') === 'template') {
      setShowCreate(true);
      const p = new URLSearchParams(searchParams);
      p.delete('new');
      setSearchParams(p, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await marketingService.listTemplates(workspaceId);
      setTemplates(rows);
      // Deleting a template can shrink the list — don't strand the user on a now-empty page.
      setPage((p) => clampPage(p, rows.length));
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to load templates', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (workspaceId) load(); /* eslint-disable-next-line */ }, [workspaceId]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const id = await marketingService.createTemplate(workspaceId, { name, description });
      navigate(`/marketing/email/templates/${id}/edit`);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to create template', variant: 'destructive' });
      setCreating(false);
    }
  };

  const handleDelete = async (t: MarketingTemplate) => {
    if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    try {
      await marketingService.deleteTemplate(t.id);
      toast({ title: 'Template deleted' });
      load();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to delete', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Templates"
        subtitle="Design reusable email templates for your campaigns."
        actions={
          <Button onClick={() => { setName(''); setDescription(''); setShowCreate(true); }}>
            <Plus className="h-4 w-4 mr-2" /> New template
          </Button>
        }
      />

      {loading ? (
        <div className="dashboard-card py-8 text-center text-muted-foreground">Loading templates…</div>
      ) : templates.length === 0 ? (
        <div className="dashboard-card py-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create your first email template to build a campaign.</p>
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" /> New template</Button>
        </div>
      ) : (
        <div className="dashboard-card">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border/50">
              <tr>
                <th className="text-left py-3 px-4 font-medium">Template</th>
                <th className="text-left py-3 px-4 font-medium">Subject</th>
                {/* The slug is how a FLOW addresses this template (send_email → Template).
                    It was selected by the service and rendered nowhere, and it carries a random
                    suffix (mkt-<name>-<8 hex>) precisely so it cannot be guessed — so a template
                    built here was unreachable from automation without reading the database. */}
                <th className="text-left py-3 px-4 font-medium">Slug</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-right py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginate(templates, page).map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="py-3 px-4">
                    <div className="font-medium">{t.name}</div>
                    {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                  </td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">{t.subject_template || '—'}</td>
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => copySlug(t.slug)}
                      title="Copy slug — paste it into a flow's Send email action"
                      className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t.slug}
                      {copied === t.slug ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-sm capitalize ${statusTone(t.is_active ? 'active' : 'draft')}`}>{t.is_active ? 'Ready' : 'Draft'}</span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/marketing/email/templates/${t.id}/edit`)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(t)}>
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
            total={templates.length}
            onPageChange={setPage}
            label="templates"
          />
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={(o) => { if (!o && !creating) setShowCreate(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Email Template</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Template Name *</Label>
              <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer Newsletter" autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-desc">Description</Label>
              <Textarea id="tpl-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional" />
            </div>
            <p className="text-xs text-muted-foreground">You'll be taken to the visual builder to design the email.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!name.trim() || creating}>
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Create &amp; Design
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MarketingTemplatesTab;

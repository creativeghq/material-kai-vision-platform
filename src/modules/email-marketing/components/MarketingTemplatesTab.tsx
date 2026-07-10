/**
 * #255 — workspace-scoped marketing template list. Create → auto-slugged workspace template →
 * open the shared GrapesJS builder. Reuses email_templates (workspace_id set, is_system=false).
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { marketingService, type MarketingTemplate } from '../services/marketingService';

export const MarketingTemplatesTab: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setTemplates(await marketingService.listTemplates(workspaceId));
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
      <div className="dashboard-card flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Templates</h3>
          <p className="text-sm text-muted-foreground">Design reusable email templates for your campaigns.</p>
        </div>
        <Button onClick={() => { setName(''); setDescription(''); setShowCreate(true); }} className="rounded-full">
          <Plus className="h-4 w-4 mr-2" /> New Template
        </Button>
      </div>

      {loading ? (
        <div className="dashboard-card py-8 text-center text-muted-foreground">Loading templates…</div>
      ) : templates.length === 0 ? (
        <div className="dashboard-card py-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create your first email template to build a campaign.</p>
          <Button onClick={() => setShowCreate(true)} className="rounded-full"><Plus className="h-4 w-4 mr-2" /> New Template</Button>
        </div>
      ) : (
        <div className="dashboard-card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border/50">
              <tr>
                <th className="text-left py-3 px-4 font-medium">Template</th>
                <th className="text-left py-3 px-4 font-medium">Subject</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-right py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="py-3 px-4">
                    <div className="font-medium">{t.name}</div>
                    {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                  </td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">{t.subject_template || '—'}</td>
                  <td className="py-3 px-4">
                    <Badge className={t.is_active ? 'bg-green-600' : 'bg-gray-500'}>{t.is_active ? 'Ready' : 'Draft'}</Badge>
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

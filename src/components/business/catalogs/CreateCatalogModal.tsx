import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { catalogsService, type PresentationCatalog, type CatalogTemplate } from '@/services/catalogsService';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (catalog: PresentationCatalog) => void;
}

export const CreateCatalogModal: React.FC<Props> = ({ open, onClose, onCreated }) => {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [clientName, setClientName] = useState('');
  const [templateId, setTemplateId] = useState<string>('');
  const [templates, setTemplates] = useState<CatalogTemplate[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    catalogsService.listTemplates().then((rows) => {
      setTemplates(rows);
      const def = rows.find((r) => r.is_default) || rows[0];
      if (def) setTemplateId(def.id);
    }).catch(() => { /* templates are optional */ });
  }, [open]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: 'Title required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const created = await catalogsService.create({
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        description: description.trim() || undefined,
        cover_client_name: clientName.trim() || undefined,
        template_id: templateId || undefined,
      });
      toast({ title: 'Catalog created' });
      onCreated(created);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Create failed', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Catalog</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Spring 2026 — Porcelain Range" />
          </div>
          <div className="space-y-2">
            <Label>Subtitle</Label>
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Curated for Vasilis Imports" />
          </div>
          <div className="space-y-2">
            <Label>Client name (rendered on cover)</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Vasilis Imports" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What this catalog is for…" />
          </div>
          {templates.length > 0 && (
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Pick a template" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}{t.is_default ? ' (default)' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !title.trim()}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

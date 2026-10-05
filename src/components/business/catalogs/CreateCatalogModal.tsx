import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { catalogsService, type PresentationCatalog } from '@/services/catalogsService';

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
  const [submitting, setSubmitting] = useState(false);

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

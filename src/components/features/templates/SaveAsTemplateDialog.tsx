import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import { entityTemplatesService } from '@/services/entityTemplatesService';
import { getAdapter } from '@/services/templates/registry';
import type { TemplateEntityType } from '@/services/templates/types';

/**
 * "Save as template" — the capture half of the template engine (issue #322), shared by every
 * module's actions menu.
 *
 * The adapter's allowlist decides what is stored; this dialog only names it. Worth knowing while
 * reading the copy below: a template is a SHAPE, not a copy of the record. Ids, statuses, fiscal
 * marks, share tokens and derived totals are all left behind by design.
 */
export const SaveAsTemplateDialog: React.FC<{
  entityType: TemplateEntityType;
  sourceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill the template name — usually the record's own title. */
  defaultTitle?: string;
  onSaved?: (templateId: string) => void;
}> = ({ entityType, sourceId, open, onOpenChange, defaultTitle, onSaved }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const workspaceId = getActiveWorkspaceId(user?.id);
  const adapter = getAdapter(entityType);

  const [title, setTitle] = useState(defaultTitle ?? '');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setTitle(defaultTitle ?? ''); setDescription(''); } }, [open, defaultTitle]);

  const save = async () => {
    if (!workspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    if (!title.trim()) return;
    setBusy(true);
    try {
      const tpl = await entityTemplatesService.saveFrom({
        entityType,
        sourceId,
        workspaceId,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      toast({ title: 'Saved as template', description: 'Find it under Templates, or when you create the next one.' });
      onOpenChange(false);
      onSaved?.(tpl.id);
    } catch (e) {
      toast({ title: 'Could not save template', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Reuse this {adapter?.label.toLowerCase() ?? 'record'}&apos;s shape next time. Dates, numbers, status
            and totals are left behind — only the structure and defaults are stored.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Template name</Label>
            <Input
              value={title}
              autoFocus
              placeholder="e.g. Monthly retainer"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Description (optional)</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="rounded-full" disabled={busy || !title.trim()} onClick={save}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SaveAsTemplateDialog;

import React, { useCallback, useEffect, useState } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { entityTemplatesService, type EntityTemplate } from '@/services/entityTemplatesService';
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

  /**
   * Save into a NEW template, or re-capture over one you already have.
   *
   * Authoring here is capture-first, so refining a template means refining the real record and
   * pushing it back — without this the only way to improve one is a second template called
   * "… v2 (final)". Starters are excluded: they are read-only, copy-to-edit.
   */
  const NEW = '__new__';
  const [targetId, setTargetId] = useState<string>(NEW);
  const [existing, setExisting] = useState<EntityTemplate[]>([]);

  const loadExisting = useCallback(async () => {
    if (!workspaceId) { setExisting([]); return; }
    try {
      const all = await entityTemplatesService.list({ entityType, workspaceId });
      setExisting(all.filter((t) => !t.is_platform_starter));
    } catch { setExisting([]); }
  }, [entityType, workspaceId]);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle ?? ''); setDescription(''); setTargetId(NEW);
    void loadExisting();
  }, [open, defaultTitle, loadExisting]);

  const save = async () => {
    if (!workspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    const updating = targetId !== NEW;
    if (!updating && !title.trim()) return;
    setBusy(true);
    try {
      const tpl = updating
        ? await entityTemplatesService.updateFrom({ templateId: targetId, sourceId })
        : await entityTemplatesService.saveFrom({
            entityType, sourceId, workspaceId,
            title: title.trim(),
            description: description.trim() || undefined,
          });
      toast({
        title: updating ? `Updated "${tpl.title}"` : 'Saved as template',
        description: updating
          ? `Now at v${tpl.version} — the previous shape is one Restore away.`
          : 'Find it under Templates, or when you create the next one.',
      });
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
          {existing.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Save into</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW}>A new template</SelectItem>
                  {existing.map((t) => (
                    <SelectItem key={t.id} value={t.id}>Update “{t.title}” (v{t.version})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {targetId !== NEW ? (
            <p className="text-xs text-muted-foreground">
              This record&apos;s shape replaces the template&apos;s. The previous version is snapshotted first,
              so you can restore it from the template editor.
            </p>
          ) : (
          <>
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
          </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="rounded-full" disabled={busy || (targetId === NEW && !title.trim())} onClick={save}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {targetId === NEW ? 'Save template' : 'Update template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SaveAsTemplateDialog;

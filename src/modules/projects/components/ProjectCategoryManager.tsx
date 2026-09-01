/**
 * Project category management.
 *
 * The point of categorising projects is that a tenant can name the kinds of work they actually do
 * — a builder's "Renovation" and a logistics operator's "Warehouse" are not the same business, and
 * neither is served by a fixed list somebody else chose. So the four platform defaults are a
 * starting point, not the vocabulary.
 *
 * Platform defaults (`workspace_id IS NULL`) are shown read-only with a lock, exactly as
 * `DealTypeManager` shows them: they are shared with every tenant, so one workspace renaming
 * "Trip" would rename it for everyone.
 *
 * Writes are RLS-gated to workspace owners/admins. The controls are hidden for everyone else
 * rather than left armed to fail — a button that always errors is worse than no button — but the
 * hiding is UX only; `project_categories`'s policies are the boundary.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Lock, ChevronUp, ChevronDown } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import {
  projectCategoriesService,
  isOwnCategory,
  type ProjectCategory,
} from '../services/projectCategoriesService';

interface Props {
  workspaceId: string;
  onClose: () => void;
  /** Called after any change so the list / picker that opened this can reload. */
  onChanged: () => void;
}

export const ProjectCategoryManager: React.FC<Props> = ({ workspaceId, onClose, onChanged }) => {
  const { toast } = useToast();
  const { isWorkspaceManager } = usePermissions();
  const [categories, setCategories] = useState<ProjectCategory[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);

  const load = useCallback(async () => {
    const rows = await projectCategoriesService.list(workspaceId).catch(() => [] as ProjectCategory[]);
    setCategories(rows);
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const guard = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    if (!newLabel.trim()) {
      toast({ title: 'Give the category a name', variant: 'destructive' });
      return;
    }
    void guard(async () => {
      await projectCategoriesService.create(workspaceId, newLabel);
      setNewLabel('');
    });
  };

  /** Swap sort with the neighbour, so ordering is a property of the rows rather than the render. */
  const move = (cat: ProjectCategory, dir: -1 | 1) => {
    const list = categories ?? [];
    const i = list.findIndex((c) => c.id === cat.id);
    const swap = list[i + dir];
    if (!swap) return;
    // A platform default's sort belongs to every workspace — moving one is refused by RLS, so
    // don't offer the trade at all.
    if (!isOwnCategory(swap)) {
      toast({
        title: 'That would reorder a shared default',
        description: 'Platform defaults keep their order for every workspace. Your own categories can be moved among themselves.',
      });
      return;
    }
    void guard(async () => {
      await projectCategoriesService.setSort(cat.id, swap.sort);
      await projectCategoriesService.setSort(swap.id, cat.sort);
    });
  };

  const ownCount = (categories ?? []).filter(isOwnCategory).length;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Project categories</DialogTitle>
          <DialogDescription>
            The kind of work a project is — used to group and filter the projects list.
          </DialogDescription>
        </DialogHeader>

        {categories === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-1">
            {categories.map((c, i) => {
              const own = isOwnCategory(c);
              const editing = renaming?.id === c.id;
              return (
                <div key={c.id} className="flex items-center gap-1.5 rounded-sm border border-hairline px-2 py-1.5">
                  {own && isWorkspaceManager && editing ? (
                    <Input
                      autoFocus
                      value={renaming.label}
                      onChange={(e) => setRenaming({ id: c.id, label: e.target.value })}
                      onBlur={() => {
                        const next = renaming.label.trim();
                        setRenaming(null);
                        if (next && next !== c.label) void guard(() => projectCategoriesService.rename(c.id, next));
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      aria-label="Category name"
                      className="h-7 flex-1 text-sm"
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={!own || !isWorkspaceManager}
                      onClick={() => setRenaming({ id: c.id, label: c.label })}
                      className="min-w-0 flex-1 truncate text-left text-sm disabled:cursor-default"
                    >
                      {c.label}
                    </button>
                  )}

                  {!own && (
                    <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Platform default — shared with every workspace" />
                  )}

                  {own && isWorkspaceManager && (
                    <>
                      <button
                        type="button" onClick={() => move(c, -1)} disabled={busy || i === 0}
                        aria-label={`Move ${c.label} up`}
                        className="text-muted-foreground disabled:opacity-30 hover:text-foreground"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button" onClick={() => move(c, 1)} disabled={busy || i === categories.length - 1}
                        aria-label={`Move ${c.label} down`}
                        className="text-muted-foreground disabled:opacity-30 hover:text-foreground"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button" onClick={() => guard(() => projectCategoriesService.remove(c.id))} disabled={busy}
                        aria-label={`Delete ${c.label}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isWorkspaceManager ? (
          <div className="space-y-2 border-t border-hairline pt-3">
            <Label className="text-xs text-muted-foreground">Add a category</Label>
            <div className="flex gap-2">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                placeholder="e.g. Fit-out"
                aria-label="New category name"
                className="h-9"
              />
              <Button size="sm" onClick={add} disabled={busy}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {ownCount === 0
                ? 'The locked ones are platform defaults, shared with every workspace. Anything you add here belongs to this workspace only.'
                : 'Your own categories can be renamed, reordered and deleted. A category still used by projects cannot be deleted.'}
            </p>
          </div>
        ) : (
          <p className="border-t border-hairline pt-3 text-xs text-muted-foreground">
            Only a workspace owner or admin can add or edit categories.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};

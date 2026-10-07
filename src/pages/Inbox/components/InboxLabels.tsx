import React, { useCallback, useMemo, useState } from 'react';
import { Plus, Loader2, Tag, Trash2, Check, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { inboxApi, LABEL_COLORS, type InboxLabel } from '@/services/inboxApi';
import { LabelRulesDialog, labelHasRules } from './LabelRulesDialog';

/** Sidebar label management (owner/admin): create, recolor, delete workspace labels. */
/** Shared workspace-label CRUD (create / recolor / delete) with busy state + toast-on-error, used by
 *  both the manage popover and the per-thread assign popover. Mutators return true on success so the
 *  caller can clear its input only when the write actually landed. */
export function useLabelCrud(workspaceId: string, onChanged: () => void) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<unknown>, failTitle: string): Promise<boolean> => {
    setBusy(true);
    try { await fn(); onChanged(); return true; }
    catch (e) { toast({ title: failTitle, description: (e as Error).message, variant: 'destructive' }); return false; }
    finally { setBusy(false); }
  }, [onChanged, toast]);
  const create = useCallback((name: string, color: string) => run(() => inboxApi.createLabel(workspaceId, name, color), 'Could not create label'), [run, workspaceId]);
  const recolor = useCallback((id: string, color: string) => run(() => inboxApi.updateLabel(id, { color }), 'Failed'), [run]);
  const remove = useCallback((id: string) => run(() => inboxApi.deleteLabel(id), 'Could not delete label'), [run]);
  return { busy, run, create, recolor, remove };
}

export const LabelManagerPopover: React.FC<{
  workspaceId: string;
  labels: InboxLabel[];
  onChanged: () => void;
  /**
   * What opens it. Defaults to the `+` beside the heading, which is the right control once there
   * are labels and the wrong one when there are none — an empty surface has to OFFER the way out
   * of being empty, not point at a 14px glyph and say "use the + above".
   */
  trigger?: React.ReactNode;
}> = ({ workspaceId, labels, onChanged, trigger }) => {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(LABEL_COLORS[0].key);
  const [rulesFor, setRulesFor] = useState<InboxLabel | null>(null);
  const { busy, create: createLabel, recolor, remove } = useLabelCrud(workspaceId, onChanged);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    if (await createLabel(name, newColor)) setNewName('');
  };

  return (<>
    {rulesFor && <LabelRulesDialog label={rulesFor} onClose={() => setRulesFor(null)} onSaved={onChanged} />}
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button className="text-muted-foreground hover:text-foreground p-0.5 rounded" title="Manage labels">
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="p-3 border-b border-border">
          <div className="text-sm font-medium">Manage labels</div>
          <div className="text-xs text-muted-foreground">Create, recolor or delete labels. <Zap className="inline w-3 h-3" /> applies one automatically.</div>
        </div>
        <div className="max-h-52 overflow-y-auto p-1.5 space-y-0.5">
          {labels.length === 0 ? (
            <div className="text-xs text-muted-foreground px-2 py-2">No labels yet.</div>
          ) : labels.map((l) => (
            <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-surface-hover group">
              <Popover>
                <PopoverTrigger asChild>
                  <button className={`w-3 h-3 rounded-full shrink-0 ${(LABEL_COLORS.find((c) => c.key === l.color) || LABEL_COLORS[0]).dot}`} title="Change color" aria-label="Change label colour" />
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-2">
                  <div className="flex items-center gap-1.5">
                    {LABEL_COLORS.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => recolor(l.id, c.key)}
                        title={c.label}
                        aria-label={`Colour: ${c.label}`}
                        className={`w-4 h-4 rounded-full ${c.dot} ${l.color === c.key ? 'ring-2 ring-offset-1 ring-offset-background ring-foreground/50' : ''}`}
                      />
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <span className="text-sm flex-1 truncate">{l.name}</span>
              <button
                onClick={() => { setOpen(false); setRulesFor(l); }}
                className={`shrink-0 ${labelHasRules(l) ? 'text-primary' : 'opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground'}`}
                title={labelHasRules(l) ? 'Auto-applied — edit the rule' : 'Apply this label automatically'}
              >
                <Zap className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => remove(l.id)} disabled={busy} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0" title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-border space-y-2">
          <div className="flex items-center gap-1.5">
            {LABEL_COLORS.map((c) => (
              <button
                key={c.key}
                onClick={() => setNewColor(c.key)}
                title={c.label}
                aria-label={`Colour: ${c.label}`}
                className={`w-4 h-4 rounded-full ${c.dot} ${newColor === c.key ? 'ring-2 ring-offset-1 ring-offset-background ring-foreground/50' : ''}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } }}
              placeholder="New label"
              className="h-8 text-sm"
            />
            <Button size="sm" className="h-8 shrink-0" onClick={create} disabled={busy || !newName.trim()}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  </>);
};

/** Assign/unassign labels on the open thread; owner/admin can also create/delete workspace labels. */
export const LabelAssignButton: React.FC<{
  workspaceId: string;
  threadId: string;
  labels: InboxLabel[];
  assigned: InboxLabel[];
  canManage: boolean;
  onChanged: () => void;
}> = ({ workspaceId, threadId, labels, assigned, canManage, onChanged }) => {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(LABEL_COLORS[0].key);
  const assignedIds = useMemo(() => new Set(assigned.map((l) => l.id)), [assigned]);
  const { busy, run, create: createLabel, remove } = useLabelCrud(workspaceId, onChanged);

  const toggle = (labelId: string) => {
    const next = new Set(assignedIds);
    if (next.has(labelId)) next.delete(labelId); else next.add(labelId);
    return run(() => inboxApi.setThreadLabels(threadId, [...next]), 'Failed');
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    if (await createLabel(name, newColor)) setNewName('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9" title="Labels">
          <Tag className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-3 border-b border-border">
          <div className="text-sm font-medium">Labels</div>
          <div className="text-xs text-muted-foreground">Tag this conversation to filter and organise.</div>
        </div>
        <div className="max-h-56 overflow-y-auto p-1.5">
          {labels.length === 0 ? (
            <div className="text-xs text-muted-foreground px-2 py-3">No labels yet.{canManage ? ' Create one below.' : ''}</div>
          ) : labels.map((l) => {
            const on = assignedIds.has(l.id);
            const dot = (LABEL_COLORS.find((c) => c.key === l.color) || LABEL_COLORS[0]).dot;
            return (
              <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-surface-hover group">
                <button onClick={() => toggle(l.id)} disabled={busy} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                  <span className={`w-4 h-4 rounded flex items-center justify-center border ${on ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>
                    {on && <Check className="w-3 h-3" />}
                  </span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                  <span className="text-sm truncate">{l.name}</span>
                </button>
                {canManage && (
                  <button onClick={() => remove(l.id)} disabled={busy} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0" title="Delete label">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {canManage && (
          <div className="p-3 border-t border-border space-y-2">
            <div className="text-xs text-muted-foreground">New label</div>
            <div className="flex items-center gap-1.5">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setNewColor(c.key)}
                  title={c.label}
                  aria-label={`Colour: ${c.label}`}
                  className={`w-4 h-4 rounded-full ${c.dot} ${newColor === c.key ? 'ring-2 ring-offset-1 ring-offset-background ring-foreground/50' : ''}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } }}
                placeholder="Label name"
                className="h-8 text-sm"
              />
              <Button size="sm" className="h-8 shrink-0" onClick={create} disabled={busy || !newName.trim()}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

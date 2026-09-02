/**
 * Cost code management — the workspace's own cost breakdown structure.
 *
 * There are no platform defaults to show read-only here (unlike project categories or deal types):
 * a cost breakdown is a numbering convention the firm chose, so every row is theirs. The starter
 * library is a COPY offered on an empty workspace, not a shared list — install it and rename
 * everything, or ignore it and type your own.
 *
 * Archive, not delete, is the normal retirement. The FK on every table that codes money is
 * ON DELETE RESTRICT, so a code that has ever been used cannot be removed at all — and blanking
 * the classification on historic costs would be the wrong answer even if it could.
 *
 * Writes are RLS-gated to workspace owners/admins. The controls are hidden for everyone else
 * rather than left armed to fail, but the hiding is UX only; `cost_codes`'s policies are the
 * boundary.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, Loader2, Archive, ArchiveRestore, Pencil, Check, X, Ruler, Download,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { invalidateCostCodes } from '@/hooks/useCostCodes';
import {
  costCodesService, costCodeTree, flattenCostCodes, COST_CODE_MAX_DEPTH, type CostCode,
} from '@/services/costCodesService';

interface Props {
  workspaceId: string;
}

interface DraftState {
  /** null = the "add a top-level code" row; a string = adding a child under that code. */
  parentId: string | null;
  code: string;
  name: string;
}

export const CostCodesPanel: React.FC<Props> = ({ workspaceId }) => {
  const { toast } = useToast();
  const { isWorkspaceManager } = usePermissions();

  const [codes, setCodes] = useState<CostCode[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [editing, setEditing] = useState<{ id: string; code: string; name: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      setCodes(await costCodesService.listAll(workspaceId));
    } catch (e) {
      toast({ title: 'Could not load cost codes', description: (e as Error).message, variant: 'destructive' });
      setCodes([]);
    }
  }, [workspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  /** Every write reloads this panel AND drops the shared picker cache. */
  const guard = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
      invalidateCostCodes(workspaceId);
    } catch (e) {
      toast({ title: label, description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const visible = useMemo(
    () => (codes ?? []).filter((c) => showArchived || c.is_active),
    [codes, showArchived],
  );
  const ordered = useMemo(() => flattenCostCodes(costCodeTree(visible)), [visible]);
  const archivedCount = (codes ?? []).filter((c) => !c.is_active).length;

  const submitDraft = async () => {
    if (!draft) return;
    await guard('Could not add the cost code', async () => {
      await costCodesService.create(workspaceId, {
        code: draft.code,
        name: draft.name,
        parentId: draft.parentId,
      });
      setDraft(null);
    });
  };

  const submitEdit = async () => {
    if (!editing) return;
    await guard('Could not rename the cost code', async () => {
      await costCodesService.update(editing.id, { code: editing.code, name: editing.name });
      setEditing(null);
    });
  };

  const installStarter = () =>
    guard('Could not install the starter cost codes', async () => {
      const added = await costCodesService.installStarter(workspaceId);
      toast({
        title: added > 0 ? `${added} cost codes added` : 'Nothing to add',
        description: added > 0
          ? 'Rename, renumber or archive anything that does not match how you work.'
          : 'Every code in the starter library already exists here.',
      });
    });

  const DraftRow: React.FC<{ depth: number }> = ({ depth }) => (
    <div className="flex items-end gap-2 py-2" style={{ paddingLeft: `${depth * 20}px` }}>
      <div className="w-28">
        <Label className="text-[11px] text-muted-foreground">Number</Label>
        <Input
          autoFocus
          value={draft?.code ?? ''}
          onChange={(e) => setDraft((d) => (d ? { ...d, code: e.target.value } : d))}
          placeholder="05.2"
          className="mt-1 h-9"
        />
      </div>
      <div className="flex-1">
        <Label className="text-[11px] text-muted-foreground">Name</Label>
        <Input
          value={draft?.name ?? ''}
          onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
          placeholder="Plumbing & drainage"
          onKeyDown={(e) => { if (e.key === 'Enter') void submitDraft(); }}
          className="mt-1 h-9"
        />
      </div>
      <Button size="sm" onClick={() => void submitDraft()} disabled={busy || !draft?.code.trim() || !draft?.name.trim()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        Add
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 px-5 py-3">
        <div>
          <CardTitle>Cost codes</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            How this workspace classifies what a job costs. Set one on a supplier bill, an expense
            or a timesheet, and the project&apos;s Cost by code report groups by it.
          </p>
        </div>
        {isWorkspaceManager && (codes?.length ?? 0) > 0 && (
          <Button size="sm" variant="secondary" onClick={() => setDraft({ parentId: null, code: '', name: '' })} disabled={busy}>
            <Plus className="h-3.5 w-3.5" /> Add code
          </Button>
        )}
      </CardHeader>

      <CardContent className="px-5 py-4">
        {codes === null ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </div>
        ) : codes.length === 0 ? (
          <HubEmptyState
            icon={Ruler}
            title="No cost codes yet"
            description={
              isWorkspaceManager
                ? 'Install a generic build and fit-out breakdown to start from, then rename anything that does not match how you work. Or add your own.'
                : 'A workspace owner or admin sets these up.'
            }
            action={isWorkspaceManager ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={() => void installStarter()} disabled={busy}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Install starter library
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDraft({ parentId: null, code: '', name: '' })} disabled={busy}>
                  <Plus className="h-3.5 w-3.5" /> Add one myself
                </Button>
              </div>
            ) : undefined}
          />
        ) : (
          <div className="divide-y divide-border/60">
            {ordered.map(({ code, depth }) => (
              <div key={code.id} className="group">
                {editing?.id === code.id ? (
                  <div className="flex items-end gap-2 py-2" style={{ paddingLeft: `${depth * 20}px` }}>
                    <Input
                      autoFocus
                      value={editing.code}
                      onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                      className="h-9 w-28"
                    />
                    <Input
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') void submitEdit(); }}
                      className="h-9 flex-1"
                    />
                    <Button size="sm" onClick={() => void submitEdit()} disabled={busy}>
                      <Check className="h-3.5 w-3.5" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 py-2" style={{ paddingLeft: `${depth * 20}px` }}>
                    <span className="w-24 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{code.code}</span>
                    <span className={`flex-1 text-sm ${code.is_active ? '' : 'text-muted-foreground line-through'}`}>
                      {code.name}
                    </span>
                    {!code.is_active && <Badge variant="neutral">Archived</Badge>}
                    {isWorkspaceManager && (
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        {depth + 1 < COST_CODE_MAX_DEPTH && code.is_active && (
                          <Button
                            size="sm" variant="ghost" title="Add a code under this one"
                            onClick={() => setDraft({ parentId: code.id, code: '', name: '' })} disabled={busy}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm" variant="ghost" title="Rename"
                          onClick={() => setEditing({ id: code.id, code: code.code, name: code.name })} disabled={busy}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          title={code.is_active ? 'Archive — keeps it on past costs, hides it from pickers' : 'Restore'}
                          onClick={() => void guard('Could not change the cost code', () => costCodesService.setActive(code.id, !code.is_active))}
                          disabled={busy}
                        >
                          {code.is_active ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="sm" variant="ghost" title="Delete — only possible if nothing uses it"
                          onClick={() => void guard('Could not delete the cost code', () => costCodesService.remove(code.id))}
                          disabled={busy}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {draft?.parentId === code.id && <DraftRow depth={depth + 1} />}
              </div>
            ))}
            {draft?.parentId === null && <DraftRow depth={0} />}
          </div>
        )}

        {archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {showArchived ? 'Hide' : 'Show'} {archivedCount} archived
          </button>
        )}
      </CardContent>
    </Card>
  );
};

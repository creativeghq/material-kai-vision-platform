/**
 * Deal type & stage management (#311).
 *
 * The point of typing deals is that a tenant can model their own work — "Kitchen Fit-out",
 * "Retrofit", whatever they sell — and give it stages that make sense for it. Without this screen
 * the tables supported that and nobody could reach it, which is the same as not having built it.
 *
 * Platform defaults (`workspace_id IS NULL`) are shown read-only: they are shared across every
 * tenant, so one workspace renaming "Real Estate" would rename it for everyone. A workspace edits
 * only its own.
 *
 * Creation goes through `crm_create_deal_type` rather than two inserts, because a type whose
 * stages failed to write renders a board with no columns and no way to add a deal.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Trophy, Loader2, ChevronUp, ChevronDown, Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { dealsService, dealTypesAdmin, type DealStage, type DealType } from '@/services/dealsService';

interface Props {
  ws: string;
  onClose: () => void;
  /** Called after any change so the board can reload its types/stages. */
  onChanged: () => void;
}

export const DealTypeManager: React.FC<Props> = ({ ws, onClose, onChanged }) => {
  const { toast } = useToast();
  const [types, setTypes] = useState<DealType[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stages, setStages] = useState<DealStage[]>([]);
  const [busy, setBusy] = useState(false);

  const [newLabel, setNewLabel] = useState('');
  const [newSubject, setNewSubject] = useState<DealType['subject_kind']>('none');
  const [newStage, setNewStage] = useState('');

  const selected = types?.find((t) => t.id === selectedId) ?? null;
  const isOwnType = !!selected && selected.workspace_id !== null;

  const loadTypes = useCallback(async () => {
    const rows = await dealsService.listTypes(ws).catch(() => [] as DealType[]);
    setTypes(rows);
    setSelectedId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? null));
  }, [ws]);

  useEffect(() => { void loadTypes(); }, [loadTypes]);

  useEffect(() => {
    if (!selectedId) { setStages([]); return; }
    dealsService.listStages(selectedId).then(setStages).catch(() => setStages([]));
  }, [selectedId]);

  const refresh = async () => {
    await loadTypes();
    if (selectedId) setStages(await dealsService.listStages(selectedId).catch(() => []));
    onChanged();
  };

  const guard = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await refresh(); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const createType = () => {
    if (!newLabel.trim()) { toast({ title: 'Name the deal type', variant: 'destructive' }); return; }
    void guard(async () => {
      const id = await dealTypesAdmin.create(ws, newLabel, newSubject);
      setNewLabel(''); setNewSubject('none'); setSelectedId(id);
      toast({ title: 'Deal type created', description: 'It starts with a default stage set — edit the stages below.' });
    });
  };

  const move = (stage: DealStage, dir: -1 | 1) => {
    const i = stages.findIndex((s) => s.id === stage.id);
    const swap = stages[i + dir];
    if (!swap) return;
    void guard(async () => {
      await dealTypesAdmin.updateStage(stage.id, { sort: swap.sort });
      await dealTypesAdmin.updateStage(swap.id, { sort: stage.sort });
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Deal types &amp; stages</DialogTitle></DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          {/* Types */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Types</Label>
            {types === null ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
              <div className="space-y-1">
                {types.map((t) => (
                  <button
                    key={t.id} type="button" onClick={() => setSelectedId(t.id)}
                    className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm ${t.id === selectedId ? 'bg-muted font-medium' : 'hover:bg-muted/60'}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{t.label}</span>
                    {t.workspace_id === null && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Platform default" />}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-1.5 border-t border-border/60 pt-2">
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="New type…" aria-label="New deal type name" className="h-8 text-sm" />
              <Select value={newSubject} onValueChange={(v) => setNewSubject(v as DealType['subject_kind'])}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {/* Closed list: a subject is a row the code knows how to render and link. */}
                  <SelectItem value="none" className="text-xs">No subject</SelectItem>
                  <SelectItem value="property" className="text-xs">About a property</SelectItem>
                  <SelectItem value="project" className="text-xs">About a project</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="w-full rounded-full" onClick={createType} disabled={busy}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add type
              </Button>
            </div>
          </div>

          {/* Stages of the selected type */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">
                Stages{selected ? ` · ${selected.label}` : ''}
              </Label>
              {isOwnType && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-red-500"
                  onClick={() => guard(() => dealTypesAdmin.remove(selected!.id))} disabled={busy}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete type
                </Button>
              )}
            </div>

            {!selected ? <div className="text-xs text-muted-foreground">Pick a type.</div> : (
              <>
                {!isOwnType && (
                  <p className="rounded-md bg-muted/50 px-2.5 py-2 text-[11px] text-muted-foreground">
                    A platform default, shared with every workspace — read-only here. Add your own type to change stages.
                  </p>
                )}
                <div className="space-y-1">
                  {stages.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-sm">{s.label}</span>
                      {s.is_won && <Trophy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Winning stage" />}
                      {isOwnType && (
                        <>
                          <button type="button" onClick={() => move(s, -1)} disabled={busy || i === 0} aria-label={`Move ${s.label} earlier`} className="text-muted-foreground disabled:opacity-30 hover:text-foreground"><ChevronUp className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => move(s, 1)} disabled={busy || i === stages.length - 1} aria-label={`Move ${s.label} later`} className="text-muted-foreground disabled:opacity-30 hover:text-foreground"><ChevronDown className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => guard(() => dealTypesAdmin.updateStage(s.id, { is_won: !s.is_won }))} disabled={busy} aria-label={`Toggle ${s.label} as the winning stage`} className="text-muted-foreground hover:text-foreground"><Trophy className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => guard(() => dealTypesAdmin.removeStage(s.id))} disabled={busy} aria-label={`Delete ${s.label}`} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                        </>
                      )}
                    </div>
                  ))}
                  {stages.length === 0 && <div className="text-xs text-muted-foreground">No stages — this board would render empty.</div>}
                </div>

                {isOwnType && (
                  <div className="flex gap-1.5 pt-1">
                    <Input
                      value={newStage} onChange={(e) => setNewStage(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && newStage.trim()) { void guard(async () => { await dealTypesAdmin.addStage(selected.id, newStage, (stages.at(-1)?.sort ?? 0) + 10); setNewStage(''); }); } }}
                      placeholder="Add stage…" aria-label="New stage name" className="h-8 text-sm"
                    />
                    <Button size="sm" className="h-8 rounded-full px-3" disabled={busy || !newStage.trim()}
                      onClick={() => guard(async () => { await dealTypesAdmin.addStage(selected.id, newStage, (stages.at(-1)?.sort ?? 0) + 10); setNewStage(''); })}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter><Button variant="ghost" className="rounded-full" onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

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
import { Plus, Trash2, Trophy, XCircle, Loader2, ChevronUp, ChevronDown, Lock, Mail } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/core/ui/textarea';
import { dealsService, dealTypesAdmin, stageEmail, type DealStage, type DealType, type StageEmailRule } from '@/services/dealsService';

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
  const [renaming, setRenaming] = useState<string | null>(null);   // draft label while editing
  const [rules, setRules] = useState<StageEmailRule[]>([]);
  const [emailFor, setEmailFor] = useState<DealStage | null>(null);

  const selected = types?.find((t) => t.id === selectedId) ?? null;
  const isOwnType = !!selected && selected.workspace_id !== null;

  const loadTypes = useCallback(async () => {
    const rows = await dealsService.listTypes(ws).catch(() => [] as DealType[]);
    setTypes(rows);
    setSelectedId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? null));
  }, [ws]);

  useEffect(() => { void loadTypes(); }, [loadTypes]);

  useEffect(() => {
    if (!selectedId) { setStages([]); setRules([]); return; }
    dealsService.listStages(selectedId).then(setStages).catch(() => setStages([]));
    const key = types?.find((t) => t.id === selectedId)?.key;
    if (key) stageEmail.list(ws, key).then(setRules).catch(() => setRules([]));
    else setRules([]);
  }, [selectedId, types, ws]);

  const refresh = async () => {
    await loadTypes();
    if (selectedId) setStages(await dealsService.listStages(selectedId).catch(() => []));
    if (selected?.key) setRules(await stageEmail.list(ws, selected.key).catch(() => []));
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
              <Button size="sm" className="w-full" onClick={createType} disabled={busy}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add type
              </Button>
            </div>
          </div>

          {/* Stages of the selected type */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              {isOwnType ? (
                <Input
                  value={renaming ?? selected!.label}
                  onChange={(e) => setRenaming(e.target.value)}
                  onBlur={() => {
                    const next = (renaming ?? '').trim();
                    setRenaming(null);
                    if (next && next !== selected!.label) void guard(() => dealTypesAdmin.rename(selected!.id, next));
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  aria-label="Deal type name"
                  className="h-7 max-w-[220px] text-sm font-medium"
                />
              ) : (
                <Label className="text-xs text-muted-foreground">
                  Stages{selected ? ` · ${selected.label}` : ''}
                </Label>
              )}
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
                      {s.is_lost && <XCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Losing stage" />}
                      {/* Automatic email when a deal reaches this stage. Writes an ordinary
                          workspace flow, so it stays visible and pausable under Flows. */}
                      <button
                        type="button" onClick={() => setEmailFor(s)} disabled={busy}
                        aria-label={`Email when a deal reaches ${s.label}`}
                        title={rules.find((r) => r.stage_key === s.key)?.active ? 'Emails the contact on this stage' : 'No email on this stage'}
                        className={`hover:text-foreground ${rules.find((r) => r.stage_key === s.key)?.active ? 'text-primary' : 'text-muted-foreground'}`}
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </button>
                      {isOwnType && (
                        <>
                          <button type="button" onClick={() => move(s, -1)} disabled={busy || i === 0} aria-label={`Move ${s.label} earlier`} className="text-muted-foreground disabled:opacity-30 hover:text-foreground"><ChevronUp className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => move(s, 1)} disabled={busy || i === stages.length - 1} aria-label={`Move ${s.label} later`} className="text-muted-foreground disabled:opacity-30 hover:text-foreground"><ChevronDown className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => guard(() => dealTypesAdmin.updateStage(s.id, { is_won: !s.is_won, is_lost: false }))} disabled={busy} aria-label={`Toggle ${s.label} as the winning stage`} className={`hover:text-foreground ${s.is_won ? 'text-foreground' : 'text-muted-foreground'}`}><Trophy className="h-3.5 w-3.5" /></button>
                          {/* is_lost was settable only from SQL, while moveToStage already acted on it. */}
                          <button type="button" onClick={() => guard(() => dealTypesAdmin.updateStage(s.id, { is_lost: !s.is_lost, is_won: false }))} disabled={busy} aria-label={`Toggle ${s.label} as a losing stage`} className={`hover:text-foreground ${s.is_lost ? 'text-foreground' : 'text-muted-foreground'}`}><XCircle className="h-3.5 w-3.5" /></button>
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
                    <Button size="sm" className="h-8 px-3" disabled={busy || !newStage.trim()}
                      onClick={() => guard(async () => { await dealTypesAdmin.addStage(selected.id, newStage, (stages.at(-1)?.sort ?? 0) + 10); setNewStage(''); })}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter><Button variant="ghost" onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>

      {emailFor && selected && (
        <StageEmailDialog
          ws={ws}
          dealType={{ key: selected.key, label: selected.label }}
          stage={emailFor}
          rule={rules.find((r) => r.stage_key === emailFor.key) ?? null}
          onClose={() => setEmailFor(null)}
          onSaved={() => { setEmailFor(null); void refresh(); }}
        />
      )}
    </Dialog>
  );
};

/**
 * Configure "email the contact when a deal reaches this stage".
 *
 * Saves a workspace-scoped flow rather than a bespoke setting: the automation then shows up under
 * Flows with its run history, and can be paused or rewritten there like any other. Targeting is
 * `trigger_config = { deal_type_key, stage }`, which the engine matches by equality against the
 * event payload — without that filter it would fire on every stage move.
 */
const StageEmailDialog: React.FC<{
  ws: string;
  dealType: { key: string; label: string };
  stage: DealStage;
  rule: StageEmailRule | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ ws, dealType, stage, rule, onClose, onSaved }) => {
  const { toast } = useToast();
  const [subject, setSubject] = useState(rule?.subject ?? `Your ${dealType.label.toLowerCase()} — ${stage.label}`);
  const [body, setBody] = useState(
    'Hi {{contact_name}},\n\nA quick update: {{deal_title}} is now at {{stage}}.\n\nWe will be in touch shortly.',
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!subject.trim()) { toast({ title: 'Give the email a subject', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await stageEmail.upsert(ws, dealType, { key: stage.key, label: stage.label },
        { subject: subject.trim(), body }, rule?.flow_id ?? null);
      toast({
        title: 'Automation saved',
        description: `Contacts will be emailed when a ${dealType.label} deal reaches ${stage.label}. Manage it under Flows.`,
      });
      onSaved();
    } catch (e) {
      toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!rule) return;
    setBusy(true);
    try { await stageEmail.remove(rule.flow_id); onSaved(); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Email on “{stage.label}”</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Sent to the deal’s contact when it reaches this stage, from your workspace’s own sender.
            A deal whose contact has no email is skipped, not failed.
          </p>
          <div>
            <Label className="text-xs" htmlFor="se-subject">Subject</Label>
            <Input id="se-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs" htmlFor="se-body">Message</Label>
            <Textarea id="se-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {'{{contact_name}}'} · {'{{deal_title}}'} · {'{{stage}}'} · {'{{value}}'} · {'{{currency}}'}
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {rule && <Button variant="ghost" className="mr-auto text-red-500" onClick={remove} disabled={busy}>Remove</Button>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{rule ? 'Save' : 'Turn on'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

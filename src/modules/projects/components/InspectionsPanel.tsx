/**
 * Inspections — the checklist somebody walks the site with.
 *
 * The three things this screen exists to get right:
 *
 *  1. **The verdict comes from SQL.** `get_project_inspections` derives it; nothing here decides
 *     whether an inspection passed. A tile and a report reading the same RPC cannot then disagree.
 *  2. **An unanswered item is not a pass.** It renders as unanswered, and the header says how many
 *     are still to check rather than folding them into a clean-looking count.
 *  3. **A failure nobody actioned is SAID.** `open_failures` is the silent-zero case wearing a hat:
 *     a recorded defect with no snag against it looks exactly like a finished inspection.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, ClipboardCheck, Loader2, Minus, Plus, Trash2, X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { CostCodePicker } from '@/components/business/costCodes/CostCodePicker';
import { useToast } from '@/hooks/use-toast';
import { formatDate, todayLocalISO } from '@/utils/datetime';
import {
  inspectionsService, INSPECTION_OUTCOME_LABELS,
  type InspectionResult, type ProjectInspection, type ProjectInspectionItem,
} from '../services/inspectionsService';

/** The derived verdict's badge. Never computed here — only dressed. */
const outcomeVariant = (o: ProjectInspection['outcome']) =>
  o === 'passed' ? 'success'
    : o === 'failed' ? 'error'
      : o === 'in_progress' ? 'info'
        : 'neutral';

export const InspectionsPanel: React.FC<{ projectId: string; isOwner: boolean }> = ({
  projectId, isOwner,
}) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<ProjectInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setLoading(true); setRows(await inspectionsService.list(projectId)); }
    catch (err: any) {
      toast({ title: 'Failed to load inspections', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [projectId, toast]);
  useEffect(() => { void load(); }, [load]);

  // Failures nobody has turned into work, across the whole project. This is the number worth
  // putting at the top: a recorded defect with no snag against it is indistinguishable, on a list
  // of completed inspections, from a stage that was checked and found clean.
  const unactioned = useMemo(() => rows.reduce((n, r) => n + r.open_failures, 0), [rows]);

  const remove = async (row: ProjectInspection) => {
    if (!confirm(`Delete "${row.title}" and its checklist?`)) return;
    try { await inspectionsService.remove(row.id); await load(); }
    catch (err: any) { toast({ title: 'Failed to delete', description: err?.message, variant: 'destructive' }); }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <Card className="dashboard-card">
      <CardHeader className="border-b border-hairline px-5 py-3 flex-row items-center justify-between space-y-0 gap-3 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <ClipboardCheck className="h-4 w-4 text-primary" /> Inspections
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {rows.length} recorded
            {unactioned > 0 && (
              <span className="text-destructive">
                {' '}· {unactioned} failure{unactioned === 1 ? '' : 's'} with no snag raised
              </span>
            )}
          </p>
        </div>
        {isOwner && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New inspection
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <HubEmptyState
            icon={ClipboardCheck}
            title="No inspections yet"
            description="A checklist you walk the site with — the same items on every plot, and a record that the stage was checked before it was covered up."
            action={isOwner ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> New inspection
              </Button>
            ) : undefined}
          />
        ) : (
          <div className="divide-y divide-hairline">
            {rows.map((r) => (
              <div key={r.id} className="p-4">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setOpenId(openId === r.id ? null : r.id)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{r.title}</p>
                      <Badge variant={outcomeVariant(r.outcome)}>
                        {INSPECTION_OUTCOME_LABELS[r.outcome]}
                      </Badge>
                      {r.status === 'signed_off' && (
                        <span className="text-[11px] text-muted-foreground">
                          signed off{r.signed_off_name ? ` by ${r.signed_off_name}` : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {r.inspection_date ? formatDate(r.inspection_date) : formatDate(r.created_at)}
                      {' · '}
                      {/* The count says what is still UNANSWERED rather than only what passed —
                          an item nobody looked at is not an item that was fine. */}
                      {r.items_answered} of {r.items_total} answered
                      {r.items_failed > 0 && ` · ${r.items_failed} failed`}
                    </p>
                    {r.open_failures > 0 && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {r.open_failures} failure{r.open_failures === 1 ? '' : 's'} with no snag raised
                      </p>
                    )}
                  </button>
                  {isOwner && (
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(r)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {openId === r.id && (
                  <InspectionChecklist inspection={r} isOwner={isOwner} onChanged={() => void load()} />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {creating && (
        <NewInspectionDialog
          projectId={projectId}
          onClose={() => setCreating(false)}
          onSaved={(id) => { setCreating(false); setOpenId(id); void load(); }}
        />
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------

const RESULT_BUTTONS: Array<{ value: InspectionResult; label: string; icon: React.ReactNode }> = [
  { value: 'pass', label: 'Pass', icon: <Check className="h-3.5 w-3.5" /> },
  { value: 'fail', label: 'Fail', icon: <X className="h-3.5 w-3.5" /> },
  { value: 'na', label: 'N/A', icon: <Minus className="h-3.5 w-3.5" /> },
];

const InspectionChecklist: React.FC<{
  inspection: ProjectInspection; isOwner: boolean; onChanged: () => void;
}> = ({ inspection, isOwner, onChanged }) => {
  const { toast } = useToast();
  const [items, setItems] = useState<ProjectInspectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  const load = useCallback(async () => {
    try { setLoading(true); setItems(await inspectionsService.listItems(inspection.id)); }
    catch (err: any) {
      toast({ title: 'Failed to load the checklist', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [inspection.id, toast]);
  useEffect(() => { void load(); }, [load]);

  const answer = async (item: ProjectInspectionItem, result: InspectionResult | null) => {
    setBusyId(item.id);
    try {
      await inspectionsService.setResult(item.id, result);
      await load();
      onChanged();
    } catch (err: any) {
      toast({ title: 'Could not record that', description: err?.message, variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  const raise = async (item: ProjectInspectionItem) => {
    setBusyId(item.id);
    try {
      // Idempotent in the database: a second press returns the SAME snag rather than raising a
      // second one for one defect, so the button does not have to be disarmed to be safe.
      await inspectionsService.raiseSnag(item.id, 'medium');
      await load();
      onChanged();
      toast({ title: 'Snag raised', description: item.title });
    } catch (err: any) {
      toast({ title: 'Could not raise the snag', description: err?.message, variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  const signOff = async () => {
    setSigning(true);
    try {
      await inspectionsService.setStatus(inspection.id, 'signed_off');
      onChanged();
    } catch (err: any) {
      toast({ title: 'Could not sign off', description: err?.message, variant: 'destructive' });
    } finally { setSigning(false); }
  };

  if (loading) {
    return <div className="py-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-primary" /></div>;
  }

  return (
    <div className="mt-3 space-y-2 border-t border-hairline pt-3">
      {items.map((it) => (
        <div key={it.id} className="flex flex-wrap items-start gap-2 rounded-md bg-surface-sunken p-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm">{it.title}</p>
            {it.guidance && <p className="text-xs text-muted-foreground">{it.guidance}</p>}
            {it.note && <p className="mt-1 text-xs text-muted-foreground">{it.note}</p>}
            {/* Not answered is its own state, said out loud. Blank would read as "nothing wrong". */}
            {it.result === null && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">Not answered</p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            {isOwner ? RESULT_BUTTONS.map((b) => (
              <button
                key={b.value}
                type="button"
                disabled={busyId === it.id}
                onClick={() => answer(it, it.result === b.value ? null : b.value)}
                className={`flex items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors ${
                  it.result === b.value
                    ? b.value === 'fail'
                      ? 'bg-destructive text-destructive-foreground'
                      : b.value === 'pass'
                        ? 'bg-emerald-700 text-white dark:bg-emerald-600'
                        : 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {b.icon} {b.label}
              </button>
            )) : (
              <span className="text-xs text-muted-foreground">
                {it.result ? RESULT_BUTTONS.find((b) => b.value === it.result)?.label : 'Not answered'}
              </span>
            )}
            {isOwner && it.result === 'fail' && (
              it.snag_id ? (
                <span className="text-[11px] text-muted-foreground">Snag raised</span>
              ) : (
                <Button size="sm" variant="outline" disabled={busyId === it.id} onClick={() => raise(it)}>
                  Raise snag
                </Button>
              )
            )}
          </div>
        </div>
      ))}

      {isOwner && inspection.status !== 'signed_off' && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" variant="secondary" disabled={signing} onClick={() => void signOff()}>
            {signing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Sign off'}
          </Button>
          {/* Signing off a failed walk is allowed and said plainly. Refusing would push people to
              leave failures unanswered instead, which loses the finding altogether. */}
          <span className="text-xs text-muted-foreground">
            {inspection.items_answered < inspection.items_total
              ? `${inspection.items_total - inspection.items_answered} still to check`
              : inspection.items_failed > 0
                ? 'Records the walk and what was wrong with it.'
                : 'Everything checked and clear.'}
          </span>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

interface DraftItem { title: string; guidance: string; costCodeId: string | null }

const NewInspectionDialog: React.FC<{
  projectId: string; onClose: () => void; onSaved: (id: string) => void;
}> = ({ projectId, onClose, onSaved }) => {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => todayLocalISO());
  const [items, setItems] = useState<DraftItem[]>([{ title: '', guidance: '', costCodeId: null }]);
  const [saving, setSaving] = useState(false);

  const filled = items.filter((i) => i.title.trim().length > 0);

  const save = async () => {
    if (!title.trim()) { toast({ title: 'Name the inspection', variant: 'destructive' }); return; }
    if (filled.length === 0) {
      // Refused rather than created empty: a checklist with nothing on it is a stage nobody
      // checked wearing the badge of one that was.
      toast({ title: 'Add at least one thing to check', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const id = await inspectionsService.create({
        project_id: projectId,
        title: title.trim(),
        inspection_date: date || null,
        items: filled.map((i) => ({
          title: i.title.trim(),
          guidance: i.guidance.trim() || null,
          cost_code_id: i.costCodeId,
        })),
      });
      onSaved(id);
    } catch (err: any) {
      toast({ title: 'Could not start the inspection', description: err?.message, variant: 'destructive' });
      setSaving(false);
    }
  };

  const patch = (i: number, p: Partial<DraftItem>) =>
    setItems((list) => list.map((it, n) => (n === i ? { ...it, ...p } : it)));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New inspection</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pre-plaster — Plot 4" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Things to check</Label>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {items.map((it, i) => (
                <div key={i} className="space-y-1.5 rounded-md border border-hairline p-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={it.title}
                      onChange={(e) => patch(i, { title: e.target.value })}
                      placeholder="What to look at"
                    />
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setItems((l) => (l.length === 1 ? l : l.filter((_, n) => n !== i)))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Input
                    value={it.guidance}
                    onChange={(e) => patch(i, { guidance: e.target.value })}
                    placeholder="What good looks like (optional)"
                  />
                  {/* The trade rides along so a failure becomes a snag that is already coded. */}
                  <CostCodePicker
                    value={it.costCodeId}
                    onChange={(v) => patch(i, { costCodeId: v })}
                    placeholder="No trade"
                  />
                </div>
              ))}
            </div>
            <Button
              size="sm" variant="ghost"
              onClick={() => setItems((l) => [...l, { title: '', guidance: '', costCodeId: null }])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add item
            </Button>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <span className="mr-auto text-xs text-muted-foreground">
              {filled.length} item{filled.length === 1 ? '' : 's'}
            </span>
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Start inspection'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InspectionsPanel;

/**
 * Log hours against a job — from the job (#378 C6).
 *
 * Labour was enterable in exactly one place: Finance → Time & Billing, which does have a project
 * selector. But the person who knows the hours is on the project, not in the finance hub, so the
 * job's labour cost arrived by goodwill; `get_project_pnl` reads it and quietly reported whatever
 * happened to have been entered.
 *
 * `time_entries.task_id` had **no writer anywhere in the codebase**. The column exists and a DB
 * trigger enforces that it requires its project, so per-task actuals were designed for and never
 * enterable. The task picker here is that writer.
 *
 * The rate is the operator's to state, and it is NOT the employee's payroll cost — those are two
 * different numbers that this platform does not reconcile (#378 N1). Nothing here pretends
 * otherwise; the field says what it is.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Clock } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { CostCodePicker } from '@/components/business/costCodes/CostCodePicker';
import { Textarea } from '@/components/core/ui/textarea';
import { Checkbox } from '@/components/core/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { timeTrackingService } from '@/modules/finance/services/timeTrackingService';
import { projectsService, type ProjectTaskWithSubtasks } from '../services/projectsService';
import { parseDecimal } from '@/utils/decimal';
import { todayLocalISO } from '@/utils/datetime';

const NO_TASK = '__none__';

/** Hours as typed → minutes. Accepts "1.5" and "1,5"; parseDecimal owns the comma. */
function toMinutes(hours: string): number {
  const h = parseDecimal(hours);
  if (h == null || !Number.isFinite(h) || h <= 0) return 0;
  return Math.round(h * 60);
}

export const LogTimeDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  projectId: string;
  /** Pre-select a task — used when opening from a task row rather than the job's cost card. */
  taskId?: string | null;
  onLogged?: () => void;
}> = ({ open, onOpenChange, workspaceId, projectId, taskId, onLogged }) => {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<ProjectTaskWithSubtasks[]>([]);
  const [busy, setBusy] = useState(false);

  const [workDate, setWorkDate] = useState(todayLocalISO());
  const [hours, setHours] = useState('');
  const [rate, setRate] = useState('');
  const [description, setDescription] = useState('');
  const [billable, setBillable] = useState(true);
  const [task, setTask] = useState<string>(NO_TASK);
  const [costCodeId, setCostCodeId] = useState<string | null>(null);

  const reset = useCallback(() => {
    // The OPERATOR's calendar day, never UTC: `new Date().toISOString().slice(0,10)` returns
    // yesterday between local midnight and 02:00–03:00 in Greece.
    setWorkDate(todayLocalISO());
    setHours(''); setRate(''); setDescription(''); setBillable(true);
    setTask(taskId ?? NO_TASK);
  }, [taskId]);

  useEffect(() => { if (open) reset(); }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    projectsService.listTasks(projectId)
      .then((t) => { if (!cancelled) setTasks(t); })
      .catch(() => { if (!cancelled) setTasks([]); });
    return () => { cancelled = true; };
  }, [open, projectId]);

  const minutes = toMinutes(hours);
  const rateValue = parseDecimal(rate) ?? 0;
  const canSave = minutes > 0 && !!workDate && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await timeTrackingService.create(workspaceId, {
        project_id: projectId,
        // The trigger requires the project alongside it, which this always supplies.
        task_id: task === NO_TASK ? null : task,
        work_date: workDate,
        minutes,
        hourly_rate: rateValue,
        description: description.trim(),
        is_billable: billable,
        cost_code_id: costCodeId,
      });
      toast({ title: 'Time logged', description: `${(minutes / 60).toFixed(2)}h on this project.` });
      onOpenChange(false);
      onLogged?.();
    } catch (e) {
      toast({ title: 'Failed to log time', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Log time</DialogTitle>
          <DialogDescription>
            Hours worked on this job. They become labour cost on its P&amp;L, and can be billed to
            the client later from Finance → Time &amp; Billing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lt-date">Date</Label>
              <Input id="lt-date" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-hours">Hours</Label>
              <Input id="lt-hours" inputMode="decimal" placeholder="1.5" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lt-task">Task <span className="text-muted-foreground">(optional)</span></Label>
            <Select value={task} onValueChange={setTask}>
              <SelectTrigger id="lt-task"><SelectValue placeholder="No task" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TASK}>No task — the job as a whole</SelectItem>
                {tasks.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Cost code <span className="text-muted-foreground">(optional)</span></Label>
            <CostCodePicker value={costCodeId} onChange={setCostCodeId} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lt-rate">Charge rate per hour</Label>
            <Input id="lt-rate" inputMode="decimal" placeholder="0.00" value={rate} onChange={(e) => setRate(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              What this hour is worth on the job. Not the employee&apos;s payroll cost — the two are
              separate numbers and this does not reconcile them.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lt-desc">What was done</Label>
            <Textarea id="lt-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-hairline px-3 py-2">
            <span className="text-xs">Billable to the client</span>
            <Checkbox checked={billable} onCheckedChange={(v) => setBillable(v === true)} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Log time
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

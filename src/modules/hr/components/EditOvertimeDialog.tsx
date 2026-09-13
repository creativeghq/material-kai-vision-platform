/**
 * Correct an overtime entry that has not been filed yet (#409).
 *
 * `hrService.updateOvertime` and its edge action existed with zero callers, so a mistyped
 * overtime entry could only be deleted. Once it IS filed the record is locked in `submitted` by
 * the draft|submitted|failed CHECK — the way out of that is Ergani → Cancel, which withdraws the
 * filing at the ministry and releases the row back to draft.
 */
import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { hrService, type Overtime } from '../services/hrService';

export function EditOvertimeDialog({
  workspaceId, entry, onClose, onDone,
}: {
  workspaceId: string;
  entry: Overtime;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [date, setDate] = useState(entry.work_date ?? '');
  const [start, setStart] = useState((entry.start_time ?? '').slice(0, 5));
  const [end, setEnd] = useState((entry.end_time ?? '').slice(0, 5));
  const [reason, setReason] = useState(entry.reason ?? '');
  const [note, setNote] = useState(entry.note ?? '');
  const [saving, setSaving] = useState(false);

  // Mirrors the SQL generated column so the operator sees the number the row will carry.
  const hours = useMemo(() => {
    if (!start || !end || end <= start) return null;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
  }, [start, end]);

  const save = async () => {
    if (!date) { toast({ title: 'Date is required', variant: 'destructive' }); return; }
    if (!start || !end || end <= start) {
      toast({ title: 'End time must be after start time', variant: 'destructive' });
      return;
    }
    if (!reason.trim()) {
      toast({
        title: 'Reason is required',
        description: 'Ergani rejects an overtime declaration without a justification.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      await hrService.updateOvertime(workspaceId, {
        id: entry.id,
        work_date: date,
        start_time: start,
        end_time: end,
        reason: reason.trim(),
        note: note.trim() || null,
      });
      toast({ title: 'Overtime updated' });
      onDone();
    } catch (e) {
      toast({ title: 'Could not update', description: (e as Error).message, variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit overtime</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Date *</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1"><Label>From *</Label><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1"><Label>To *</Label><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">
            {hours == null ? 'Overtime is declared within a single work date.' : `${hours.toFixed(2)} hours.`}
          </p>
          <div className="space-y-1">
            <Label>Reason *</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. urgent customer delivery" />
          </div>
          <div className="space-y-1">
            <Label>Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Correct a separation that has not been filed yet (#409).
 *
 * `hrService.updateSeparation` and its edge action existed with zero callers, so a wrong
 * separation could only be deleted. Once it IS filed the row is locked in `submitted` by the
 * draft|submitted|failed CHECK — the way out is Ergani → Cancel, which withdraws the filing at
 * the ministry and releases the record back to draft.
 */
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  hrService, type Separation, type SeparationType, SEPARATION_TYPE_LABELS,
} from '../services/hrService';

const SEPARATION_TYPES = Object.keys(SEPARATION_TYPE_LABELS) as SeparationType[];

export function EditSeparationDialog({
  workspaceId, separation, onClose, onDone,
}: {
  workspaceId: string;
  separation: Separation;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<SeparationType>(separation.separation_type);
  const [effective, setEffective] = useState(separation.effective_date ?? '');
  const [notice, setNotice] = useState(separation.notice_date ?? '');
  const [reason, setReason] = useState(separation.reason ?? '');
  const [severance, setSeverance] = useState(
    separation.severance_amount == null ? '' : String(separation.severance_amount),
  );
  const [note, setNote] = useState(separation.note ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!effective) { toast({ title: 'Effective date is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await hrService.updateSeparation(workspaceId, {
        id: separation.id,
        separation_type: type,
        effective_date: effective,
        notice_date: notice || null,
        reason: reason.trim() || null,
        severance_amount: severance.trim() === '' ? null : Number(severance),
        note: note.trim() || null,
      });
      toast({ title: 'Separation updated' });
      onDone();
    } catch (e) {
      toast({ title: 'Could not update', description: (e as Error).message, variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit separation</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Type *</Label>
            <Select value={type} onValueChange={(v) => setType(v as SeparationType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEPARATION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{SEPARATION_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Effective *</Label>
              <Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Notice given</Label>
              <Input type="date" value={notice} onChange={(e) => setNotice(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Reason</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Severance</Label>
              <Input inputMode="decimal" value={severance} onChange={(e) => setSeverance(e.target.value)} />
            </div>
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

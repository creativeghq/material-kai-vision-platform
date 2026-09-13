/**
 * The contract's retention terms, and the event that opens the release schedule (#408).
 *
 * `projects.retention_percent` defaults to 0 and NOTHING in the codebase ever wrote it, so every
 * valuation deducted €0, `get_project_retention` always reported nothing held, and the tranche
 * button threw "Set the practical completion date first" on every project — while the card told
 * the operator to set a date no control could set. A default of 0 is a valid number and an empty
 * release schedule is a valid schedule, which is why nothing caught it.
 */
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { applicationsService, type RetentionTerms } from '../services/applicationsService';

const num = (v: string, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const RetentionTermsDialog: React.FC<{
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ projectId, onClose, onSaved }) => {
  const { toast } = useToast();
  const [terms, setTerms] = useState<RetentionTerms | null>(null);
  const [percent, setPercent] = useState('');
  const [cap, setCap] = useState('');
  const [defects, setDefects] = useState('');
  const [pc, setPc] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    applicationsService.getRetentionTerms(projectId)
      .then((t) => {
        if (!alive) return;
        setTerms(t);
        setPercent(String(t.retention_percent ?? 0));
        setCap(String(t.retention_cap_percent ?? 5));
        setDefects(String(t.defects_period_months ?? 12));
        setPc(t.practical_completion_on ?? '');
      })
      .catch((e) => toast({
        title: 'Could not read the retention terms',
        description: (e as Error).message,
        variant: 'destructive',
      }));
    return () => { alive = false; };
  }, [projectId, toast]);

  const save = async () => {
    const pct = num(percent, 0);
    const capPct = num(cap, 5);
    if (pct < 0 || pct > 100 || capPct < 0 || capPct > 100) {
      toast({ title: 'Percentages run 0–100', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await applicationsService.setRetentionTerms(projectId, {
        retention_percent: pct,
        retention_cap_percent: capPct,
        defects_period_months: Math.max(0, Math.round(num(defects, 12))),
        // Practical completion is the EVENT that opens the release schedule, not a settings
        // field: the two standard tranches are dated from it. Blank means it has not happened.
        practical_completion_on: pc || null,
      });
      onSaved();
    } catch (e) {
      toast({ title: 'Could not save the terms', description: (e as Error).message, variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Retention terms</DialogTitle></DialogHeader>
        {!terms ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Retention %</Label>
                <Input inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">Deducted from every valuation.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Capped at % of contract</Label>
                <Input inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">Deduction stops once this is held.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Defects period (months)</Label>
                <Input inputMode="numeric" value={defects} onChange={(e) => setDefects(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Practical completion</Label>
                <Input type="date" value={pc} onChange={(e) => setPc(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">
                  The two standard releases are dated from this — half on the day, half at the end
                  of the defects period.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

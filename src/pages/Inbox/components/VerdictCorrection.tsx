import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';

/** "Is this right?" under one AI verdict: confirming or correcting it records an outcome for calibration. */
export const VerdictCorrection: React.FC<{
  current: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onRecord: (value: string) => Promise<unknown>;
  resetKey?: string;
}> = ({ current, options, onRecord, resetKey }) => {
  const { toast } = useToast();
  const [recorded, setRecorded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRecorded(null); }, [resetKey, current]);

  if (recorded) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Check className="h-3 w-3" />
        {recorded === current ? 'Confirmed' : `Corrected to ${options.find((o) => o.value === recorded)?.label ?? recorded}`}
      </span>
    );
  }

  const pick = async (value: string) => {
    setBusy(true);
    try {
      await onRecord(value);
      setRecorded(value);
    } catch (e) {
      toast({ title: 'Could not record that', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Select value="" onValueChange={(v) => { void pick(v); }} disabled={busy}>
      <SelectTrigger className="h-6 w-auto gap-1 px-2 text-[11px]" aria-label="Is this right?">
        <SelectValue placeholder="Is this right?" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={current} className="text-xs">Yes, it is correct</SelectItem>
        {options.filter((o) => o.value !== current).map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">No — {o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

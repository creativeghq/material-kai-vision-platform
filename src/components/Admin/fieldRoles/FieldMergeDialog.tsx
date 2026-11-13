import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import {
  Command, CommandEmpty, CommandInput, CommandItem, CommandList,
} from '@/components/core/ui/command';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface MergeCandidate {
  field_name: string;
  display_name: string | null;
  destination: string;
  products: number;
}

interface MergeReport {
  products: number;
  moved: number;
  equal: number;
  conflicts: number;
}

interface Props {
  loser: MergeCandidate | null;
  fields: readonly MergeCandidate[];
  onClose: () => void;
  onMerged: () => void;
}

/** Retire one field into another: its values move, its name becomes the survivor's alias. */
export const FieldMergeDialog: React.FC<Props> = ({ loser, fields, onClose, onMerged }) => {
  const { toast } = useToast();
  const [survivor, setSurvivor] = useState<MergeCandidate | null>(null);
  const [preview, setPreview] = useState<MergeReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setSurvivor(null); setPreview(null); setError(null); }, [loser]);

  const run = async (apply: boolean) => {
    if (!loser || !survivor) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('merge_metadata_field', {
      p_loser: loser.field_name, p_survivor: survivor.field_name, p_apply: apply,
    });
    setBusy(false);
    if (err) { setError(err.message); setPreview(null); return; }
    const report = data as MergeReport;
    if (!apply) { setPreview(report); return; }
    toast({
      title: `${loser.field_name} merged into ${survivor.field_name}`,
      description: report.conflicts > 0
        ? `${report.conflicts} product(s) hold two different values; resolve them under Conflicts.`
        : `${report.moved} value(s) moved, ${report.equal} already matched.`,
    });
    onMerged();
    onClose();
  };

  const options = fields.filter(f => f.field_name !== loser?.field_name && f.destination === loser?.destination);

  return (
    <Dialog open={!!loser} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge {loser?.display_name || loser?.field_name}</DialogTitle>
          <DialogDescription>
            Pick the field that already means the same thing. Values move only where that field is empty;
            two different values on one product are kept and listed for you to decide.
          </DialogDescription>
        </DialogHeader>

        <Command className="border border-hairline rounded-sm">
          <CommandInput placeholder="Search fields…" />
          <CommandList className="max-h-56">
            <CommandEmpty>No field matches that search.</CommandEmpty>
            {options.map(f => (
              <CommandItem
                key={f.field_name}
                value={`${f.field_name} ${f.display_name ?? ''}`}
                onSelect={() => { setSurvivor(f); setPreview(null); setError(null); }}
                className={survivor?.field_name === f.field_name ? 'bg-surface-sunken' : undefined}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate">{f.display_name || f.field_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{f.field_name}</div>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{f.products} products</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>

        {survivor && (
          <div className="text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Into:</span> {survivor.display_name || survivor.field_name}{' '}
              <span className="text-xs text-muted-foreground">({survivor.field_name})</span>
            </div>
            {preview && (
              <div className="text-muted-foreground">
                {preview.products} product(s): {preview.moved} move, {preview.equal} already match,{' '}
                <span className={preview.conflicts > 0 ? 'text-warning' : undefined}>{preview.conflicts} conflict(s)</span>.
              </div>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {preview ? (
            <Button disabled={busy} onClick={() => run(true)}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Merge
            </Button>
          ) : (
            <Button disabled={!survivor || busy} onClick={() => run(false)}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Preview
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

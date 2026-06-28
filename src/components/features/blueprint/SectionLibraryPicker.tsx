import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Layers } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/core/ui/dialog';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { blueprintsService } from '@/services/blueprintsService';

/**
 * Pick a single premade section (e.g. "Electrical", "Plumbing — bathrooms") from
 * the starter-blueprint library to append to a plan. Used by the project Plan tab
 * and the public estimator, so a project can be built from parts rather than only
 * by importing a whole blueprint. Reads starter sections (RLS-readable by anon too).
 */
interface SectionLibraryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (blueprintId: string, sectionId: string, label: string) => void;
}

type Lib = Awaited<ReturnType<typeof blueprintsService.getSectionLibrary>>;

export function SectionLibraryPicker({ open, onOpenChange, onPick }: SectionLibraryPickerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [lib, setLib] = useState<Lib>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    blueprintsService.getSectionLibrary()
      .then(setLib)
      .catch((e) => toast({ title: 'Failed to load sections', description: String((e as Error)?.message ?? e), variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [open, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Layers className="h-4 w-4" /> Add a section from the library</DialogTitle>
          <DialogDescription>Drop in a ready-made section of works. You can edit its rows after.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {lib.map((bp) => (
              <div key={bp.blueprintId} className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">{bp.blueprintTitle}</div>
                <div className="grid grid-cols-1 gap-1.5">
                  {bp.sections.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { onPick(bp.blueprintId, s.id, s.label); onOpenChange(false); }}
                      className="w-full text-left rounded-lg border border-border px-3 py-2 hover:bg-muted/40 transition flex items-center gap-2"
                    >
                      <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm flex-1">{s.label}</span>
                      <Badge variant="outline" className="text-[10px] h-4">{s.taskCount} {s.taskCount === 1 ? 'row' : 'rows'}</Badge>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {lib.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">No library sections available.</div>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

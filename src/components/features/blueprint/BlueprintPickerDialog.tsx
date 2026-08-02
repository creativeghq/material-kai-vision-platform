import React, { useEffect, useState } from 'react';
import { Loader2, LayoutTemplate, Sparkles } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/core/ui/dialog';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { blueprintsService, type Blueprint } from '@/services/blueprintsService';

/**
 * Pick a blueprint to import into a project plan. Shows the workspace's own
 * blueprints + platform starters (badged). onPick receives the blueprint id.
 */
interface BlueprintPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onPick: (blueprintId: string) => void;
}

export function BlueprintPickerDialog({ open, onOpenChange, workspaceId, onPick }: BlueprintPickerDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    blueprintsService.list({ includeStarters: true })
      .then(setBlueprints)
      .catch((e) => toast({ title: 'Failed to load blueprints', description: String(e?.message ?? e), variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [open, toast]);

  const own = blueprints.filter((b) => b.workspace_id === workspaceId && !b.is_platform_starter);
  const starters = blueprints.filter((b) => b.is_platform_starter);

  const renderRow = (b: Blueprint) => (
    <button
      key={b.id}
      onClick={() => { onPick(b.id); onOpenChange(false); }}
      className="w-full text-left rounded-lg border border-border p-3 hover:bg-muted/40 transition flex items-start gap-3"
    >
      <LayoutTemplate className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-medium flex items-center gap-2">
          {b.title}
          {b.is_platform_starter && <Badge variant="outline" className="text-[10px] h-4">Starter</Badge>}
        </div>
        {b.description && <div className="text-xs text-muted-foreground line-clamp-2">{b.description}</div>}
      </div>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import a Blueprint</DialogTitle>
          <DialogDescription>Start the plan from a reusable scope-of-works template. You can edit everything after.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {own.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Your blueprints</div>
                {own.map(renderRow)}
              </div>
            )}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Starter blueprints
              </div>
              {starters.length ? starters.map(renderRow) : <div className="text-xs text-muted-foreground">No starters available.</div>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

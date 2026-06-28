import React, { useEffect, useState } from 'react';
import { Loader2, History, RotateCcw } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { projectPlansService, type ProjectPlanVersion } from '@/services/projectPlansService';

interface PlanVersionHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  onRestored: () => void;
}

export function PlanVersionHistory({ open, onOpenChange, planId, onRestored }: PlanVersionHistoryProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [versions, setVersions] = useState<ProjectPlanVersion[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    projectPlansService.listVersions(planId)
      .then(setVersions)
      .catch((e) => toast({ title: 'Failed to load versions', description: String(e?.message ?? e), variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [open, planId, toast]);

  const restore = async (version: number) => {
    setRestoring(version);
    try {
      await projectPlansService.restoreVersion(planId, version);
      toast({ title: `Restored version ${version}` });
      onRestored();
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Restore failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setRestoring(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Version history</DialogTitle>
          <DialogDescription>Restore a previously saved snapshot of this plan.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : versions.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground text-center">No saved versions yet. Use “Save version” to snapshot the plan.</div>
        ) : (
          <div className="space-y-2 max-h-[55vh] overflow-y-auto">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">Version {v.version}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {new Date(v.created_at).toLocaleString()}{v.note ? ` · ${v.note}` : ''}
                  </div>
                </div>
                <Button variant="outline" size="sm" className="rounded-full" disabled={restoring !== null} onClick={() => restore(v.version)}>
                  {restoring === v.version ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore</>}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

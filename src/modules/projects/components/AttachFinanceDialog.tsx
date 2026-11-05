/** Pick an unattached invoice or supplier bill for this project. Attaching only stamps project_id. */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { formatMoney } from '@/utils/decimal';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { projectsService } from '../services/projectsService';

export const AttachFinanceDialog: React.FC<{
  projectId: string;
  direction: 'receivable' | 'payable';
  onClose: () => void;
  onAttached: () => void;
}> = ({ projectId, direction, onClose, onAttached }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const noun = direction === 'receivable' ? 'invoice' : 'supplier bill';

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const { receivables, payables } = await projectsService.listAttachableFinance(projectId);
      setCandidates(direction === 'receivable' ? receivables : payables);
    } catch {
      setFailed(true);
    } finally { setLoading(false); }
  }, [projectId, direction]);
  useEffect(() => { void load(); }, [load]);

  const attach = async (c: any) => {
    setBusy(c.id);
    try {
      await projectsService.setFinanceAttachment(c.kind, c.id, projectId);
      toast({ title: 'Attached' });
      onAttached();
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); setBusy(null); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Attach a {noun}</DialogTitle></DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : failed ? (
          <div className="py-4 text-sm text-amber-800 dark:text-amber-300">
            <p>The {noun}s could not be loaded, so we cannot say whether any are unattached.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>Try again</Button>
          </div>
        ) : candidates.length === 0 ? (
          <HubEmptyState
            title={`No unattached ${noun}s found`}
            description={direction === 'receivable'
              ? 'Every invoice for this client is already on a project.'
              : 'Every supplier bill in this workspace is already on a project.'}
          />
        ) : (
          <div className="max-h-72 overflow-auto rounded-sm border border-hairline divide-y divide-hairline">
            {candidates.map((c, i) => (
              <React.Fragment key={`${c.kind}-${c.id}`}>
                {direction === 'payable' && !c.related && (i === 0 || candidates[i - 1]?.related) && (
                  <p className="px-3 py-2 text-[11px] text-muted-foreground bg-surface-sunken">
                    Other unattached bills in this workspace
                  </p>
                )}
                <div className="p-3 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.label || c.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{c.status}</p>
                  </div>
                  <span className="text-sm tabular-nums">{formatMoney(c.total, c.currency ?? 'EUR')}</span>
                  <Button size="sm" variant="outline" onClick={() => attach(c)} disabled={busy === c.id}>
                    {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Attach'}
                  </Button>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

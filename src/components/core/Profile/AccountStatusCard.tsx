/**
 * Profile → Disable this account (#333).
 *
 * The platform never deletes. Disabling is the wind-down, and it has one consequence people do
 * NOT expect: **the customers move to the operator immediately and re-enabling does not bring
 * them back.** So this card states that before the button, requires the account name to be typed,
 * and is equally explicit about what is preserved — the invoices stay, and stay readable, which is
 * usually the thing someone is actually worried about when they hesitate here.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { PowerOff, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { workspaceLifecycleService } from '@/services/workspaceLifecycleService';
import { formatDate } from '@/utils/datetime';

export const AccountStatusCard: React.FC = () => {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { toast } = useToast();

  const [status, setStatus] = useState<string>('active');
  const [disabledAt, setDisabledAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const workspaceName = activeWorkspace?.name ?? '';

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const s = await workspaceLifecycleService.status(activeWorkspaceId);
      setStatus(s?.status ?? 'active');
      setDisabledAt(s?.disabled_at ?? null);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => { void load(); }, [load]);

  const disable = async () => {
    if (!activeWorkspaceId) return;
    setBusy(true);
    try {
      const res = await workspaceLifecycleService.disable(activeWorkspaceId, reason || undefined);
      toast({
        title: 'Account disabled',
        description: `${(res.companies_rehomed ?? 0) + (res.contacts_rehomed ?? 0)} customer record(s) moved to the operator. Your invoices stay here and remain readable.`,
      });
      setOpen(false);
      setConfirmName('');
      await load();
    } catch (err) {
      toast({ title: 'Could not disable the account', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (!activeWorkspaceId || loading) return null;

  if (status === 'disabled') {
    return (
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle className="flex items-center gap-2 text-amber-500">
            <PowerOff className="h-4 w-4" /> This account is disabled
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-5 text-sm">
          <p className="text-muted-foreground">
            Disabled{disabledAt ? ` on ${formatDate(disabledAt)}` : ''}. Your customers were
            moved to the operator. No new invoices, quotes or orders can be created.
          </p>
          <p className="flex items-start gap-1.5 text-xs text-emerald-500">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Your invoices, credit notes and delivery notes are still here and still readable — nothing was deleted.
          </p>
          <p className="text-xs text-muted-foreground">
            Contact the operator to re-enable. Note that re-enabling does not move your customers back.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2"><PowerOff className="h-4 w-4" /> Disable this account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5 text-sm">
        <p className="text-muted-foreground">
          Winding down? Disabling stops new invoices, quotes and orders. <strong>Nothing is deleted.</strong>
        </p>
        <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
          <li>Your <strong>invoices, credit notes and delivery notes stay here</strong> and stay readable — you and your team keep full access to them.</li>
          <li>Your <strong>customers move to the operator immediately</strong>, and re-enabling does not move them back.</li>
          <li>Only the operator can re-enable the account afterwards.</li>
        </ul>
        <Button variant="outline" className="rounded-full text-destructive" onClick={() => setOpen(true)}>
          <PowerOff className="mr-1 h-4 w-4" /> Disable account
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Disable “{workspaceName}”?
            </DialogTitle>
            <DialogDescription>
              Your customers move to the operator the moment you confirm, and re-enabling will not bring
              them back. Your fiscal documents stay here and stay readable.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Reason (optional)</Label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. closing the business" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type <strong>{workspaceName}</strong> to confirm</Label>
              <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              className="rounded-full"
              disabled={busy || confirmName.trim() !== workspaceName.trim()}
              onClick={disable}
            >
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Disable account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

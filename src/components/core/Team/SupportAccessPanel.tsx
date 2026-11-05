import React, { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Label } from '@/components/core/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/core/errors/utils';
import {
  supportAccessService, formatTimeLeft, SUPPORT_ACCESS_DURATIONS, SUPPORT_PIN_VALIDITIES,
  DEFAULT_SUPPORT_ACCESS_MINUTES, DEFAULT_SUPPORT_PIN_MINUTES, type WorkspaceSupportMember,
} from '@/services/supportAccessService';

interface Props {
  workspaceId: string;
  members: { user_id: string; full_name: string | null; email: string | null }[];
  onChanged: () => void;
}

export const SupportAccessPanel: React.FC<Props> = ({ workspaceId, members, onChanged }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<WorkspaceSupportMember[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [approving, setApproving] = useState<WorkspaceSupportMember | null>(null);
  const [accessMinutes, setAccessMinutes] = useState<number>(DEFAULT_SUPPORT_ACCESS_MINUTES);
  const [pinMinutes, setPinMinutes] = useState<number>(DEFAULT_SUPPORT_PIN_MINUTES);
  const [issued, setIssued] = useState<{ pin: string; validFor: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await supportAccessService.list(workspaceId));
    } catch (err) {
      toast({ title: 'Could not load support access', description: getErrorMessage(err), variant: 'destructive' });
    }
  }, [workspaceId, toast]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const nameOf = (userId: string) => {
    const m = members.find((x) => x.user_id === userId);
    return m?.full_name || m?.email || 'Support member';
  };

  const closeDialog = () => { setApproving(null); setIssued(null); };

  const issuePin = async () => {
    if (!approving?.request) return;
    setBusy('approve');
    try {
      const res = await supportAccessService.approve(approving.request.id, accessMinutes, pinMinutes);
      if (!res.ok) throw new Error('This request is no longer open.');
      setIssued({
        pin: res.pin,
        validFor: SUPPORT_PIN_VALIDITIES.find((p) => p.minutes === pinMinutes)?.label ?? `${pinMinutes} minutes`,
      });
      void load();
    } catch (err) {
      toast({ title: 'Could not create the PIN', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const deny = async (row: WorkspaceSupportMember) => {
    if (!row.request) return;
    setBusy(`deny-${row.user_id}`);
    try {
      await supportAccessService.deny(row.request.id);
      toast({ title: 'Request denied' });
      void load();
    } catch (err) {
      toast({ title: 'Could not deny the request', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const end = async (row: WorkspaceSupportMember) => {
    if (!window.confirm(`End access for ${nameOf(row.user_id)} now? They will need a new PIN to come back.`)) return;
    setBusy(`end-${row.user_id}`);
    try {
      const ok = await supportAccessService.end(workspaceId, row.user_id);
      if (!ok) throw new Error('You do not have permission to end this access.');
      toast({ title: 'Support access ended' });
      void load();
      onChanged();
    } catch (err) {
      toast({ title: 'Could not end access', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Support Access ({rows.length})</CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          Support members lose access when their time ends. To let one back in, create a PIN and give it to them yourself.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/40">
          {rows.map((row) => (
            <div key={row.user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{nameOf(row.user_id)}</div>
                <div className="pt-1">
                  {row.active
                    ? <Badge variant="success">{formatTimeLeft(row.seconds_left)} left</Badge>
                    : row.request?.status === 'pending'
                      ? <Badge variant="warning">Asking to Come Back In</Badge>
                      : row.request?.status === 'approved'
                        ? <Badge variant="info">PIN valid for {formatTimeLeft(row.request.pin_seconds_left ?? 0)}</Badge>
                        : <Badge variant="neutral">Access Ended</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {row.active && (
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => end(row)}>End access</Button>
                )}
                {!row.active && row.request && (
                  <>
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => deny(row)}>Deny</Button>
                    <Button size="sm" disabled={!!busy} onClick={() => { setIssued(null); setApproving(row); }}>
                      {row.request.status === 'approved' ? 'Create new PIN' : 'Approve'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={!!approving} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{approving ? `Let ${nameOf(approving.user_id)} back in` : 'Approve'}</DialogTitle>
            <DialogDescription>
              {issued
                ? 'Give them this PIN yourself. It is shown only once.'
                : 'A 6-digit PIN will be created for you to give them. Their time starts when they enter it.'}
            </DialogDescription>
          </DialogHeader>
          {issued ? (
            <div className="space-y-3 text-center">
              <div className="text-3xl font-semibold tabular-nums tracking-[0.3em]">{issued.pin}</div>
              <p className="text-xs text-muted-foreground">Works once, for the next {issued.validFor}.</p>
              <Button
                size="sm" variant="outline"
                onClick={() => { void navigator.clipboard.writeText(issued.pin); toast({ title: 'Copied' }); }}
              >
                <Copy className="h-4 w-4 mr-2" /> Copy PIN
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Access Lasts</Label>
                <Select value={String(accessMinutes)} onValueChange={(v) => setAccessMinutes(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORT_ACCESS_DURATIONS.map((d) => (
                      <SelectItem key={d.minutes} value={String(d.minutes)}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>PIN expires after</Label>
                <Select value={String(pinMinutes)} onValueChange={(v) => setPinMinutes(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORT_PIN_VALIDITIES.map((p) => (
                      <SelectItem key={p.minutes} value={String(p.minutes)}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            {issued ? (
              <Button onClick={closeDialog}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button onClick={issuePin} disabled={busy === 'approve'}>
                  {busy === 'approve' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create PIN
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/core/errors/utils';
import { ACTIVE_WORKSPACE_KEY } from '@/utils/activeWorkspace';
import {
  supportAccessService, formatTimeLeft, type MySupportAccess, type RedeemPinResult,
} from '@/services/supportAccessService';

const dismissedKey = (userId: string) => `mk_support_gate_dismissed_${userId}`;

function readDismissed(userId: string | null): string[] {
  if (!userId) return [];
  try { return JSON.parse(sessionStorage.getItem(dismissedKey(userId)) ?? '[]') as string[]; } catch { return []; }
}

function pinErrorText(res: Extract<RedeemPinResult, { ok: false }>): string {
  switch (res.error) {
    case 'format': return 'Enter the 6 digits of the PIN.';
    case 'wrong_pin': return `That PIN is not right. ${res.attempts_left ?? 0} tries left.`;
    case 'locked': return 'Too many wrong tries. This PIN no longer works, so request approval again.';
    case 'expired': return 'This PIN has expired. Request approval again.';
    default: return 'There is no PIN waiting for you. Request approval again.';
  }
}

export const SupportAccessGate: React.FC = () => {
  const { user, signOut } = useAuth();
  const { activeWorkspaceId, memberships, loading: workspaceLoading, refresh } = useWorkspace();
  const { toast } = useToast();
  const userId = user?.id ?? null;

  const [rows, setRows] = useState<MySupportAccess[]>([]);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activeIds = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const next = await supportAccessService.mine();
      const lostAccess = [...activeIds.current].some((id) => !next.some((r) => r.workspace_id === id && r.active));
      activeIds.current = new Set(next.filter((r) => r.active).map((r) => r.workspace_id));
      setRows(next);
      setFetchedAt(Date.now());
      if (lostAccess) await refresh();
    } catch {
      setRows((prev) => prev);
    }
  }, [userId, refresh]);

  useEffect(() => {
    setDismissed(readDismissed(userId));
    if (!userId) {
      activeIds.current = new Set();
      setRows([]);
    }
  }, [userId]);

  useEffect(() => {
    if (userId && !workspaceLoading) void load();
  }, [userId, workspaceLoading, memberships, load]);

  const waiting = rows.some((r) => !r.active && (r.request?.status === 'pending' || r.request?.status === 'approved'));
  const hasRows = rows.length > 0;

  useEffect(() => {
    if (!hasRows) return undefined;
    const poll = window.setInterval(() => { void load(); }, waiting ? 15_000 : 60_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => { window.clearInterval(poll); window.clearInterval(tick); };
  }, [hasRows, waiting, load]);

  const elapsed = Math.max(0, (now - fetchedAt) / 1000);
  const hasRunOut = rows.some((r) => r.active && r.seconds_left - elapsed <= 0);
  useEffect(() => {
    if (hasRunOut) void load();
  }, [hasRunOut, load]);

  const ended = rows.filter((r) => !r.active);
  const current = ended.find((r) => !dismissed.includes(r.workspace_id)) ?? null;
  const reopenable = ended.filter((r) => dismissed.includes(r.workspace_id));
  const activeHere = rows.find((r) => r.active && r.workspace_id === activeWorkspaceId) ?? null;

  const saveDismissed = (next: string[]) => {
    setDismissed(next);
    if (!userId) return;
    try { sessionStorage.setItem(dismissedKey(userId), JSON.stringify(next)); } catch { /* private mode */ }
  };
  const dismiss = (workspaceId: string) => saveDismissed([...dismissed, workspaceId]);
  const reopen = (workspaceId: string) => saveDismissed(dismissed.filter((id) => id !== workspaceId));

  const request = async (workspaceId: string) => {
    setBusy(true);
    setPinError(null);
    try {
      const res = await supportAccessService.requestAccess(workspaceId);
      if (res.ok === false) {
        toast({
          title: res.error === 'too_many' ? 'Too many requests' : 'Could not send the request',
          description: res.error === 'too_many' ? 'Please wait before asking again, or contact the workspace owner directly.' : undefined,
          variant: 'destructive',
        });
      } else if (res.notified === 0) {
        toast({
          title: 'Nobody could be notified',
          description: 'Your request is saved, but no owner or admin was told. Please contact them directly.',
          variant: 'destructive',
        });
      }
      await load();
    } catch (err) {
      toast({ title: 'Could not send the request', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const submitPin = async (workspaceId: string) => {
    if (!userId) return;
    setBusy(true);
    setPinError(null);
    try {
      const res = await supportAccessService.redeemPin(workspaceId, pin.trim());
      if (res.ok === false) {
        setPinError(pinErrorText(res));
        await load();
        return;
      }
      setPin('');
      try { localStorage.setItem(ACTIVE_WORKSPACE_KEY(userId), workspaceId); } catch { /* private mode */ }
      await load();
      await refresh();
      toast({ title: 'You are back in', description: `Access lasts ${formatTimeLeft(res.seconds_left)}.` });
    } catch (err) {
      setPinError(getErrorMessage(err));
    } finally { setBusy(false); }
  };

  if (!userId) return null;

  if (current) {
    const status = current.request?.status;
    const pinOpen = status === 'approved';
    const pinLeft = Math.max(0, (current.request?.pin_seconds_left ?? 0) - elapsed);
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="border-b border-border/60 px-5 py-3">
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Your access has ended</CardTitle>
            <p className="text-xs text-muted-foreground pt-1">
              Your support access to {current.workspace_name} is over. An owner or admin of the workspace has to let you back in.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            {status === 'pending' && (
              <p className="text-sm">
                Your request was sent. Once it is approved, they will give you a 6-digit PIN to enter here.
              </p>
            )}
            {status === 'denied' && <p className="text-sm">Your last request was denied. You can ask again.</p>}
            {status === 'locked' && <p className="text-sm">Too many wrong PIN tries closed your last request. You can ask again.</p>}
            {status === 'expired' && <p className="text-sm">Your last PIN or request expired. You can ask again.</p>}

            {pinOpen && (
              <form
                className="space-y-2"
                onSubmit={(e) => { e.preventDefault(); void submitPin(current.workspace_id); }}
              >
                <Label htmlFor="support-access-pin">6-digit PIN</Label>
                <Input
                  id="support-access-pin" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                  value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                />
                <p className="text-xs text-muted-foreground">
                  Your request was approved. Ask the person who approved it for the PIN. It expires in {formatTimeLeft(pinLeft)}.
                </p>
                {pinError && <p className="text-xs text-destructive">{pinError}</p>}
                <Button type="submit" disabled={busy || pin.length !== 6} className="w-full">
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Enter workspace
                </Button>
              </form>
            )}

            {!pinOpen && status !== 'pending' && (
              <>
                {pinError && <p className="text-xs text-destructive">{pinError}</p>}
                <Button className="w-full" disabled={busy} onClick={() => request(current.workspace_id)}>
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Request Approval to Enter Workspace
                </Button>
              </>
            )}

            {memberships.length > 0 ? (
              <Button variant="ghost" className="w-full" onClick={() => dismiss(current.workspace_id)}>
                Not now
              </Button>
            ) : (
              <Button variant="ghost" className="w-full" onClick={() => { void signOut(); }}>
                Sign out
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (reopenable.length > 0) {
    return (
      <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2 lg:bottom-4">
        {reopenable.map((r) => (
          <Button key={r.workspace_id} size="sm" variant="outline" className="bg-card" onClick={() => reopen(r.workspace_id)}>
            <KeyRound className="h-4 w-4 mr-2" /> Request access to {r.workspace_name}
          </Button>
        ))}
      </div>
    );
  }

  if (activeHere) {
    return (
      <div className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-sm border border-hairline bg-card px-3 py-2 text-xs shadow-overlay lg:bottom-4">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span>Support access: {formatTimeLeft(activeHere.seconds_left - elapsed)} left</span>
      </div>
    );
  }

  return null;
};

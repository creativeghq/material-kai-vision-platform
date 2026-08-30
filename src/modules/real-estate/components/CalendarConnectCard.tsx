import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { useToast } from '@/hooks/use-toast';
import { realEstateService } from '../services/realEstateService';

/**
 * Connect the agent's own Google Calendar so viewings land on their phone.
 *
 * Per-user, not per-workspace: it is their Google account and their calendar. The card stays quiet
 * when the platform has no Google credentials configured — telling every agent to connect something
 * the operator hasn't set up is just noise they can't act on.
 */
export const CalendarConnectCard: React.FC<{ ws: string | null }> = ({ ws }) => {
  const { toast } = useToast();
  const [state, setState] = useState<{ connected: boolean; google_email: string | null; last_sync_error: string | null; configured: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!ws) return;
    try { setState(await realEstateService.calendarStatus(ws)); } catch { setState(null); }
  }, [ws]);
  useEffect(() => { void load(); }, [load]);

  // The OAuth callback redirects back here with ?calendar=… — surface the outcome rather than
  // silently landing the user on an unchanged screen.
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get('calendar');
    if (!r) return;
    if (r === 'connected') toast({ title: 'Google Calendar connected' });
    else toast({ title: 'Could not connect Google Calendar', description: r.replace(/_/g, ' '), variant: 'destructive' });
    const url = new URL(window.location.href);
    url.searchParams.delete('calendar');
    window.history.replaceState({}, '', url.toString());
    void load();
  }, [load, toast]);

  const connect = async () => {
    if (!ws) return;
    setBusy(true);
    try { const { auth_url } = await realEstateService.calendarConnect(ws); window.location.href = auth_url; }
    catch (e) { toast({ title: 'Could not start', description: (e as Error).message, variant: 'destructive' }); setBusy(false); }
  };
  const disconnect = async () => {
    if (!ws) return;
    setBusy(true);
    try { await realEstateService.calendarDisconnect(ws); await load(); toast({ title: 'Disconnected' }); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  if (!state?.configured) return null;

  return (
    <Card><CardContent className="flex flex-wrap items-center gap-3 p-4">
      <CalendarCheck className={`h-4 w-4 ${state.connected ? 'text-emerald-700 dark:text-emerald-500' : 'text-muted-foreground'}`} />
      <div className="min-w-0">
        <div className="text-sm font-medium">Google Calendar</div>
        <div className="text-xs text-muted-foreground">
          {state.connected
            ? <>Viewings sync to {state.google_email || 'your calendar'}.</>
            : <>Connect so viewings appear on your phone.</>}
        </div>
        {state.last_sync_error && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" /> Last sync failed: {state.last_sync_error}
          </div>
        )}
      </div>
      <div className="ml-auto">
        {state.connected
          ? <Button size="sm" variant="ghost" disabled={busy} onClick={disconnect}>Disconnect</Button>
          : <Button size="sm" variant="outline" disabled={busy} onClick={connect}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Connect</Button>}
      </div>
    </CardContent></Card>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plane } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { travelService, type FlightQuota } from '../travelService';

/** Profile → Keys → Data & Research. Optional: without a key the workspace gets the free monthly allowance on ours. */
export const BrightDataKeyCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [cred, setCred] = useState<{ key_hint: string | null; enabled: boolean } | null | undefined>(undefined);
  const [quota, setQuota] = useState<FlightQuota | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setCred(await travelService.credential(workspaceId).catch(() => null));
    setQuota(await travelService.quota(workspaceId).catch(() => null));
  }, [workspaceId]);
  useEffect(() => { void load(); }, [load]);

  const save = async (disconnect = false) => {
    setBusy(true);
    try {
      if (disconnect) await travelService.disconnect(workspaceId);
      else await travelService.saveKey(workspaceId, key.trim());
      setKey('');
      toast({ title: disconnect ? 'Bright Data key removed' : 'Bright Data key saved' });
      await load();
    } catch (e) {
      toast({ title: 'Not saved', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const connected = !!cred?.enabled;
  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plane className="h-4 w-4 text-primary" /> Bright Data (flight search)
          {connected ? <Badge variant="success">Connected {cred?.key_hint}</Badge> : <Badge variant="neutral">Optional</Badge>}
        </CardTitle>
        <CardDescription>
          Optional, and the one exception to the rule above. Without your own key you get 2 free flight searches a
          month on ours; a failed search or a repeat within 24 hours does not count. With your own Bright Data token
          searches are unlimited and billed by Bright Data to you.
        </CardDescription>
        {quota && <p className="text-xs text-muted-foreground">{quota.reason}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        {cred === undefined ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="brightdata-key" className="text-xs">{connected ? 'Replace the API token' : 'Bright Data API token'}</Label>
              <Input id="brightdata-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void save()} disabled={busy || key.trim().length < 16}>
                {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} {connected ? 'Replace' : 'Connect'}
              </Button>
              {connected && <Button size="sm" variant="outline" onClick={() => void save(true)} disabled={busy}>Disconnect</Button>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

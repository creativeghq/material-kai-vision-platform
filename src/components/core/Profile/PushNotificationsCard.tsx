import React from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { usePushSubscription, type PushState } from '@/hooks/usePushSubscription';

const NOTE: Partial<Record<PushState, string>> = {
  unsupported: 'This browser cannot receive notifications.',
  'needs-install': 'On iPhone, add the app to your Home Screen first (Share → Add to Home Screen), then open it from there to turn notifications on.',
  denied: 'Notifications are blocked for this app. Re-enable them in your browser or phone settings, then come back here.',
};

export const PushNotificationsCard: React.FC = () => {
  const { state, busy, error, enable, disable } = usePushSubscription();
  if (state === 'loading') return null;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 space-y-0">
        <CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4" /> Phone Notifications</CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Get alerts on this device, even when the app is closed.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {NOTE[state] ?? (state === 'on' ? 'Notifications are on for this device.' : 'Notifications are off for this device.')}
          {error && <div className="mt-1 text-destructive">{error}</div>}
        </div>
        {state === 'off' && (
          <Button onClick={enable} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
            Turn On Notifications
          </Button>
        )}
        {state === 'on' && (
          <Button variant="outline" onClick={disable} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellOff className="mr-2 h-4 w-4" />}
            Turn Off
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

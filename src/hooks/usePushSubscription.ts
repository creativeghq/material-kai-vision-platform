import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type PushState = 'loading' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches
  || (navigator as unknown as { standalone?: boolean }).standalone === true;

function keyToBytes(b64url: string): Uint8Array {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const b64url = (buf: ArrayBuffer | null): string => {
  if (!buf) return '';
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export function usePushSubscription() {
  const { user } = useAuth();
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      // iOS only exposes the push API to an app added to the Home Screen.
      setState(isIos() && !isStandalone() ? 'needs-install' : 'unsupported');
      return;
    }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    setState(sub && Notification.permission === 'granted' ? 'on' : 'off');
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const enable = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { await refresh(); return; }
      const { data: cfg, error: cfgErr } = await supabase.functions.invoke('notification-dispatcher', {
        body: { action: 'get-vapid-key' },
      });
      if (cfgErr || !cfg?.publicKey) throw new Error('Notifications are not set up on the server yet.');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        ?? (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyToBytes(cfg.publicKey) as BufferSource,
        }));
      const { error: saveErr } = await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh_key: b64url(sub.getKey('p256dh')),
        auth_key: b64url(sub.getKey('auth')),
        user_agent: navigator.userAgent,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (saveErr) throw new Error(saveErr.message);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn notifications on.');
    } finally {
      setBusy(false);
    }
  }, [user, refresh]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await supabase.from('push_subscriptions').update({ is_active: false }).eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn notifications off.');
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return { state, busy, error, enable, disable };
}

/**
 * Cloudflare Turnstile React wrapper.
 *
 * Loads the CF script once per page. Each instance renders a widget into a div
 * and reports the resulting token via onVerify. Call reset() to discard the
 * current token and prompt the user to re-verify (needed after every scan).
 */

import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          action?: string;
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: (code: string) => void;
          theme?: 'light' | 'dark' | 'auto';
          appearance?: 'always' | 'execute' | 'interaction-only';
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Turnstile cannot load server-side'));
      return;
    }
    if (window.turnstile) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src^="${SCRIPT_SRC.split('?')[0]}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Turnstile')));
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Turnstile'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export interface TurnstileHandle {
  reset: () => void;
}

interface TurnstileWidgetProps {
  siteKey: string;
  action?: string;
  onVerify: (token: string) => void;
  onExpired?: () => void;
  onError?: (code: string) => void;
  theme?: 'light' | 'dark' | 'auto';
}

export const TurnstileWidget = forwardRef<TurnstileHandle, TurnstileWidgetProps>(function TurnstileWidget(
  { siteKey, action, onVerify, onExpired, onError, theme = 'auto' },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Hold the callbacks in refs and keep them current, so the render effect can
  // depend ONLY on [siteKey, action, theme]. Without this, every parent re-render
  // that passes a new inline onVerify/onExpired/onError (e.g. typing in a sibling
  // input) re-ran the effect, whose cleanup removes + re-renders the CF widget —
  // making it visibly "blink" and drop the just-issued token.
  const onVerifyRef = useRef(onVerify);
  const onExpiredRef = useRef(onExpired);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpiredRef.current = onExpired;
    onErrorRef.current = onError;
  });

  const reset = useCallback(() => {
    if (window.turnstile && widgetIdRef.current) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, []);

  useImperativeHandle(ref, () => ({ reset }), [reset]);

  useEffect(() => {
    let cancelled = false;
    if (!siteKey || !containerRef.current) return;

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme,
          callback: (token) => onVerifyRef.current(token),
          'expired-callback': () => onExpiredRef.current?.(),
          'error-callback': (code) => onErrorRef.current?.(code),
        });
      })
      .catch((err) => onErrorRef.current?.(err instanceof Error ? err.message : 'load_failed'));

    return () => {
      cancelled = true;
      if (window.turnstile && widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, action, theme]);

  return <div ref={containerRef} className="cf-turnstile" />;
});

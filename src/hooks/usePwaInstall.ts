import { useCallback, useEffect, useState } from 'react';

/**
 * The `beforeinstallprompt` event isn't in the standard TS DOM lib yet.
 * Chromium fires it when the app meets installability criteria (manifest +
 * icons + registered service worker, over HTTPS).
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes navigator.standalone instead of display-mode.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOSDevice = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ reports as Mac; detect the touch-capable "Mac" as iPad.
  const isIPadOS = /macintosh/i.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
  return isIOSDevice || isIPadOS;
}

export interface PwaInstallState {
  /** True once the browser has offered a programmatic install (Chrome/Edge/Android). */
  canPrompt: boolean;
  /** iOS Safari can't prompt programmatically — the user adds via the Share sheet. */
  isIOS: boolean;
  /** Already running as an installed app — hide the install affordance entirely. */
  isStandalone: boolean;
  /** Whether to surface an "Install app" affordance at all. */
  isInstallable: boolean;
  /** Fire the native install prompt. Returns the user's choice (or null if unavailable). */
  promptInstall: () => Promise<'accepted' | 'dismissed' | null>;
}

/**
 * Drives the "Install app / Add to Home Screen" affordance.
 *
 * - Chromium browsers: captures `beforeinstallprompt` and replays it on demand.
 * - iOS Safari: no programmatic prompt exists, so callers show manual
 *   Share → "Add to Home Screen" instructions when {@link PwaInstallState.isIOS}.
 * - Already-installed (standalone) sessions report `isInstallable = false`.
 */
export function usePwaInstall(): PwaInstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(detectStandalone);
  const isIOS = detectIOS();

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      // Stop Chrome's default mini-infobar; we drive the prompt from the menu.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setIsStandalone(true);
    };
    const mql = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayChange = () => setIsStandalone(detectStandalone());

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    mql?.addEventListener?.('change', onDisplayChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      mql?.removeEventListener?.('change', onDisplayChange);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | null> => {
    if (!deferred) return null;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    // The event is single-use; drop it so the button reflects reality.
    setDeferred(null);
    return choice.outcome;
  }, [deferred]);

  const canPrompt = deferred !== null;
  const isInstallable = !isStandalone && (canPrompt || isIOS);

  return { canPrompt, isIOS, isStandalone, isInstallable, promptInstall };
}

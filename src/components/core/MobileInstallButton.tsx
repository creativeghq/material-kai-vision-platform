import React, { useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';

import { usePwaInstall } from '@/hooks/usePwaInstall';

interface MobileInstallButtonProps {
  /** Called after a successful (accepted) install or when the user dismisses. */
  onDone?: () => void;
}

/**
 * "Install app" affordance for the mobile menu. Adds MaterialsHub to the phone's
 * home screen as a standalone app icon.
 *
 * - Chromium (Android/desktop): fires the native install prompt.
 * - iOS Safari: there is no programmatic prompt, so it reveals the manual
 *   Share → "Add to Home Screen" steps inline.
 * - Renders nothing when already installed or when the platform can't install.
 */
export const MobileInstallButton: React.FC<MobileInstallButtonProps> = ({ onDone }) => {
  const { isInstallable, canPrompt, isIOS, promptInstall } = usePwaInstall();
  const [showIosHelp, setShowIosHelp] = useState(false);

  if (!isInstallable) return null;

  const handleClick = async () => {
    if (canPrompt) {
      const outcome = await promptInstall();
      if (outcome) onDone?.();
      return;
    }
    if (isIOS) setShowIosHelp((v) => !v);
  };

  return (
    <div className="mt-3 border-t border-white/8 pt-3">
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/5"
      >
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-white"
          style={{ background: 'var(--brand-gradient)' }}
        >
          <Download className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-light text-foreground">Install app</span>
          <span className="block text-xs text-muted-foreground">Add MaterialsHub to your home screen</span>
        </span>
      </button>

      {showIosHelp && isIOS && (
        <div className="relative mt-2 rounded-xl bg-white/5 px-4 py-3 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => setShowIosHelp(false)}
            aria-label="Close"
            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="mb-2 font-light text-foreground">Add to Home Screen</p>
          <ol className="space-y-1.5">
            <li className="flex items-center gap-2">
              <span className="text-foreground">1.</span>
              <span>Tap the Share icon</span>
              <Share className="h-4 w-4 text-foreground" />
              <span>in Safari's toolbar</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-foreground">2.</span>
              <span>Choose</span>
              <span className="inline-flex items-center gap-1 text-foreground">
                Add to Home Screen <SquarePlus className="h-4 w-4" />
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-foreground">3.</span>
              <span>Tap Add — the icon appears on your home screen.</span>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
};

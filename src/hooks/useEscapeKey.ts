import { useEffect } from 'react';

/**
 * Close a hand-rolled overlay on Escape.
 *
 * Radix `<Dialog>` does this for free, but the lightboxes and preview overlays built directly out
 * of `fixed inset-0` divs do not — they dismissed on a backdrop CLICK and on nothing else. With no
 * Escape and no focus trap, a keyboard user who opened one had no way to close it: that is a
 * keyboard trap, WCAG 2.1.2, not a lint nicety.
 *
 * Listens on `keydown` at the document, because the overlay itself is rarely focused when it opens.
 *
 * @param active  whether the overlay is currently open — the listener is only attached while true,
 *                so a closed overlay cannot swallow Escape from whatever is open behind it.
 */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onEscape();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, onEscape]);
}

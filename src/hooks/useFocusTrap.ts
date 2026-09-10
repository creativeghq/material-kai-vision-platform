import { useEffect, type RefObject } from 'react';

/** Everything the browser will focus with Tab, minus anything explicitly removed from the order. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Contain Tab inside an overlay, and give focus back when it closes.
 * @param ref     the overlay's root element
 * @param active  whether the overlay is open; nothing is attached while false
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;

    // Remember where focus came from, so it can be handed back on close.
    const previous = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.offsetParent !== null || el === document.activeElement);

    // Move focus in. Prefer the first control; fall back to the container itself so focus is
    // never left outside an overlay that happens to contain nothing focusable yet.
    const first = focusable()[0];
    if (first) first.focus();
    else {
      root.setAttribute('tabindex', '-1');
      root.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) { e.preventDefault(); return; }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      // Wrap at both ends. Without this, Tab past the last control escapes into the page behind.
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // `isConnected` guards the case where the trigger itself was unmounted with the overlay.
      if (previous && previous.isConnected) previous.focus();
    };
  }, [ref, active]);
}

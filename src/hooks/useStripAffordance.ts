import * as React from 'react';

/**
 * A rail that has collapsed into a horizontal strip needs two things the
 * vertical form never did, and it needs them wherever that collapse happens —
 * a Radix `TabsList` (Finance, HR, Stock) and a `HubSideNav` (Profile, Social,
 * Party work) both become the same object below `lg`, so they share this.
 */
export function useStripAffordance(
  elRef: React.RefObject<HTMLElement | null>,
  /** How to find the selected item. Radix stamps `data-state`; a nav rail does not. */
  activeSelector = '[role="tab"][data-state="active"]',
) {
  const [overflow, setOverflow] = React.useState<'none' | 'left' | 'right' | 'both'>('none');

  const measure = React.useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 1) {
      setOverflow('none');
      return;
    }
    const atStart = el.scrollLeft <= 1;
    const atEnd = el.scrollLeft >= max - 1;
    setOverflow(!atStart && !atEnd ? 'both' : atStart ? 'right' : 'left');
  }, [elRef]);

  const centerActive = React.useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 1) return;
    const active = el.querySelector<HTMLElement>(activeSelector);
    if (!active) return;
    const er = el.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    // Already fully in view → leave the scroll position alone. This keeps a
    // leading item (the common case) resting at the start instead of being
    // yanked toward centre, and prevents transient mid-mount re-centres.
    if (ar.left >= er.left && ar.right <= er.right) return;
    const target = el.scrollLeft + (ar.left - er.left) - (el.clientWidth - ar.width) / 2;
    el.scrollLeft = Math.max(0, Math.min(target, max));
  }, [elRef, activeSelector]);

  React.useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    centerActive();
    measure();

    const onScroll = () => measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => {
      centerActive();
      measure();
    });
    ro.observe(el);
    // Re-centre + re-measure whenever the selection changes. `class` covers the
    // nav rail (`.sidebar-item.active`), `data-state` covers Radix.
    const mo = new MutationObserver(() => {
      centerActive();
      measure();
    });
    mo.observe(el, { attributes: true, subtree: true, attributeFilter: ['data-state', 'class'] });

    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      mo.disconnect();
    };
  }, [centerActive, measure, elRef]);

  return overflow;
}

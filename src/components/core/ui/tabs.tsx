import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

/**
 * On mobile the global stylesheet turns a horizontal TabsList into a single
 * swipeable strip (see index.css). For many-tab pages that introduces two
 * needs this hook handles:
 *   1. keep the ACTIVE trigger in view (so a deep-linked tab is never hidden
 *      off-screen at rest), and
 *   2. expose how the strip is overflowing via `data-overflow` so CSS can fade
 *      the edge(s) that have more tabs — the "there's more" affordance.
 * It is a no-op when the list isn't actually scrollable (e.g. desktop), so it
 * is safe to apply to every TabsList.
 */
function useTabStripAffordance(elRef: React.RefObject<HTMLElement>) {
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
    const active = el.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    if (!active) return;
    const er = el.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    // Already fully in view → leave the scroll position alone. This keeps a
    // leading tab (the common case) resting at the start instead of being
    // yanked toward centre, and prevents transient mid-mount re-centres.
    if (ar.left >= er.left && ar.right <= er.right) return;
    // Active tab's offset within the scroll content, then centre it — clamped
    // to the valid scroll range so a stale measurement can't fling the strip.
    const target = el.scrollLeft + (ar.left - er.left) - (el.clientWidth - ar.width) / 2;
    el.scrollLeft = Math.max(0, Math.min(target, max));
  }, [elRef]);

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
    // Re-center + re-measure whenever the active trigger changes.
    const mo = new MutationObserver(() => {
      centerActive();
      measure();
    });
    mo.observe(el, { attributes: true, subtree: true, attributeFilter: ['data-state'] });

    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      mo.disconnect();
    };
  }, [centerActive, measure]);

  return overflow;
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const innerRef = React.useRef<HTMLElement | null>(null);
  const setRefs = React.useCallback(
    (node: HTMLElement | null) => {
      innerRef.current = node;
      if (typeof ref === 'function') ref(node as never);
      else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node;
    },
    [ref],
  );
  const overflow = useTabStripAffordance(innerRef);

  return (
    <TabsPrimitive.List
      ref={setRefs}
      data-overflow={overflow}
      className={cn(
        // A tab strip is a NAVIGATION rule, so it renders as one: no container
        // fill, no padding box, a hairline running the full width with the
        // triggers sitting on it. The active indicator is a 2px accent segment
        // of that same rule (see index.css) — which is why the list needs the
        // border and the trigger needs the height, not the other way round.
        'inline-flex h-9 w-full items-center justify-start gap-1 border-b border-hairline text-muted-foreground',
        // A VERTICAL rail (Finance's section nav) gets the rule on its trailing
        // edge instead, and no fixed height — a 36px-tall stack of 19 sections
        // is not a thing. Radix stamps data-orientation on the list itself.
        'data-[orientation=vertical]:h-auto data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch data-[orientation=vertical]:gap-0 data-[orientation=vertical]:border-b-0 data-[orientation=vertical]:border-r',
        className,
      )}
      {...props}
    />
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // UNDERLINE tabs. The colours, the indicator and the active weight are
      // all in index.css, keyed off `[role="tab"]`, so the same treatment
      // reaches every tab-shaped nav in the platform — Radix Tabs here, the
      // Finance vertical rail, and the hand-rolled strips that never imported
      // this file. What lives here is only the box: size, padding, focus.
      //
      // Why not a filled pill (what this used to be): a filled accent pill is
      // the exact silhouette of a primary button, so "the section you are in"
      // and "the button you should press" were the same object. An underline
      // is a location marker and reads as one instantly.
      //
      // min-h-9 on mobile: the mobile stylesheet turns a tab row into a
      // horizontal scroll strip, and a short target inside a scroll container
      // gets swallowed as a drag instead of a tap.
      'relative inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 md:min-h-0',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };

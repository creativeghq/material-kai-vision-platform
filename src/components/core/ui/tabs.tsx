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
    if (!el || el.scrollWidth - el.clientWidth <= 1) return;
    const active = el.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    if (!active) return;
    const elRect = el.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    const delta = aRect.left - elRect.left - (el.clientWidth - aRect.width) / 2;
    el.scrollLeft += delta;
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
        // No container background — tabs sit flat on the page; the active
        // trigger alone carries the light-grey highlight (see TabsTrigger).
        'inline-flex h-10 items-center justify-center rounded-md p-1 text-muted-foreground',
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
      // Mimic the header-menu nav exactly: hover AND active both render the
      // blue→red brand gradient — the global `.bg-primary` / `.hover:bg-primary:hover`
      // rule in index.css turns these bg-primary utilities into the gradient.
      // Covers horizontal tabs and the vertical/sidebar tabs (e.g. Finance),
      // since they all use this single TabsTrigger.
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-primary hover:text-primary-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm',
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
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };

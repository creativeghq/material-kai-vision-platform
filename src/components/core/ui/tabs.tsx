import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/lib/utils';
import { useStripAffordance } from '@/hooks/useStripAffordance';

const Tabs = TabsPrimitive.Root;

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
  const overflow = useStripAffordance(innerRef);

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

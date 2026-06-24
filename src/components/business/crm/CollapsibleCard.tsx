import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/core/ui/collapsible';

interface CollapsibleCardProps {
  title: React.ReactNode;
  icon?: LucideIcon;
  /** Open on first render. Each card keeps its own state (independent open/close). */
  defaultOpen?: boolean;
  /** Optional node on the right of the header (before the chevron). */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Passed to the inner CardContent (e.g. "space-y-4"). */
  contentClassName?: string;
}

/**
 * A Card whose body collapses/expands from its header. Used to turn the CRM
 * detail-page sidebars into independently collapsible sections.
 */
export const CollapsibleCard: React.FC<CollapsibleCardProps> = ({
  title, icon: Icon, defaultOpen = false, action, children, className, contentClassName,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className={className}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="flex-row items-center justify-between space-y-0 py-4 cursor-pointer select-none">
            <CardTitle className="text-base flex items-center gap-2">
              {Icon && <Icon className="h-4 w-4" />} {title}
            </CardTitle>
            <span className="flex items-center gap-2">
              {action}
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
            </span>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className={contentClassName}>{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

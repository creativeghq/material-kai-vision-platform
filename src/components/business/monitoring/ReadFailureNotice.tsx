/**
 * What a monitoring panel shows when its read failed (#360 CB-21).
 *
 * Not an empty state, and never a zero: on these screens zero is a real answer — no new mentions,
 * no price movement — so an outage that renders as zero is indistinguishable from good news. It
 * says what could not be read and offers the retry, because "unknown" is only useful if somebody
 * can act on it.
 */
import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/core/ui/button';

export const ReadFailureNotice: React.FC<{
  /** What could not be read, in the reader's words — "share of voice", "the mention feed". */
  what: string;
  /** The underlying message, shown small. */
  reason?: string;
  onRetry?: () => void;
  className?: string;
}> = ({ what, reason, onRetry, className }) => (
  <div
    className={`flex items-start gap-2 rounded-sm border border-hairline bg-surface-sunken px-3 py-2 text-xs ${className ?? ''}`}
  >
    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800 dark:text-amber-300" aria-hidden />
    <div className="min-w-0 flex-1">
      <div className="font-medium text-foreground">We could not read {what}.</div>
      <p className="text-muted-foreground">
        This is not &ldquo;nothing found&rdquo; — the figure is unknown until the read succeeds.
        {reason ? ` (${reason})` : ''}
      </p>
    </div>
    {onRetry && (
      <Button size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-xs" onClick={onRetry}>
        <RefreshCw className="mr-1 h-3 w-3" /> Retry
      </Button>
    )}
  </div>
);

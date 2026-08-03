import * as React from 'react';

import { cn } from '@/lib/utils';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * Which way the user may drag the resize grip. Defaults to 'vertical'.
   *
   * Vertical rather than the browser default of 'both': horizontal dragging lets a textarea grow
   * past its container and break the surrounding layout, and nothing in this app wants that. Pass
   * 'none' for composers that auto-grow or sit in a fixed-height row.
   */
  resize?: 'none' | 'both' | 'horizontal' | 'vertical';
}

const RESIZE_CLASS: Record<NonNullable<TextareaProps['resize']>, string> = {
  none: 'resize-none',
  both: 'resize',
  horizontal: 'resize-x',
  vertical: 'resize-y',
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, resize = 'vertical', ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[72px] w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200',
          RESIZE_CLASS[resize],
          // Placed last so a caller's own resize-* utility still wins (cn is tailwind-merge).
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };

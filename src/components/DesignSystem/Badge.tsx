import React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  className?: string;
}

/**
 * Badge - Status badge component
 *
 * Usage:
 * <Badge variant="success">Delivered</Badge>
 * <Badge variant="warning">Pending</Badge>
 */
export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  className,
}) => {
  return (
    <span
      className={cn(
        'badge',
        variant === 'success' && 'badge-success',
        variant === 'warning' && 'badge-warning',
        variant === 'error' && 'badge-error',
        variant === 'info' && 'badge-info',
        variant === 'neutral' && 'badge-neutral',
        className,
      )}
    >
      {children}
    </span>
  );
};


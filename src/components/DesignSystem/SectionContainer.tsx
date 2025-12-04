import React from 'react';
import { cn } from '@/lib/utils';

interface SectionContainerProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

/**
 * SectionContainer - Container for grouping related content
 * 
 * Usage:
 * <SectionContainer title="Shipments Activities" action={<FilterButton />}>
 *   <YourContent />
 * </SectionContainer>
 */
export const SectionContainer: React.FC<SectionContainerProps> = ({
  children,
  className,
  title,
  description,
  action,
}) => {
  return (
    <div className={cn('section-container', className)}>
      {(title || description || action) && (
        <div className="flex items-start justify-between mb-6">
          <div>
            {title && <h2 className="text-xl font-semibold text-foreground">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
};


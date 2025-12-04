import React from 'react';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: 'default' | 'search';
  icon?: React.ReactNode;
}

/**
 * Input - Dark-themed input component
 * 
 * Usage:
 * <Input placeholder="Enter text..." />
 * <Input variant="search" placeholder="Search..." />
 */
export const Input: React.FC<InputProps> = ({
  variant = 'default',
  icon,
  className,
  ...props
}) => {
  if (variant === 'search') {
    return (
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          className={cn('search-input', className)}
          {...props}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      {icon && (
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
          {icon}
        </div>
      )}
      <input
        className={cn('input-dark', icon && 'pl-10', className)}
        {...props}
      />
    </div>
  );
};


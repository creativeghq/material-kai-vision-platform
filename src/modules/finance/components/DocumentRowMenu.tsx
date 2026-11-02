import React from 'react';
import { ExternalLink, MoreVertical } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { fiscalLinks, type FiscalRecord } from '@/modules/finance/components/FiscalRecordPanel';

export interface RowMenuAction {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  disabled?: boolean;
}

export const DocumentRowMenu: React.FC<{ actions: RowMenuAction[]; fiscal?: FiscalRecord; label?: string }> = ({ actions, fiscal, label = 'Document actions' }) => {
  const links = fiscal ? fiscalLinks(fiscal) : [];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        avoidCollisions={false}
        collisionPadding={8}
        className="w-56 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {actions.map((a) => (
          <DropdownMenuItem key={a.label} onClick={a.onSelect} disabled={a.disabled}>
            {a.icon && <a.icon className="mr-2 h-4 w-4" />}{a.label}
          </DropdownMenuItem>
        ))}
        {links.length > 0 && <DropdownMenuSeparator />}
        {links.map((l) => (
          <DropdownMenuItem key={l.href} asChild>
            <a href={l.href} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />{l.label}</a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

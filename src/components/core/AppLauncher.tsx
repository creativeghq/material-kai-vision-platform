// #251 — top-bar App Launcher. A single grid button that opens the active workspace's
// optional modules (from useWorkspaceModuleNav). Keeps the top nav lean: enabled modules
// live here + on the /apps hub, never as their own top-level nav items.
import React from 'react';
import { LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { useWorkspaceModuleNav } from '@/modules/_core';

export const AppLauncher: React.FC = () => {
  const navigate = useNavigate();
  const { entries } = useWorkspaceModuleNav();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Apps"
          title="Apps"
          className="flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 rounded-xl" align="end" forceMount>
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Apps</div>
        {entries.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">No modules active yet.</div>
        ) : (
          entries.map((e) => (
            <DropdownMenuItem key={e.slug} onClick={() => navigate(e.path)} className="py-2.5">
              <e.icon className="mr-3 h-4 w-4" />
              <span className="text-sm">{e.label}</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/apps')} className="py-2.5">
          <LayoutGrid className="mr-3 h-4 w-4" />
          <span className="text-sm">Manage modules</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

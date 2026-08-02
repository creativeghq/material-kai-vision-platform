/**
 * ToolkitOnboardingCard — the "now what?" card.
 *
 * Renders the moment a toolkit is enabled (either by the picker or by the
 * agent's load_toolkit call), and re-renders as the empty state of any chat
 * that has toolkits active but no messages yet. Shows 1–4 starter actions
 * per active toolkit so the user always has a concrete next click.
 *
 * Without this card, enabling Catalogs (or any toolkit) drops the user into
 * a blank chat with no idea what to type.
 */
import React from 'react';
import {
  Sparkles, Compass, BookOpen, Megaphone, LayoutTemplate, Search, Globe, Link2,
  FileSearch, Layers, BadgeCheck, Newspaper, Building2, Bot, Wrench, Plus, Send,
  PencilLine, ImageIcon, Mail, ListChecks, Grid3x3, Palette, AlertCircle, ArrowRight,
  Briefcase, FolderKanban,
  Users, CalendarOff, CalendarPlus, LayoutDashboard,
  Package, PackagePlus, AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { cn } from '@/lib/utils';
import type { ToolkitDefinition, ToolkitQuickStart } from '../agentToolsCatalog';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles, Compass, BookOpen, Megaphone, LayoutTemplate, Search, Globe, Link2,
  FileSearch, Layers, BadgeCheck, Newspaper, Building2, Bot, Wrench, Plus, Send,
  PencilLine, ImageIcon, Mail, ListChecks, Grid3x3, Palette, AlertCircle,
  Briefcase, FolderKanban,
  Users, CalendarOff, CalendarPlus, LayoutDashboard,
  Package, PackagePlus, AlertTriangle,
};

interface Props {
  /**
   * The toolkits to render starter actions for. When `mode='just_enabled'`,
   * pass the single toolkit that was just turned on. When `mode='empty_state'`,
   * pass every active toolkit (Core + user picks) so the user can launch any.
   */
  toolkits: ToolkitDefinition[];
  mode: 'just_enabled' | 'empty_state';
  /** When the user clicks a quick-start. Receives the prompt string. */
  onLaunch: (prompt: string, quickStart: ToolkitQuickStart, toolkit: ToolkitDefinition) => void;
  /** Dismiss the just-enabled card without picking anything (sticks for empty_state). */
  onDismiss?: () => void;
}

export const ToolkitOnboardingCard: React.FC<Props> = ({ toolkits, mode, onLaunch, onDismiss }) => {
  const filtered = toolkits.filter((tk) => (tk.quick_starts?.length || 0) > 0);
  if (filtered.length === 0) return null;

  return (
    <div className={cn(
      'rounded-xl border border-primary/30 bg-primary/5 overflow-hidden',
      mode === 'just_enabled' ? 'mb-3' : 'my-6 mx-auto max-w-2xl',
    )}>
      <div className="px-4 py-3 border-b border-primary/20 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {mode === 'just_enabled'
              ? `${filtered[0]?.name || 'Toolkit'} loaded — what do you want to do?`
              : 'Pick a starter to begin'}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {mode === 'just_enabled'
              ? 'Click any starter or type your own request.'
              : `Quick actions across ${filtered.length} active toolkit${filtered.length === 1 ? '' : 's'}.`}
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-[10px] text-muted-foreground hover:text-foreground rounded px-1.5 py-0.5"
            title="Dismiss"
          >
            ✕
          </button>
        )}
      </div>

      <div className="p-3 space-y-3">
        {filtered.map((tk) => (
          <ToolkitGroup key={tk.id} toolkit={tk} onLaunch={onLaunch} />
        ))}
      </div>
    </div>
  );
};

const ToolkitGroup: React.FC<{
  toolkit: ToolkitDefinition;
  onLaunch: (prompt: string, qs: ToolkitQuickStart, tk: ToolkitDefinition) => void;
}> = ({ toolkit, onLaunch }) => {
  const ToolkitIcon = ICON_MAP[toolkit.icon] || Wrench;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <ToolkitIcon className="h-3 w-3 text-primary" />
        <span className="text-xs font-medium">{toolkit.name}</span>
        <Badge variant="outline" className="text-[9px] py-0">{toolkit.quick_starts?.length}</Badge>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {(toolkit.quick_starts || []).map((qs, idx) => (
          <QuickStartButton
            key={idx}
            quickStart={qs}
            onClick={() => onLaunch(qs.prompt, qs, toolkit)}
          />
        ))}
      </div>
    </div>
  );
};

const QuickStartButton: React.FC<{
  quickStart: ToolkitQuickStart;
  onClick: () => void;
}> = ({ quickStart, onClick }) => {
  const Icon = quickStart.icon ? (ICON_MAP[quickStart.icon] || Sparkles) : Sparkles;
  return (
    <button
      onClick={onClick}
      className="group text-left p-2.5 rounded-lg border border-border/60 hover:border-primary/50 hover:bg-primary/5 transition flex items-start gap-2"
    >
      <div className="h-7 w-7 rounded-md bg-muted/40 group-hover:bg-primary/15 flex items-center justify-center shrink-0 transition">
        <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium flex items-center gap-1">
          {quickStart.label}
          <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-60 transition" />
        </div>
        <div className="text-[10px] text-muted-foreground line-clamp-2">{quickStart.description}</div>
      </div>
    </button>
  );
};

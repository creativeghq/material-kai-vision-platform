/**
 * ToolkitPickerModal — visual card picker for enabling tool clusters.
 *
 * Replaces the flat checkbox list with a single screen of big toolkit cards.
 * Each card represents a CLUSTER of related tools (Catalogs / SEO Research /
 * B2B / etc.) — toggling a card flips the entire cluster on/off.
 *
 * Why this is better than the old checkbox picker:
 *   • Visible token cost per toolkit + a live total in the footer.
 *   • Always-on `core` toolkit means the agent has sane defaults without the
 *     user having to know what to load.
 *   • Active toolkits show as removable chips both INSIDE this modal and on
 *     the chat input toolbar — always visible.
 *   • The agent can also call the `load_toolkit` meta-tool mid-conversation
 *     to request more tools, so the user never gets stuck.
 *
 * Token math (visible to the user in the footer):
 *   ~250 input tokens per tool definition × N tools across active toolkits.
 *   With everything OFF (core only, ~4 tools) = ~1k tokens.
 *   With every toolkit ON = ~12k tokens.
 *   Old default (all 50+ KAI tools bound) = ~12-15k tokens. Same cost only
 *   if the user actively asks for it.
 */
import React, { useMemo, useState } from 'react';
import {
  X, Check, Sparkles, Compass, BookOpen, Megaphone, LayoutTemplate, Search, Globe,
  Link2, FileSearch, Layers, BadgeCheck, Newspaper, Building2, Bot, Wrench, Lock,
  AlertCircle, Coins, RotateCcw, Briefcase, FolderKanban,
  Users, CalendarOff, CalendarPlus, LayoutDashboard, ListChecks,
  Package, PackagePlus, AlertTriangle,
  Network, Workflow, Share2, Radar, Plus, FileText, Grid3x3, Mail, Palette,
  Pencil, PencilLine, Percent, Send, Image as ImageIcon, Wallet,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { cn } from '@/lib/utils';
import {
  TOOLKITS, ALWAYS_ON_TOOLKIT_IDS, getAccessibleToolkits,
  getToolkitOwnerAgents, toolkitTokenEstimate, resolveToolkitsToTools, getToolkitHub,
  type ToolkitDefinition, type ToolkitQuickStart,
} from './agentToolsCatalog';
import { HUBS } from '@/config/nav-items';
import { Play } from 'lucide-react';

// Every `icon:` referenced by TOOLKITS (cluster + quick_start) must resolve here —
// an unknown name silently degrades to a generic Wrench rather than failing, so
// tests/unit/toolkitCoverage.test.ts asserts this map covers the catalog.
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Compass, BookOpen, Megaphone, LayoutTemplate, Sparkles, Search, Globe, Link2,
  FileSearch, Layers, BadgeCheck, Newspaper, Building2, Bot, Wrench, Briefcase, FolderKanban,
  Users, CalendarOff, CalendarPlus, LayoutDashboard, ListChecks,
  Package, PackagePlus, AlertTriangle,
  Network, Workflow, Share2, Radar, Plus, FileText, Grid3x3, Mail, Palette,
  Pencil, PencilLine, Percent, Send, ImageIcon, AlertCircle, Wallet,
};

interface Props {
  open: boolean;
  onClose: () => void;
  role: 'viewer' | 'member' | 'admin' | 'owner';
  enabledModules: string[];
  activeToolkitIds: string[];
  onChange: (toolkitIds: string[]) => void;
  /** Current selected agent. Used to scope toolkits — KAI users only see KAI
   *  toolkits, Interior Designer only sees Interior toolkits. Always-on
   *  toolkits show regardless. */
  currentAgentId?: string;
  /** Launch a toolkit's guided process (quick-start). This is the single
   *  starter surface now that the separate ✨ prompts modal is gone — each
   *  toolkit card lists its processes as launchable buttons. */
  onLaunchQuickStart?: (qs: ToolkitQuickStart, tk: ToolkitDefinition) => void;
}

export const ToolkitPickerModal: React.FC<Props> = ({
  open, onClose, role, enabledModules, activeToolkitIds, onChange,
  currentAgentId, onLaunchQuickStart,
}) => {
  const accessible = useMemo(
    () => {
      const byRoleAndModule = getAccessibleToolkits(role, enabledModules);
      if (!currentAgentId) return byRoleAndModule;
      // JARVIS (orchestrator) auto-routes to whichever specialist owns a tool,
      // so it can access EVERY toolkit — show the full accessible set.
      if (currentAgentId === 'orchestrator') return byRoleAndModule;
      // Strict-filter to the current agent: only show toolkits whose tools
      // are actually bound to this agent. Always-on toolkits (Core) bypass
      // the filter because they're loaded into every agent.
      return byRoleAndModule.filter((t) =>
        t.alwaysOn || getToolkitOwnerAgents(t).includes(currentAgentId),
      );
    },
    [role, enabledModules, currentAgentId],
  );

  // Local draft so toggling doesn't immediately churn the parent. Apply on close.
  const [draft, setDraft] = useState<Set<string>>(() => new Set(activeToolkitIds));

  React.useEffect(() => {
    if (open) setDraft(new Set(activeToolkitIds));
  }, [open, activeToolkitIds]);

  const totalToolCount = useMemo(() => {
    return resolveToolkitsToTools([...draft]).length;
  }, [draft]);

  const totalTokenEstimate = useMemo(() => {
    let n = 0;
    for (const t of TOOLKITS) {
      if (t.alwaysOn || draft.has(t.id)) n += toolkitTokenEstimate(t);
    }
    return n;
  }, [draft]);

  const toggle = (id: string) => {
    if (ALWAYS_ON_TOOLKIT_IDS.includes(id)) return;
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetToDefaults = () => {
    setDraft(new Set(ALWAYS_ON_TOOLKIT_IDS));
  };

  const apply = () => {
    onChange([...draft]);
    onClose();
  };

  if (!open) return null;

  // Order: Core first, then standard toolkits grouped by Hub (#275 — same Hubs as the app
  // launcher, so "toolkits under each Hub" matches the menu), then admin-only toolkits.
  const groups = {
    core: accessible.filter((t) => t.alwaysOn),
    standard: accessible.filter((t) => !t.alwaysOn && !t.adminOnly),
    admin: accessible.filter((t) => !t.alwaysOn && t.adminOnly),
  };
  const standardHubGroups: { key: string; label: string; toolkits: ToolkitDefinition[] }[] = [];
  for (const hub of HUBS) {
    const items = groups.standard.filter((t) => getToolkitHub(t.id) === hub.id);
    if (items.length) standardHubGroups.push({ key: hub.id, label: hub.label, toolkits: items });
  }
  const ungrouped = groups.standard.filter((t) => !getToolkitHub(t.id));
  if (ungrouped.length) standardHubGroups.push({ key: 'other', label: 'Other', toolkits: ungrouped });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="dashboard-card w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-medium leading-tight">Agent toolkits</h2>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
                Enable whole clusters of tools at once. The agent has Core always loaded and can call <code className="text-[10px] px-1 py-0.5 rounded bg-muted">load_toolkit</code> mid-conversation when it needs more.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted/60"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Active toolkits chip row */}
        {draft.size > 0 && (
          <div className="px-5 py-3 border-b border-border bg-primary/5 flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">
              Active
            </span>
            {[...draft].map((id) => {
              const tk = TOOLKITS.find((t) => t.id === id);
              if (!tk) return null;
              return (
                <ActiveChip
                  key={id}
                  toolkit={tk}
                  removable={!tk.alwaysOn}
                  onRemove={() => toggle(id)}
                />
              );
            })}
          </div>
        )}

        {/* Toolkit grid */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {groups.core.length > 0 && (
            <ToolkitSection title="Always loaded" subtitle="Available in every conversation. Cannot be disabled.">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {groups.core.map((tk) => (
                  <ToolkitCard
                    key={tk.id} toolkit={tk} active={true} alwaysOn onClick={() => {}}
                    onLaunch={onLaunchQuickStart ? (qs) => onLaunchQuickStart(qs, tk) : undefined}
                  />
                ))}
              </div>
            </ToolkitSection>
          )}

          {standardHubGroups.map((g) => (
            <ToolkitSection key={g.key} title={g.label}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {g.toolkits.map((tk) => (
                  <ToolkitCard
                    key={tk.id}
                    toolkit={tk}
                    active={draft.has(tk.id)}
                    onClick={() => toggle(tk.id)}
                    onLaunch={onLaunchQuickStart ? (qs) => onLaunchQuickStart(qs, tk) : undefined}
                  />
                ))}
              </div>
            </ToolkitSection>
          ))}

          {groups.admin.length > 0 && (
            <ToolkitSection title="Admin toolkits" subtitle="Restricted to admin and owner roles.">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {groups.admin.map((tk) => (
                  <ToolkitCard
                    key={tk.id}
                    toolkit={tk}
                    active={draft.has(tk.id)}
                    onClick={() => toggle(tk.id)}
                    onLaunch={onLaunchQuickStart ? (qs) => onLaunchQuickStart(qs, tk) : undefined}
                  />
                ))}
              </div>
            </ToolkitSection>
          )}
        </div>

        {/* Footer with token math + apply */}
        <div className="border-t border-border p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-sm">
            <Badge variant="outline" className="text-xs gap-1">
              <Coins className="h-3 w-3" /> ~{totalTokenEstimate.toLocaleString()} tokens / turn
            </Badge>
            <span className="text-xs text-muted-foreground">
              {totalToolCount} tool{totalToolCount === 1 ? '' : 's'} loaded
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={resetToDefaults}>
              <RotateCcw className="h-3 w-3 mr-1" /> Reset to lean default
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={apply}>Apply</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const ToolkitSection: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, children }) => (
  <section>
    <div className="mb-2">
      <h3 className="text-xs uppercase tracking-wide text-muted-foreground">{title}</h3>
      {subtitle && <p className="text-[11px] text-muted-foreground/80 mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </section>
);

const ToolkitCard: React.FC<{
  toolkit: ToolkitDefinition;
  active: boolean;
  alwaysOn?: boolean;
  onClick: () => void;
  /** Launch one of this toolkit's guided processes (quick-starts). */
  onLaunch?: (qs: ToolkitQuickStart) => void;
}> = ({ toolkit, active, alwaysOn, onClick, onLaunch }) => {
  const Icon = ICON_MAP[toolkit.icon] || Wrench;
  const tokens = toolkitTokenEstimate(toolkit);
  const quickStarts = toolkit.quick_starts || [];
  return (
    <div
      className={cn(
        'group relative rounded-xl border p-3.5 transition-all flex flex-col',
        active
          ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(208,72,160,0.15)]'
          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30',
      )}
    >
      {active && !alwaysOn && (
        <span className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
          <Check className="h-3 w-3" />
        </span>
      )}
      {alwaysOn && (
        <span className="absolute top-2 right-2 text-[9px] uppercase tracking-wide text-primary font-medium">
          always on
        </span>
      )}

      {/* Toggle area — clicking the header/stats flips the toolkit on/off */}
      <button
        onClick={onClick}
        disabled={alwaysOn}
        className={cn('text-left', alwaysOn && 'cursor-default')}
      >
        <div className="flex items-start gap-2.5 mb-2">
          <div
            className={cn(
              'h-9 w-9 rounded-lg flex items-center justify-center shrink-0 transition-colors',
              active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary',
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm flex items-center gap-1.5 flex-wrap">
              {toolkit.name}
              {toolkit.adminOnly && (
                <Badge variant="outline" className="text-[9px] gap-1 py-0">
                  <Lock className="h-2 w-2" /> admin
                </Badge>
              )}
              {toolkit.moduleSlug && (
                <Badge variant="outline" className="text-[9px] gap-1 py-0 border-amber-500/40 text-amber-300">
                  <AlertCircle className="h-2 w-2" /> module
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
              {toolkit.description}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{toolkit.tool_ids.length} tool{toolkit.tool_ids.length === 1 ? '' : 's'}</span>
          <span className="flex items-center gap-1">
            <Coins className="h-2.5 w-2.5" /> ~{tokens.toLocaleString()} tok
          </span>
        </div>
      </button>

      {/* Guided processes — launch a quick-start directly from the card */}
      {onLaunch && quickStarts.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
          {quickStarts.map((qs, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onLaunch(qs); }}
              className="w-full text-left bg-muted/40 hover:bg-primary/10 rounded-md px-2.5 py-1.5 border border-border/50 hover:border-primary/40 transition group/qs flex items-start gap-2"
              title={qs.description}
            >
              <Play className="h-3 w-3 text-primary/70 shrink-0 mt-0.5" />
              <span className="flex-1 min-w-0">
                <span className="text-xs font-medium block truncate">{qs.label}</span>
                <span className="text-[10px] text-muted-foreground line-clamp-1">{qs.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ActiveChip: React.FC<{
  toolkit: ToolkitDefinition;
  removable: boolean;
  onRemove: () => void;
}> = ({ toolkit, removable, onRemove }) => {
  const Icon = ICON_MAP[toolkit.icon] || Wrench;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-2 py-1 text-xs">
      <Icon className="h-3 w-3 text-primary" />
      <span className="font-medium">{toolkit.name}</span>
      {removable ? (
        <button onClick={onRemove} className="ml-0.5 hover:text-destructive transition" title="Remove">
          <X className="h-3 w-3" />
        </button>
      ) : (
        <Lock className="h-2.5 w-2.5 ml-0.5 text-muted-foreground" />
      )}
    </span>
  );
};

export default ToolkitPickerModal;

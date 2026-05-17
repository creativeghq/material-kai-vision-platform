/**
 * CommandPalette — slash-trigger overlay above the chat input.
 *
 * Trigger: user types `/` at the start of an empty (or trimmed) input. Renders
 * a floating list of:
 *   - Multi-step workflows (from workflowRegistry) — the primary affordance
 *   - Individual tools (from agentToolsCatalog) — for power users
 *   - Recent runs (TODO: localStorage / DB)
 *
 * Keyboard: arrow up/down to navigate, Enter to launch, Esc to close.
 *
 * On launch:
 *   - Workflow → calls onLaunchWorkflow(workflowId, exampleIndex). Parent
 *     either bootstraps the tracker locally OR injects an example prompt.
 *   - Tool → calls onUseToolPrompt(prompt). Parent fills the chat input.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Wrench, ArrowRight, Lock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/core/ui/badge';
import { AGENTS, type AgentToolEntry, getAccessibleAgents } from '../agentToolsCatalog';
import { WORKFLOWS, getWorkflowsForRole } from './workflowRegistry';
import type { WorkflowDefinition } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  query: string;
  agentId: string;
  role: 'viewer' | 'member' | 'admin' | 'owner';
  enabledModules: string[];
  onLaunchWorkflow: (workflow: WorkflowDefinition) => void;
  onUseExample: (prompt: string) => void;
}

interface PaletteEntry {
  kind: 'workflow' | 'tool';
  id: string;
  name: string;
  description: string;
  badges?: Array<{ label: string; variant?: 'default' | 'secondary' | 'outline' | 'destructive' }>;
  examples?: string[];
  workflow?: WorkflowDefinition;
  tool?: AgentToolEntry;
  disabled?: boolean;
  disabledReason?: string;
}

export const CommandPalette: React.FC<Props> = ({
  open, onClose, query, agentId, role, enabledModules, onLaunchWorkflow, onUseExample,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const entries = useMemo<PaletteEntry[]>(() => {
    const out: PaletteEntry[] = [];
    const isAdmin = role === 'admin' || role === 'owner';

    // Workflows first
    for (const wf of getWorkflowsForRole(role, enabledModules)) {
      out.push({
        kind: 'workflow',
        id: wf.id,
        name: wf.name,
        description: wf.description,
        badges: [
          { label: `${wf.steps.length} steps`, variant: 'outline' },
          ...(wf.adminOnly ? [{ label: 'admin', variant: 'outline' as const }] : []),
        ],
        examples: wf.examples,
        workflow: wf,
      });
    }

    // Then individual tools (filtered to current agent + role)
    const accessible = getAccessibleAgents(role).find((a) => a.id === agentId);
    for (const t of accessible?.tools || []) {
      if (t.workflowOf) continue; // tools that are part of a workflow are reachable via the workflow entry
      if (t.moduleSlug && !enabledModules.includes(t.moduleSlug)) {
        out.push({
          kind: 'tool',
          id: t.id,
          name: t.name,
          description: t.desc,
          badges: [
            { label: t.category, variant: 'secondary' },
            { label: 'module disabled', variant: 'destructive' },
          ],
          examples: t.examples,
          tool: t,
          disabled: true,
          disabledReason: `Module "${t.moduleSlug}" is disabled.`,
        });
        continue;
      }
      out.push({
        kind: 'tool',
        id: t.id,
        name: t.name,
        description: t.desc,
        badges: [
          { label: t.category, variant: 'secondary' },
          ...(t.adminOnly ? [{ label: 'admin', variant: 'outline' as const }] : []),
          ...(t.credits ? [{ label: `${t.credits} cr`, variant: 'outline' as const }] : []),
        ],
        examples: t.examples,
        tool: t,
      });
    }

    return out;
  }, [agentId, role, enabledModules]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q)
    );
  }, [entries, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const entry = filtered[activeIndex];
        if (entry) launch(entry);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, activeIndex, onClose]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-index="${activeIndex}"]`);
    if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const launch = (entry: PaletteEntry) => {
    if (entry.disabled) return;
    if (entry.kind === 'workflow' && entry.workflow) {
      if (entry.examples && entry.examples.length > 0) {
        onUseExample(entry.examples[0]);
      }
      onLaunchWorkflow(entry.workflow);
    } else if (entry.examples && entry.examples.length > 0) {
      onUseExample(entry.examples[0]);
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-border bg-card shadow-lg max-h-[400px] overflow-y-auto z-50"
    >
      <div className="sticky top-0 px-3 py-2 border-b border-border bg-card text-[11px] text-muted-foreground flex items-center gap-2">
        <Sparkles className="h-3 w-3" />
        Type to filter · ↑↓ navigate · Enter launch · Esc close
      </div>

      {filtered.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          No tools or workflows match "{query}".
        </div>
      ) : (
        <div className="py-1">
          {filtered.map((entry, idx) => (
            <button
              key={`${entry.kind}-${entry.id}`}
              data-index={idx}
              onClick={() => launch(entry)}
              onMouseEnter={() => setActiveIndex(idx)}
              disabled={entry.disabled}
              className={cn(
                'w-full text-left px-3 py-2 flex items-start gap-3 transition border-l-2',
                idx === activeIndex
                  ? 'bg-primary/10 border-l-primary'
                  : 'border-l-transparent hover:bg-muted/40',
                entry.disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              <div className={cn(
                'h-7 w-7 rounded shrink-0 flex items-center justify-center',
                entry.kind === 'workflow' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
              )}>
                {entry.kind === 'workflow' ? <Sparkles className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium truncate">{entry.name}</span>
                  {entry.kind === 'workflow' && (
                    <Badge variant="default" className="text-[9px] py-0">workflow</Badge>
                  )}
                  {entry.badges?.map((b, i) => (
                    <Badge key={i} variant={b.variant || 'outline'} className="text-[9px] py-0 capitalize">
                      {b.label === 'admin' && <Lock className="h-2 w-2 mr-0.5" />}
                      {b.label === 'module disabled' && <AlertCircle className="h-2 w-2 mr-0.5" />}
                      {b.label}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1">{entry.description}</p>
                {entry.disabled && entry.disabledReason && (
                  <p className="text-[10px] text-amber-400/80 mt-0.5">{entry.disabledReason}</p>
                )}
              </div>

              {idx === activeIndex && !entry.disabled && (
                <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0 self-center" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

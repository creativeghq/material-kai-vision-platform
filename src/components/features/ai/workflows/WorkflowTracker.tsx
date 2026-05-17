/**
 * WorkflowTracker — pinned card at the top of the chat showing live progress
 * of a multi-step workflow. Replaces the "type-and-pray" UX with a visible
 * checklist of every step the agent will run.
 *
 * Each step is a numbered node:
 *   ◯ pending  ⟳ running  ✎ awaiting_input  ✓ done  ✕ failed  ↷ skipped
 *
 * Click a step to expand its panel: shows status_line, input snapshot,
 * output preview, and per-step actions (re-run, skip, edit input).
 */
import React, { useMemo, useState } from 'react';
import {
  ChevronDown, ChevronRight, ChevronsUp, Check, Circle, Loader2, X, SkipForward,
  PencilLine, AlertCircle, BookOpen, Sparkles, FileDown, Globe, Send, FileText, Plus,
  ImageIcon, Search, ListTree, PenLine, BadgeCheck, Megaphone, RefreshCw, Bot, Settings2,
  LayoutTemplate, Grid3x3, Building2, Users, Mail, Save, Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import type {
  WorkflowRuntimeState, WorkflowStepStatus, WorkflowStepRuntimeState,
} from './types';
import { getWorkflow } from './workflowRegistry';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  BookOpen, Sparkles, FileDown, Globe, Send, FileText, Plus, ImageIcon, Search,
  ListTree, PenLine, BadgeCheck, Megaphone, RefreshCw, Bot, Settings2, LayoutTemplate,
  Grid3x3, Building2, Users, Mail, Save, Wrench, PencilLine,
};

interface Props {
  runtime: WorkflowRuntimeState;
  /** When the user clicks "edit / re-run / skip" on a step. */
  onStepAction?: (stepId: string, action: 'edit_input' | 'rerun' | 'skip') => void;
  /** When the tracker is collapsed/expanded. */
  onToggleCollapse?: () => void;
  /** Slot rendered below the tracker — used for the active step's input form. */
  bottomSlot?: React.ReactNode;
}

export const WorkflowTracker: React.FC<Props> = ({ runtime, onStepAction, onToggleCollapse, bottomSlot }) => {
  const definition = getWorkflow(runtime.definition_id);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  const steps = useMemo(() => {
    return runtime.step_order
      .map((id) => {
        const stepDef = definition?.steps.find((s) => s.id === id);
        const stepRt = runtime.steps[id];
        return { id, def: stepDef, rt: stepRt };
      })
      .filter((s) => s.def || s.rt);
  }, [runtime, definition]);

  const totalSteps = steps.length;
  const doneSteps = steps.filter((s) => s.rt?.status === 'done' || s.rt?.status === 'skipped').length;

  const overallIcon =
    runtime.status === 'done' ? <Check className="h-4 w-4 text-green-500" /> :
    runtime.status === 'failed' ? <AlertCircle className="h-4 w-4 text-destructive" /> :
    runtime.status === 'aborted' ? <X className="h-4 w-4 text-muted-foreground" /> :
    runtime.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> :
    <Circle className="h-4 w-4 text-muted-foreground" />;

  const HeaderIcon = definition?.icon ? ICON_MAP[definition.icon] || Wrench : Wrench;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 overflow-hidden mb-3">
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-primary/10 transition"
        onClick={onToggleCollapse}
      >
        <HeaderIcon className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-medium truncate flex items-center gap-2">
            {definition?.name || runtime.definition_id}
            {runtime.title && <span className="text-muted-foreground font-normal text-xs">— {runtime.title}</span>}
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
            {overallIcon}
            <span className="capitalize">{runtime.status}</span>
            <span>·</span>
            <span>{doneSteps} / {totalSteps} steps</span>
          </div>
        </div>
        {runtime.collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronsUp className="h-4 w-4 text-muted-foreground" />}
      </button>

      {!runtime.collapsed && (
        <>
          {/* Step strip — horizontal scrolling row of numbered nodes */}
          <div className="px-3 py-2 border-t border-primary/20 flex gap-1.5 overflow-x-auto">
            {steps.map((s, idx) => (
              <StepNode
                key={s.id}
                index={idx + 1}
                status={s.rt?.status || 'pending'}
                title={s.def?.title || s.id}
                icon={s.def?.icon}
                expanded={expandedStepId === s.id}
                onClick={() => setExpandedStepId(expandedStepId === s.id ? null : s.id)}
              />
            ))}
          </div>

          {/* Expanded step panel */}
          {expandedStepId && (
            <StepDetail
              stepId={expandedStepId}
              definition={definition?.steps.find((d) => d.id === expandedStepId)}
              runtime={runtime.steps[expandedStepId]}
              onAction={onStepAction}
              onClose={() => setExpandedStepId(null)}
            />
          )}

          {/* Bottom slot — used by the parent to render the inline input form */}
          {bottomSlot && <div className="border-t border-primary/20">{bottomSlot}</div>}
        </>
      )}
    </div>
  );
};

const StepNode: React.FC<{
  index: number;
  status: WorkflowStepStatus;
  title: string;
  icon?: string;
  expanded: boolean;
  onClick: () => void;
}> = ({ index, status, title, icon, expanded, onClick }) => {
  const StatusIcon = (() => {
    switch (status) {
      case 'done':            return <Check className="h-3 w-3" />;
      case 'failed':          return <X className="h-3 w-3" />;
      case 'skipped':         return <SkipForward className="h-3 w-3" />;
      case 'running':         return <Loader2 className="h-3 w-3 animate-spin" />;
      case 'awaiting_input':  return <PencilLine className="h-3 w-3" />;
      default:                return <span className="text-[10px] font-semibold">{index}</span>;
    }
  })();

  const nodeColors = {
    done:           'bg-green-500/15 border-green-500/40 text-green-400',
    failed:         'bg-destructive/15 border-destructive/40 text-destructive',
    skipped:        'bg-muted border-border text-muted-foreground',
    running:        'bg-primary/20 border-primary text-primary',
    awaiting_input: 'bg-amber-500/15 border-amber-500/40 text-amber-400 animate-pulse',
    pending:        'bg-card border-border text-muted-foreground',
  } as const;

  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-lg border px-2 py-1.5 text-xs flex items-center gap-1.5 transition min-w-[120px]',
        nodeColors[status],
        expanded ? 'ring-2 ring-primary' : 'hover:opacity-80',
      )}
      title={title}
    >
      <span className={cn(
        'h-5 w-5 rounded-full flex items-center justify-center shrink-0 border',
        nodeColors[status],
      )}>
        {StatusIcon}
      </span>
      <span className="truncate text-left">{title}</span>
    </button>
  );
};

const StepDetail: React.FC<{
  stepId: string;
  definition: any;
  runtime: WorkflowStepRuntimeState | undefined;
  onAction?: (stepId: string, action: 'edit_input' | 'rerun' | 'skip') => void;
  onClose: () => void;
}> = ({ stepId, definition, runtime, onAction, onClose }) => {
  const status = runtime?.status || 'pending';
  return (
    <div className="px-3 py-2 border-t border-primary/20 bg-card/50 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{definition?.title || stepId}</div>
          {definition?.description && (
            <p className="text-xs text-muted-foreground">{definition.description}</p>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} className="shrink-0 h-6 w-6 p-0">
          <X className="h-3 w-3" />
        </Button>
      </div>

      {runtime?.status_line && (
        <div className="text-xs text-muted-foreground italic">{runtime.status_line}</div>
      )}

      {runtime?.error_message && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive flex items-start gap-1.5">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> {runtime.error_message}
        </div>
      )}

      {runtime?.input && Object.keys(runtime.input).length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Input</summary>
          <pre className="mt-1 rounded bg-muted/40 p-2 overflow-x-auto text-[10px]">{JSON.stringify(runtime.input, null, 2)}</pre>
        </details>
      )}

      {runtime?.output && Object.keys(runtime.output).length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Output</summary>
          <pre className="mt-1 rounded bg-muted/40 p-2 overflow-x-auto text-[10px]">{JSON.stringify(runtime.output, null, 2)}</pre>
        </details>
      )}

      {onAction && (
        <div className="flex gap-1.5 pt-1">
          {(status === 'done' || status === 'failed' || status === 'skipped') && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAction(stepId, 'rerun')}>
              <RefreshCw className="h-3 w-3 mr-1" /> Re-run
            </Button>
          )}
          {definition?.awaits_user_input && status !== 'running' && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAction(stepId, 'edit_input')}>
              <PencilLine className="h-3 w-3 mr-1" /> Edit input
            </Button>
          )}
          {definition?.skippable && (status === 'pending' || status === 'awaiting_input') && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAction(stepId, 'skip')}>
              <SkipForward className="h-3 w-3 mr-1" /> Skip
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

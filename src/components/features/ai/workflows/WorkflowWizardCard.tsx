/**
 * WorkflowWizardCard — the prominent "do it step by step" surface.
 *
 * Sits below the small WorkflowTracker breadcrumb and renders the CURRENT
 * step as a big visual form card with:
 *   • Step indicator strip (●●●○○○○○ Step 3 of 8)
 *   • Progress bar
 *   • Step icon + title + description
 *   • Schema-driven form (reuses WorkflowInlineForm) for structured input
 *   • "Or describe in your own words" expandable override that lets the user
 *     swap the form for a free-form prompt without leaving the wizard
 *   • Skip + Next buttons
 *
 * Every "Next" click composes a structured continuation message that the
 * agent picks up — `[workflow:<def_id>/<step_id>] continue with input: <json>`
 * (or, when the user used the free-form override, just the prose). The agent
 * emits step_progress chunks on completion so the WorkflowTracker advances.
 *
 * On final-step completion the wizard collapses to a green "Complete" summary
 * with a "Build another" / "Iterate further" pair of follow-up actions.
 */
import React, { useMemo, useState } from 'react';
import {
  Check, ChevronDown, ChevronRight, Loader2, SkipForward, AlertCircle,
  Sparkles, BookOpen, FileText, Plus, ImageIcon, FileDown, Globe, Send,
  Search, ListTree, PenLine, BadgeCheck, Building2, Users, Mail, Save,
  Megaphone, RefreshCw, Bot, Settings2, LayoutTemplate, Grid3x3, PencilLine,
  Newspaper, Wrench, MessageSquare, X,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import { cn } from '@/lib/utils';
import { WorkflowInlineForm } from './WorkflowInlineForm';
import { getWorkflow } from './workflowRegistry';
import type {
  WorkflowDefinition, WorkflowRuntimeState, WorkflowStepDefinition, WorkflowStepRuntimeState,
} from './types';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles, BookOpen, FileText, Plus, ImageIcon, FileDown, Globe, Send,
  Search, ListTree, PenLine, BadgeCheck, Building2, Users, Mail, Save,
  Megaphone, RefreshCw, Bot, Settings2, LayoutTemplate, Grid3x3, PencilLine,
  Newspaper, Wrench,
};

interface Props {
  runtime: WorkflowRuntimeState;
  /**
   * Called when the user advances a step. The handler is responsible for:
   *   1. Appending the right continuation message to the chat (structured
   *      JSON OR free-form prose depending on whether useCustomPrompt is set).
   *   2. Marking the step as `running` so the tracker reflects the in-flight
   *      state until the agent emits `workflow_step_progress`.
   *
   * The wizard does NOT mutate runtime state itself — that stays the parent's
   * responsibility so chunks from the agent are the single source of truth.
   */
  onAdvance: (args: {
    runId: string;
    stepId: string;
    formValues?: Record<string, any>;
    customPrompt?: string;
  }) => void;
  /** Skip the active step. Wizard moves to the next pending step. */
  onSkip: (runId: string, stepId: string) => void;
  /** Dismiss the wizard entirely (workflow stays in runtime state but card unmounts). */
  onDismiss?: (runId: string) => void;
}

export const WorkflowWizardCard: React.FC<Props> = ({ runtime, onAdvance, onSkip, onDismiss }) => {
  const definition = getWorkflow(runtime.definition_id);

  // Both useMemos must run before the `if (!definition) return null` bail-out —
  // they only depend on `runtime`, so hoisting is safe. Bailing out first made the hook
  // count vary between renders (React: "Rendered more hooks than during the previous
  // render") the moment an unknown definition_id resolved.

  // Resolve the active step. Priority:
  //   1. The step the agent is asking for input on (awaiting_input_step_id)
  //   2. First step with status='running'
  //   3. First step with status='pending'
  //   4. None — workflow is done; render the success state
  const activeStepId = useMemo(() => {
    if (runtime.awaiting_input_step_id) return runtime.awaiting_input_step_id;
    for (const id of runtime.step_order) {
      const status = runtime.steps[id]?.status || 'pending';
      if (status === 'running' || status === 'awaiting_input') return id;
    }
    for (const id of runtime.step_order) {
      const status = runtime.steps[id]?.status || 'pending';
      if (status === 'pending') return id;
    }
    return null;
  }, [runtime]);

  const allDone = useMemo(() => {
    if (runtime.step_order.length === 0) return false;
    return runtime.step_order.every((id) => {
      const s = runtime.steps[id]?.status;
      return s === 'done' || s === 'skipped';
    });
  }, [runtime]);

  // Bail-out AFTER the hooks (see note above) — everything below dereferences `definition`.
  if (!definition) return null;

  if (allDone) {
    return <WorkflowCompleteCard runtime={runtime} definition={definition} onDismiss={onDismiss} />;
  }

  if (!activeStepId) return null;
  const stepDef = definition.steps.find((s) => s.id === activeStepId);
  const stepRt = runtime.steps[activeStepId];
  if (!stepDef) return null;

  return (
    <WizardStep
      key={`${runtime.run_id}:${activeStepId}`}
      runtime={runtime}
      definition={definition}
      stepDef={stepDef}
      stepRt={stepRt}
      onAdvance={onAdvance}
      onSkip={onSkip}
      onDismiss={onDismiss}
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Active step view
// ─────────────────────────────────────────────────────────────────────────────

const WizardStep: React.FC<{
  runtime: WorkflowRuntimeState;
  definition: WorkflowDefinition;
  stepDef: WorkflowStepDefinition;
  stepRt: WorkflowStepRuntimeState | undefined;
  onAdvance: Props['onAdvance'];
  onSkip: Props['onSkip'];
  onDismiss?: Props['onDismiss'];
}> = ({ runtime, definition, stepDef, stepRt, onAdvance, onSkip, onDismiss }) => {
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  const stepIndex = runtime.step_order.indexOf(stepDef.id);
  const totalSteps = runtime.step_order.length;
  const completedSteps = runtime.step_order.filter((id) => {
    const s = runtime.steps[id]?.status;
    return s === 'done' || s === 'skipped';
  }).length;
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const StepIcon = stepDef.icon ? (ICON_MAP[stepDef.icon] || Sparkles) : Sparkles;
  const isRunning = stepRt?.status === 'running';
  const hasError = stepRt?.status === 'failed';

  const handleAdvance = (formValues?: Record<string, any>) => {
    if (useCustomPrompt && customPrompt.trim()) {
      onAdvance({ runId: runtime.run_id, stepId: stepDef.id, customPrompt: customPrompt.trim() });
    } else {
      onAdvance({ runId: runtime.run_id, stepId: stepDef.id, formValues });
    }
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/5 to-transparent overflow-hidden mb-3">
      {/* Header — workflow name + step indicator strip */}
      <div className="px-4 py-3 border-b border-primary/20 flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{definition.name}</div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
            <span>Step {stepIndex + 1} of {totalSteps}</span>
            <span>·</span>
            <span>{progressPct}% complete</span>
          </div>
          {/* Numbered dots strip */}
          <div className="mt-2 flex items-center gap-1">
            {runtime.step_order.map((id) => {
              const s = runtime.steps[id]?.status || 'pending';
              const cls =
                s === 'done' ? 'bg-green-500' :
                s === 'failed' ? 'bg-destructive' :
                s === 'skipped' ? 'bg-muted-foreground/30' :
                s === 'running' || s === 'awaiting_input' ? 'bg-primary ring-2 ring-primary/30' :
                'bg-muted';
              return <span key={id} className={cn('h-1.5 flex-1 rounded-full transition', cls)} />;
            })}
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={() => onDismiss(runtime.run_id)}
            className="p-1 rounded-lg hover:bg-muted/40"
            title="Dismiss"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Step body */}
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className={cn(
            'h-9 w-9 rounded-lg flex items-center justify-center shrink-0 transition',
            isRunning ? 'bg-primary/20 text-primary' :
            hasError ? 'bg-destructive/20 text-destructive' :
            'bg-muted text-muted-foreground',
          )}>
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <StepIcon className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-base">{stepDef.title}</div>
            {stepDef.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{stepDef.description}</p>
            )}
          </div>
          <Badge variant="outline" className="text-[10px] py-0">
            #{stepDef.order}
          </Badge>
        </div>

        {hasError && stepRt?.error_message && (
          <div className="rounded border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Step failed</div>
              <div>{stepRt.error_message}</div>
            </div>
          </div>
        )}

        {isRunning && (
          <div className="rounded border border-primary/30 bg-primary/5 p-2.5 text-xs text-primary flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>{stepRt?.status_line || 'Running…'}</span>
          </div>
        )}

        {/* Form OR custom prompt */}
        {!isRunning && !useCustomPrompt && stepDef.input_schema && stepDef.input_schema.length > 0 && (
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <WorkflowInlineForm
              schema={stepDef.input_schema}
              initialValues={stepRt?.input}
              onSubmit={async (values) => handleAdvance(values)}
              submitLabel="Next →"
              loading={isRunning}
            />
          </div>
        )}

        {!isRunning && !useCustomPrompt && (!stepDef.input_schema || stepDef.input_schema.length === 0) && (
          <div className="rounded-xl border border-border/60 bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground mb-3">
              No inputs needed for this step — click Next to run it.
            </p>
            <Button size="sm" onClick={() => handleAdvance({})}>
              Next →
            </Button>
          </div>
        )}

        {!isRunning && useCustomPrompt && (
          <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              Describe in your own words
            </Label>
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={3}
              placeholder={'e.g. "Use a different template" — anything specific you want for this step.'}
              autoFocus
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-muted-foreground">
                The agent will run this step using your description instead of the form.
              </p>
              <Button
                size="sm"
                onClick={() => handleAdvance()}
                disabled={!customPrompt.trim()}
              >
                Next →
              </Button>
            </div>
          </div>
        )}

        {/* Footer — toggle override + skip */}
        {!isRunning && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              onClick={() => setUseCustomPrompt((v) => !v)}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 group"
            >
              {useCustomPrompt ? <ChevronDown className="h-3 w-3 rotate-180" /> : <ChevronRight className="h-3 w-3" />}
              {useCustomPrompt
                ? 'Back to the structured form'
                : 'Or describe in your own words'}
            </button>
            {stepDef.skippable && (
              <Button size="sm" variant="ghost" onClick={() => onSkip(runtime.run_id, stepDef.id)}>
                <SkipForward className="h-3 w-3 mr-1" /> Skip step
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Final "Complete" summary
// ─────────────────────────────────────────────────────────────────────────────

const WorkflowCompleteCard: React.FC<{
  runtime: WorkflowRuntimeState;
  definition: WorkflowDefinition;
  onDismiss?: (runId: string) => void;
}> = ({ runtime, definition, onDismiss }) => {
  const stepCount = runtime.step_order.length;
  return (
    <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4 mb-3">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
          <Check className="h-5 w-5 text-green-500" />
        </div>
        <div className="flex-1">
          <div className="font-medium">{definition.name} — complete</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            All {stepCount} step{stepCount === 1 ? '' : 's'} finished. You can iterate further by chatting normally — every relevant tool stays loaded.
          </p>
        </div>
        {onDismiss && (
          <button onClick={() => onDismiss(runtime.run_id)} className="p-1 rounded-lg hover:bg-muted/40" title="Dismiss">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
};

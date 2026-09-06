/**
 * RunCanvas — what the canvas shows while the agent is working.
 *
 * The canvas used to be empty until a finished artifact landed: for the length of the turn
 * the biggest surface on screen said "Your canvas. When the agent produces something…"
 * while the agent was, in fact, producing something. Every signal that work was happening
 * lived in a 400px rail — and for the 21 direct-run quick-starts that emit no artifact at
 * all, the canvas stayed on that sentence forever while the chat said "done".
 *
 * So the run itself is a canvas citizen: a plan when we have one, the tools as they execute
 * when we don't, a verdict per step, and the results at the end. Same card for all 48
 * toolkits, because it is derived from the stream rather than authored per toolkit.
 */
import React, { useEffect, useState } from 'react';
import {
  Check, X, SkipForward, Loader2, PencilLine, AlertTriangle, CircleDashed,
  ArrowUpRight, RefreshCw, Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import type { CanvasArtifact } from '../CanvasPanel';
import { getWorkflow } from '../workflows/workflowRegistry';
import { stepIcon } from './stepIcons';
import { runProgress, type AgentRunState, type AgentRunStepStatus } from './runTypes';

/**
 * How each verdict draws.
 *
 * Built on the platform's status TOKENS (`--success` / `--warning` / `--error`), not on raw
 * palette shades. A raw shade is a light/dark pair and only one half ever gets written: the
 * amber picked against plum-black renders at 1.23:1 on the light themes' cream, which is a
 * valid class that is simply unreadable. The tokens are already defined per theme, so there
 * is one class here and it is correct in all four.
 */
const STEP_TONE: Record<AgentRunStepStatus, { ring: string; text: string; label: string }> = {
  pending: {
    ring: 'border-hairline bg-surface-sunken',
    text: 'text-muted-foreground',
    label: 'Waiting',
  },
  running: {
    ring: 'border-primary bg-primary/10',
    text: 'text-primary',
    label: 'Running',
  },
  awaiting_input: {
    ring: 'border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning-bg))]',
    text: 'text-[hsl(var(--warning))]',
    label: 'Needs you',
  },
  done: {
    ring: 'border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success-bg))]',
    text: 'text-[hsl(var(--success))]',
    label: 'Done',
  },
  failed: {
    ring: 'border-destructive bg-destructive/10',
    text: 'text-destructive',
    label: 'Failed',
  },
  skipped: {
    ring: 'border-hairline bg-surface-sunken',
    text: 'text-muted-foreground',
    label: 'Skipped',
  },
  // Deliberately NOT drawn as a success or a failure: nobody reported either.
  unreported: {
    ring: 'border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning-bg))]',
    text: 'text-[hsl(var(--warning))]',
    label: 'No verdict',
  },
};

function StepMarker({ status, index }: { status: AgentRunStepStatus; index: number }) {
  const tone = STEP_TONE[status];
  const glyph = (() => {
    switch (status) {
      case 'done':           return <Check className="h-3.5 w-3.5" />;
      case 'failed':         return <X className="h-3.5 w-3.5" />;
      case 'skipped':        return <SkipForward className="h-3.5 w-3.5" />;
      case 'running':        return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
      case 'awaiting_input': return <PencilLine className="h-3.5 w-3.5" />;
      case 'unreported':     return <AlertTriangle className="h-3.5 w-3.5" />;
      default:               return <span className="text-[11px] font-semibold tabular-nums">{index}</span>;
    }
  })();
  return (
    <span
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
        tone.ring, tone.text,
      )}
    >
      {glyph}
    </span>
  );
}

function elapsedLabel(from: number, to: number): string {
  const secs = Math.max(0, Math.round((to - from) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

/** Live clock while the run is going; frozen at `ended_at` once it stops. */
function useElapsed(run: AgentRunState): string | null {
  const [now, setNow] = useState(() => Date.now());
  const live = run.status === 'running';
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [live]);
  if (!run.started_at) return null;
  // A workflow run is adapted from a runtime that records no end time, so a finished one has
  // nothing to measure against — and `started_at → started_at` printed a confident "0s" on
  // every completed pipeline. No figure beats a wrong one.
  if (!live && !run.ended_at) return null;
  return elapsedLabel(run.started_at, run.ended_at ?? now);
}

interface RunCanvasProps {
  run: AgentRunState;
  /** Artifacts produced by this run's turn, oldest first. */
  results?: CanvasArtifact[];
  onOpenResult?: (id: string) => void;
  /**
   * Rendered under the step that is waiting on the user — the workflow wizard's form.
   * A question belongs beside the plan it is a step of, not in a rail on another pane.
   */
  formSlot?: React.ReactNode;
  /** Planned-run step controls. Only offered for steps the definition says allow it. */
  onStepAction?: (stepId: string, action: 'edit_input' | 'rerun' | 'skip') => void;
  /** Re-send the whole thing. Offered when a run ended without doing anything. */
  onRetry?: () => void;
}

export const RunCanvas: React.FC<RunCanvasProps> = ({
  run, results = [], onOpenResult, formSlot, onStepAction, onRetry,
}) => {
  const definition = run.definition_id ? getWorkflow(run.definition_id) : undefined;
  const progress = runProgress(run);
  const elapsed = useElapsed(run);
  const HeaderIcon = stepIcon(definition?.icon ?? 'Sparkles');

  const runBadge = (() => {
    switch (run.status) {
      case 'done':    return <Badge variant="success">Finished</Badge>;
      case 'failed':  return <Badge variant="error">Failed</Badge>;
      case 'aborted': return <Badge variant="neutral">Stopped</Badge>;
      default:        return <Badge variant="info">Working</Badge>;
    }
  })();

  // A run that ended having done nothing visible is the whole reason this surface exists:
  // say so, rather than leaving the canvas on its welcome copy under a cheerful "done".
  const producedNothing =
    run.status !== 'running' && run.step_order.length === 0 && results.length === 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <section className="rounded-lg border border-hairline bg-card">
        <header className="flex items-start gap-3 border-b border-hairline p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-surface-sunken text-primary">
            <HeaderIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold leading-tight">{run.title}</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {run.toolkit_name && <span>{run.toolkit_name}</span>}
              {run.toolkit_name && definition && <span aria-hidden>·</span>}
              {definition && <span>{definition.name}</span>}
              {elapsed && (
                <>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{elapsed}</span>
                </>
              )}
            </p>
          </div>
          <div className="shrink-0">{runBadge}</div>
        </header>

        {/* Progress. A discovered run has no total to count towards, so it reports what has
            happened ("3 steps") instead of inventing a denominator — a made-up "3 of 5"
            would be a number nobody measured. */}
        <div className="space-y-2 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-medium text-foreground">
              {progress.total === 0
                ? (run.status === 'running' ? 'Starting…' : 'No steps recorded')
                : run.origin === 'planned'
                  ? `Step ${progress.currentIndex ?? progress.settled} of ${progress.total}`
                  : `${progress.settled} of ${progress.total} step${progress.total === 1 ? '' : 's'} complete`}
            </span>
            {progress.total > 0 && (
              <span className="tabular-nums text-muted-foreground">{progress.pct}%</span>
            )}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-sm bg-surface-sunken">
            <div
              className={cn(
                'h-full rounded-sm transition-all duration-500',
                run.status === 'failed' ? 'bg-destructive' : 'bg-primary',
              )}
              style={{ width: `${progress.total === 0 ? (run.status === 'running' ? 4 : 0) : progress.pct}%` }}
            />
          </div>
          {run.activity && run.status === 'running' && (
            <p className="flex items-center gap-2 pt-0.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
              <span className="min-w-0 break-words">{run.activity}</span>
            </p>
          )}
        </div>

        {/* Steps */}
        <ol className="border-t border-hairline">
          {run.step_order.length === 0 && run.status === 'running' && (
            <li className="flex items-center gap-3 px-4 py-4 text-sm text-muted-foreground">
              <CircleDashed className="h-4 w-4 shrink-0 animate-pulse" />
              Deciding what to do.
            </li>
          )}
          {run.step_order.map((stepId, idx) => {
            const step = run.steps[stepId];
            if (!step) return null;
            const stepDef = definition?.steps.find((s) => s.id === stepId);
            const Icon = stepIcon(step.icon);
            const active = step.status === 'running' || step.status === 'awaiting_input';
            return (
              <li
                key={stepId}
                className={cn(
                  'flex gap-3 border-b border-hairline px-4 py-3 last:border-b-0',
                  active && 'bg-surface-sunken',
                )}
              >
                <StepMarker status={step.status} index={idx + 1} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', STEP_TONE[step.status].text)} />
                    <span className={cn('truncate text-sm', active ? 'font-semibold' : 'font-medium')}>
                      {step.title}
                    </span>
                    <span className={cn('shrink-0 text-[11px]', STEP_TONE[step.status].text)}>
                      {STEP_TONE[step.status].label}
                    </span>
                  </div>
                  {step.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
                  )}
                  {step.status_line && (
                    // min-w-0 + break-words: progress lines carry raw URLs, and a query
                    // string offers the browser nowhere to wrap.
                    <p className="mt-1 min-w-0 break-words text-xs text-foreground/80">{step.status_line}</p>
                  )}
                  {step.status === 'unreported' && (
                    <p className="mt-1 text-xs text-[hsl(var(--warning))]">
                      This step started and the turn ended without saying how it went.
                    </p>
                  )}
                  {step.error_message && (
                    <p className="mt-1 min-w-0 break-words rounded-sm border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                      {step.error_message}
                    </p>
                  )}

                  {/* The question this step is asking, in place. */}
                  {step.status === 'awaiting_input' && formSlot && (
                    <div className="mt-3">{formSlot}</div>
                  )}

                  {onStepAction && stepDef && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(step.status === 'done' || step.status === 'failed' || step.status === 'skipped'
                        || step.status === 'unreported') && (
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => onStepAction(stepId, 'rerun')}>
                          <RefreshCw className="mr-1 h-3 w-3" /> Re-run
                        </Button>
                      )}
                      {stepDef.awaits_user_input && step.status !== 'running' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => onStepAction(stepId, 'edit_input')}>
                          <PencilLine className="mr-1 h-3 w-3" /> Edit input
                        </Button>
                      )}
                      {stepDef.skippable && (step.status === 'pending' || step.status === 'awaiting_input') && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs"
                          onClick={() => onStepAction(stepId, 'skip')}>
                          <SkipForward className="mr-1 h-3 w-3" /> Skip
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {/* A form for a run whose awaiting step we could not place (no plan, or the agent
            asked before any step opened) still has to reach the user. */}
        {formSlot && !run.step_order.some((id) => run.steps[id]?.status === 'awaiting_input') && (
          <div className="border-t border-hairline p-4">{formSlot}</div>
        )}

        {run.error_message && (
          <div className="border-t border-hairline p-4">
            <p className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {run.error_message}
            </p>
          </div>
        )}
      </section>

      {results.length > 0 && (
        <section className="rounded-lg border border-hairline bg-card">
          <header className="border-b border-hairline px-4 py-3">
            <h3 className="text-sm font-semibold">What it produced</h3>
            <p className="text-xs text-muted-foreground">
              {results.length} result{results.length === 1 ? '' : 's'} from this run.
            </p>
          </header>
          <ul>
            {results.map((r) => (
              <li key={r.id} className="border-b border-hairline last:border-b-0">
                <button
                  type="button"
                  onClick={() => onOpenResult?.(r.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-sunken"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {producedNothing && (
        <section className="rounded-lg border border-hairline bg-card p-4">
          <div className="flex items-start gap-3">
            <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">Nothing ran</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The turn finished without calling a tool or producing a result. The reply in the
                chat is all there was.
              </p>
              {onRetry && (
                <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={onRetry}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Try again
                </Button>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

/**
 * Compact stand-in for the chat rail while the run is on the canvas.
 *
 * The rail is 400px and the run card is a page; rendering the page twice side by side was
 * never the ask. This says work is happening and takes one tap to reach it.
 */
export const RunChip: React.FC<{
  run: AgentRunState;
  active: boolean;
  onOpen: () => void;
}> = ({ run, active, onOpen }) => {
  const progress = runProgress(run);
  const running = run.status === 'running';
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full items-center gap-3 rounded-sm border bg-card px-3 py-2 text-left transition-colors',
        active ? 'border-primary' : 'border-hairline hover:bg-surface-sunken',
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-surface-sunken text-primary">
        {running
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : run.status === 'failed'
            ? <X className="h-3.5 w-3.5 text-destructive" />
            : <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{run.title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {progress.total === 0
            ? (running ? 'Starting…' : 'No steps recorded')
            : progress.currentTitle
              ? `${progress.currentTitle} · ${progress.settled}/${progress.total}`
              : `${progress.settled}/${progress.total} steps`}
        </span>
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
};

export default RunCanvas;

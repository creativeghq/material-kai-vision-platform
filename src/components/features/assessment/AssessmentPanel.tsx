/**
 * AI Assessment — one panel, three subjects (#397).
 *
 * WHAT THIS SCREEN IS. Two halves that must not be confused for each other:
 *
 *   THE SIGNALS are free and live. `preview()` re-derives them every time the panel opens — the
 *   checks, the six dimension scores and the verdict, all computed by `get_assessment_snapshot`
 *   in SQL. Nothing here computes a number.
 *
 *   THE REPORT costs credits. It is one Claude turn over those same signals, producing the
 *   headline, the narrative and the ranked actions. It is a SNAPSHOT — frozen when it ran — which
 *   is why it is shown next to a live "as of" date rather than pretending to be current.
 *
 * Every dimension renders every time, and one that could not be judged says so. A tile that
 * disappears when there is no data makes a broken collector pixel-identical to a healthy subject;
 * a tile showing 0 is worse, because 0 is a score.
 *
 * Mounted three times — the project tab, the Finance hub, the property workbench — because the
 * report is about three different things and belongs beside each of them. It is ONE component for
 * the same reason the SQL is one system: three copies would drift on the first change.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Gauge, Loader2, RefreshCw, ListPlus, X, Check, AlertTriangle, ArrowRight,
  CheckCircle2, CircleSlash, HelpCircle, History,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { CreditTopUpDialog, type CreditTopUpRequest } from '@/components/core/CreditTopUpDialog';
import { formatDate } from '@/utils/datetime';
import { humanizeLabel } from '@/utils/humanize';
import {
  ASSESSMENT_DIMENSIONS,
  ASSESSMENT_DIMENSION_LABELS,
  ASSESSMENT_DIMENSION_BLURBS,
  ASSESSMENT_VERDICT_LABELS,
  ACTION_EFFORT_LABELS,
  type AssessmentSubject,
  type AssessmentDimension,
  type AssessmentVerdict,
  type SignalSeverity,
} from '@/services/assessment/assessmentVocabulary';
import { assessmentDestinationHref } from '@/services/assessment/assessmentDestinations';
import {
  assessmentService,
  AssessmentBlocked,
  type AssessmentSnapshot,
  type AssessmentRecord,
  type AssessmentAction,
  type AssessmentSignal,
} from '@/services/assessment/assessmentService';

interface Props {
  subject: AssessmentSubject;
  /** The project id, the workspace id, or the property id. Finance never shows it in a URL. */
  subjectId: string;
  /** Whether this viewer may spend credits and act on the result. */
  canRun: boolean;
  /** What the subject is called, for the empty state's copy. */
  subjectName?: string;
}

/**
 * Verdict → badge variant. Light/dark pairs come from the Badge's semantic variants rather than
 * raw palette shades, which are a light/dark PAIR and get written as one set of classes by
 * accident (the Inbox source chip, 1.23:1 on cream).
 */
const VERDICT_VARIANT: Record<AssessmentVerdict, 'success' | 'warning' | 'error' | 'neutral'> = {
  on_track: 'success',
  at_risk: 'warning',
  off_track: 'error',
  stalled: 'error',
  not_enough_data: 'neutral',
};

const SEVERITY_VARIANT: Record<SignalSeverity, 'error' | 'warning' | 'neutral' | 'info'> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'neutral',
  info: 'info',
};

const VERDICT_BLURB: Record<AssessmentVerdict, string> = {
  on_track: 'Nothing here needs attention today.',
  at_risk: 'Working, but something will bite if it is left.',
  off_track: 'Something is wrong now, not later.',
  stalled: 'Nothing has moved on this for over a month.',
  not_enough_data: 'Too little is recorded to judge this. That is a finding, not a pass.',
};

/** What the paid button offers, per subject. The copy is the only thing that differs. */
const RUN_COPY: Record<AssessmentSubject, { first: string; again: string; empty: string }> = {
  project: {
    first: 'Assess this project', again: 'Re-assess',
    empty: 'The signals above are already derived. An assessment adds the verdict in words and a ranked list of what to do first.',
  },
  finance: {
    first: 'Assess the books', again: 'Re-assess',
    empty: 'The signals above are already derived from your ledgers. An assessment adds the verdict in words and a ranked list of what to fix first.',
  },
  real_estate: {
    first: 'Assess this listing', again: 'Re-assess',
    empty: 'The signals above are already derived. An assessment adds the verdict in words and a ranked list of what to fix first.',
  },
};

const STATUS_ICON = {
  ok: CheckCircle2,
  attention: AlertTriangle,
  no_data: HelpCircle,
  not_applicable: CircleSlash,
} as const;

const ScoreTile: React.FC<{
  subject: AssessmentSubject;
  dimension: AssessmentDimension;
  score: number | null;
  attention: number;
  reason: string | null;
}> = ({ subject, dimension, score, attention, reason }) => (
  <div className="rounded-sm border border-hairline bg-card p-3">
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs font-semibold text-foreground">
        {ASSESSMENT_DIMENSION_LABELS[subject][dimension]}
      </span>
      {/* A dimension nothing could judge shows a WORD, never a 0 — a 0 is a score, and this is
          the absence of one. */}
      {score === null ? (
        <span className="text-xs font-medium text-muted-foreground">Not judged</span>
      ) : (
        <span className="font-mono text-lg font-semibold tabular-nums text-foreground">{Math.round(score)}</span>
      )}
    </div>
    <p className="mt-1 text-xs leading-snug text-muted-foreground">
      {score === null
        ? (reason ? humanizeLabel(reason) : 'Nothing measurable here yet')
        : attention > 0
          ? `${attention} thing${attention === 1 ? '' : 's'} to look at`
          : ASSESSMENT_DIMENSION_BLURBS[subject][dimension]}
    </p>
  </div>
);

const SignalRow: React.FC<{
  signal: AssessmentSignal; subject: AssessmentSubject; subjectId: string;
}> = ({ signal, subject, subjectId }) => {
  const Icon = STATUS_ICON[signal.status] ?? HelpCircle;
  const href = assessmentDestinationHref(subject, subjectId, signal.destination);
  const tone =
    signal.status === 'attention'
      ? (signal.severity === 'critical' || signal.severity === 'high'
        ? 'text-red-700 dark:text-red-400'
        : 'text-amber-800 dark:text-amber-400')
      : 'text-muted-foreground';
  return (
    <li className="flex items-start gap-2 border-b border-hairline py-2 last:border-b-0">
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-foreground">{signal.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {signal.status === 'attention' ? humanizeLabel(signal.severity) : humanizeLabel(signal.status)}
          {signal.reason ? ` · ${humanizeLabel(signal.reason)}` : ''}
        </p>
      </div>
      {href && (
        <Link to={href} className="shrink-0 text-xs font-medium text-primary hover:underline">Open</Link>
      )}
    </li>
  );
};

export const AssessmentPanel: React.FC<Props> = ({ subject, subjectId, canRun, subjectName }) => {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<AssessmentSnapshot | null>(null);
  /** Out of credits is an offer, not a wall — see CreditTopUpDialog. */
  const [topUpRequest, setTopUpRequest] = useState<CreditTopUpRequest | null>(null);
  const [report, setReport] = useState<AssessmentRecord | null>(null);
  const [actions, setActions] = useState<AssessmentAction[]>([]);
  const [history, setHistory] = useState<AssessmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setBlocked(null);
    try {
      // The signals are free and live; the report is the stored snapshot. Loaded together so the
      // screen can say how far apart they are.
      const [snap, latest, past] = await Promise.all([
        assessmentService.preview(subject, subjectId).catch((e) => {
          if (e instanceof AssessmentBlocked) { setBlocked(e.message); return null; }
          throw e;
        }),
        assessmentService.latest(subject, subjectId),
        assessmentService.history(subject, subjectId),
      ]);
      setSnapshot(snap);
      setReport(latest);
      setHistory(past);
      setActions(latest ? await assessmentService.actionsFor(latest.id) : []);
    } catch (e) {
      toast({ title: 'Could not load the assessment', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [subject, subjectId, toast]);

  useEffect(() => { void load(); }, [load]);

  const runAssessment = async () => {
    setRunning(true);
    try {
      const out = await assessmentService.run(subject, subjectId);
      if (out.already_running) {
        toast({ title: 'Already running', description: 'An assessment is already in flight. Nothing was charged twice.' });
      } else {
        toast({
          title: 'Assessment complete',
          description: `${ASSESSMENT_VERDICT_LABELS[(out.verdict ?? 'not_enough_data') as AssessmentVerdict]} · ${out.actions_stored ?? 0} action(s)${out.credits_used ? ` · ${out.credits_used} credits` : ''}`,
        });
      }
      await load();
    } catch (e) {
      if (e instanceof AssessmentBlocked) {
        // Out of credits opens the top-up offer rather than a destructive toast — it is the one
        // refusal here the user can clear themselves, in about ten seconds.
        if (e.code === 'insufficient_credits') {
          setTopUpRequest({ action: 'run this assessment' });
          return;
        }
        setBlocked(e.message);
        toast({ title: 'Not available', description: e.message, variant: 'destructive' });
      } else {
        toast({ title: 'The assessment failed', description: (e as Error).message, variant: 'destructive' });
      }
    } finally {
      setRunning(false);
    }
  };

  const addAsTask = async (action: AssessmentAction) => {
    setBusyAction(action.id);
    try {
      const out = await assessmentService.applyAction(action.id, action.due_hint);
      if (!out.ok) {
        // `project_tasks` is the only task table there is. Saying so beats a button that appears
        // to work and changes nothing.
        toast({ title: 'No task list for this', description: out.error, variant: 'destructive' });
        return;
      }
      // Said out loud rather than reported as a fresh success: a retry after a dropped connection
      // returns the task that already exists, and the operator needs to know that is what happened.
      toast({ title: out.already ? 'Already on the task list' : 'Added to tasks', description: action.title });
      setActions((prev) => prev.map((a) => (a.id === action.id
        ? { ...a, state: 'task_created', task_id: out.task_id } : a)));
    } catch (e) {
      toast({ title: 'Could not add the task', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusyAction(null);
    }
  };

  const setActionState = async (action: AssessmentAction, state: 'open' | 'done' | 'dismissed') => {
    setBusyAction(action.id);
    try {
      await assessmentService.resolveAction(action.id, state);
      setActions((prev) => prev.map((a) => (a.id === action.id ? { ...a, state } : a)));
    } catch (e) {
      toast({ title: 'Could not update the action', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusyAction(null);
    }
  };

  const dimensions = snapshot?.dimensions ?? report?.scores?.dimensions ?? null;
  const signals = snapshot?.signals ?? report?.signals ?? [];
  const shownSignals = useMemo(
    () => (showAll ? signals : signals.filter((s) => s.status === 'attention' || s.status === 'no_data')),
    [signals, showAll],
  );
  const verdict = (snapshot?.verdict ?? report?.verdict ?? null) as AssessmentVerdict | null;
  const openActions = actions.filter((a) => a.state === 'open');
  const copy = RUN_COPY[subject];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (blocked) {
    return (
      <Card>
        <CardContent className="py-8">
          <HubEmptyState
            icon={Gauge}
            title="AI Assessment is not available here"
            description={blocked}
            action={<Button asChild variant="secondary"><Link to="/profile?tab=modules">Open Modules</Link></Button>}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── verdict + run ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" aria-hidden />
              Assessment
            </CardTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {verdict && <Badge variant={VERDICT_VARIANT[verdict]}>{ASSESSMENT_VERDICT_LABELS[verdict]}</Badge>}
              {snapshot?.overall_score != null && (
                <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                  {Math.round(snapshot.overall_score)}<span className="text-muted-foreground">/100</span>
                </span>
              )}
              {snapshot && (
                <span className="text-xs text-muted-foreground">
                  {snapshot.judged_dimensions} of {ASSESSMENT_DIMENSIONS.length} areas judged · signals as of {formatDate(snapshot.as_of)}
                </span>
              )}
            </div>
            {verdict && <p className="mt-1 text-xs text-muted-foreground">{VERDICT_BLURB[verdict]}</p>}
          </div>
          {canRun && (
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={running}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Refresh signals
              </Button>
              <Button size="sm" onClick={() => void runAssessment()} disabled={running}>
                {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Gauge className="mr-1.5 h-3.5 w-3.5" />}
                {report ? copy.again : copy.first}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {/* Every dimension, every time. */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ASSESSMENT_DIMENSIONS.map((d) => (
              <ScoreTile
                key={d}
                subject={subject}
                dimension={d}
                score={dimensions?.[d]?.score ?? null}
                attention={dimensions?.[d]?.attention_signals ?? 0}
                reason={dimensions?.[d]?.reason ?? null}
              />
            ))}
          </div>
          {/* The AI half is what costs money, and the screen says so before it is spent. */}
          {canRun && (
            <p className="mt-3 text-xs text-muted-foreground">
              The scores above are derived from your data and cost nothing. Running an assessment adds
              the written verdict and the ranked plan — one AI turn, charged in credits.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── the written report ──────────────────────────────────────────── */}
      {report ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{report.headline || 'Assessment'}</CardTitle>
            <p className="text-xs text-muted-foreground">
              Written {formatDate(report.completed_at ?? report.created_at)}
              {report.model ? ` · ${report.model}` : ''}
              {report.credits_used ? ` · ${report.credits_used} credits` : ''}
            </p>
          </CardHeader>
          <CardContent>
            {report.narrative
              ? report.narrative.split(/\n{2,}/).map((p, i) => (
                <p key={i} className="mb-3 text-sm leading-relaxed text-foreground last:mb-0">{p}</p>
              ))
              : <p className="text-sm text-muted-foreground">This report has no narrative.</p>}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8">
            <HubEmptyState
              icon={Gauge}
              title={`${subjectName ? `${subjectName} has` : 'This has'} no written assessment yet`}
              description={copy.empty}
              action={canRun
                ? (
                  <Button size="sm" onClick={() => void runAssessment()} disabled={running}>
                    {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Gauge className="mr-1.5 h-3.5 w-3.5" />}
                    {copy.first}
                  </Button>
                )
                : undefined}
            />
          </CardContent>
        </Card>
      )}

      {/* ── what to do ──────────────────────────────────────────────────── */}
      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What to do next</CardTitle>
            <p className="text-xs text-muted-foreground">
              {openActions.length} open of {actions.length}
              {subject === 'project' ? ' · adding one creates a real task on this project' : ''}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {actions.length === 0 ? (
              <HubEmptyState
                icon={CheckCircle2}
                title="Nothing was recommended"
                description="The assessment found nothing worth acting on. That is a result, not an empty list."
              />
            ) : (
              <ul>
                {actions.map((a) => {
                  const href = assessmentDestinationHref(subject, subjectId, a.destination);
                  const resolved = a.state === 'done' || a.state === 'dismissed';
                  return (
                    <li key={a.id} className="border-b border-hairline px-4 py-3 last:border-b-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs tabular-nums text-muted-foreground">{a.priority}</span>
                            <span className={`text-sm font-medium ${resolved ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                              {a.title}
                            </span>
                            {a.impact && <Badge variant={SEVERITY_VARIANT[a.impact]}>{humanizeLabel(a.impact)}</Badge>}
                            {a.effort && <Badge variant="neutral">{ACTION_EFFORT_LABELS[a.effort]}</Badge>}
                          </div>
                          {a.rationale && <p className="mt-1 text-xs leading-snug text-muted-foreground">{a.rationale}</p>}
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                            <span className="text-muted-foreground">{ASSESSMENT_DIMENSION_LABELS[subject][a.dimension]}</span>
                            {a.due_hint && <span className="text-muted-foreground">by {formatDate(a.due_hint)}</span>}
                            {href && (
                              <Link to={href} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                                Go there <ArrowRight className="h-3 w-3" />
                              </Link>
                            )}
                            {a.task_id && subject === 'project' && (
                              <Link to={`/projects/${subjectId}?tab=tasks`} className="font-medium text-primary hover:underline">
                                On the task list
                              </Link>
                            )}
                          </div>
                        </div>
                        {canRun && !resolved && (
                          <div className="flex shrink-0 items-center gap-1.5">
                            {/* Only a project action can become a task — there is no task table
                                for the books or a listing, and a button that silently does
                                nothing is worse than no button. */}
                            {a.state === 'open' && subject === 'project' && (
                              <Button variant="outline" size="sm" disabled={busyAction === a.id} onClick={() => void addAsTask(a)}>
                                <ListPlus className="mr-1.5 h-3.5 w-3.5" />
                                Add as task
                              </Button>
                            )}
                            <Button
                              variant="ghost" size="sm" disabled={busyAction === a.id}
                              onClick={() => void setActionState(a, 'done')}
                              aria-label={`Mark "${a.title}" done`}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="sm" disabled={busyAction === a.id}
                              onClick={() => void setActionState(a, 'dismissed')}
                              aria-label={`Dismiss "${a.title}"`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                        {resolved && canRun && (
                          <Button variant="ghost" size="sm" disabled={busyAction === a.id} onClick={() => void setActionState(a, 'open')}>
                            Reopen
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── the signals themselves ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Signals</CardTitle>
            <p className="text-xs text-muted-foreground">
              {signals.filter((s) => s.status === 'attention').length} needing attention ·{' '}
              {signals.filter((s) => s.status === 'ok').length} fine ·{' '}
              {signals.filter((s) => s.status === 'no_data').length} not recorded ·{' '}
              {signals.filter((s) => s.status === 'not_applicable').length} not applicable
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Only what matters' : 'Show all'}
          </Button>
        </CardHeader>
        <CardContent>
          {shownSignals.length === 0 ? (
            <HubEmptyState
              icon={CheckCircle2}
              title="Every check passed"
              description="Nothing here is flagged and nothing is unrecorded."
            />
          ) : (
            ASSESSMENT_DIMENSIONS.map((d) => {
              const rows = shownSignals.filter((s) => s.dimension === d);
              if (rows.length === 0) return null;
              return (
                <div key={d} className="mb-4 last:mb-0">
                  <h4 className="mb-1 text-xs font-semibold text-muted-foreground">
                    {ASSESSMENT_DIMENSION_LABELS[subject][d]}
                  </h4>
                  <ul>
                    {rows.map((s) => (
                      <SignalRow key={s.code} signal={s} subject={subject} subjectId={subjectId} />
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ── history, failures included ──────────────────────────────────── */}
      {history.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-muted-foreground" aria-hidden />
              Past runs
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="bg-surface-sunken">
                  <tr className="text-left text-[11px] font-semibold text-muted-foreground">
                    <th className="px-4 py-2">Run</th>
                    <th className="px-4 py-2">Verdict</th>
                    <th className="px-4 py-2 text-right">Score</th>
                    <th className="px-4 py-2 text-right">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-t border-hairline">
                      <td className="px-4 py-2 text-muted-foreground">{formatDate(h.created_at)}</td>
                      <td className="px-4 py-2">
                        {/* A failed run is shown, with its reason. Hiding it leaves a gap in the
                            history with no explanation attached to it. */}
                        {h.run_status === 'complete' && h.verdict
                          ? <Badge variant={VERDICT_VARIANT[h.verdict]}>{ASSESSMENT_VERDICT_LABELS[h.verdict]}</Badge>
                          : <span className="text-xs text-red-700 dark:text-red-400">
                            {humanizeLabel(h.run_status)}{h.error_message ? ` — ${h.error_message}` : ''}
                          </span>}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">
                        {h.overall_score == null ? '—' : Math.round(h.overall_score)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">
                        {h.credits_used == null ? '—' : h.credits_used}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <CreditTopUpDialog
        open={!!topUpRequest}
        request={topUpRequest ?? undefined}
        onClose={() => setTopUpRequest(null)}
      />
    </div>
  );
};

/**
 * Start Here — the first-run walkthrough.
 *
 * Opens itself once, from the dashboard, for a member who has never seen it; afterwards it lives
 * under the profile menu. The setup steps mount the platform's REAL settings components, so there
 * is no second form writing the same columns.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CircleHelp, Compass, Loader2, X } from 'lucide-react';

import { Layout } from '@/components/core/Layout';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useFactoryRole } from '@/hooks/useFactoryRole';
import { usePermissions } from '@/hooks/usePermissions';
import { useOnboarding } from '@/hooks/useOnboarding';
import { onboardingService, type OnboardingSetupStatus } from '@/services/onboardingService';
import type { OnboardingHighlight, OnboardingStep } from '@/config/onboardingSteps';
import { cn } from '@/lib/utils';

import { BusinessIdentityCard } from '@/modules/finance/components/BusinessIdentityCard';
import { InboundSetupCard } from '@/modules/finance/components/InboundSetupCard';
import { AadeCredentialsCard } from '@/modules/myaade/components/AadeCredentialsCard';
import { ModulesActivationTab } from '@/components/core/Profile/ModulesActivationTab';
import { TeamPanel } from '@/components/core/Team/TeamPanel';

// ───────────────────────────── the rail ─────────────────────────────

interface RailProps {
  steps: OnboardingStep[];
  activeIndex: number;
  seen: string[];
  setupStatus: OnboardingSetupStatus | null;
  onPick: (index: number) => void;
}

/** A setup step's tick comes from the DATA; a tour step's from having been read. */
function stepDone(
  step: OnboardingStep,
  seen: string[],
  setupStatus: OnboardingSetupStatus | null,
): boolean {
  if (step.id === 'business') return setupStatus?.business === 'ok';
  if (step.id === 'myaade') return setupStatus?.myaade === 'ok';
  return seen.includes(step.id);
}

const StepRail: React.FC<RailProps> = ({ steps, activeIndex, seen, setupStatus, onPick }) => (
  <>
    {/* Desktop: the full rail. Below lg it would be a wall of rows above the content. */}
    <nav aria-label="Setup steps" className="hidden lg:block w-72 shrink-0">
      <ol className="space-y-1">
        {steps.map((step, i) => {
          const done = stepDone(step, seen, setupStatus);
          const active = i === activeIndex;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onPick(i)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'w-full text-left rounded-sm px-3 py-3 flex gap-3 transition-colors',
                  active ? 'bg-surface-sunken' : 'hover:bg-surface-sunken/60',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 h-5 w-5 shrink-0 rounded-full grid place-items-center border text-[10px]',
                    done
                      ? 'bg-primary border-primary text-primary-foreground'
                      : active
                        ? 'border-primary text-primary'
                        : 'border-hairline text-muted-foreground',
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={cn('block text-sm', active ? 'font-medium' : 'text-foreground/90')}>
                    {step.navLabel}
                  </span>
                  <span className="block text-[11px] text-muted-foreground leading-snug mt-0.5">
                    {step.kind === 'setup' ? 'Set this up' : 'Have a look'}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>

    {/* Below lg: a strip, so the step you asked for is not pushed under the fold. */}
    <div className="lg:hidden -mx-4 px-4 overflow-x-auto">
      <ol className="flex gap-2 w-max pb-2">
        {steps.map((step, i) => {
          const done = stepDone(step, seen, setupStatus);
          const active = i === activeIndex;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onPick(i)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'whitespace-nowrap rounded-sm border px-3 py-1.5 text-xs flex items-center gap-1.5',
                  active
                    ? 'border-primary text-primary bg-surface-sunken'
                    : 'border-hairline text-muted-foreground',
                )}
              >
                {done ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
                {step.navLabel}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  </>
);

// ───────────────────────────── tour body ─────────────────────────────

const HighlightCard: React.FC<{ item: OnboardingHighlight; available: boolean }> = ({
  item, available,
}) => {
  const Icon = item.icon;
  // A tile for a module the workspace does not own points at Modules, never at a page that would
  // render nothing — the "live link to a wall" failure this platform keeps re-learning.
  const to = available ? item.route : '/profile?tab=modules';
  return (
    <Link
      to={to}
      className="panel-interactive rounded-sm border border-hairline bg-card p-3 flex gap-3 min-w-0"
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
      <span className="min-w-0">
        <span className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{item.label}</span>
          {!available && <Badge variant="neutral">Not switched on</Badge>}
        </span>
        <span className="block text-xs text-muted-foreground leading-snug mt-1">
          {item.description}
        </span>
      </span>
    </Link>
  );
};

// ───────────────────────────── setup bodies ─────────────────────────────

const SetupBody: React.FC<{ stepId: string; workspaceId: string; workspaceName?: string }> = ({
  stepId, workspaceId, workspaceName,
}) => {
  if (stepId === 'business') return <BusinessIdentityCard workspaceId={workspaceId} />;
  if (stepId === 'myaade') {
    return (
      <div className="space-y-4">
        <AadeCredentialsCard workspaceId={workspaceId} />
        <InboundSetupCard workspaceId={workspaceId} />
      </div>
    );
  }
  if (stepId === 'workspace') {
    return (
      <div className="space-y-6">
        <ModulesActivationTab />
        <TeamPanel workspaceId={workspaceId} workspaceName={workspaceName} />
      </div>
    );
  }
  return null;
};

// ───────────────────────────── the page ─────────────────────────────

const StartHerePage: React.FC = () => {
  const navigate = useNavigate();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { isModuleAvailable } = useEntitlements();
  const { isAdmin } = useFactoryRole();
  const { can } = usePermissions();
  const { loading, progress, steps, start, saveProgress, finish, restart } = useOnboarding();

  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState<string[]>([]);
  const [setupStatus, setSetupStatus] = useState<OnboardingSetupStatus | null>(null);
  const [restored, setRestored] = useState(false);

  // Clamp rather than index blindly: switching workspace can SHRINK the list (admin here, plain
  // member there), and `steps[index]` going undefined renders "nothing to walk through" over a
  // walkthrough that has five perfectly good steps left.
  const safeIndex = steps.length ? Math.min(index, steps.length - 1) : 0;
  const step = steps[safeIndex];
  const isLast = safeIndex === steps.length - 1;

  // Claim the first run, or pick up where a previous visit left off. Re-opening a FINISHED
  // walkthrough from the profile menu starts it again from the top — restoring `current_step`
  // there would drop the reader on the last screen of something they asked to see again.
  useEffect(() => {
    if (loading || restored || steps.length === 0) return;
    if (progress === null) {
      void start();
    } else if (progress && progress.status !== 'active') {
      void restart();
      setSeen(progress.completedSteps);
      setIndex(0);
    } else if (progress) {
      setSeen(progress.completedSteps);
      const at = steps.findIndex((s) => s.id === progress.currentStep);
      if (at >= 0) setIndex(at);
    }
    setRestored(true);
  }, [loading, restored, progress, steps, start, restart]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    void onboardingService.setupStatus(activeWorkspaceId).then(setSetupStatus);
  }, [activeWorkspaceId, safeIndex]);

  const goTo = useCallback((next: number) => {
    if (!step) return;
    const nextSeen = seen.includes(step.id) ? seen : [...seen, step.id];
    setSeen(nextSeen);
    const target = Math.min(Math.max(next, 0), steps.length - 1);
    setIndex(target);
    void saveProgress(steps[target]?.id ?? step.id, nextSeen);
  }, [step, seen, steps, saveProgress]);

  const complete = useCallback(async () => {
    const nextSeen = step && !seen.includes(step.id) ? [...seen, step.id] : seen;
    await finish('completed', nextSeen);
    navigate('/');
  }, [finish, navigate, seen, step]);

  const dismiss = useCallback(async () => {
    await finish('skipped', seen);
    navigate('/');
  }, [finish, navigate, seen]);

  // An admin-gated destination is DROPPED rather than shown greyed: the nav hides it for the same
  // member, and a tile whose guard refuses on click is the "offered but not bound" failure.
  const highlights = useMemo(
    () => (step?.highlights ?? []).filter((h) => (
      (!h.requireAdmin || isAdmin)
      && (!h.requireCapability || can(h.requireCapability))
      && (!h.requireAnyCapability || h.requireAnyCapability.some(can))
    )),
    [step, isAdmin, can],
  );

  if (loading && !step) {
    return (
      <Layout>
        <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </Layout>
    );
  }

  if (!step || !activeWorkspaceId) {
    return (
      <Layout>
        <div className="p-6">
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <CircleHelp className="h-6 w-6 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                There is nothing to walk through on this account yet.
              </p>
              <Button onClick={() => navigate('/')}>Go to the dashboard</Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const StepIcon = step.icon;

  return (
    <Layout>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto w-full">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
              <Compass className="h-3.5 w-3.5" />
              Start Here
              <span aria-hidden>·</span>
              Step {safeIndex + 1} of {steps.length}
            </div>
            <h1 className="font-display text-2xl mt-1">Welcome to Materials Hub</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={dismiss} className="shrink-0">
            <X className="h-4 w-4 mr-1" /> Skip for now
          </Button>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <StepRail
            steps={steps}
            activeIndex={safeIndex}
            seen={seen}
            setupStatus={setupStatus}
            onPick={goTo}
          />

          <div className="flex-1 min-w-0 space-y-4">
            <Card>
              <CardContent className="pt-6 space-y-2">
                <div className="flex items-center gap-2">
                  <StepIcon className="h-5 w-5 text-primary shrink-0" />
                  {/* font-sans, not the display face: a step title can be Greek ("…ΑΑΔΕ"), and
                      Aleo has no Greek glyphs, so it would split mid-line into two faces. */}
                  <h2 className="font-sans text-xl font-medium">{step.title}</h2>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.lede}</p>
                {step.footnote && (
                  <p className="text-xs text-muted-foreground/80 pt-1">{step.footnote}</p>
                )}
              </CardContent>
            </Card>

            {step.kind === 'setup' ? (
              <SetupBody
                stepId={step.id}
                workspaceId={activeWorkspaceId}
                workspaceName={activeWorkspace?.name}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {highlights.map((item) => (
                  <HighlightCard
                    key={item.label}
                    item={item}
                    available={!item.moduleSlug || isModuleAvailable(item.moduleSlug)}
                  />
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-hairline pt-4">
              <Button
                variant="outline"
                onClick={() => goTo(safeIndex - 1)}
                disabled={safeIndex === 0}
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              {isLast ? (
                <Button onClick={complete}>
                  <Check className="h-4 w-4 mr-1" /> Finish
                </Button>
              ) : (
                // Each embedded settings card owns its own Save; this button only moves on, and
                // saying "Save and continue" would claim a write it does not perform.
                <Button onClick={() => goTo(safeIndex + 1)}>
                  Continue <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default StartHerePage;

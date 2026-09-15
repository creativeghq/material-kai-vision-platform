/**
 * Start Here — progress for the active member/workspace pair, and the first-run decision.
 *
 * The auto-open rule is "no row yet". That is what makes it first-run-only without a flag that
 * someone has to remember to set: finishing or skipping writes a terminal status, and nothing
 * re-opens it except the profile menu.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { visibleOnboardingSteps, type OnboardingStep } from '@/config/onboardingSteps';
import {
  onboardingService,
  type OnboardingProgress,
  type OnboardingStatus,
} from '@/services/onboardingService';

export interface OnboardingState {
  loading: boolean;
  /** `null` = never started, `undefined` = we could not ask. */
  progress: OnboardingProgress | null | undefined;
  /** The steps this member gets, after the capability filter. */
  steps: OnboardingStep[];
  start: () => Promise<void>;
  saveProgress: (currentStep: string, completedSteps: string[]) => Promise<void>;
  finish: (status: Exclude<OnboardingStatus, 'active'>, completedSteps: string[]) => Promise<void>;
  restart: () => Promise<void>;
}

export function useOnboarding(): OnboardingState {
  const { user } = useAuth();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const { can, isWorkspaceManager, loading: permissionsLoading } = usePermissions();

  const [progress, setProgress] = useState<OnboardingProgress | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const steps = useMemo(
    () => visibleOnboardingSteps({ isWorkspaceManager, can }),
    [isWorkspaceManager, can],
  );

  useEffect(() => {
    let cancelled = false;
    if (!user?.id || !activeWorkspaceId) {
      setLoading(workspaceLoading);
      return () => { cancelled = true; };
    }
    setLoading(true);
    void onboardingService.get(user.id, activeWorkspaceId).then((row) => {
      if (cancelled) return;
      setProgress(row);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user?.id, activeWorkspaceId, workspaceLoading]);

  const firstStepId = steps[0]?.id ?? '';

  const start = useCallback(async () => {
    if (!user?.id || !activeWorkspaceId || !firstStepId) return;
    await onboardingService.start(user.id, activeWorkspaceId, firstStepId);
    setProgress(await onboardingService.get(user.id, activeWorkspaceId) ?? undefined);
  }, [user?.id, activeWorkspaceId, firstStepId]);

  const saveProgress = useCallback(async (currentStep: string, completedSteps: string[]) => {
    if (!user?.id || !activeWorkspaceId) return;
    await onboardingService.saveProgress(user.id, activeWorkspaceId, currentStep, completedSteps);
    setProgress((p) => (p ? { ...p, currentStep, completedSteps } : p));
  }, [user?.id, activeWorkspaceId]);

  const finish = useCallback(async (
    status: Exclude<OnboardingStatus, 'active'>,
    completedSteps: string[],
  ) => {
    if (!user?.id || !activeWorkspaceId) return;
    await onboardingService.finish(user.id, activeWorkspaceId, status, completedSteps);
    setProgress((p) => (p ? { ...p, status, completedSteps } : p));
  }, [user?.id, activeWorkspaceId]);

  const restart = useCallback(async () => {
    if (!user?.id || !activeWorkspaceId || !firstStepId) return;
    await onboardingService.restart(user.id, activeWorkspaceId, firstStepId);
    setProgress((p) => (p ? { ...p, status: 'active', currentStep: firstStepId } : p));
  }, [user?.id, activeWorkspaceId, firstStepId]);

  return {
    loading: loading || workspaceLoading || permissionsLoading,
    progress,
    steps,
    start,
    saveProgress,
    finish,
    restart,
  };
}

/**
 * Should the dashboard hand this visit to the wizard? Only from `/`, only when the member has
 * never started, and only when they have steps to see. A read that FAILED returns false — an
 * offline moment must not replay the walkthrough at somebody who finished it.
 */
/**
 * Once per browser session, whatever the database says. `start()` writing the claim row is what
 * normally stops the second redirect — if that write fails (offline, RLS), the row stays absent
 * and every visit to the dashboard would bounce again. This makes the failure "the walkthrough
 * did not stick", not "I cannot reach my dashboard".
 */
// Keyed by workspace, like the claim row it stands in for: switching to a brand-new workspace in
// the same tab is a different first run, and a session-wide key would swallow it.
const autoOpenKey = (workspaceId: string) => `start-here:auto-opened:${workspaceId}`;

function alreadyAutoOpened(workspaceId: string): boolean {
  try {
    return sessionStorage.getItem(autoOpenKey(workspaceId)) === '1';
  } catch {
    // Private windows and blocked site data throw. Fail closed: do not redirect.
    return true;
  }
}

export function useOnboardingAutoOpen(): boolean {
  const { user } = useAuth();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const { can, isWorkspaceManager, loading: permissionsLoading } = usePermissions();
  const [shouldOpen, setShouldOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ready = !!user?.id && !!activeWorkspaceId && !workspaceLoading && !permissionsLoading;
    const hasSteps = visibleOnboardingSteps({ isWorkspaceManager, can }).length > 0;

    if (ready && hasSteps && !alreadyAutoOpened(activeWorkspaceId!)) {
      const ws = activeWorkspaceId!;
      void onboardingService.get(user!.id, ws).then((row) => {
        if (cancelled || row !== null) return;
        try { sessionStorage.setItem(autoOpenKey(ws), '1'); } catch { /* not worth failing over */ }
        setShouldOpen(true);
      });
    }
    return () => { cancelled = true; };
  }, [user, activeWorkspaceId, workspaceLoading, permissionsLoading, isWorkspaceManager, can]);

  return shouldOpen;
}

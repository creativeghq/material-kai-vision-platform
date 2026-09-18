/** Start Here — the one reader/writer of `user_onboarding`. */
import { supabase } from '@/integrations/supabase/client';
import { aadeService } from '@/modules/myaade/services/aadeService';

export type OnboardingStatus = 'active' | 'completed' | 'skipped';

export interface OnboardingProgress {
  userId: string;
  workspaceId: string;
  status: OnboardingStatus;
  currentStep: string | null;
  completedSteps: string[];
  startedAt: string;
  completedAt: string | null;
}

interface OnboardingRow {
  user_id: string;
  workspace_id: string;
  status: string;
  current_step: string | null;
  completed_steps: string[] | null;
  started_at: string;
  completed_at: string | null;
}

const asProgress = (row: OnboardingRow): OnboardingProgress => ({
  userId: row.user_id,
  workspaceId: row.workspace_id,
  // An unrecognised status fails closed to 'completed': the wizard is a nudge, and a row we
  // cannot read must never become a reason to re-open it on every visit.
  status: (['active', 'completed', 'skipped'] as const).includes(row.status as OnboardingStatus)
    ? (row.status as OnboardingStatus)
    : 'completed',
  currentStep: row.current_step,
  completedSteps: row.completed_steps ?? [],
  startedAt: row.started_at,
  completedAt: row.completed_at,
});

/**
 * Whether a setup step's work is actually done. `unknown` is a real answer and is rendered as
 * such — a read we could not make must never show as a green tick, and must never show as a red
 * cross either.
 */
export type SetupVerdict = 'ok' | 'missing' | 'unknown';

export interface OnboardingSetupStatus {
  business: SetupVerdict;
  myaade: SetupVerdict;
  einvoicing: SetupVerdict;
}

export const onboardingService = {
  /**
   * The member's progress, or `null` when they have never started. Absence is what makes the
   * wizard first-run-only, so a read failure returns `undefined` instead — the caller must be
   * able to tell "never started" from "could not ask", or a flaky network re-opens the wizard
   * over somebody who finished it weeks ago.
   */
  async get(userId: string, workspaceId: string): Promise<OnboardingProgress | null | undefined> {
    const { data, error } = await supabase
      .from('user_onboarding')
      .select('user_id, workspace_id, status, current_step, completed_steps, started_at, completed_at')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (error) {
      console.warn('[onboarding] could not read progress', error.message);
      return undefined;
    }
    return data ? asProgress(data as OnboardingRow) : null;
  },

  /** Claim the first run. `ignoreDuplicates` makes a second tab a no-op rather than a reset. */
  async start(userId: string, workspaceId: string, firstStep: string): Promise<void> {
    const { error } = await supabase
      .from('user_onboarding')
      .upsert(
        { user_id: userId, workspace_id: workspaceId, status: 'active', current_step: firstStep },
        { onConflict: 'user_id,workspace_id', ignoreDuplicates: true },
      );
    if (error) console.warn('[onboarding] could not start', error.message);
  },

  /** Record where the member is and which steps they have passed through. */
  async saveProgress(
    userId: string,
    workspaceId: string,
    currentStep: string,
    completedSteps: string[],
  ): Promise<void> {
    const { error } = await supabase
      .from('user_onboarding')
      .upsert(
        // No `status` on purpose: PostgREST only updates the columns it is given, so someone
        // re-reading a finished walkthrough from the profile menu does not reset it to 'active'.
        { user_id: userId, workspace_id: workspaceId, current_step: currentStep, completed_steps: completedSteps },
        { onConflict: 'user_id,workspace_id' },
      );
    if (error) console.warn('[onboarding] could not save progress', error.message);
  },

  /**
   * Finish. `status` separates the member who read it through from the one who dismissed it —
   * both stop the auto-open, and only the first means they saw the thing.
   */
  async finish(
    userId: string,
    workspaceId: string,
    status: Exclude<OnboardingStatus, 'active'>,
    completedSteps: string[] = [],
  ): Promise<void> {
    const { error } = await supabase
      .from('user_onboarding')
      .upsert(
        {
          user_id: userId,
          workspace_id: workspaceId,
          status,
          completed_steps: completedSteps,
          completed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,workspace_id' },
      );
    if (error) console.warn('[onboarding] could not finish', error.message);
  },

  /**
   * What the two setup steps look like from the data's side. A workspace has its business details
   * once it has a name AND a VAT number — a name alone is its own label and says nothing about
   * who issues the invoice.
   *
   * ΑΑΔΕ asks `creds-status`, never `workspace_aade_credentials` directly: an empty table does NOT
   * mean lookups are unconfigured, since a workspace inheriting platform-level codes has no row.
   */
  async setupStatus(workspaceId: string): Promise<OnboardingSetupStatus> {
    const [settings, aade, einvoice] = await Promise.all([
      supabase
        .from('finance_settings')
        .select('business_name, business_vat')
        .eq('workspace_id', workspaceId)
        .maybeSingle(),
      aadeService.getDefaultStatus(workspaceId).catch(() => null),
      supabase.rpc('get_einvoice_onboarding', { p_workspace_id: workspaceId }),
    ]);

    return {
      business: settings.error
        ? 'unknown'
        : settings.data?.business_name && settings.data?.business_vat ? 'ok' : 'missing',
      // `null` is a call we could not make, which is an unknown — never a red cross.
      myaade: aade === null
        ? 'unknown'
        : aade.source !== 'none' && aade.has_password ? 'ok' : 'missing',
      // Novus's own word for it — nothing a member clicks produces this tick.
      einvoicing: einvoice.error
        ? 'unknown'
        : (einvoice.data as { can_transmit?: boolean } | null)?.can_transmit ? 'ok' : 'missing',
    };
  },

  /** Re-open it deliberately — what "Start Here" in the profile menu does on a second visit. */
  async restart(userId: string, workspaceId: string, firstStep: string): Promise<void> {
    const { error } = await supabase
      .from('user_onboarding')
      .upsert(
        {
          user_id: userId,
          workspace_id: workspaceId,
          status: 'active',
          current_step: firstStep,
          completed_at: null,
        },
        { onConflict: 'user_id,workspace_id' },
      );
    if (error) console.warn('[onboarding] could not restart', error.message);
  },
};

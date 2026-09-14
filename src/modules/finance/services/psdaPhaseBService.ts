/**
 * ΨΔΑ Phase Β readiness (#407).
 *
 * Both verdicts are derived in SQL. The route is a recorded decision rather than an inferred one:
 * guessing it from whichever connector happens to be configured would report a filing path that
 * cannot carry the four operations.
 */
import { supabase } from '@/integrations/supabase/client';

import type { PsdaRoutePosition, CnCoverage, PsdaRoute } from '@/modules/finance/psdaPhaseBRules';

export type {
  PsdaRouteStatus, PsdaRoute, CnCoverageStatus, PsdaRoutePosition, CnCoverage,
} from '@/modules/finance/psdaPhaseBRules';
export {
  ROUTE_STATUS_LABEL, ROUTE_LABEL, CN_STATUS_LABEL, routeNeedsDecision, eventsAreStranded,
  cnNeedsWork, cnFromTaric, PHASE_B1_FROM, PHASE_B2_FROM, PENALTY_IS_PER_AUDIT, DATE_MOVES_LATE,
  COPYABLE_IS_HISTORIC, SUPPRESSION_BASIS,
} from '@/modules/finance/psdaPhaseBRules';

export const psdaPhaseBService = {
  async route(workspaceId: string): Promise<PsdaRoutePosition> {
    const { data, error } = await supabase.rpc('psda_transmission_route' as never, {
      p_workspace: workspaceId,
    } as never);
    if (error) throw error;
    return data as unknown as PsdaRoutePosition;
  },

  async cnCoverage(workspaceId: string, from?: string, to?: string): Promise<CnCoverage> {
    const { data, error } = await supabase.rpc('movement_cn_coverage' as never, {
      p_workspace: workspaceId, p_from: from ?? null, p_to: to ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as CnCoverage;
  },

  async setRoute(workspaceId: string, route: PsdaRoute | null, opts?: {
    confirmedOn?: string | null;
    credentialRef?: string | null;
  }): Promise<void> {
    const { error } = await supabase
      .from('finance_settings')
      .update({
        psda_event_route: route,
        psda_route_confirmed_on: opts?.confirmedOn ?? null,
        psda_direct_credential_ref: opts?.credentialRef ?? null,
      })
      .eq('workspace_id', workspaceId);
    if (error) throw error;
  },
};

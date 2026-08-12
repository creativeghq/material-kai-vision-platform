import { useEffect, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { inboxApi } from '@/services/inboxApi';
import { getDashboardInsights, type DashboardInsights } from '@/services/dashboardInsightsService';

/* ────────────────────────────────────────────────────────────────────────────
   Data layer for the dashboard command center.
   Extracted verbatim from MyOffice.tsx so the presentation could be rebuilt to
   the 2026 language without touching the queries or their loading semantics.
   ──────────────────────────────────────────────────────────────────────────── */

export interface OfficeStats {
  finance: { total: number; count: number; overdue: number; currency: string };
  projects: number;
  tasks: number;
  inbox: number;
}

export const EMPTY_OFFICE_STATS: OfficeStats = {
  finance: { total: 0, count: 0, overdue: 0, currency: 'EUR' },
  projects: 0,
  tasks: 0,
  inbox: 0,
};

/** Greeting names — two independent values:
 *    personName  → the human (full_name → signup display_name → email local-part)
 *    companyName → the business, from the first source that has one:
 *                  linked crm_company → finance_settings.business_name → branding.
 *  The workspace label ("Default Workspace") is a system name and never used. */
export function useOfficeIdentity() {
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const { user } = useAuth();
  const [personName, setPersonName] = useState('');
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    // Wait for the workspace to settle. The panel mounts DURING that resolution and
    // `activeWorkspaceId` is in the dep list, so running early just buys a throwaway
    // round of the same three queries with no workspace to read the issuer from.
    if (!user || workspaceLoading) return;
    let alive = true;
    (async () => {
      const metaName = (user.user_metadata?.display_name as string | undefined)?.trim() || '';
      const emailPrefix = user.email?.split('@')[0]?.trim() || '';

      const { data: prof } = await supabase
        .from('user_profiles')
        .select('full_name, business_id, branding_company_name')
        .eq('user_id', user.id)
        .maybeSingle();
      const fullName = (prof?.full_name as string | null)?.trim() || '';
      const person = [fullName, metaName, emailPrefix].find(Boolean) || '';

      let linkedCompany = '';
      if (prof?.business_id) {
        const { data: company } = await supabase
          .from('crm_companies')
          .select('name')
          .eq('id', prof.business_id)
          .maybeSingle();
        linkedCompany = (company?.name as string | null)?.trim() || '';
      }

      let issuerName = '';
      if (activeWorkspaceId) {
        const { data: fs } = await supabase
          .from('finance_settings')
          .select('business_name')
          .eq('workspace_id', activeWorkspaceId)
          .maybeSingle();
        issuerName = (fs?.business_name as string | null)?.trim() || '';
      }

      const branding = (prof?.branding_company_name as string | null)?.trim() || '';
      const company = [linkedCompany, issuerName, branding].find(Boolean) || '';

      if (alive) {
        setPersonName(person);
        setCompanyName(company);
      }
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [user, activeWorkspaceId, workspaceLoading]);

  return { personName, companyName };
}

export function useOfficeStats() {
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const [stats, setStats] = useState<OfficeStats>(EMPTY_OFFICE_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeWorkspaceId) {
      // Only leave the loading state once we KNOW there is no workspace. While the
      // workspace is still resolving, dropping out of it renders "—" / "0" in the
      // tiles for a beat and then swaps in the real numbers.
      if (!workspaceLoading) setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      const [invRes, projRes, taskRes, threadsRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('amount_due, due_at, status, currency')
          .eq('workspace_id', activeWorkspaceId)
          .in('status', ['issued', 'partially_paid', 'overdue'])
          .limit(1000),
        supabase
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', activeWorkspaceId)
          .in('status', ['planning', 'in_progress', 'on_hold']),
        userId
          ? supabase
              .from('project_tasks')
              .select('id', { count: 'exact', head: true })
              .eq('assignee_id', userId)
              .in('status', ['todo', 'in_progress', 'blocked'])
          : Promise.resolve({ count: 0 } as { count: number | null }),
        inboxApi.listThreads({ status: 'open' }).catch(() => ({ threads: [] as unknown[] })),
      ]);

      if (!alive) return;

      const invRows = (invRes.data ?? []) as Array<{
        amount_due: number | null;
        due_at: string | null;
        status: string;
        currency: string;
      }>;
      const now = Date.now();
      let total = 0;
      let overdue = 0;
      let currency = 'EUR';
      for (const r of invRows) {
        total += Number(r.amount_due ?? 0);
        if (r.status === 'overdue' || (r.due_at && new Date(r.due_at).getTime() < now)) overdue++;
        if (r.currency) currency = r.currency;
      }

      setStats({
        finance: { total: Math.round(total), count: invRows.length, overdue, currency },
        projects: projRes.count ?? 0,
        tasks: (taskRes as { count: number | null }).count ?? 0,
        inbox: ((threadsRes as { threads?: unknown[] })?.threads ?? []).length,
      });
      setLoading(false);
    })().catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [activeWorkspaceId, workspaceLoading]);

  return { stats, loading };
}

export function useOfficeInsights() {
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (force = false) => {
    if (!activeWorkspaceId) {
      // Same as the stats above — hold the skeleton until the workspace is settled,
      // otherwise the "Pro tip" empty state flashes in before the real insights.
      if (!workspaceLoading) setLoading(false);
      return;
    }
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await getDashboardInsights(activeWorkspaceId, { force });
      setInsights(res.insights);
    } catch {
      setInsights(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, workspaceLoading]);

  return { insights, loading, refreshing, reload: load };
}

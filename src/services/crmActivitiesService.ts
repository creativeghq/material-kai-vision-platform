import { supabase } from '@/integrations/supabase/client';

export type CrmActivityTargetKind = 'contact' | 'company' | 'user';
export interface CrmActivityTarget { kind: CrmActivityTargetKind; id: string }

export interface CrmActivity {
  id: string;
  target_kind: CrmActivityTargetKind;
  target_id: string;
  activity_type: string;
  title: string;
  description: string | null;
  metadata: Record<string, any>;
  actor_user_id: string | null;
  created_at: string;
  actor_name?: string | null;
}

class CrmActivitiesService {
  /**
   * Fire-and-forget activity log. NEVER throws — recording an activity must never
   * break the underlying action (sending the email, attaching the company, …).
   */
  async log(
    target: CrmActivityTarget,
    input: { activity_type: string; title: string; description?: string | null; metadata?: Record<string, any>; workspace_id?: string | null },
  ): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('crm_activities').insert({
        target_kind: target.kind,
        target_id: target.id,
        activity_type: input.activity_type,
        title: input.title,
        description: input.description ?? null,
        metadata: input.metadata ?? {},
        actor_user_id: user.id,
        workspace_id: input.workspace_id ?? null,
      });
    } catch (e) {
      console.warn('crm activity log failed (non-fatal):', e);
    }
  }

  async listForTarget(target: CrmActivityTarget, limit = 100): Promise<CrmActivity[]> {
    const { data, error } = await supabase
      .from('crm_activities')
      .select('id, target_kind, target_id, activity_type, title, description, metadata, actor_user_id, created_at')
      .eq('target_kind', target.kind)
      .eq('target_id', target.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const rows = (data || []) as CrmActivity[];

    // Resolve actor display names in one batch.
    const ids = [...new Set(rows.map((r) => r.actor_user_id).filter(Boolean))] as string[];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, full_name')
        .in('user_id', ids);
      const byId = new Map<string, string | null>((profiles || []).map((p: any) => [p.user_id as string, (p.full_name ?? null) as string | null]));
      for (const r of rows) r.actor_name = r.actor_user_id ? (byId.get(r.actor_user_id) ?? null) : null;
    }
    return rows;
  }
}

export const crmActivitiesService = new CrmActivitiesService();

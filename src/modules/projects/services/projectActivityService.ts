import { supabase } from '@/integrations/supabase/client';
import type { ProjectEvent } from './projectsService';

/**
 * The team timeline. `get_project_activity` merges `project_events` with request, client-message,
 * inspection and snag events derived from their own rows, so the feed is one ordered list.
 */
export async function listProjectActivity(projectId: string, limit = 200): Promise<ProjectEvent[]> {
  const { data, error } = await (supabase as any).rpc('get_project_activity', {
    p_project_id: projectId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as ProjectEvent[];
}

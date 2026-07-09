// #252 — client for the PUBLIC careers page (anonymous). Talks to the `hr-careers` edge function.
import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

export interface CareersJobSummary {
  id: string; title: string; location: string | null; remote: boolean;
  employment_type: string | null; salary_min: number | null; salary_max: number | null; currency: string | null;
  published_at: string | null; department: string | null;
}
export interface CareersJobDetail extends CareersJobSummary { description: string | null; requirements: string | null; }
export interface CareersMeta { company: string; turnstile_site_key: string | null; jobs: CareersJobSummary[]; }

async function call<T>(action: string, extra: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('hr-careers', { body: { action, ...extra } });
  if (error) throw await edgeError(error);
  return data as T;
}

export const publicCareersService = {
  meta: (slug: string) => call<CareersMeta>('meta', { slug }),
  getJob: (slug: string, job_id: string) => call<{ company: string; turnstile_site_key: string | null; job: CareersJobDetail }>('get-job', { slug, job_id }),
  apply: (slug: string, input: { job_id: string; name: string; email?: string; phone?: string; headline?: string; cover_letter?: string; turnstile_token?: string }) =>
    call<{ ok: boolean; already?: boolean; message?: string }>('apply', { slug, ...input }),
};

// #252 — client for the PUBLIC careers page (anonymous). Talks to the `hr-careers` edge function.
import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

/** One row of the multi-region compensation table shown in the job's facts rail. */
export interface CompensationBand {
  region: string;
  currency: string;
  min: number | null;
  max: number | null;
  equity: boolean;
  bonus: boolean;
  note: string | null;
}

/** Which optional fields the application form asks for (set per posting by the employer). */
export interface ApplyConfig {
  require_resume: boolean;
  ask_phone: boolean;
  ask_location: boolean;
  ask_links: boolean;
  ask_cover_letter: boolean;
}

export interface CareersJobSummary {
  id: string; slug: string | null; title: string;
  location: string | null; location_type: string | null; remote: boolean;
  employment_type: string | null; level: string | null;
  salary_min: number | null; salary_max: number | null; currency: string | null;
  compensation: CompensationBand[]; compensation_note: string | null;
  published_at: string | null; closes_at: string | null; department: string | null;
}
export interface CareersJobDetail extends CareersJobSummary {
  description: string | null;
  requirements: string | null;
  apply_config: ApplyConfig;
}
export interface CompanyProfile { name: string; tagline: string | null; logo_url: string | null; website: string | null }
export interface CareersMeta {
  company: string; company_profile: CompanyProfile; turnstile_site_key: string | null; jobs: CareersJobSummary[];
}

export interface ApplyInput {
  job_slug?: string; job_id?: string;
  name: string; email?: string; phone?: string; headline?: string; location?: string; links?: string;
  cover_letter?: string;
  /** Base64 PDF (no data-URL prefix) + its original filename. */
  resume_base64?: string; resume_filename?: string;
  turnstile_token?: string;
}

async function call<T>(action: string, extra: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('hr-careers', { body: { action, ...extra } });
  if (error) throw await edgeError(error);
  return data as T;
}

export const publicCareersService = {
  meta: (slug: string) => call<CareersMeta>('meta', { slug }),
  /** `job` is the posting's public slug; a raw uuid is accepted too (legacy links). */
  getJob: (slug: string, job: string) =>
    call<{ company: string; company_profile: CompanyProfile; turnstile_site_key: string | null; job: CareersJobDetail }>(
      'get-job',
      isUuid(job) ? { slug, job_id: job } : { slug, job_slug: job },
    ),
  apply: (slug: string, input: ApplyInput) =>
    call<{ ok: boolean; already?: boolean; message?: string }>('apply', { slug, ...input }),
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: string): boolean { return UUID_RE.test(v); }

/** Read a File as base64 without the `data:*;base64,` prefix (what the edge function expects). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
}

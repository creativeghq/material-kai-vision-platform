/** embedding-drain — embeds rows whose vector is missing or stale, one backlog per `?task=`. */
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isCronAuthorized } from '../_shared/auth.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { drainKbDocs } from './handlers/kb-docs.ts';
import { drainCrmCompanies } from './handlers/crm-companies.ts';

const TASKS: Record<string, (body: Record<string, unknown>) => Promise<Record<string, unknown>>> = {
  'kb-docs': drainKbDocs,
  'crm-companies': drainCrmCompanies,
};

Deno.serve(withApiLogging(
  (req) => {
    const t = new URL(req.url).searchParams.get('task');
    return t ? `embedding-drain?task=${t}` : 'embedding-drain';
  },
  async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

    if (!isCronAuthorized(req)) {
      const auth = await authenticate(req, { allowedRoles: ['admin'] });
      if (!auth.success) return json({ error: auth.error || 'Unauthorized' }, 401);
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const task = new URL(req.url).searchParams.get('task') ?? (typeof body.task === 'string' ? body.task : '');
    const run = TASKS[task];
    if (!run) throw new HttpError(400, `Unknown task '${task}'. Known: ${Object.keys(TASKS).join(', ')}`);

    return json({ success: true, task, ...(await run(body)) });
  },
));

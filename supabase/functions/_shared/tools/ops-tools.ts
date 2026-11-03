/**
 * Ops Tools: createCheckServerHealthTool, createQuerySentryTool, createIngestionReportTool
 */

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');
const { createClient } = await import('npm:@supabase/supabase-js@2');
import { callerDbClient } from '../caller-client.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * LangChain Tool: Check Server Health
 */
export const createCheckServerHealthTool = () => {
  return tool(
    async ({ checkType }) => {
      try {

        const MIVAA_API_URL = Deno.env.get('MIVAA_GATEWAY_URL') || Deno.env.get('MIVAA_SERVICE_URL') || 'https://v1api.materialshub.gr';

        // `/api/system/...`, not `/api/admin/system/...`. The admin router's prefix is `/api`
        // and the route is `/system/health`, so the extra `admin` segment was a 404. Both of
        // this tool's endpoints carried it.
        let endpoint = '';
        switch (checkType) {
          case 'service_status':
            endpoint = '/api/system/health';
            break;
          case 'disk_space':
          case 'memory':
          case 'processes':
            endpoint = '/api/system/metrics';
            break;
          default:
            throw new Error(`Unknown check type: ${checkType}`);
        }

        // AUTHENTICATE. This sent `Content-Type` and nothing else, so MIVAA answered 401
        // "Missing authentication token" — the routes are behind `verify_internal_access`.
        // Two independent faults in one call, and neither was ever observed because no agent
        // could reach this tool at all until 2026-08-26.
        const mivaaKey = Deno.env.get('MIVAA_API_KEY') || Deno.env.get('MATERIAL_KAI_API_KEY') || '';
        const cronSecret = Deno.env.get('CRON_SECRET') || '';
        if (!mivaaKey && !cronSecret) {
          throw new Error(
            'No MIVAA credential available (MIVAA_API_KEY / MATERIAL_KAI_API_KEY / CRON_SECRET all unset) '
            + '— the health endpoints require one.',
          );
        }
        const response = await fetch(`${MIVAA_API_URL}${endpoint}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(mivaaKey ? { Authorization: `Bearer ${mivaaKey}` } : {}),
            ...(cronSecret ? { 'x-cron-secret': cronSecret } : {}),
          },
        });

        if (!response.ok) {
          // `statusText` alone is "Unauthorized" / "Not Found" with no hint of WHICH url —
          // which is exactly how a wrong path read as a credentials problem here.
          const body = await response.text().catch(() => '');
          throw new Error(
            `Health check failed: ${response.status} ${response.statusText} at ${endpoint}`
            + (body ? ` — ${body.slice(0, 160)}` : ''),
          );
        }

        const health = await response.json();

        return JSON.stringify({
          success: true,
          checkType,
          data: health,
        });
      } catch (error) {
        console.error('Check server health tool error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Health check failed',
        });
      }
    },
    {
      name: 'checkServerHealth',
      description: 'Check MIVAA service health and system metrics (service status, disk space, memory, processes)',
      schema: z.object({
        checkType: z
          .enum(['service_status', 'disk_space', 'memory', 'processes'])
          .describe('Type of health check to perform'),
      }),
    }
  );
};

/**
 * LangChain Tool: Query Sentry for Errors
 */
export const createQuerySentryTool = () => {
  return tool(
    // Not wired to Sentry. A success with errorCount 0 would read as "no errors", which is a claim.
    ({ jobId, timeRange }) => {
      return JSON.stringify({
        success: false,
        not_connected: true,
        jobId,
        timeRange,
        error: 'Error monitoring is not connected to the assistant, so I cannot check for errors on this job.',
      });
    },
    {
      name: 'querySentry',
      description: 'Query Sentry for errors related to a specific job ID',
      schema: z.object({
        jobId: z.string().describe('Job ID to search for in Sentry'),
        timeRange: z.string().default('1h').describe('Time range for error search (e.g., 1h, 24h)'),
      }),
    }
  );
};

type IngestionChunkSink = ((chunk: Record<string, unknown>) => void) | undefined;

interface CorrectionRow {
  id: string; document_id: string; job_id: string | null; stage: string; code: string; outcome: string;
  message: string; count: number; acknowledged_at: string | null; created_at: string;
}

/**
 * LangChain Tool: what the ingestion pipeline corrected on its own, what it did worse than intended,
 * and what waits for a decision (#536). Acknowledging is the Approve/Decline gate, run as the caller.
 */
export const createIngestionReportTool = (userId: string, userJwt: string | undefined, onChunk?: IngestionChunkSink) => {
  return tool(
    async ({ action, document, days, correction_ids, confirm }) => {
      const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const window = days ?? 14;
      try {
        const since = new Date(Date.now() - window * 86_400_000).toISOString();
        let corrQuery = db.from('ingestion_corrections')
          .select('id, document_id, job_id, stage, code, outcome, message, count, acknowledged_at, created_at')
          .gte('created_at', since).order('created_at', { ascending: false }).limit(500);
        if (document) {
          const byId = /^[0-9a-f-]{36}$/i.test(document);
          const { data: docs, error } = byId
            ? await db.from('documents').select('id').eq('id', document).limit(1)
            : await db.from('documents').select('id').ilike('filename', `%${document}%`).limit(20);
          if (error) throw new Error(error.message);
          if (!docs?.length) return JSON.stringify({ success: false, error: `No document matches "${document}".` });
          corrQuery = corrQuery.in('document_id', docs.map((d: { id: string }) => d.id));
        }
        const { data: rows, error: corrError } = await corrQuery;
        if (corrError) throw new Error(corrError.message);
        const corrections = (rows ?? []) as CorrectionRow[];
        const docIds = [...new Set(corrections.map((c) => c.document_id))];
        const { data: docRows } = docIds.length
          ? await db.from('documents').select('id, filename').in('id', docIds) : { data: [] };
        const nameOf = new Map((docRows ?? []).map((d: { id: string; filename: string }) => [d.id, d.filename]));

        if (action === 'acknowledge') {
          if (!document || docIds.length !== 1) {
            return JSON.stringify({ success: false, error: 'acknowledge needs one document (its name or id) with corrections in the window.' });
          }
          const open = corrections.filter((c) => !c.acknowledged_at && c.outcome !== 'corrected'
            && (!correction_ids?.length || correction_ids.includes(c.id)));
          if (!open.length) return JSON.stringify({ success: true, acknowledged: 0, message: 'Nothing open to acknowledge.' });
          if (confirm !== true) {
            onChunk?.({
              type: 'action_confirmation',
              tool: 'ingestion_report',
              input: { action: 'acknowledge', document: docIds[0], correction_ids: open.map((c) => c.id) },
              title: `Acknowledge ${open.length} open correction(s) on ${nameOf.get(docIds[0]) ?? 'this document'}?`,
              summary: open.map((c) => `${c.outcome === 'degraded' ? 'Degraded' : 'Needs decision'}: ${c.message}`).join('\n'),
              danger: false,
              toolkit_id: 'admin-misc',
              timestamp: Date.now(),
            });
            return JSON.stringify({ success: true, awaiting_confirmation: true, message: 'Awaiting the user\'s approval. Do not retry.' });
          }
          const { data: count, error } = await callerDbClient(userJwt, userId).rpc('acknowledge_ingestion_corrections', {
            p_document_id: docIds[0], p_ids: open.map((c) => c.id),
          });
          if (error) return JSON.stringify({ success: false, error: error.message });
          return JSON.stringify({ success: true, acknowledged: count, message: `${count} correction(s) acknowledged; the next audit no longer counts them.` });
        }

        const { data: audits } = docIds.length
          ? await db.from('ingestion_audits').select('document_id, status, created_at').in('document_id', docIds)
            .order('created_at', { ascending: false })
          : { data: [] };
        const auditOf = new Map<string, string>();
        for (const a of (audits ?? []) as Array<{ document_id: string; status: string }>) {
          if (!auditOf.has(a.document_id)) auditOf.set(a.document_id, a.status);
        }
        const documents = docIds.map((id) => {
          const mine = corrections.filter((c) => c.document_id === id);
          const open = mine.filter((c) => !c.acknowledged_at && c.outcome !== 'corrected');
          return {
            document: nameOf.get(id) ?? id,
            document_id: id,
            audit: auditOf.get(id) ?? 'not audited',
            corrected: mine.filter((c) => c.outcome === 'corrected').reduce((n, c) => n + c.count, 0),
            degraded_open: open.filter((c) => c.outcome === 'degraded').map((c) => c.message),
            needs_decision: open.filter((c) => c.outcome === 'needs_decision').map((c) => c.message),
            corrections: mine.slice(0, 30).map((c) => ({
              when: c.created_at, stage: c.stage, outcome: c.outcome, what: c.message, acknowledged: !!c.acknowledged_at,
            })),
          };
        });
        onChunk?.({ type: 'ingestion_report', days: window, documents, timestamp: Date.now() });
        return JSON.stringify({
          success: true,
          days: window,
          documents: documents.map(({ corrections: _c, ...d }) => d),
          note: documents.length ? undefined : 'No ingestion corrections were recorded in this window.',
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Ingestion report failed' });
      }
    },
    {
      name: 'ingestion_report',
      description:
        'Report what the catalogue ingestion pipeline changed on its own per document: corrected (fixed as intended), '
        + 'degraded (done worse than intended, e.g. repaired without Gemini) and needs_decision (the pipeline would not guess), '
        + 'with the document\'s latest audit status. action=acknowledge marks a document\'s open degraded/needs_decision '
        + 'corrections as seen; it ALWAYS asks the user to Approve first (never set confirm yourself).',
      schema: z.object({
        action: z.enum(['report', 'acknowledge']).default('report'),
        document: z.string().optional().describe('Document filename (partial match) or id. Omit for every document with corrections in the window.'),
        days: z.number().int().min(1).max(90).optional().describe('How many days back to look (default 14).'),
        correction_ids: z.array(z.string()).optional().describe('acknowledge: only these corrections (default: all open ones on the document).'),
        confirm: z.boolean().optional().describe('Do NOT set — the Approve/Decline card sets confirm:true on approval.'),
      }),
    },
  );
};

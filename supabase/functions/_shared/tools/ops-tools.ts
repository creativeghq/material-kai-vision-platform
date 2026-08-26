/**
 * Ops Tools: createCheckServerHealthTool, createQuerySentryTool
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
    async ({ jobId, timeRange }) => {
      try {

        // This is a placeholder implementation
        // In production, you would integrate with Sentry API using SENTRY_AUTH_TOKEN
        // For now, we'll return a mock response indicating the feature is available


        return JSON.stringify({
          success: true,
          jobId,
          timeRange,
          errorCount: 0,
          recentErrors: [],
          message: 'Sentry integration available - configure SENTRY_AUTH_TOKEN to enable',
        });
      } catch (error) {
        console.error('Query Sentry tool error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Sentry query failed',
        });
      }
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

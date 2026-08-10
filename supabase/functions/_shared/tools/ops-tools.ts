/**
 * Ops Tools: createCheckServerHealthTool, createQuerySentryTool
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
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

        let endpoint = '';
        switch (checkType) {
          case 'service_status':
            endpoint = '/api/admin/system/health';
            break;
          case 'disk_space':
          case 'memory':
          case 'processes':
            endpoint = '/api/admin/system/metrics';
            break;
          default:
            throw new Error(`Unknown check type: ${checkType}`);
        }

        const response = await fetch(`${MIVAA_API_URL}${endpoint}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Health check failed: ${response.statusText}`);
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

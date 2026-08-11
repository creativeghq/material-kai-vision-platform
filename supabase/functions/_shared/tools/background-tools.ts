/**
 * Background Tools: createDispatchBackgroundTaskTool, createInteriorVideoV2Tool
 */

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.1.15/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Agent Configurations with RBAC
 */
/**
 * LangChain Tool: Dispatch Background Task
 *
 * Admin-only. Called by KAI when a task is too large or time-consuming
 * to complete inline. Creates an agent_runs row and fires the
 * background-agent-runner edge function asynchronously.
 *
 * The user receives an immediate acknowledgement with the run_id
 * so they can track progress on the admin monitoring page.
 */
const KAI_SYSTEM_AGENT_ID = '00000000-0000-0000-0000-000000000001';

export const createDispatchBackgroundTaskTool = (userId: string, workspaceId: string, conversationId: string | null) => {
  return tool(
    async ({ task_prompt, model_override, context_snippet, reason }) => {
      try {

        // 1. Create an agent_runs row in pending state
        const { data: run, error: runError } = await supabase
          .from('agent_runs')
          .insert({
            agent_id:     KAI_SYSTEM_AGENT_ID,
            status:       'pending',
            triggered_by: 'chat',
            input_data:   {
              task_prompt,
              context_snippet: context_snippet ?? '',
              model_override:  model_override ?? null,
              dispatched_by:   userId,
              conversation_id: conversationId,   // used to post result back to chat
            },
            workspace_id: workspaceId,
          })
          .select('id')
          .single();

        if (runError || !run) {
          throw new Error(`Failed to create run: ${runError?.message}`);
        }

        const runId = run.id as string;

        // 2. Fire-and-forget to background-agent-runner.
        // On dispatch failure we mark the agent_run as failed so the user/monitoring
        // sees a terminal state instead of a run stuck in 'pending' forever.
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        fetch(`${supabaseUrl}/functions/v1/background-agent-runner`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            agent_id:     KAI_SYSTEM_AGENT_ID,
            run_id:       runId,
            triggered_by: 'chat',
            input_data:   { task_prompt, context_snippet, model_override },
          }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const errText = await res.text().catch(() => res.statusText);
              console.error(`[dispatch_background_task] Runner returned ${res.status}: ${errText}`);
              await supabase
                .from('agent_runs')
                .update({
                  status: 'failed',
                  error_message: `Runner dispatch failed (${res.status}): ${errText || res.statusText}`,
                  completed_at: new Date().toISOString(),
                })
                .eq('id', runId);
            }
          })
          .catch(async (err) => {
            console.error('[dispatch_background_task] Fire-and-forget error:', err);
            await supabase
              .from('agent_runs')
              .update({
                status: 'failed',
                error_message: `Runner dispatch network error: ${err instanceof Error ? err.message : String(err)}`,
                completed_at: new Date().toISOString(),
              })
              .eq('id', runId);
          });


        return JSON.stringify({
          success:    true,
          run_id:     runId,
          message:    `Background task started. I'll post the results back here in this conversation once complete${conversationId ? '' : ' (check Admin → Background Tasks to monitor progress)'}.`,
          task_preview: task_prompt.slice(0, 120),
          reason,
        });
      } catch (error) {
        console.error('[dispatch_background_task] Error:', error);
        return JSON.stringify({
          success: false,
          error:   error instanceof Error ? error.message : String(error),
        });
      }
    },
    {
      name: 'dispatch_background_task',
      description: [
        'Dispatch a complex or long-running task to run asynchronously in the background.',
        'Use this when: (1) the task would take more than ~30 seconds, (2) it requires many iterations or large batch processing,',
        '(3) the user explicitly asks to run something in the background, or (4) it is a repeatable scheduled operation.',
        'The task will be executed by the KAI background agent using the full tool suite.',
        'Returns immediately with a run_id the user can use to track progress.',
      ].join(' '),
      schema: z.object({
        task_prompt:      z.string().describe('The complete task description — be detailed, include all context the background agent will need.'),
        reason:           z.string().describe('One sentence explaining WHY you are dispatching this to the background (e.g., "requires processing 500 products which would exceed the response time limit").'),
        model_override:   z.string().optional().describe('Specific model to use, e.g. claude-opus-4-8, claude-haiku-4-5. Omit to use default.'),
        context_snippet:  z.string().optional().describe('Relevant excerpt from the current conversation for context (max 500 chars).'),
      }),
    }
  );
};

// ═══════════════════════════════════════════════════════════════
// Interior Video V2 Tool (multi-model: Veo / Kling / Wan2.1 / Runway)
// ═══════════════════════════════════════════════════════════════

export const createInteriorVideoV2Tool = (userId: string, workspaceId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ source_image_url, video_type, model, prompt, aspect_ratio, duration_seconds, before_image_url }) => {
      try {
        onChunk?.({ type: 'tool_progress', status: `Starting ${video_type} video generation with ${model ?? 'auto-selected model'}...`, timestamp: Date.now() });

        const videoController = new AbortController();
        const videoTimeoutId = setTimeout(() => videoController.abort(), 300_000);
        let response;
        try {
          response = await fetch(`${SUPABASE_URL}/functions/v1/generate-interior-video-v2`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              user_id: userId,
              workspace_id: workspaceId,
              source_image_url,
              video_type,
              model,
              prompt,
              aspect_ratio: aspect_ratio ?? '16:9',
              duration_seconds: duration_seconds ?? 8,
              before_image_url,
            }),
            signal: videoController.signal,
          });
        } finally {
          clearTimeout(videoTimeoutId);
        }

        if (!response.ok) {
          const errText = await response.text().catch(() => response.statusText);
          return JSON.stringify({
            success: false,
            error: `Video generation failed (${response.status}): ${errText || response.statusText}`,
          });
        }

        const result = await response.json();

        if (result.success && result.video_url) {
          onChunk?.({
            type: 'video_generated',
            video_url: result.video_url,
            job_id: result.job_id,
            model: result.model_used,
            credits_used: result.credits_used,
            video_type,
          });
        }

        return JSON.stringify(result);
      } catch (error) {
        const isAbort = error instanceof Error && error.name === 'AbortError';
        return JSON.stringify({
          success: false,
          error: isAbort
            ? 'Video generation timed out after 300s. The backend may be overloaded — please retry.'
            : String(error),
        });
      }
    },
    {
      name: 'generate_video',
      description: `Generate an interior design video using AI. Routes to the best model based on video type.
Video types and recommended models:
- walkthrough: Veo 2.0 (30cr) — cinematic camera moves through a room
- product_spotlight: Kling 3.0 (20cr) — focuses on a specific material/product with audio
- before_after: Kling 3.0 (20cr) — transition between two room states (requires before_image_url)
- floorplan_flythrough: Veo 2.0 (30cr) — aerial view flythrough
- social_reel: Kling 3.0 (20cr) — 9:16 short-form video for social media with audio
- premium: Runway Gen-4 Turbo (40cr) — highest quality for any type

Returns video_url when complete, or prediction_id if still processing (poll generate_3d_status).`,
      schema: z.object({
        source_image_url: z.string().describe('Source image URL to animate or base the video on'),
        video_type: z.enum(['walkthrough', 'product_spotlight', 'before_after', 'floorplan_flythrough', 'social_reel'])
          .describe('Type of video to generate'),
        // These MUST be generate-interior-video-v2's VideoModel keys — the value is
        // forwarded to it verbatim. 'kling-3.0', 'kling-1.6-pro' and 'wan2.1-i2v'
        // were none of them, so any agent that took the description at its word got
        // a failed generation.
        model: z.enum(['veo-2', 'kling-v3.0', 'wan2.1-i2v-720p', 'runway-gen4-turbo']).optional()
          .describe('Override model selection: veo-2 30cr, kling-v3.0 20cr, wan2.1-i2v-720p 12cr, runway-gen4-turbo 40cr (default: auto based on video_type)'),
        prompt: z.string().optional().describe('Additional prompt for the video generation'),
        aspect_ratio: z.enum(['16:9', '9:16', '1:1']).optional()
          .describe('16:9 for standard video, 9:16 for social reels (default: 16:9)'),
        duration_seconds: z.number().int().min(5).max(16).optional()
          .describe('Duration in seconds (default: 8)'),
        before_image_url: z.string().optional()
          .describe('Required only for before_after type: the "before" state image URL'),
      }),
    }
  );
};

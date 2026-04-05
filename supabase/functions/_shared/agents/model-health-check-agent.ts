/**
 * Background Agent: Model Health Check
 *
 * Periodically tests all Replicate AI models to ensure they are operational.
 * Calls each model's prediction endpoint with a minimal test prompt and
 * records pass/fail, latency, and error details.
 *
 * Config params (background_agents.config):
 *   models        string[]  Optional subset of model IDs to test (default: all)
 *   timeout_ms    number    Per-model timeout in ms (default 120000 = 2min)
 *   test_prompt   string    Override test prompt (default: "modern minimalist living room")
 */

import type { AgentRunner, AgentRunContext, AgentRunResult } from './types.ts';

const ALL_MODELS = [
  'adirik/interior-design',
  'erayyavuz/interior-ai',
  'jschoormans/comfyui-interior-remodel',
  'julian-at/interiorly-gen1-dev',
  'jschoormans/interior-v2',
  'doobls-ai/interor-2',
  'rihan-a/colourful_interiors',
  'pointblack/stable-interiors-v2',
  'youzu/stable-interiors-v2',
  'rocketdigitalai/interior-design-sdxl',
  'davisbrown/designer-architecture',
  'stability-ai/stable-diffusion',
  'runwayml/stable-diffusion-v1-5',
  'threestudio-project/threestudio',
];

interface ModelTestResult {
  model: string;
  status: 'working' | 'failing';
  durationMs: number;
  error?: string;
  predictionId?: string;
}

export class ModelHealthCheckAgent implements AgentRunner {
  readonly agentType    = 'model-health-check';
  readonly name         = 'Model Health Check';
  readonly description  = 'Tests all Replicate AI models for availability and records pass/fail status';
  readonly defaultTools = [];
  readonly defaultModel = 'claude-haiku-4-5';

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const { supabase, agentConfig, input, log, heartbeat } = ctx;

    const cfg       = { ...agentConfig.config, ...input } as Record<string, unknown>;
    const modelList = (cfg.models as string[] | undefined) || ALL_MODELS;
    const timeoutMs = Number(cfg.timeout_ms ?? 120_000);
    const testPrompt = String(cfg.test_prompt ?? 'modern minimalist living room, professional photography, 8k');

    await log('info', `Starting model health check for ${modelList.length} models`, { models: modelList });

    const replicateApiKey = Deno.env.get('REPLICATE_API_TOKEN') || '';
    if (!replicateApiKey) {
      await log('error', 'REPLICATE_API_TOKEN not set');
      return {
        success: false,
        output: { error: 'REPLICATE_API_TOKEN not configured' },
        inputTokens: 0, outputTokens: 0, creditsDebited: 0,
      };
    }

    const results: ModelTestResult[] = [];
    let workingCount = 0;
    let failingCount = 0;

    for (const modelId of modelList) {
      await heartbeat();

      const start = Date.now();
      try {
        await log('debug', `Testing model: ${modelId}`);

        // Create a prediction
        const createRes = await fetch('https://api.replicate.com/v1/predictions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${replicateApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelId,
            input: { prompt: testPrompt },
          }),
        });

        if (!createRes.ok) {
          const errBody = await createRes.text();
          const durationMs = Date.now() - start;
          results.push({ model: modelId, status: 'failing', durationMs, error: `HTTP ${createRes.status}: ${errBody.slice(0, 200)}` });
          failingCount++;
          await log('warn', `Model ${modelId} failed to create prediction`, { status: createRes.status, error: errBody.slice(0, 200) });
          continue;
        }

        const prediction = await createRes.json();
        const predictionId = prediction.id;

        // Poll for completion (with timeout)
        let finalStatus = 'starting';
        let pollError: string | undefined;

        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline && !['succeeded', 'failed', 'canceled'].includes(finalStatus)) {
          await new Promise(r => setTimeout(r, 3000));
          await heartbeat();

          const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
            headers: { 'Authorization': `Bearer ${replicateApiKey}` },
          });

          if (!pollRes.ok) {
            pollError = `Poll HTTP ${pollRes.status}`;
            break;
          }

          const pollData = await pollRes.json();
          finalStatus = pollData.status;

          if (finalStatus === 'failed') {
            pollError = pollData.error || 'Model returned failed status';
          }
        }

        const durationMs = Date.now() - start;

        if (finalStatus === 'succeeded') {
          results.push({ model: modelId, status: 'working', durationMs, predictionId });
          workingCount++;
          await log('info', `Model ${modelId} is working`, { durationMs, predictionId });
        } else if (Date.now() >= deadline && !['succeeded', 'failed', 'canceled'].includes(finalStatus)) {
          results.push({ model: modelId, status: 'failing', durationMs, error: `Timeout after ${timeoutMs}ms (last status: ${finalStatus})`, predictionId });
          failingCount++;
          await log('warn', `Model ${modelId} timed out`, { durationMs, lastStatus: finalStatus });
          // Cancel the timed-out prediction
          await fetch(`https://api.replicate.com/v1/predictions/${predictionId}/cancel`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${replicateApiKey}` },
          }).catch(() => {});
        } else {
          results.push({ model: modelId, status: 'failing', durationMs, error: pollError || `Ended with status: ${finalStatus}`, predictionId });
          failingCount++;
          await log('warn', `Model ${modelId} failed`, { durationMs, error: pollError, finalStatus });
        }
      } catch (err: unknown) {
        const durationMs = Date.now() - start;
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.push({ model: modelId, status: 'failing', durationMs, error: errorMsg });
        failingCount++;
        await log('error', `Model ${modelId} threw exception`, { error: errorMsg });
      }
    }

    // Store results in a known table for the frontend to consume
    const summary = {
      tested_at: new Date().toISOString(),
      total: modelList.length,
      working: workingCount,
      failing: failingCount,
      results,
    };

    // Write to agent_run_logs so the admin panel can fetch latest results
    await log('info', 'Health check complete', summary);

    return {
      success:        failingCount === 0,
      output:         summary,
      inputTokens:    0,
      outputTokens:   0,
      creditsDebited: 0,
    };
  }
}

/**
 * Background Agent: Model Health Check
 *
 * Asks each registered provider model whether it can still be called, and writes the answer back to
 * public.generation_models.
 *
 * WHY THIS EXISTS IN THIS FORM (issue #4).
 * Replicate returned 402 Insufficient credit on every model from 2026-06-26, and the Operations page
 * reported them HEALTHY for two months. Three separate reasons, all fixed here or alongside:
 *
 *   1. Nothing ever ran this agent. There was no background_agents row for 'model-health-check' at
 *      all — the code existed and was never scheduled.
 *   2. It wrote nothing to the database. Results went into the run log and nowhere queryable.
 *   3. Provider health was inferred from ai_usage_logs, where the row is written BEFORE the upstream
 *      call and never corrected on failure — so a 100% failure rate computed as 0.000.
 *
 * The lesson from CLAUDE.md is "check the world, not the exit code": a passive detector that waits
 * for a user to hit a 402 cannot see an outage during a quiet week. This probes on a schedule.
 *
 * THE PROBE IS CREATE-THEN-CANCEL, NOT A REAL GENERATION.
 * It POSTs a prediction and cancels it immediately. That validates auth, the account balance, the
 * model's existence and its version pin — for effectively no compute — without paying for images
 * nobody looks at. It is therefore NOT proof that a generation would succeed, which is why it writes
 * last_probe_* and never touches last_verified_at (that means "a real generation succeeded").
 *
 * Config params (background_agents.config):
 *   models        string[]  Optional subset of registry model IDs (default: all enabled non-dead)
 *   providers     string[]  Optional subset of providers (default: replicate only — see below)
 *   timeout_ms    number    Per-model HTTP timeout in ms (default 20000)
 *   test_prompt   string    Override probe prompt
 */

import type { AgentRunner, AgentRunContext, AgentRunResult } from './types.ts';

/**
 * Only Replicate is probed today. The other providers (Google, xAI, WorldLabs, Kling, proplabs) each
 * need their own auth and submit shape, and a half-probe that reported "unknown" for them would be
 * worse than an honest absence — it would look like coverage. Add a provider here only with a real
 * request for it.
 */
const PROBEABLE_PROVIDERS = ['replicate'];

/**
 * What the probe concluded — one source (#391), the generated mirror. The distinction
 * between the first two is the entire point: `credit_exhausted` is an ACCOUNT problem (add
 * funds — the model is fine), `not_found` is the model being deleted upstream (no amount of
 * money fixes it). Treating both as "failing" is why a four-model deletion and a two-month
 * billing outage looked like the same event.
 */
import {
  type ProbeStatus, AUTHORITATIVE_PROBE_STATUSES,
} from './probeVocabulary.generated.ts';

interface RegistryModel {
  id: string;
  display_name: string;
  provider: string;
  slug: string | null;
  version: string | null;
  status: string;
  input_requirements: { needs_prompt?: boolean; min_images?: number } | null;
}

interface ModelProbeResult {
  model: string;
  probeStatus: ProbeStatus;
  httpStatus?: number;
  durationMs: number;
  error?: string;
  predictionId?: string;
}

/** Map an HTTP status from the provider onto a verdict we can act on. */
function classify(httpStatus: number, body: string): ProbeStatus {
  if (httpStatus === 402) return 'credit_exhausted';
  if (httpStatus === 404) return 'not_found';
  if (httpStatus === 401 || httpStatus === 403) return 'auth_failed';
  if (httpStatus === 422 || httpStatus === 400) return 'schema_rejected';
  // Replicate also signals insufficient funds in prose on some endpoints; catch it either way.
  if (/insufficient credit|payment required|billing/i.test(body)) return 'credit_exhausted';
  return 'error';
}

/**
 * A 402/404/401 is returned before the provider looks at the payload, so those verdicts are
 * authoritative. A 422 is NOT: the probe sends a generic payload rather than running each model's
 * adapter, so an image-to-image model rejecting a prompt-only body says more about the probe than
 * about the model. Advisory verdicts get recorded but never change `status`.
 */
// Derived in the vocabulary, not restated here (#391).
const AUTHORITATIVE: readonly ProbeStatus[] = AUTHORITATIVE_PROBE_STATUSES;

export class ModelHealthCheckAgent implements AgentRunner {
  readonly agentType    = 'model-health-check';
  readonly name         = 'Model Health Check';
  readonly description  = 'Probes registered generation models for reachability and records the verdict on generation_models';
  readonly defaultTools = [];
  readonly defaultModel = 'claude-haiku-4-5';

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const { supabase, agentConfig, input, log, heartbeat } = ctx;

    const cfg        = { ...agentConfig.config, ...input } as Record<string, unknown>;
    const timeoutMs  = Number(cfg.timeout_ms ?? 20_000);
    const testPrompt = String(cfg.test_prompt ?? 'modern minimalist living room');
    const providers  = (cfg.providers as string[] | undefined) ?? PROBEABLE_PROVIDERS;

    // The registry is the roster. The hardcoded ALL_MODELS list this used to carry drifted from the
    // real roster in both directions and still named two models that had been deleted upstream.
    let query = supabase
      .from('generation_models')
      .select('id, display_name, provider, slug, version, status, input_requirements')
      .eq('enabled', true)
      .neq('status', 'dead')
      .in('provider', providers);

    if (Array.isArray(cfg.models) && cfg.models.length > 0) {
      query = query.in('id', cfg.models as string[]);
    }

    const { data: models, error: loadErr } = await query;
    if (loadErr) {
      await log('error', 'Could not load generation_models', { error: loadErr.message });
      return { success: false, output: { error: loadErr.message }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    const modelList = (models ?? []) as RegistryModel[];
    if (modelList.length === 0) {
      await log('warn', 'No probeable models in the registry', { providers });
      return { success: true, output: { probed: 0, providers }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    const replicateApiKey = Deno.env.get('REPLICATE_API_TOKEN') || '';
    if (!replicateApiKey) {
      // Record it rather than returning quietly — "the token is missing" and "the account is empty"
      // produce identical user-visible symptoms and must be told apart on the Operations page.
      await log('error', 'REPLICATE_API_TOKEN not set — cannot probe');
      await supabase
        .from('generation_models')
        .update({
          last_probe_at: new Date().toISOString(),
          last_probe_status: 'auth_failed',
          last_probe_error: 'REPLICATE_API_TOKEN not configured in this environment',
        })
        .eq('provider', 'replicate')
        .eq('enabled', true);
      return {
        success: false,
        output: { error: 'REPLICATE_API_TOKEN not configured' },
        inputTokens: 0, outputTokens: 0, creditsDebited: 0,
      };
    }

    await log('info', `Probing ${modelList.length} model(s)`, { providers });

    const results: ModelProbeResult[] = [];
    const counts: Record<string, number> = {};

    for (const model of modelList) {
      await heartbeat();
      const start = Date.now();
      let result: ModelProbeResult;

      try {
        // A versioned model MUST be called by version — several 404 without it, which would be
        // misread as "deleted upstream". Unversioned models use the model-scoped endpoint.
        const body: Record<string, unknown> = { input: { prompt: testPrompt } };
        let url = 'https://api.replicate.com/v1/predictions';
        if (model.version) {
          body.version = model.version;
        } else if (model.slug) {
          url = `https://api.replicate.com/v1/models/${model.slug}/predictions`;
        }

        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);
        let res: Response;
        try {
          res = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${replicateApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: ac.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        const durationMs = Date.now() - start;

        if (res.ok) {
          const prediction = await res.json();
          // Cancel immediately. The probe's job is to prove the call is ACCEPTED; letting it run
          // would pay for an image nobody sees, on every model, on every schedule tick.
          if (prediction?.id) {
            await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}/cancel`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${replicateApiKey}` },
            }).catch(() => {});
          }
          result = { model: model.id, probeStatus: 'ok', httpStatus: res.status, durationMs, predictionId: prediction?.id };
        } else {
          const errBody = (await res.text()).slice(0, 300);
          result = {
            model: model.id,
            probeStatus: classify(res.status, errBody),
            httpStatus: res.status,
            durationMs,
            error: `HTTP ${res.status}: ${errBody}`,
          };
        }
      } catch (err: unknown) {
        const durationMs = Date.now() - start;
        const msg = err instanceof Error ? err.message : String(err);
        result = {
          model: model.id,
          probeStatus: /abort/i.test(msg) ? 'timeout' : 'error',
          durationMs,
          error: msg,
        };
      }

      results.push(result);
      counts[result.probeStatus] = (counts[result.probeStatus] ?? 0) + 1;

      // Persist per model as we go, so a crash midway still leaves the models we did reach recorded.
      const patch: Record<string, unknown> = {
        last_probe_at: new Date().toISOString(),
        last_probe_status: result.probeStatus,
        last_probe_error: result.error ?? null,
      };
      // Only a 404 marks a model dead, and ONLY because the model is genuinely gone. A 402 must
      // leave status alone: the model is fine, the account is empty, and disabling it would mean
      // funding the account did not bring it back.
      if (result.probeStatus === 'not_found') patch.status = 'dead';
      else if (result.probeStatus === 'ok' && model.status === 'dead') patch.status = 'active';

      const { error: upErr } = await supabase.from('generation_models').update(patch).eq('id', model.id);
      if (upErr) await log('warn', `Could not record probe for ${model.id}`, { error: upErr.message });

      if (!AUTHORITATIVE.includes(result.probeStatus)) {
        await log('debug', `${model.id}: ${result.probeStatus} (advisory — probe uses a generic payload)`, {
          httpStatus: result.httpStatus,
        });
      } else if (result.probeStatus !== 'ok') {
        await log('warn', `${model.id}: ${result.probeStatus}`, { httpStatus: result.httpStatus, error: result.error });
      }
    }

    const creditExhausted = results.filter((r) => r.probeStatus === 'credit_exhausted');
    const notFound        = results.filter((r) => r.probeStatus === 'not_found');

    // The headline. When every model on a provider 402s it is one fact about the account, not N
    // facts about N models — say it once and say what to do.
    if (creditExhausted.length > 0) {
      await log('error',
        `PROVIDER OUT OF CREDIT: ${creditExhausted.length}/${modelList.length} models returned 402. ` +
        `Add funds to the provider account — every model is down until then.`,
        { models: creditExhausted.map((r) => r.model) });
    }
    if (notFound.length > 0) {
      await log('error',
        `${notFound.length} model(s) no longer exist upstream — remove them from the registry.`,
        { models: notFound.map((r) => r.model) });
    }

    const summary = {
      probed_at: new Date().toISOString(),
      total: modelList.length,
      providers,
      counts,
      credit_exhausted: creditExhausted.map((r) => r.model),
      not_found: notFound.map((r) => r.model),
      results,
    };

    await log('info', 'Probe complete', summary);

    return {
      // Credit exhaustion is a real failure of the run — it must not report success, or the agent
      // itself becomes another green light over a broken system.
      success:        creditExhausted.length === 0 && notFound.length === 0,
      output:         summary,
      inputTokens:    0,
      outputTokens:   0,
      creditsDebited: 0,
    };
  }
}

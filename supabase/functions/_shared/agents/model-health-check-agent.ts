/** Background Agent: Model Health Check */

import type { AgentRunner, AgentRunContext, AgentRunResult } from './types.ts';
import { resolveReplicateToken, REPLICATE_NOT_CONFIGURED } from '../replicate-token.ts';
import { resolveSecret } from '../secrets.ts';
import { classifyProbe, probeReplicateAccount } from '../replicate-account.ts';

/**
 * Every verdict comes from a free read of the model, plus ONE near-free create per run that answers
 * for the whole Replicate account. A provider joins only with a real request for it.
 */
const PROBEABLE_PROVIDERS = ['replicate', 'google', 'openai'];

const MODEL_READ: Record<string, { url: (slug: string) => string; headers: (key: string) => Record<string, string> }> = {
  replicate: { url: (s) => `https://api.replicate.com/v1/models/${s}`, headers: (k) => ({ Authorization: `Bearer ${k}` }) },
  google: { url: (s) => `https://generativelanguage.googleapis.com/v1beta/models/${s}`, headers: (k) => ({ 'x-goog-api-key': k }) },
  openai: { url: (s) => `https://api.openai.com/v1/models/${s}`, headers: (k) => ({ Authorization: `Bearer ${k}` }) },
};

/**
 * What each unprobed provider needs before it could be called at all.
 *
 * We cannot say whether these providers WORK — nobody has written their submit shape — but we
 * can always say whether this deployment could even reach them, and that costs no upstream call.
 * Turning "never probed" into "no token deployed" is the difference between a silence the reader
 * has to interpret and a sentence they can act on. Where a provider needs BOTH halves of a pair
 * (Kling signs a JWT), all of them must resolve or the provider is unreachable.
 */
const PROVIDER_KEYS: Record<string, string[]> = {
  // `GOOGLE_GENERATIVE_AI_API_KEY`, NOT `GEMINI_API_KEY`. Every path that actually calls
  // Google reads the long name — ai-client (so Veo and Gemini Omni), generate-interior-gemini,
  // company-enrich, kai-task-agent — and it is the name in ai-client's bootstrap list. This
  // asked for the short one, found nothing, and reported a WORKING provider as
  // `not_configured`: a health check that is wrong in the reassuring direction is worse than
  // no health check, because it sends the reader to set a key that is already set.
  google:    ['GOOGLE_GENERATIVE_AI_API_KEY'],
  alibaba:   ['DASHSCOPE_API_KEY'],
  bytedance: ['ARK_API_KEY'],
  fal:       ['FAL_KEY'],
  luma:      ['LUMA_API_KEY'],
  klingai:   ['KLINGAI_ACCESS_KEY', 'KLINGAI_SECRET_KEY'],
  minimax:   ['MINIMAX_API_KEY'],
  proplabs:  ['PROPLABS_API_KEY'],
  xai:       ['XAI_API_KEY'],
  openai:    ['OPENAI_API_KEY'],
};

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
  status: string;
}

interface ModelProbeResult {
  model: string;
  probeStatus: ProbeStatus;
  httpStatus?: number;
  durationMs: number;
  error?: string;
}

// Derived in the vocabulary, not restated here (#391).
const AUTHORITATIVE: readonly ProbeStatus[] = AUTHORITATIVE_PROBE_STATUSES;

export class ModelHealthCheckAgent implements AgentRunner {
  readonly agentType    = 'model-health-check';
  readonly name         = 'Model Health Check';
  readonly description  = 'Probes registered generation models for reachability and records the verdict on generation_models';
  readonly defaultTools = [];
  readonly defaultModel = 'claude-haiku-5-5';

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const { supabase, agentConfig, input, log, heartbeat } = ctx;

    const cfg        = { ...agentConfig.config, ...input } as Record<string, unknown>;
    const timeoutMs  = Number(cfg.timeout_ms ?? 20_000);
    const providers  = (cfg.providers as string[] | undefined) ?? PROBEABLE_PROVIDERS;

    /** Key audit for the providers this agent cannot probe. */
    for (const [prov, keys] of Object.entries(PROVIDER_KEYS)) {
      const missing: string[] = [];
      for (const key of keys) {
        const r = await resolveSecret(supabase, key);
        if (!r?.value) missing.push(key);
      }
      // A provider whose credential IS deployed but that nobody probes must still SAY so. Saying
      // nothing leaves last_probe_at NULL, which reads downstream as "never probed" and sends the
      // reader to enable an agent that has been running hourly all along.
      const configured = missing.length === 0;
      if (configured && PROBEABLE_PROVIDERS.includes(prov)) continue;
      const why = configured
        ? `No probe is implemented for ${prov}: the credential is deployed, but this provider's `
          + `submit shape has never been written, so nothing has asked it anything.`
        : `No credential for ${prov}: ${missing.join(' + ')} is not set in this deployment.`;
      await supabase
        .from('generation_models')
        .update({
          last_probe_at: new Date().toISOString(),
          last_probe_status: configured ? 'no_probe_implemented' : 'not_configured',
          last_probe_error: why,
        })
        .eq('provider', prov)
        .eq('enabled', true)
        .neq('status', 'dead')
        .or('last_probe_status.is.null,last_probe_status.eq.not_configured,last_probe_status.eq.no_probe_implemented');
    }

    // The registry is the roster. The hardcoded ALL_MODELS list this used to carry drifted from the
    // real roster in both directions and still named two models that had been deleted upstream.
    let query = supabase
      .from('generation_models')
      .select('id, display_name, provider, slug, status')
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

    const tokens: Record<string, string | null> = {};
    if (modelList.some((m) => m.provider === 'replicate')) {
      tokens.replicate = (await resolveReplicateToken()).token;
      if (!tokens.replicate) {
        // "The token is missing" and "the account is empty" look identical to a user; tell them apart.
        await log('error', REPLICATE_NOT_CONFIGURED);
        await supabase
          .from('generation_models')
          .update({
            last_probe_at: new Date().toISOString(),
            last_probe_status: 'not_configured',
            last_probe_error: REPLICATE_NOT_CONFIGURED,
          })
          .eq('provider', 'replicate')
          .eq('enabled', true);
      }
    }
    for (const prov of ['google', 'openai']) {
      if (modelList.some((m) => m.provider === prov)) {
        tokens[prov] = (await resolveSecret(supabase, PROVIDER_KEYS[prov][0]))?.value ?? null;
      }
    }

    await log('info', `Probing ${modelList.length} model(s)`, { providers });
    const account = tokens.replicate ? await probeReplicateAccount(tokens.replicate, timeoutMs) : null;

    const results: ModelProbeResult[] = [];
    const counts: Record<string, number> = {};

    for (const model of modelList) {
      await heartbeat();
      const key = tokens[model.provider];
      const read = MODEL_READ[model.provider];
      if (!key || !read || !model.slug) continue;
      const start = Date.now();
      let result: ModelProbeResult;
      try {
        const res = await fetch(read.url(model.slug), { headers: read.headers(key), signal: AbortSignal.timeout(timeoutMs) });
        const body = res.ok ? '' : (await res.text()).slice(0, 300);
        if (res.ok) await res.body?.cancel();
        result = {
          model: model.id, probeStatus: classifyProbe(res.status, body), httpStatus: res.status,
          durationMs: Date.now() - start, ...(res.ok ? {} : { error: `HTTP ${res.status}: ${body}` }),
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result = {
          model: model.id, probeStatus: /abort|timed? ?out/i.test(msg) ? 'timeout' : 'error',
          durationMs: Date.now() - start, error: msg,
        };
      }

      if (model.provider === 'replicate' && result.probeStatus === 'ok') {
        // A model that exists still needs an account that accepts jobs. A throttled account is no verdict.
        if (!account) continue;
        result = { ...result, probeStatus: account.status, ...(account.error ? { error: account.error } : {}) };
      }

      results.push(result);
      counts[result.probeStatus] = (counts[result.probeStatus] ?? 0) + 1;

      const patch: Record<string, unknown> = {
        last_probe_at: new Date().toISOString(),
        last_probe_status: result.probeStatus,
        last_probe_error: result.error ?? null,
      };
      // Only Replicate's 404 retires a model, and a model that ANSWERS is active again. A 402 leaves
      // status alone: the model is fine, the account is empty.
      if (model.provider === 'replicate') {
        if (result.probeStatus === 'not_found') patch.status = 'dead';
        else if (result.probeStatus === 'ok' && model.status !== 'active') patch.status = 'active';
      }

      const { error: upErr } = await supabase.from('generation_models').update(patch).eq('id', model.id);
      if (upErr) await log('warn', `Could not record probe for ${model.id}`, { error: upErr.message });

      if (result.probeStatus !== 'ok') {
        await log(AUTHORITATIVE.includes(result.probeStatus) ? 'warn' : 'debug', `${model.id}: ${result.probeStatus}`, {
          httpStatus: result.httpStatus, error: result.error,
        });
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

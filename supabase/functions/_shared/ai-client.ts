/**
 * Unified AI Client for Supabase Edge Functions
 *
 * Uses Vercel AI SDK (ai@6) with Google and Anthropic providers.
 * Replaces raw fetch() for Gemini and @anthropic-ai/sdk for Claude.
 *
 * Usage:
 *   import { generateWithGemini, generateWithClaude } from '../_shared/ai-client.ts';
 *
 * Environment variables required:
 *   - GOOGLE_GENERATIVE_AI_API_KEY
 *   - ANTHROPIC_API_KEY
 */

// ── Environment setup (MUST run before npm imports) ──
// We seed globalThis.process.env at module-load with whatever Deno.env currently has so npm
// packages that read process.env at import time see the expected keys. The providers themselves
// are constructed LAZILY below so that any platform_secrets values bootstrapped into Deno.env
// inside the request handler (via _shared/auth.ts → bootstrapSecretsFromDb) get picked up
// on first use — even though they weren't set when this module first loaded.
const _AI_ENV_KEYS = [
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'ANTHROPIC_API_KEY',
  'KLINGAI_ACCESS_KEY',
  'KLINGAI_SECRET_KEY',
  'XAI_API_KEY',
] as const;

function _syncEnvIntoPolyfill() {
  const env: Record<string, string> = ((globalThis as any).process?.env) || {};
  for (const k of _AI_ENV_KEYS) {
    const v = Deno.env.get(k);
    if (v && env[k] !== v) env[k] = v;
  }
  (globalThis as any).process = { ...(globalThis as any).process, env };
}

// Initial sync — module-load values only (DB bootstrap hasn't run yet).
_syncEnvIntoPolyfill();

// ── Imports ──
import { generateText, generateImage, experimental_generateVideo as generateVideo, Output, stepCountIs } from 'npm:ai@6';
import { createGoogleGenerativeAI } from 'npm:@ai-sdk/google@3';
import { createAnthropic } from 'npm:@ai-sdk/anthropic@3';
// Pinned to a MAJOR, like the two providers above. The bare `npm:@ai-sdk/klingai` this
// replaced was a wildcard: `supabase/functions/deno.lock` is NOT tracked, so nothing held
// the resolved 4.0.17 and every deploy took whatever npm called latest that morning. That
// is the exact shape that got the Python `anthropic` SDK removed (a pin trap broke the
// `tools` kwarg) and that produced `fix(ai-client): AI SDK v4 API against a v6 pin`.
import { createKlingAI } from 'npm:@ai-sdk/klingai@4';
import { z, type ZodType } from 'npm:zod@3';
import { createClient } from '@supabase/supabase-js';
import { MARKUP_MULTIPLIER as _MARKUP } from './pricing-constants.ts';
import { resolveTokenPrice, resolveUnitPrice } from './ai-logger.ts';
import { fetchImageGuarded, readCapped } from './fetch-image.ts';
import { resolveSecret } from './secrets.ts';

// ── Background AI-call logger ────────────────────────────────────────────────
// Every call through generateWithGemini / generateWithClaude is automatically
// recorded in ai_call_logs and ai_usage_logs (cost + tokens). Fire-and-forget
// so a logging failure never breaks the actual AI call. Pricing tables match
// AI_PRICING in _shared/ai-logger.ts. Markup is applied as 1.5×.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// Lazy getter (NOT a module-load capture) so values bootstrapped into Deno.env
// inside the request handler are picked up. Used by the raw-fetch Gemini multi-image
// + Veo paths (the AI SDK `google` proxy covers the single-image path separately).
const GOOGLE_API_KEY = () => Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY') || '';
// Lazy getter (same rationale as GOOGLE_API_KEY) for the xAI Grok/Aurora image
// + edit + masked-inpaint paths (generateImageWithGrok / editImageWithGrok).
const XAI_API_KEY = () => Deno.env.get('XAI_API_KEY') || '';
const _logSupabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Prices are NOT defined here. They live in `ai_model_pricing` and are resolved through
// `resolveTokenPrice` (see _shared/ai-logger.ts) — one derivation, admin-editable, with
// the hardcoded literal in ai-logger as the only fallback.
//
// This file used to carry its own five-entry table that never consulted the DB. It priced
// Gemini 3.5 Flash at 0.50/3.00 (real rate: 1.50/9.00) under a comment admitting the
// numbers were an unconfirmed guess, and Opus at 15.00/75.00 (real rate: 5.00/25.00).
// Both fed `billed_cost_usd` at a 1.5x markup. Do not reintroduce a local price table.

async function _logTrackedCall(opts: {
  task: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  errorMessage?: string;
  userId?: string;
  workspaceId?: string;
}): Promise<void> {
  if (!_logSupabase) return;
  try {
    const price = await resolveTokenPrice(_logSupabase, opts.model);
    if (!price) {
      // Explicit marker rather than a silent 0 — an unpriced model is a gap in
      // ai_model_pricing, not a free call. `ops.silent_zero` can then see it.
      console.warn(`[ai-client] no price row for model "${opts.model}" — cost logged as null`);
    }
    const rawCost = price
      ? (opts.inputTokens / 1_000_000) * price.input +
        (opts.outputTokens / 1_000_000) * price.output
      : null;
    const markup = price?.markup ?? _MARKUP;
    const billedCost = rawCost === null ? null : rawCost * markup;

    // ai_call_logs (developer-facing detail)
    await _logSupabase.from('ai_call_logs').insert({
      task: opts.task,
      model: opts.model,
      input_tokens: opts.inputTokens,
      output_tokens: opts.outputTokens,
      cost: billedCost,
      latency_ms: opts.latencyMs,
      action: opts.errorMessage ? 'fallback_to_rules' : 'use_ai_result',
      error_message: opts.errorMessage ?? null,
    });

    // ai_usage_logs (dashboard-facing)
    //
    // `ai_call_logs` above deliberately gets neither id: it has no such columns and is the
    // developer-facing latency/fallback trace, not the billing record. This is the billing record.
    await _logSupabase.from('ai_usage_logs').insert({
      user_id: opts.userId ?? null,
      workspace_id: opts.workspaceId ?? null,
      operation_type: opts.task,
      model_name: opts.model,
      input_tokens: opts.inputTokens,
      output_tokens: opts.outputTokens,
      raw_cost_usd: rawCost,
      billed_cost_usd: billedCost,
      markup_multiplier: markup,
      input_cost_usd: price ? (opts.inputTokens / 1_000_000) * price.input * markup : null,
      output_cost_usd: price ? (opts.outputTokens / 1_000_000) * price.output * markup : null,
    });
  } catch (e) {
    console.warn('[ai-client] _logTrackedCall failed (non-fatal):', e);
  }
}

/**
 * The billing record for a call that is priced PER UNIT rather than per token — every image
 * and every video this client produces (#363 `EE-2`).
 *
 * Before this, `generateImageWithGemini`, `generateMultiImageWithGemini`, `generateVideoWithVeo`,
 * `generateVideoWithKling`, `generateImageWithGrok` and `editImageWithGrok` all called the
 * provider and returned bytes without writing an `ai_usage_logs` row at all. The spend was real
 * and the ledger did not know it happened, so every per-workspace cost view, the cost dashboard
 * and any budget built on them under-reported by the whole value of image and video generation.
 * The text paths had been logging since they were written; nothing made the image paths visibly
 * different, which is why the gap survived — a missing row looks exactly like an unused feature.
 *
 * An unpriced model logs with `raw_cost_usd = null` and warns, matching `_logTrackedCall`: a
 * null cost is a gap in `ai_model_pricing` that `ops.silent_zero` can surface, whereas a 0 is a
 * claim that the call was free. Veo has no row today and must not be given a guessed one.
 */
async function _logUnitCall(opts: {
  task: string;
  /** `ai_model_pricing.model_key` — must match exactly, not the display name. */
  modelKey: string;
  /** Images generated, or seconds of video. */
  units: number;
  latencyMs: number;
  errorMessage?: string;
  userId?: string;
  workspaceId?: string;
}): Promise<void> {
  if (!_logSupabase) return;
  try {
    const price = await resolveUnitPrice(_logSupabase, opts.modelKey);
    if (!price) {
      console.warn(`[ai-client] no per-unit price row for "${opts.modelKey}" — cost logged as null`);
    }
    // A failed call produced no units, so it costs nothing — but it still gets a row, so a
    // provider outage is visible as attempts-with-no-output rather than as silence.
    const billableUnits = opts.errorMessage ? 0 : opts.units;
    const rawCost = price ? price.perUnit * billableUnits : null;
    const markup = price?.markup ?? _MARKUP;
    const billedCost = rawCost === null ? null : rawCost * markup;

    await _logSupabase.from('ai_usage_logs').insert({
      user_id: opts.userId ?? null,
      workspace_id: opts.workspaceId ?? null,
      operation_type: opts.task,
      model_name: opts.modelKey,
      input_tokens: 0,
      output_tokens: 0,
      raw_cost_usd: rawCost,
      billed_cost_usd: billedCost,
      markup_multiplier: markup,
      input_cost_usd: null,
      output_cost_usd: null,
      metadata: {
        billing_type: 'per_unit',
        units: billableUnits,
        unit_label: price?.unitLabel ?? null,
        ...(opts.errorMessage ? { error_message: opts.errorMessage } : {}),
      },
    });
  } catch (e) {
    console.warn('[ai-client] _logUnitCall failed (non-fatal):', e);
  }
}

// ── Provider instances ──
// Lazy: constructed on FIRST USE (not at module load) so that platform_secrets values
// bootstrapped into Deno.env inside the request handler are reflected in apiKey.
// Existing call sites (`google(modelId)`, `google.image(modelId)`, `anthropic(modelId)`,
// `klingai.video(modelId)`) are unchanged — the Proxy makes lazy construction invisible.
// KlingAIProvider is an object, not a function — it must be reached through the
// `get` trap (`.video()` / `.videoModel()`). The `apply` trap below would throw for it.

let _google: ReturnType<typeof createGoogleGenerativeAI> | null = null;
let _anthropic: ReturnType<typeof createAnthropic> | null = null;
let _klingai: ReturnType<typeof createKlingAI> | null = null;

function _ensureGoogle() {
  if (!_google) {
    _syncEnvIntoPolyfill();
    _google = createGoogleGenerativeAI({ apiKey: Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY') || '' });
  }
  return _google;
}
function _ensureAnthropic() {
  if (!_anthropic) {
    _syncEnvIntoPolyfill();
    _anthropic = createAnthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') || '' });
  }
  return _anthropic;
}
function _ensureKlingai() {
  if (!_klingai) {
    _syncEnvIntoPolyfill();
    _klingai = createKlingAI({
      accessKey: Deno.env.get('KLINGAI_ACCESS_KEY') || '',
      secretKey: Deno.env.get('KLINGAI_SECRET_KEY') || '',
    });
  }
  return _klingai;
}

// Proxies preserve the exact existing surface: callable as `google(modelId)` AND attribute-access
// like `google.image(modelId)` / `google.video(modelId)`.
const google = new Proxy(function () {}, {
  apply: (_t, _thisArg, args) => (_ensureGoogle() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_t, prop) => (_ensureGoogle() as unknown as Record<string | symbol, unknown>)[prop],
}) as unknown as ReturnType<typeof createGoogleGenerativeAI>;

const anthropic = new Proxy(function () {}, {
  apply: (_t, _thisArg, args) => (_ensureAnthropic() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_t, prop) => (_ensureAnthropic() as unknown as Record<string | symbol, unknown>)[prop],
}) as unknown as ReturnType<typeof createAnthropic>;

const klingai = new Proxy(function () {}, {
  apply: (_t, _thisArg, args) => (_ensureKlingai() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_t, prop) => (_ensureKlingai() as unknown as Record<string | symbol, unknown>)[prop],
}) as unknown as ReturnType<typeof createKlingAI>;

// ── Default models ──
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-8';

// ── Billing identity for the per-unit models ───────────────────────────────
// `generation_models.id` values, NOT the provider strings this file passes to the SDKs. They
// differ, and that is the whole reason these constants exist rather than reusing `modelId`:
// the KlingAI SDK wants 'kling-v3.0-i2v', Veo's raw API wants 'veo-2.0-generate-001', and
// xAI's endpoint wants the slug 'grok-imagine-image-quality' — none of which is a key the
// pricing table knows. The registry maps id → pricing_key → rate; passing the provider string
// straight through would resolve to no row and silently log every image and video at null cost,
// which is the same shape as the bug this replaces. The Gemini image models are the exception:
// their provider id and registry id are the same string, so they pass `modelId` directly.
// Ceiling for a provider-returned video download. A Veo clip is single-digit MB; this leaves
// generous headroom while keeping the read bounded well inside the isolate's 256 MB, with room
// for the base64 copy that follows it.
const MAX_VIDEO_DOWNLOAD_BYTES = 48 * 1024 * 1024;

const VEO_PRICING_MODEL_ID = 'veo-2';
const KLING_PRICING_MODEL_ID = 'kling-v3.0';
const GROK_PRICING_MODEL_ID = 'xai-aurora';

// ── Types ──
export interface AIGenerateConfig {
  /** Override default model */
  model?: string;
  /** Temperature (0-2). Default: 0.7 for text, 0.3 for structured */
  temperature?: number;
  /** Max output tokens */
  maxTokens?: number;
  /** Gemini thinking level for reasoning tasks */
  thinkingLevel?: 'none' | 'low' | 'medium' | 'high';
  /**
   * Task label written to ai_call_logs / ai_usage_logs. Used by the cost
   * dashboard to attribute spend to the originating feature (e.g.
   * 'seo_write', 'suggest_fields', 'ai_rerank'). Defaults to a generic
   * label if omitted, but callers should always pass one.
   */
  task?: string;
  /**
   * WHO the spend belongs to. Both optional, both should be passed whenever the call is made on
   * behalf of somebody.
   *
   * Every row this client wrote carried `user_id = NULL` and `workspace_id = NULL` — 1233
   * health checks, 473 reranks, 605 expense extractions and more, all attributed to nobody.
   * Two things failed silently as a result. No per-tenant cost view could see any of it, so
   * "what is this workspace costing us" answered with a fraction of the truth. And the RLS
   * policy on `ai_usage_logs` is `auth.uid() = user_id OR is_workspace_admin(workspace_id)` —
   * with both columns null, neither branch can ever match, so these rows were invisible to
   * every non-platform-admin in the product, including the people paying for them.
   *
   * Genuinely unattributed calls exist and must stay null: `anthropic_health_check` runs on a
   * timer for nobody. Null here means "no owner", never "we had one and did not pass it".
   */
  userId?: string;
  workspaceId?: string;
}

export interface AIGenerateResult<T = string> {
  /** Generated text or parsed object */
  output: T;
  /** Raw text response */
  text: string;
  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Model used */
  model: string;
}

// ── Gemini: Text generation ──
export async function generateWithGemini(
  prompt: string,
  config?: AIGenerateConfig & { systemPrompt?: string },
): Promise<AIGenerateResult<string>> {
  const modelId = config?.model || DEFAULT_GEMINI_MODEL;
  const _start = Date.now();

  try {
    const result = await generateText({
      model: google(modelId),
      system: config?.systemPrompt,
      prompt,
      temperature: config?.temperature ?? 0.7,
      maxOutputTokens: config?.maxTokens ?? 4096,
      providerOptions: config?.thinkingLevel
        ? {
            google: {
              thinkingConfig: {
                thinkingLevel: config.thinkingLevel,
              },
            },
          }
        : undefined,
    });

    const usage = await result.usage;
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;

    // Auto-track every Gemini call (fire-and-forget)
    void _logTrackedCall({
      task: config?.task ?? 'gemini_text_generation',
      userId: config?.userId,
      workspaceId: config?.workspaceId,
      model: modelId,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - _start,
    });

    return {
      output: result.text,
      text: result.text,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      model: modelId,
    };
  } catch (err) {
    void _logTrackedCall({
      task: config?.task ?? 'gemini_text_generation',
      userId: config?.userId,
      workspaceId: config?.workspaceId,
      model: modelId,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - _start,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ── Gemini: Structured JSON output ──
export async function generateStructuredWithGemini<T>(
  prompt: string,
  schema: ZodType<T>,
  config?: AIGenerateConfig & { systemPrompt?: string },
): Promise<AIGenerateResult<T>> {
  const modelId = config?.model || DEFAULT_GEMINI_MODEL;
  const _start = Date.now();

  try {
    const result = await generateText({
      model: google(modelId),
      system: config?.systemPrompt,
      prompt,
      temperature: config?.temperature ?? 0.3,
      maxOutputTokens: config?.maxTokens ?? 4096,
      output: Output.object({ schema }),
      providerOptions: config?.thinkingLevel
        ? {
            google: {
              thinkingConfig: {
                thinkingLevel: config.thinkingLevel,
              },
            },
          }
        : undefined,
    });

    const usage = await result.usage;
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;

    void _logTrackedCall({
      task: config?.task ?? 'gemini_structured_generation',
      userId: config?.userId,
      workspaceId: config?.workspaceId,
      model: modelId,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - _start,
    });

    return {
      output: result.output as T,
      text: result.text,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      model: modelId,
    };
  } catch (err) {
    void _logTrackedCall({
      task: config?.task ?? 'gemini_structured_generation',
      userId: config?.userId,
      workspaceId: config?.workspaceId,
      model: modelId,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - _start,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ── Claude: Text generation ──
export async function generateWithClaude(
  prompt: string,
  config?: AIGenerateConfig & { systemPrompt?: string },
): Promise<AIGenerateResult<string>> {
  const modelId = config?.model || DEFAULT_CLAUDE_MODEL;
  const _start = Date.now();

  try {
    const result = await generateText({
      model: anthropic(modelId),
      system: config?.systemPrompt,
      prompt,
      temperature: config?.temperature ?? 0.7,
      maxOutputTokens: config?.maxTokens ?? 4096,
    });

    const usage = await result.usage;
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;

    void _logTrackedCall({
      task: config?.task ?? 'claude_text_generation',
      userId: config?.userId,
      workspaceId: config?.workspaceId,
      model: modelId,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - _start,
    });

    return {
      output: result.text,
      text: result.text,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      model: modelId,
    };
  } catch (err) {
    void _logTrackedCall({
      task: config?.task ?? 'claude_text_generation',
      userId: config?.userId,
      workspaceId: config?.workspaceId,
      model: modelId,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - _start,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ── Claude: multi-step tool-using generation (agentic loop) ──
// Runs an agentic tool-call loop: Claude may call the provided `tools` (AI SDK `tool(...)`
// definitions), the SDK executes each and feeds the result back, repeating up to `maxSteps`
// before producing the final text. Tool execution + scoping is the caller's responsibility —
// pass tools whose filters are derived from trusted server-side identity, never from model input.
export async function generateWithClaudeTools(
  prompt: string,
  config: AIGenerateConfig & {
    systemPrompt?: string;
    // deno-lint-ignore no-explicit-any
    tools: Record<string, any>;
    maxSteps?: number;
  },
): Promise<AIGenerateResult<string>> {
  const modelId = config.model || DEFAULT_CLAUDE_MODEL;
  const _start = Date.now();

  try {
    const result = await generateText({
      model: anthropic(modelId),
      system: config.systemPrompt,
      prompt,
      temperature: config.temperature ?? 0.4,
      maxOutputTokens: config.maxTokens ?? 1024,
      tools: config.tools,
      stopWhen: stepCountIs(config.maxSteps ?? 6),
    });

    const usage = await result.usage;
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;

    void _logTrackedCall({
      task: config.task ?? 'claude_tool_generation',
      userId: config.userId,
      workspaceId: config.workspaceId,
      model: modelId,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - _start,
    });

    return {
      output: result.text,
      text: result.text,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      model: modelId,
    };
  } catch (err) {
    void _logTrackedCall({
      task: config.task ?? 'claude_tool_generation',
      userId: config.userId,
      workspaceId: config.workspaceId,
      model: modelId,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - _start,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ── Claude: Structured JSON output ──
export async function generateStructuredWithClaude<T>(
  prompt: string,
  schema: ZodType<T>,
  config?: AIGenerateConfig & { systemPrompt?: string },
): Promise<AIGenerateResult<T>> {
  const modelId = config?.model || DEFAULT_CLAUDE_MODEL;
  const _start = Date.now();

  try {
    const result = await generateText({
      model: anthropic(modelId),
      system: config?.systemPrompt,
      prompt,
      temperature: config?.temperature ?? 0.3,
      maxOutputTokens: config?.maxTokens ?? 4096,
      output: Output.object({ schema }),
    });

    const usage = await result.usage;
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;

    void _logTrackedCall({
      task: config?.task ?? 'claude_structured_generation',
      userId: config?.userId,
      workspaceId: config?.workspaceId,
      model: modelId,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - _start,
    });

    return {
      output: result.output as T,
      text: result.text,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      model: modelId,
    };
  } catch (err) {
    void _logTrackedCall({
      task: config?.task ?? 'claude_structured_generation',
      userId: config?.userId,
      workspaceId: config?.workspaceId,
      model: modelId,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - _start,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ── Claude: the raw Messages API, through the chokepoint ─────────────────────
/**
 * The Messages API verbatim, with the two things a hand-rolled `fetch` keeps forgetting.
 *
 * The AI SDK wrappers above cover a one-shot text or structured turn. They do NOT cover forced
 * `tool_use` against a hand-written tool schema, or an image block in the user turn — and those
 * are not exotic here: invariant 9 REQUIRES forced tool_use for any classifier whose verdict
 * drives a spend or a write, and `image-edit-gate` classifies an actual image. So fifteen call
 * sites reached past this file to `fetch('https://api.anthropic.com/v1/messages')`, which is not
 * fifteen people ignoring a rule — it is a rule with a hole in it.
 *
 * What they lost by going around:
 *   1. Cost. Ten re-implemented logging by hand; five (flow-engine, stock-api,
 *      xml-import-orchestrator, image-edit-gate, next-steps) logged NOTHING, so that Anthropic
 *      spend reached no cost view at all. A plausible zero that nothing raises.
 *   2. The key. Three read `Deno.env.get('ANTHROPIC_API_KEY')` directly. `Deno.env.set` throws on
 *      Supabase edge, so the platform_secrets bootstrap is a no-op — a key an admin set in the DB
 *      and never in env is invisible to those three, and the call just fails.
 *
 * Both come free here. `body` is passed to Anthropic unchanged, so a migrating call site keeps
 * its own tools, tool_choice, system blocks and image content exactly as they were.
 *
 * THROWS on a missing key, a non-2xx, or a network failure — always after logging the attempt.
 * Every site this replaced already had a try/catch around its fetch and a separate `!res.ok`
 * branch that did the same thing as the catch, so a throw preserves their behaviour.
 */
export interface ClaudeMessagesResponse {
  id?: string;
  stop_reason?: string;
  // `input` is the provider's tool_use payload — shape is the caller's own tool schema, so
  // it is keyed-unknown rather than `unknown` (which blocks every property read) or `any`
  // (which would silently accept a typo at every call site).
  content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export async function callClaudeMessages(
  body: Record<string, unknown> & { model?: string; max_tokens: number },
  config: {
    task: string;
    userId?: string;
    workspaceId?: string | null;
    /** Default 60s. The old sites ranged 20–120s; pass the one that site used. */
    timeoutMs?: number;
    /**
     * Set ONLY when this call's tokens are already booked in another ledger, and name it in a
     * comment at the call site. `agent-chat` books its turns — including the next-steps garnish —
     * into `agent_usage_logs` via `log_agent_usage`, which ALSO debits credits. AIPerformanceTab
     * reads both tables, so a second row here would count the same tokens twice, which is the
     * two-derivations-of-one-money-quantity shape in a new costume.
     */
    costLoggedByCaller?: boolean;
    /**
     * Extra request headers, for the beta opt-ins the Messages API gates behind one —
     * `{'anthropic-beta': 'web-search-2025-03-05'}` for the server-side web_search tool, which is
     * why flow-engine had its own fetch. Never put the API key here; it is resolved above.
     */
    headers?: Record<string, string>;
  },
): Promise<ClaudeMessagesResponse> {
  const modelId = String(body.model || DEFAULT_CLAUDE_MODEL);
  const _start = Date.now();
  const fail = (message: string): never => {
    if (config.costLoggedByCaller) throw new Error(message);
    void _logTrackedCall({
      task: config.task,
      userId: config.userId,
      workspaceId: config.workspaceId ?? undefined,
      model: modelId,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - _start,
      errorMessage: message,
    });
    throw new Error(message);
  };

  // env first, platform_secrets second — the shared resolver, never a bare Deno.env.get.
  const apiKey = _logSupabase
    ? (await resolveSecret(_logSupabase, 'ANTHROPIC_API_KEY')).value
    : Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) fail('ANTHROPIC_API_KEY unresolved (env and platform_secrets)');

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.headers ?? {}),
        // After the spread, so a caller cannot accidentally override either.
        'x-api-key': apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ ...body, model: modelId }),
      signal: AbortSignal.timeout(config.timeoutMs ?? 60_000),
    });
  } catch (e) {
    return fail(`anthropic request failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return fail(`anthropic ${res.status}: ${detail.slice(0, 300)}`);
  }

  const response = await res.json() as ClaudeMessagesResponse;
  if (config.costLoggedByCaller) return response;
  void _logTrackedCall({
    task: config.task,
    userId: config.userId,
    workspaceId: config.workspaceId ?? undefined,
    model: modelId,
    inputTokens: Number(response.usage?.input_tokens ?? 0),
    outputTokens: Number(response.usage?.output_tokens ?? 0),
    latencyMs: Date.now() - _start,
  });
  return response;
}

// ── Gemini: Image generation + editing ──
// GA image models (Nano Banana 2 / Pro). The `-preview` aliases were deprecated
// and shut down; the GA ids use the identical generateContent API.
export type GeminiImageModel = 'gemini-3.1-flash-image' | 'gemini-3-pro-image';
export type ImageAspectRatio = '1:1' | '16:9' | '3:2' | '4:3' | '9:16' | '3:4' | '4:5' | '5:4' | '21:9' | '2:3';

export interface GeminiImageResult {
  base64: string;
  mimeType: string;
  model: GeminiImageModel;
}

/** Attribution + task label for the per-unit (image/video) billing rows. Same contract as
 *  `AIGenerateConfig` — null means "no owner", never "we had one and did not pass it". */
export interface UnitBillingConfig {
  task?: string;
  userId?: string;
  workspaceId?: string;
}

export async function generateImageWithGemini(
  prompt: string | { text: string; images: (Uint8Array | string)[] },
  config?: UnitBillingConfig & {
    model?: GeminiImageModel;
    aspectRatio?: ImageAspectRatio;
  },
): Promise<GeminiImageResult> {
  const modelId: GeminiImageModel = config?.model ?? 'gemini-3.1-flash-image';
  const _start = Date.now();

  // Any prompt with images must go through the raw Gemini generateContent API.
  // The Vercel AI SDK generateImage() is text-to-image only — it does not support
  // passing source images for editing and will silently ignore them, regenerating
  // the room from scratch (causing positions to change). Route ALL image-containing
  // prompts through generateMultiImageWithGemini which uses responseModalities correctly.
  if (typeof prompt === 'object' && prompt.images.length >= 1) {
    // `...config` FIRST: spreading it after `model` lets a caller who passes an explicit
    // `model: undefined` overwrite the resolved id with undefined.
    return generateMultiImageWithGemini(prompt, { ...config, model: modelId });
  }

  try {
    const { image } = await generateImage({
      model: google.image(modelId),
      prompt: prompt as any,
      aspectRatio: config?.aspectRatio ?? '16:9',
    });

    void _logUnitCall({
      task: config?.task ?? 'gemini_image_generation',
      modelKey: modelId,
      units: 1,
      latencyMs: Date.now() - _start,
      userId: config?.userId,
      workspaceId: config?.workspaceId,
    });

    return {
      base64: image.base64,
      mimeType: image.mediaType ?? 'image/png',
      model: modelId,
    };
  } catch (err) {
    void _logUnitCall({
      task: config?.task ?? 'gemini_image_generation',
      modelKey: modelId,
      units: 0,
      latencyMs: Date.now() - _start,
      errorMessage: err instanceof Error ? err.message : String(err),
      userId: config?.userId,
      workspaceId: config?.workspaceId,
    });
    throw err;
  }
}

/**
 * Multi-image generation via Gemini's generateContent API with IMAGE response modality.
 * Used when two or more reference images are needed (e.g. dual-reference Copy Style).
 *
 * Sends all images as ordered content parts — the text prompt can reference them by
 * position ("IMAGE 1", "IMAGE 2"). Gemini processes them in the order provided.
 */
async function generateMultiImageWithGemini(
  prompt: { text: string; images: (Uint8Array | string)[] },
  config: UnitBillingConfig & { model: GeminiImageModel },
): Promise<GeminiImageResult> {
  if (!GOOGLE_API_KEY()) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set');
  const _start = Date.now();

  /** Safe base64 encoder that doesn't blow the call stack on large Uint8Arrays */
  const toBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  };

  /** Convert any image input to an inlineData part */
  const toInlinePart = async (img: Uint8Array | string): Promise<any> => {
    if (img instanceof Uint8Array) {
      return { inlineData: { mimeType: 'image/jpeg', data: toBase64(img) } };
    }
    if (img.startsWith('data:')) {
      const commaIdx = img.indexOf(',');
      const mimeType = img.slice(5, img.indexOf(';'));
      const base64 = img.slice(commaIdx + 1);
      return { inlineData: { mimeType, data: base64 } };
    }
    // URL — fetch and inline, through the shared SSRF guard (invariant 7, #363 `EE-4`).
    // These URLs arrive from tool calls and stored product/moodboard rows, so this runtime
    // resolves and fetches a URL on somebody else's say-so. The bare `fetch(img)` this
    // replaces followed redirects, so a public URL could 302 to 169.254.169.254, and read
    // the whole body with `arrayBuffer()` before anything looked at its size. The guard is
    // https-only, refuses redirects, rejects private/link-local targets, and caps the read
    // against bytes actually delivered rather than the Content-Length claim.
    const { bytes, mimeType } = await fetchImageGuarded(img);
    return { inlineData: { mimeType, data: toBase64(bytes) } };
  };

  // Build content parts with explicit labels before each image so Gemini knows
  // exactly which is the layout donor and which is the design donor.
  // Structure: label → image → [label → image] → instruction text
  const isSingleImage = prompt.images.length === 1;
  const IMAGE_LABELS = isSingleImage
    ? [
        'ROOM TO EDIT (this is the room photo you are editing — all fixture positions, walls, doors, windows stay exactly where they are):',
      ]
    : [
        'STYLE REFERENCE IMAGE (first image — mood board only, extract colors/materials/finishes, ignore its spatial layout entirely):',
        'ROOM TO EDIT (second image — this is the room you are editing, all positions and fixtures stay exactly where they are):',
      ];

  const parts: any[] = [];
  for (let i = 0; i < prompt.images.length; i++) {
    parts.push({ text: IMAGE_LABELS[i] ?? `IMAGE ${i + 1}:` });
    parts.push(await toInlinePart(prompt.images[i]));
  }
  // Instruction comes last so Gemini processes both images before reading the task
  parts.push({ text: prompt.text });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${GOOGLE_API_KEY()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    void _logUnitCall({
      task: config.task ?? 'gemini_image_generation',
      modelKey: config.model,
      units: 0,
      latencyMs: Date.now() - _start,
      errorMessage: `HTTP ${response.status}`,
      userId: config.userId,
      workspaceId: config.workspaceId,
    });
    throw new Error(`Gemini multi-image generation failed: ${err}`);
  }

  const result = await response.json();
  const imagePart = result.candidates?.[0]?.content?.parts?.find(
    (p: any) => p.inlineData?.mimeType?.startsWith('image/'),
  );

  if (!imagePart?.inlineData) {
    // Say WHY. A 200 with no image part is almost never "the model had nothing to
    // say" — it is a refusal, and the reason is in finishReason. IMAGE_RECITATION
    // (output too close to memorised training data) is the common one and it is
    // deterministic per prompt: measured 0 images in 13 attempts for a flat,
    // repeating fabric macro, on both flash and pro, with and without a source
    // image. Retrying does not help; the prompt has to change. Reporting only
    // "no image in response" sent every one of those to Sentry as a mystery.
    const cand = result.candidates?.[0];
    const reason = cand?.finishReason ?? 'unknown';
    const blocked = result.promptFeedback?.blockReason;
    throw new Error(
      `Gemini multi-image: no image in response (finishReason=${reason}` +
      `${blocked ? `, blockReason=${blocked}` : ''})` +
      (reason === 'IMAGE_RECITATION'
        ? ' — the model refused as too close to training data. Generic, flat, repeating subjects (plain material swatches) trigger this reliably; make the prompt more specific or use a different provider.'
        : ''),
    );
  }

  void _logUnitCall({
    task: config.task ?? 'gemini_image_generation',
    modelKey: config.model,
    units: 1,
    latencyMs: Date.now() - _start,
    userId: config.userId,
    workspaceId: config.workspaceId,
  });

  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
    model: config.model,
  };
}

// ── Veo: Video generation ──
export type VeoModel = 'veo-2.0-generate-001';

export interface VeoVideoResult {
  base64: string;
  mimeType: string;
  model: VeoModel;
}

export async function generateVideoWithVeo(
  prompt: string,
  config?: UnitBillingConfig & {
    model?: VeoModel;
    aspectRatio?: '16:9' | '9:16' | '1:1';
    durationSeconds?: number;
    resolution?: '1280x720' | '1920x1080';
    /** Source image URL or base64 data URL for image-to-video conditioning */
    imageUrl?: string;
  },
): Promise<VeoVideoResult> {
  const modelId: VeoModel = config?.model ?? 'veo-2.0-generate-001';
  const _start = Date.now();
  const seconds = config?.durationSeconds ?? 8;

  // Image-to-video: use raw Google API (the AI SDK experimental_generateVideo
  // does not support image conditioning — it silently does text-to-video only).
  if (config?.imageUrl) {
    return generateVideoWithVeoRaw(prompt, config.imageUrl, modelId, config);
  }

  try {
    // Text-to-video via AI SDK
    const { video } = await generateVideo({
      model: google.video(modelId),
      prompt,
      aspectRatio: config?.aspectRatio ?? '16:9',
      durationSeconds: seconds,
      resolution: config?.resolution ?? '1280x720',
      pollTimeoutMs: 600000,
    } as any);

    // `veo-2` is the generation_models id; its pricing_key is deliberately NULL — nobody has
    // verified a per-second rate for it — so this logs the call with a null cost and a warning
    // rather than a guessed number. The row still exists, which is the point: `ops.silent_zero`
    // can see "video generated, cost unknown", and a missing price row is a fixable gap.
    void _logUnitCall({
      task: config?.task ?? 'veo_video_generation',
      modelKey: VEO_PRICING_MODEL_ID,
      units: seconds,
      latencyMs: Date.now() - _start,
      userId: config?.userId,
      workspaceId: config?.workspaceId,
    });

    return {
      base64: (video as any).base64,
      mimeType: (video as any).mimeType ?? 'video/mp4',
      model: modelId,
    };
  } catch (err) {
    void _logUnitCall({
      task: config?.task ?? 'veo_video_generation',
      modelKey: VEO_PRICING_MODEL_ID,
      units: 0,
      latencyMs: Date.now() - _start,
      errorMessage: err instanceof Error ? err.message : String(err),
      userId: config?.userId,
      workspaceId: config?.workspaceId,
    });
    throw err;
  }
}

/**
 * Image-to-video via the Google Generative Language API directly.
 * Fetches the source image, submits as a long-running operation, polls until
 * done, then downloads and returns the video as base64.
 */
async function generateVideoWithVeoRaw(
  prompt: string,
  imageUrl: string,
  modelId: VeoModel,
  config?: UnitBillingConfig & { aspectRatio?: string; durationSeconds?: number; resolution?: string },
): Promise<VeoVideoResult> {
  if (!GOOGLE_API_KEY()) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set');
  const _start = Date.now();
  const billSeconds = config?.durationSeconds ?? 8;
  const logVeo = (units: number, errorMessage?: string) => _logUnitCall({
    task: config?.task ?? 'veo_video_generation',
    modelKey: VEO_PRICING_MODEL_ID,
    units,
    latencyMs: Date.now() - _start,
    ...(errorMessage ? { errorMessage } : {}),
    userId: config?.userId,
    workspaceId: config?.workspaceId,
  });

  // Fetch source image → base64, through the shared SSRF guard (invariant 7, #365 `AD-27` —
  // the thirteenth site of this shape). `imageUrl` reaches here from a tool call, so it is a URL
  // this runtime resolves on behalf of whoever asked: a bare fetch followed 302s, had no size
  // cap, and would happily read `169.254.169.254`. The guard is https-only, refuses redirects,
  // rejects private/link-local targets and caps the read against bytes actually delivered.
  const { bytes: imgBytes, mimeType } = await fetchImageGuarded(imageUrl);

  // Safe base64 encoder (avoids call-stack overflow on large images)
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < imgBytes.length; i += chunk) {
    binary += String.fromCharCode(...imgBytes.subarray(i, i + chunk));
  }
  const imageBase64 = btoa(binary);

  // Submit long-running operation
  const submitRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predictLongRunning?key=${GOOGLE_API_KEY()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{
          prompt,
          image: { bytesBase64Encoded: imageBase64, mimeType },
        }],
        parameters: {
          aspectRatio: config?.aspectRatio ?? '16:9',
          durationSeconds: config?.durationSeconds ?? 8,
        },
      }),
    },
  );

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Veo submit failed (${submitRes.status}): ${err}`);
  }

  const operation = await submitRes.json() as { name: string; done?: boolean };
  const opName = operation.name;
  if (!opName) throw new Error('Veo: no operation name returned');

  // Poll until done (10 min max, 10s intervals)
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 10_000));

    const pollRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${opName}?key=${GOOGLE_API_KEY()}`,
    );
    if (!pollRes.ok) continue;

    const opData = await pollRes.json() as {
      done?: boolean;
      error?: { message: string };
      response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string; encodedVideo?: string; mimeType?: string } }> } };
    };

    if (opData.error) throw new Error(`Veo generation failed: ${opData.error.message}`);

    if (opData.done) {
      // Try both response shapes Google has used
      const generateVideoResponse =
        (opData.response as any)?.generateVideoResponse ??
        (opData.response as any);
      const sample = generateVideoResponse?.generatedSamples?.[0];
      if (!sample?.video) {
        throw new Error(`Veo: no video in response. Response: ${JSON.stringify(opData.response).slice(0, 500)}`);
      }

      // Prefer inline base64, fall back to downloading from URI
      if (sample.video.encodedVideo) {
        void logVeo(billSeconds);
        return { base64: sample.video.encodedVideo, mimeType: sample.video.mimeType ?? 'video/mp4', model: modelId };
      }

      if (sample.video.uri) {
        // The URI is a generativelanguage.googleapis.com endpoint — requires API key
        const videoFetchUrl = sample.video.uri.includes('?')
          ? `${sample.video.uri}&key=${GOOGLE_API_KEY()}`
          : `${sample.video.uri}?key=${GOOGLE_API_KEY()}`;
        // Not `fetchBinaryGuarded` here, deliberately: this URI comes back from Google's own
        // API in response to our authenticated request, so there is no user-influenced host
        // to validate, and the guard's `redirect: 'error'` would break the download outright
        // — these endpoints 302 to a storage CDN as a matter of course.
        //
        // The half that DOES apply is the cap. `await vidRes.arrayBuffer()` read a video of
        // unbounded length into a 256 MB isolate and then base64-encoded it, adding another
        // third on top, with nothing between the response and OOM. `readCapped` is the same
        // metering `fetchBinaryGuarded` uses, aborting the read the moment it overruns
        // rather than checking a Content-Length the server is free to omit or lie about.
        const vidRes = await fetch(videoFetchUrl);
        if (!vidRes.ok) throw new Error(`Veo: failed to download video (${vidRes.status}): ${await vidRes.text()}`);
        const vidBytes = await readCapped(vidRes, MAX_VIDEO_DOWNLOAD_BYTES);
        let vidBinary = '';
        for (let i = 0; i < vidBytes.length; i += chunk) {
          vidBinary += String.fromCharCode(...vidBytes.subarray(i, i + chunk));
        }
        void logVeo(billSeconds);
        return { base64: btoa(vidBinary), mimeType: 'video/mp4', model: modelId };
      }

      throw new Error('Veo: video has neither encodedVideo nor uri');
    }
  }

  void logVeo(0, 'timed out waiting for video generation');
  throw new Error('Veo: timed out waiting for video generation');
}

// ── Kling AI: Video generation ──
export interface KlingVideoResult {
  base64: string;
  mimeType: string;
  model: string;
}

export async function generateVideoWithKling(
  prompt: string,
  config?: UnitBillingConfig & {
    /** Default: 'kling-v3.0-i2v' */
    model?: string;
    /** Source image URL for image-to-video */
    imageUrl?: string;
    /** 5 or 10 seconds. Default: 5 */
    durationSeconds?: 5 | 10;
    aspectRatio?: '16:9' | '9:16' | '1:1';
    /** 'std' or 'pro'. Default: 'pro' */
    mode?: 'std' | 'pro';
  },
): Promise<KlingVideoResult> {
  const modelId = config?.model ?? 'kling-v3.0-i2v';
  const _start = Date.now();
  const seconds = config?.durationSeconds ?? 5;

  const visionPrompt: any = config?.imageUrl
    ? { image: config.imageUrl, text: prompt }
    : prompt;

  try {
    const { video } = await generateVideo({
      // KlingAIProvider is NOT callable — it exposes video()/videoModel(). Calling it
      // directly (klingai(modelId)) threw a TypeError on every invocation.
      model: klingai.video(modelId),
      prompt: visionPrompt,
      durationSeconds: seconds,
      aspectRatio: config?.aspectRatio ?? '16:9',
      providerOptions: {
        klingai: {
          mode: config?.mode ?? 'pro',
        },
      },
      pollTimeoutMs: 600_000,
    } as any);

    // KLING_PRICING_MODEL_ID, not `modelId`: the string this client hands the KlingAI SDK
    // ('kling-v3.0-i2v') is neither the generation_models id nor an ai_model_pricing key, and
    // resolution here is exact on purpose — `kling-3.0` and `kling-1.6-pro` are different rates.
    void _logUnitCall({
      task: config?.task ?? 'kling_video_generation',
      modelKey: KLING_PRICING_MODEL_ID,
      units: seconds,
      latencyMs: Date.now() - _start,
      userId: config?.userId,
      workspaceId: config?.workspaceId,
    });

    return {
      base64: (video as any).base64,
      mimeType: (video as any).mimeType ?? 'video/mp4',
      model: modelId,
    };
  } catch (err) {
    void _logUnitCall({
      task: config?.task ?? 'kling_video_generation',
      modelKey: KLING_PRICING_MODEL_ID,
      units: 0,
      latencyMs: Date.now() - _start,
      errorMessage: err instanceof Error ? err.message : String(err),
      userId: config?.userId,
      workspaceId: config?.workspaceId,
    });
    throw err;
  }
}

// ── Grok (xAI Aurora): Image generation + editing ──────────────────────────

// Current xAI image model (the older grok-2-image-1212 is legacy). Note: this
// model is prompt-driven and does NOT do mask-based inpainting — generate-region-edit
// still sends a mask, which this model ignores (edit applies from the prompt). The
// mask param is harmless/optional on /v1/images/edits.
export const GROK_IMAGE_MODEL = 'grok-imagine-image-quality';

export interface GrokImageResult {
  base64: string;
  mimeType: string;
  model: string;
}

/**
 * Generate an image from a text prompt using xAI's Aurora model.
 * Uses the OpenAI-compatible /v1/images/generations endpoint.
 */
export async function generateImageWithGrok(
  prompt: string,
  config?: UnitBillingConfig & { model?: string },
): Promise<GrokImageResult> {
  if (!XAI_API_KEY()) throw new Error('XAI_API_KEY not set');

  const modelId = config?.model ?? GROK_IMAGE_MODEL;
  const _start = Date.now();
  const logGrok = (units: number, errorMessage?: string) => _logUnitCall({
    task: config?.task ?? 'grok_image_generation',
    modelKey: GROK_PRICING_MODEL_ID,
    units,
    latencyMs: Date.now() - _start,
    ...(errorMessage ? { errorMessage } : {}),
    userId: config?.userId,
    workspaceId: config?.workspaceId,
  });

  const response = await fetch('https://api.x.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${XAI_API_KEY()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      prompt,
      n: 1,
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    void logGrok(0, `HTTP ${response.status}`);
    throw new Error(`Grok image generation failed (${response.status}): ${err}`);
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    void logGrok(0, 'no image in generation response');
    throw new Error('Grok: no image in generation response');
  }

  void logGrok(1);
  return { base64: b64, mimeType: 'image/png', model: modelId };
}

/**
 * Edit an existing image using xAI's Aurora model.
 * Supports optional binary mask for region-specific inpainting:
 *   - maskBytes: PNG where white pixels (255) = regenerate, black (0) = keep
 * Without a mask, Aurora edits the full image guided by the prompt.
 * Uses multipart/form-data as required by /v1/images/edits.
 */
export async function editImageWithGrok(
  prompt: string,
  imageBytes: Uint8Array,
  config?: UnitBillingConfig & {
    model?: string;
    /** Binary PNG mask: white = change, black = keep unchanged */
    maskBytes?: Uint8Array;
    imageMimeType?: string;
  },
): Promise<GrokImageResult> {
  if (!XAI_API_KEY()) throw new Error('XAI_API_KEY not set');

  const modelId = config?.model ?? GROK_IMAGE_MODEL;
  const mimeType = config?.imageMimeType ?? 'image/jpeg';
  const _start = Date.now();
  const logGrok = (units: number, errorMessage?: string) => _logUnitCall({
    task: config?.task ?? 'grok_image_edit',
    modelKey: GROK_PRICING_MODEL_ID,
    units,
    latencyMs: Date.now() - _start,
    ...(errorMessage ? { errorMessage } : {}),
    userId: config?.userId,
    workspaceId: config?.workspaceId,
  });

  const form = new FormData();
  form.append('model', modelId);
  form.append('prompt', prompt);
  form.append('n', '1');
  form.append('response_format', 'b64_json');
  form.append('image', new Blob([imageBytes as unknown as BlobPart], { type: mimeType }), 'image.jpg');

  if (config?.maskBytes) {
    form.append('mask', new Blob([config.maskBytes as unknown as BlobPart], { type: 'image/png' }), 'mask.png');
  }

  const response = await fetch('https://api.x.ai/v1/images/edits', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${XAI_API_KEY()}` },
    body: form,
  });

  if (!response.ok) {
    const err = await response.text();
    void logGrok(0, `HTTP ${response.status}`);
    throw new Error(`Grok image edit failed (${response.status}): ${err}`);
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    void logGrok(0, 'no image in edit response');
    throw new Error('Grok: no image in edit response');
  }

  void logGrok(1);
  return { base64: b64, mimeType: 'image/png', model: modelId };
}

// ── Re-exports for convenience ──
export { z } from 'npm:zod@3';
export { google, anthropic };
export { DEFAULT_GEMINI_MODEL, DEFAULT_CLAUDE_MODEL };

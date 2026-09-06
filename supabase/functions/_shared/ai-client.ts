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
  // BytePlus ModelArk (Seedance 2.5). The ByteDance provider reads `ARK_API_KEY` from
  // process.env when no explicit apiKey is passed; we pass one, but the sync keeps the
  // two paths from disagreeing about which key is in force.
  'ARK_API_KEY',
  // fal (H3 Max video). Raw REST rather than a provider — see the note on
  // generateVideoWithH3Max — but kept in sync for the same reason LUMA_API_KEY is.
  'FAL_KEY',
  // Luma (Ray3.2 video). Raw REST rather than a provider — see the note on generateVideoWithRay.
  'LUMA_API_KEY',
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
//
// AND THE MAJOR IS 3, NOT 4 — the pin above was right about pinning and wrong about the
// number. A provider package's major tracks the MODEL SPECIFICATION it implements, not the
// model line it can reach: the whole `@ai-sdk/klingai@4` series depends on
// `@ai-sdk/provider@4` (`specificationVersion: 'v4'`, the AI SDK 7 line), while `npm:ai@6`
// resolves `@ai-sdk/provider@3` and its `resolveVideoModel` throws
// `AI_UnsupportedModelVersionError` on anything that is not `'v3'`. That throw happens
// BEFORE the network call, so with the @4 pin EVERY Kling generation failed 100% of the
// time — credits refunded, nothing in `ai_usage_logs`, and a pin that reads deliberate.
// 3.0.41 is the current v3-spec release and carries the identical `kling-v3.0-*` ids.
// Upgrading `ai` to 7 is what unlocks the @4 line; do both together or neither.
import { createKlingAI } from 'npm:@ai-sdk/klingai@3';
// Seedance 2.5 (ByteDance) over BytePlus ModelArk. Major 1 for exactly the reason above:
// `@ai-sdk/bytedance@2` is spec v4. 1.0.38 is spec v3 and speaks the same Ark
// `/contents/generations/tasks` API.
import { createByteDance } from 'npm:@ai-sdk/bytedance@1';
// Wan3.0 video over DashScope. Major 1 = spec v3; @ai-sdk/alibaba@2 is spec v4. The
// provider is named for the VENDOR, not the platform — which is why a search for
// "@ai-sdk/dashscope" found nothing and this code was hand-written for a year.
import { createAlibaba } from 'npm:@ai-sdk/alibaba@1';
import { z, type ZodType } from 'npm:zod@3';
import { createClient } from '@supabase/supabase-js';
import { MARKUP_MULTIPLIER as _MARKUP } from './pricing-constants.ts';
import { resolveTokenPrice, resolveUnitPrice } from './ai-logger.ts';
import { fetchImageGuarded, readCapped } from './fetch-image.ts';
import { resolveSecret } from './secrets.ts';
import { assertTransferAllowed, isEeaEndpoint } from './residency-gate.ts';

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
// Images ONLY. OpenAI was removed from the platform on 2026-08-23; gpt-image-1 came back on
// 2026-09-05 for the interior grid (text-to-image and image edit) through this chokepoint,
// the same way Grok's OpenAI-compatible endpoint did. No SDK, no text models here.
const OPENAI_API_KEY = () => Deno.env.get('OPENAI_API_KEY') || '';
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
      // DECLARE THE OUTCOME. `ops.silent_zero_provider` judges a provider only on rows
      // carrying `success`, and skips any row without it — correctly, since a row that
      // never claimed to succeed is not evidence that it failed. This chokepoint set it
      // nowhere, so every model call it logged was invisible to the one probe that exists
      // to notice a provider refusing all of them.
      //
      // Derived from `errorMessage`, which the row above already uses to choose its
      // action, rather than accepted as a separate argument that could contradict it.
      metadata: {
        success: !opts.errorMessage,
        error: opts.errorMessage ?? null,
        latency_ms: opts.latencyMs,
      },
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
        // Same key, same reason as the token path above. `error_message` was already
        // here conditionally; `success` is what the probe reads and must be present
        // either way — a key that only appears on failure is a key that never appears
        // when the provider is healthy, which is indistinguishable from silence.
        success: !opts.errorMessage,
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
const DEFAULT_CLAUDE_MODEL = 'claude-opus-5';

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

// ── Gemini: audio → text ──
// The recording travels as a FILE PART in the user message; Gemini is the one text model behind
// this client that accepts audio inline. The transcript is plain text, on purpose: a voice note is
// the customer's words, and the reader (a person in the inbox, or the assistant) wants them as
// said, not as a schema. Cost lands in ai_usage_logs like every other call here.
export async function transcribeAudioWithGemini(
  audio: Uint8Array,
  mediaType: string,
  config: AIGenerateConfig & {
    systemPrompt: string;
    /** The user-turn text beside the recording. Default: a bare instruction to transcribe. */
    instruction?: string;
    /** Upstream ceiling. A voice note is seconds long; a minute of silence here is a stuck call. */
    timeoutMs?: number;
  },
): Promise<AIGenerateResult<string>> {
  const modelId = config.model || DEFAULT_GEMINI_MODEL;
  const _start = Date.now();
  const task = config.task ?? 'gemini_audio_transcription';

  try {
    const result = await generateText({
      model: google(modelId),
      system: config.systemPrompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'file', data: audio, mediaType },
          { type: 'text', text: config.instruction ?? 'Transcribe this recording.' },
        ],
      }],
      temperature: config.temperature ?? 0,
      maxOutputTokens: config.maxTokens ?? 2048,
      abortSignal: AbortSignal.timeout(config.timeoutMs ?? 60_000),
    });

    const usage = await result.usage;
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;

    void _logTrackedCall({
      task,
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
      task,
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
    const failure = _describeStructuredFailure(err);
    void _logTrackedCall({
      task: config?.task ?? 'gemini_structured_generation',
      userId: config?.userId,
      workspaceId: config?.workspaceId,
      model: modelId,
      // A truncated call still burned every token it was allowed. Reporting 0/0 hid the
      // whole reason it failed — see _describeStructuredFailure.
      inputTokens: failure.inputTokens,
      outputTokens: failure.outputTokens,
      latencyMs: Date.now() - _start,
      errorMessage: failure.message,
    });
    throw failure.error;
  }
}

/**
 * Name a structured-output failure for what it is.
 *
 * Gemini counts THINKING tokens against `maxOutputTokens`. When a reasoning model runs out
 * of budget mid-JSON the API returns `finishReason: MAX_TOKENS` with a partial body, and
 * the AI SDK surfaces that as `AI_NoObjectGeneratedError: No object generated: could not
 * parse the response.` — indistinguishable, to anyone reading a log or an `error_message`
 * column, from a model that answered badly. `seo_plan` sat broken behind exactly that
 * sentence: 3,929 reasoning tokens and 151 of JSON against a 4,096 cap, reported as an
 * unparseable answer for as long as the stage existed.
 *
 * So: when the cause is the budget, SAY it is the budget, and carry the token split into
 * `ai_usage_logs` rather than the 0/0 the old catch wrote.
 */
function _describeStructuredFailure(err: unknown): {
  error: unknown;
  message: string;
  inputTokens: number;
  outputTokens: number;
} {
  const e = err as {
    name?: string;
    message?: string;
    finishReason?: string;
    usage?: { inputTokens?: number; outputTokens?: number; reasoningTokens?: number };
  };

  const inputTokens = e?.usage?.inputTokens ?? 0;
  const outputTokens = e?.usage?.outputTokens ?? 0;
  const message = err instanceof Error ? err.message : String(err);

  if (e?.name === 'AI_NoObjectGeneratedError' && e?.finishReason === 'length') {
    const reasoning = e.usage?.reasoningTokens ?? 0;
    const detail =
      `Structured output hit the token cap before the object closed — raise maxTokens or lower ` +
      `thinkingLevel (reasoning ${reasoning} + text ${Math.max(outputTokens - reasoning, 0)} ` +
      `= ${outputTokens} output tokens).`;
    return { error: new Error(detail), message: detail, inputTokens, outputTokens };
  }

  return { error: err, message, inputTokens, outputTokens };
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

// ── Wan3.0 (Alibaba) ───────────────────────────────────────────────────────
//
// Through `@ai-sdk/alibaba@1` (major 1 for spec v3, same rule as Kling/Seedance).
// This replaced a hand-written DashScope REST client on 2026-08-29, and the rewrite
// corrected three things the hand-written version had wrong — none of which could have
// surfaced as a test failure, because no call had ever been verified against a funded key:
//
//   1. THE MODEL ID. It sent `wan3.0-video-prime`, which does not appear on Alibaba's own
//      model page. The documented id is `wan3.0-video`.
//   2. THE BODY SHAPE. It sent `input.img_url` / `input.ref_images` / `parameters.size`.
//      The documented shape — and the one the provider builds — is `input.media[]` with a
//      `type` per entry (`first_frame`, `last_frame`, `reference_image`, ...) plus
//      `parameters.ratio`.
//   3. THE PRICE. It was priced at $0.068/$0.14/$0.28 per second; QwenCloud's list rate
//      for wan3.0-video is $0.05/$0.10/$0.20. We were over-stating our own cost, which is
//      the safe direction to be wrong in but still wrong — the credit prices derived from
//      it were ~35% higher than the arithmetic supports.
//
// What Wan buys over the rest of the roster: 30 seconds against Veo's 8 and Kling's 10,
// audio generated with the picture in the same pass, and reference media held consistent
// across the clip — which is the one that matters for a materials platform, because a
// generated room that does not preserve the ACTUAL product is not a sales asset.
//
// FRAMES AND REFERENCES ARE MUTUALLY EXCLUSIVE on wan3 (the same constraint H3 Max
// has). A first/last frame and a reference image cannot travel in the same `media` array;
// the provider passes an explicit array through verbatim, so nothing local complains and
// the REJECTION arrives from DashScope. This function decides — frames win — and reports
// what it dropped rather than letting the references evaporate.
const WAN_MODEL_ID = 'wan3.0-video';

export type WanResolution = '480P' | '720P' | '1080P';

/** `ai_model_pricing.model_key` per tier — the rate differs 4x across them. */
const WAN_PRICING_MODEL_ID: Record<WanResolution, string> = {
  '480P': 'wan-3.0-480p',
  '720P': 'wan-3.0-720p',
  '1080P': 'wan-3.0-1080p',
};

/**
 * The AI SDK takes `resolution` as `{width}x{height}` and the provider maps it back onto
 * DashScope's tier string. These three are in its table; an unmapped size is forwarded
 * verbatim and rejected. Orientation rides on `ratio`, so one landscape size per tier.
 */
const WAN_RESOLUTION_SIZE: Record<WanResolution, string> = {
  '480P': '832x480',
  '720P': '1280x720',
  '1080P': '1920x1080',
};

export interface WanVideoResult {
  /** Raw bytes — the SDK downloads the finished clip. 30s of 1080p is large; do not base64 it. */
  bytes: Uint8Array;
  mimeType: string;
  model: string;
  durationSeconds: number;
  resolution: WanResolution;
  hasAudio: boolean;
  /** References supplied alongside a frame image, which wan3 will not accept together. */
  referencesDropped: number;
}

export interface WanReference {
  /** One of image | video | audio. wan3 takes at most 5 reference items in total. */
  kind: 'image' | 'video' | 'audio';
  url: string;
}

export async function generateVideoWithWan(
  prompt: string,
  config?: UnitBillingConfig & {
    /** First frame. Wan can run text-only, but every caller here is image-to-video. */
    imageUrl?: string;
    /** Optional last-frame guidance. Requires a first frame. */
    lastFrameUrl?: string;
    /** References — used ONLY when no frame image is given. Max 5 items. */
    references?: WanReference[];
    /** 2-30. Clamped by the caller, which is where the credit price is decided. */
    durationSeconds?: number;
    resolution?: WanResolution;
    aspectRatio?: '16:9' | '9:16' | '1:1';
    /** Wan scores the clip in the same pass. Default true — a silent reel is the bug. */
    generateAudio?: boolean;
    pollTimeoutMs?: number;
    /** See generateVideoWithSeedance — false when the caller writes its own richer row. */
    logUsage?: boolean;
  },
): Promise<WanVideoResult> {
  const _start = Date.now();
  const resolution = config?.resolution ?? '720P';
  const seconds = Math.max(2, Math.min(30, Math.round(config?.durationSeconds ?? 5)));
  const modelKey = WAN_PRICING_MODEL_ID[resolution];
  const withAudio = config?.generateAudio ?? true;

  // Lazy, and via resolveSecret: `Deno.env.set` is a no-op on Supabase edge, so a
  // module-load capture reads undefined and an admin-configured key is never seen.
  // The provider would read ALIBABA_API_KEY from process.env on its own; the key is
  // passed explicitly so the platform keeps ONE secret name for this vendor.
  const apiKey = _logSupabase
    ? (await resolveSecret(_logSupabase, 'DASHSCOPE_API_KEY')).value
    : Deno.env.get('DASHSCOPE_API_KEY');
  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY is not configured — cannot generate with Wan3.0');
  }

  // Same endpoint question as the research path: Singapore unless pointed at the
  // Frankfurt EU scope. The SDK reads `baseURL`/`videoBaseURL`; both default to
  // dashscope-intl, which was verified rather than assumed — a default of
  // dashscope.aliyuncs.com (Beijing) would have made residency worse as a silent
  // side-effect of adopting the provider.
  const videoBase = _logSupabase
    ? (await resolveSecret(_logSupabase, 'DASHSCOPE_BASE_URL')).value
    : Deno.env.get('DASHSCOPE_BASE_URL');

  // A video prompt is far less exposed than a research query — it describes a room,
  // not a customer — but it is still free text a user typed, so it gets the same
  // floor. The image itself is not inspected: that is what invariant 9b's
  // `assertEditableSource` is for, on the paths that edit user-supplied images.
  const verdict = assertTransferAllowed([prompt], {
    destinationIsEea: isEeaEndpoint(videoBase),
    providerLabel: 'Wan3.0 (Alibaba)',
  });
  if (!verdict.allowed) {
    throw new Error(verdict.message ?? 'Blocked: personal data may not leave the EEA.');
  }

  const alibaba = createAlibaba({
    apiKey,
    ...(videoBase ? { baseURL: videoBase, videoBaseURL: videoBase } : {}),
  });

  const refs = (config?.references ?? []).slice(0, 5);
  const usesFrame = Boolean(config?.imageUrl);
  const referencesDropped = usesFrame ? refs.length : 0;
  if (referencesDropped > 0) {
    console.warn(
      `[ai-client] Wan3.0: ${referencesDropped} reference(s) ignored — wan3 will not accept ` +
      'reference media together with a first/last frame. Drop the source image to use them.',
    );
  }

  // Built explicitly rather than left to the provider's automatic mapping, because the
  // roles are the whole point: DashScope treats a `reference_image` and a `first_frame`
  // as different instructions, and the automatic path cannot know which one we meant.
  const media: Array<{ type: string; url: string }> = usesFrame
    ? [
        { type: 'first_frame', url: config!.imageUrl! },
        ...(config?.lastFrameUrl ? [{ type: 'last_frame', url: config.lastFrameUrl }] : []),
      ]
    : refs.map((r) => ({
        type: r.kind === 'video'
          ? 'reference_video'
          : r.kind === 'audio' ? 'reference_audio' : 'reference_image',
        url: r.url,
      }));

  try {
    const { video } = await generateVideo({
      model: alibaba.video(WAN_MODEL_ID),
      prompt,
      duration: seconds,
      resolution: WAN_RESOLUTION_SIZE[resolution],
      generateAudio: withAudio,
      providerOptions: {
        alibaba: {
          ratio: config?.aspectRatio ?? '16:9',
          // Sold output, not a demo.
          watermark: false,
          ...(media.length ? { media } : {}),
        },
      },
      pollTimeoutMs: config?.pollTimeoutMs ?? 600_000,
    } as any);

    const bytes: Uint8Array = (video as any).uint8Array;
    if (!bytes?.length) throw new Error('Wan3.0 returned an empty video');

    // Billed on the seconds we ASKED for. DashScope charges for the produced clip, and a
    // partial result we then reject is still a clip they rendered.
    if (config?.logUsage !== false) void _logUnitCall({
      task: config?.task ?? 'wan_video_generation',
      modelKey,
      units: seconds,
      latencyMs: Date.now() - _start,
      userId: config?.userId,
      workspaceId: config?.workspaceId,
    });

    return {
      bytes,
      mimeType: (video as any).mediaType ?? 'video/mp4',
      model: WAN_MODEL_ID,
      durationSeconds: seconds,
      resolution,
      hasAudio: withAudio,
      referencesDropped,
    };
  } catch (err) {
    // Always logged, even when the caller owns the success row — see the Seedance note.
    void _logUnitCall({
      task: config?.task ?? 'wan_video_generation',
      modelKey,
      units: 0,
      latencyMs: Date.now() - _start,
      errorMessage: err instanceof Error ? err.message : String(err),
      userId: config?.userId,
      workspaceId: config?.workspaceId,
    });
    throw err;
  }
}

// ── Seedance 2.5 (ByteDance, via BytePlus ModelArk) ────────────────────────
//
// Through the AI SDK, unlike Wan: `@ai-sdk/bytedance` exists, so the rule applies as
// written — an edge function never reaches a provider directly, and this file uses the
// SDK wherever there IS one.
//
// What Seedance buys over the existing roster: a 30-second clip generated in ONE pass
// (Wan reaches 30s too, Veo stops at 8 and Kling at 10), native audio, and reference
// inputs that carry an explicit ROLE — first frame, last frame, reference image — rather
// than an undifferentiated bag of pictures. For a materials platform the role is the
// point: "this exact tile, in this room, for the whole clip" is a different instruction
// from "something like these".
//
// ARK IS TWO CONSOLES AND THE IDS ARE NOT INTERCHANGEABLE. BytePlus ModelArk
// (international, USD, ark.ap-southeast.bytepluses.com) takes `dreamina-seedance-2-5-*`;
// Volcano Engine Ark (mainland China, RMB, ark.cn-beijing.volces.com) takes
// `doubao-seedance-2.5`. Crossing them fails as an AUTH error, which reads like a bad key
// rather than a wrong endpoint, so both halves are pinned here together.
const SEEDANCE_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3';
const SEEDANCE_MODEL_ID = 'dreamina-seedance-2-5-260628';

export type SeedanceResolution = '480P' | '720P';

/**
 * `ai_model_pricing.model_key` per tier. Ark bills Seedance by TOKEN, not by second:
 * tokens = width x height x fps x seconds / 1024, at $10.70/M with no video input. At 24fps
 * that is $0.104/s for 480p and $0.231/s for 720p — which is what the per-second rows hold,
 * because every other video model in this platform is priced per second and one odd unit
 * would break `logVideoUsage`'s `units = duration` contract at every call site.
 */
const SEEDANCE_PRICING_MODEL_ID: Record<SeedanceResolution, string> = {
  '480P': 'seedance-2.5-480p',
  '720P': 'seedance-2.5-720p',
};

/**
 * The AI SDK takes `resolution` as `{width}x{height}` and the ByteDance provider maps it
 * back onto Ark's tier string through its own table. These two sizes are IN that table;
 * an unmapped size is forwarded verbatim and Ark rejects it. Orientation is carried by
 * `ratio`, so one landscape size per tier is enough.
 */
const SEEDANCE_RESOLUTION_SIZE: Record<SeedanceResolution, string> = {
  '480P': '864x480',
  '720P': '1280x720',
};

export interface SeedanceVideoResult {
  /** Raw bytes. 30s of 720p is ~20 MB — base64 would carry a third more for no reason. */
  bytes: Uint8Array;
  mimeType: string;
  model: string;
  durationSeconds: number;
  resolution: SeedanceResolution;
  hasAudio: boolean;
}

export async function generateVideoWithSeedance(
  prompt: string,
  config?: UnitBillingConfig & {
    /** First frame. */
    imageUrl?: string;
    /** Optional last-frame guidance — Ark tags it `role: 'last_frame'`. */
    lastFrameUrl?: string;
    /** Extra images held consistent across the clip (`role: 'reference_image'`). */
    referenceUrls?: string[];
    /** 4-30. Clamped here AND by the caller, which is where the credit price is decided. */
    durationSeconds?: number;
    resolution?: SeedanceResolution;
    aspectRatio?: '16:9' | '9:16' | '1:1';
    /** Seedance scores the clip in the same pass. Default true — a silent reel is the bug. */
    generateAudio?: boolean;
    pollTimeoutMs?: number;
    /**
     * Write the `ai_usage_logs` row from here. Default true, and every direct caller
     * should leave it there.
     *
     * `false` exists for callers that write a RICHER row themselves — the video edge
     * functions attach `credits_debited` and `video_type`, which this logger has no
     * access to. Those callers log unconditionally, so without this flag the row would
     * be written TWICE and every cost view would read double. That is not hypothetical:
     * it is what the Veo, Kling and Wan branches of `generate-interior-video-v2` do
     * today, because `generateVideoWith*` grew its own logging after they had theirs.
     */
    logUsage?: boolean;
  },
): Promise<SeedanceVideoResult> {
  const _start = Date.now();
  const resolution = config?.resolution ?? '720P';
  const seconds = Math.max(4, Math.min(30, Math.round(config?.durationSeconds ?? 5)));
  const modelKey = SEEDANCE_PRICING_MODEL_ID[resolution];
  const withAudio = config?.generateAudio ?? true;

  // Lazy, and via resolveSecret for the same reason Wan is: `Deno.env.set` is a no-op on
  // Supabase edge, so a module-load capture reads undefined and an admin-configured key is
  // never seen. Fails BEFORE the provider call, so an unset key costs nothing.
  const apiKey = _logSupabase
    ? (await resolveSecret(_logSupabase, 'ARK_API_KEY')).value
    : Deno.env.get('ARK_API_KEY');
  if (!apiKey) {
    throw new Error('ARK_API_KEY is not configured — cannot generate with Seedance 2.5');
  }

  // The same floor Wan applies to the same kind of input. A video prompt is free text a user
  // typed, and SEEDANCE_BASE_URL is BytePlus Singapore — hardcoded, so unlike Wan there is no
  // configuration under which this destination is inside the EEA. Wan blocked a prompt carrying
  // an email/IBAN/phone and this path sent it; identical data, two different answers.
  const seedanceVerdict = assertTransferAllowed([prompt], {
    destinationIsEea: false,
    providerLabel: 'Seedance 2.5 (BytePlus, Singapore)',
  });
  if (!seedanceVerdict.allowed) {
    throw new Error(seedanceVerdict.message ?? 'Blocked: personal data may not leave the EEA.');
  }

  const bytedance = createByteDance({ apiKey, baseURL: SEEDANCE_BASE_URL });

  // Ark accepts a public URL verbatim (the SDK only data-URI-encodes bytes), so the source
  // image is passed as a URL and never pulled into this function's memory.
  const visionPrompt: any = config?.imageUrl
    ? { image: config.imageUrl, text: prompt }
    : prompt;

  try {
    const { video } = await generateVideo({
      model: bytedance.video(SEEDANCE_MODEL_ID),
      prompt: visionPrompt,
      duration: seconds,
      resolution: SEEDANCE_RESOLUTION_SIZE[resolution],
      aspectRatio: config?.aspectRatio ?? '16:9',
      generateAudio: withAudio,
      providerOptions: {
        bytedance: {
          // Ark takes these as plain URLs with a role attached, which is the whole
          // reason they are provider options rather than `inputReferences`: the generic
          // path would data-URI every one of them into the request body.
          ...(config?.lastFrameUrl ? { lastFrameImage: config.lastFrameUrl } : {}),
          ...(config?.referenceUrls?.length
            ? { referenceImages: config.referenceUrls.slice(0, 10) }
            : {}),
          // A watermarked clip is not a deliverable — this is sold output, not a demo.
          watermark: false,
        },
      },
      pollTimeoutMs: config?.pollTimeoutMs ?? 600_000,
    } as any);

    const bytes: Uint8Array = (video as any).uint8Array;
    if (!bytes?.length) throw new Error('Seedance returned an empty video');

    // Billed on the seconds we ASKED for: Ark charges for the clip it rendered, and a
    // partial result we then reject is still a clip they rendered.
    if (config?.logUsage !== false) void _logUnitCall({
      task: config?.task ?? 'seedance_video_generation',
      modelKey,
      units: seconds,
      latencyMs: Date.now() - _start,
      userId: config?.userId,
      workspaceId: config?.workspaceId,
    });

    return {
      bytes,
      mimeType: (video as any).mediaType ?? 'video/mp4',
      model: SEEDANCE_MODEL_ID,
      durationSeconds: seconds,
      resolution,
      hasAudio: withAudio,
    };
  } catch (err) {
    // A FAILURE is always logged, even when the caller owns the success row: the caller
    // refunds and returns, so a provider outage would otherwise leave no trace at all.
    void _logUnitCall({
      task: config?.task ?? 'seedance_video_generation',
      modelKey,
      units: 0,
      latencyMs: Date.now() - _start,
      errorMessage: err instanceof Error ? err.message : String(err),
      userId: config?.userId,
      workspaceId: config?.workspaceId,
    });
    throw err;
  }
}

// ── Luma Ray3.2 (video) ────────────────────────────────────────────────────
//
// Raw REST, and this one is NOT the Wan situation. `@ai-sdk/luma` exists and is
// useless to us: it exposes exactly two model ids, `photon-1` and `photon-flash-1`,
// and Luma's own model page says Photon "no longer exists as a separate product".
// It has no video model at all, so Ray has never been reachable through it. Ray2 is
// reachable through `@ai-sdk/fal` — but Ray2 is the DEPRECATED generation, which is
// the trap: an SDK path exists, it is just to the wrong model.
//
// Ray3.2 (June 2026) is the current one. Sequence, because the numbers do not sort:
// Ray3 -> Ray3.14 (January) -> Ray3.2 (June). 3.2 is the LATEST despite reading
// smaller than 3.14 — Luma's own LLM-facing page states it outright, which is the
// only reason we can be sure.
//
// PRICING IS NOT LINEAR IN DURATION and that matters more than it looks: a 10s clip
// costs THREE times a 5s clip, not two. Luma's rate card is per clip (720p: 100
// credits/5s, 300 credits/10s, at $0.003 a credit = $0.30 and $0.90). Every video
// model in this platform is priced per SECOND, so these rows carry the WORST-CASE
// per-second rate — the 10-second one. A 5s clip is then over-reported by a third,
// which is the safe direction: over-stating a cost can only make a sale look less
// profitable than it is, while the linear-looking 5s rate would under-report the
// full-length clip we actually let people buy.
const LUMA_BASE_URL = 'https://agents.lumalabs.ai/v1';
const LUMA_MODEL_ID = 'ray-3.2';

export type RayResolution = '720p' | '1080p';

/** `ai_model_pricing.model_key` per tier — the rate differs 4x across them. */
const RAY_PRICING_MODEL_ID: Record<RayResolution, string> = {
  '720p': 'ray-3.2-720p',
  '1080p': 'ray-3.2-1080p',
};

export interface RayVideoResult {
  /** Presigned Luma URL, valid ~1 hour. Callers re-host it through the SSRF guard. */
  url: string;
  mimeType: string;
  model: string;
  durationSeconds: number;
  resolution: RayResolution;
}

export async function generateVideoWithRay(
  prompt: string,
  config?: UnitBillingConfig & {
    /** First frame (`video.start_frame`). Omit for text-to-video. */
    imageUrl?: string;
    /** Last frame (`video.end_frame`) — Ray interpolates between the two. */
    lastFrameUrl?: string;
    /** 5 or 10. Clamped here; 10 is the longest duration Luma publishes a price for. */
    durationSeconds?: number;
    resolution?: RayResolution;
    aspectRatio?: '16:9' | '9:16' | '1:1';
    pollTimeoutMs?: number;
    /** See generateVideoWithSeedance — false when the caller writes its own richer row. */
    logUsage?: boolean;
  },
): Promise<RayVideoResult> {
  const _start = Date.now();
  const resolution = config?.resolution ?? '720p';
  // 5 or 10 and nothing between: those are the two durations on the rate card, and a
  // duration we cannot price is a duration we cannot sell.
  const seconds = (config?.durationSeconds ?? 5) > 7 ? 10 : 5;
  const modelKey = RAY_PRICING_MODEL_ID[resolution];

  const apiKey = _logSupabase
    ? (await resolveSecret(_logSupabase, 'LUMA_API_KEY')).value
    : Deno.env.get('LUMA_API_KEY');
  if (!apiKey) {
    throw new Error('LUMA_API_KEY is not configured — cannot generate with Ray3.2');
  }

  // `ImageRef` is `{ url }` OR `{ data, media_type }`, never both — the shape the
  // official `luma-agents` SDK declares. URLs are passed through, so the source frame
  // never lands in this isolate's memory.
  const video: Record<string, unknown> = {
    resolution,
    duration: `${seconds}s`,
  };
  if (config?.imageUrl) video.start_frame = { url: config.imageUrl };
  if (config?.lastFrameUrl) video.end_frame = { url: config.lastFrameUrl };

  try {
    const submit = await fetch(`${LUMA_BASE_URL}/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: LUMA_MODEL_ID,
        type: 'video',
        prompt,
        aspect_ratio: config?.aspectRatio ?? '16:9',
        video,
      }),
    });
    if (!submit.ok) {
      throw new Error(`Luma submit ${submit.status}: ${(await submit.text()).slice(0, 300)}`);
    }
    const generationId = (await submit.json())?.id;
    if (!generationId) throw new Error('Luma returned no generation id');

    const deadline = Date.now() + (config?.pollTimeoutMs ?? 600_000);
    for (;;) {
      if (Date.now() > deadline) throw new Error(`Luma generation ${generationId} timed out`);
      await new Promise((r) => setTimeout(r, 3_000));
      const poll = await fetch(`${LUMA_BASE_URL}/generations/${generationId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!poll.ok) {
        throw new Error(`Luma poll ${poll.status}: ${(await poll.text()).slice(0, 300)}`);
      }
      const body = await poll.json();
      const state = body?.state;
      if (state === 'completed') {
        const url = body?.output?.[0]?.url;
        if (!url) throw new Error('Luma completed but returned no output URL');
        if (config?.logUsage !== false) void _logUnitCall({
          task: config?.task ?? 'ray_video_generation',
          modelKey,
          units: seconds,
          latencyMs: Date.now() - _start,
          userId: config?.userId,
          workspaceId: config?.workspaceId,
        });
        return {
          url,
          mimeType: 'video/mp4',
          model: LUMA_MODEL_ID,
          durationSeconds: seconds,
          resolution,
        };
      }
      if (state === 'failed') {
        // `failure_code` is a machine-readable enum (content_moderated, budget_exhausted,
        // rate_limited, ...). Carried into the message because "generation failed" alone
        // cannot tell an operator whether to retry, re-prompt or top up.
        throw new Error(
          `Luma generation ${generationId} failed [${body?.failure_code ?? 'unknown'}]: ` +
          `${body?.failure_reason ?? 'no detail'}`,
        );
      }
    }
  } catch (err) {
    void _logUnitCall({
      task: config?.task ?? 'ray_video_generation',
      modelKey,
      units: 0,
      latencyMs: Date.now() - _start,
      errorMessage: err instanceof Error ? err.message : String(err),
      userId: config?.userId,
      workspaceId: config?.workspaceId,
    });
    throw err;
  }
}

// ── H3 Max (video) — fal Research's post-train of MiniMax H3 ───────────────
//
// Replaced `minimax-h3` on 2026-08-30 (#396). Same lineage, different vendor and a very
// different bill: fal post-trained H3 and optimised inference for it, so a 5-second clip
// renders in about three seconds where the official endpoint takes minutes, and 768P costs
// $0.08/s against the $0.13/s MiniMax charges for the 2K its API will only ever serve.
//
// WHY THIS IS RAW REST AND NOT `@ai-sdk/fal`. The provider package exists and exposes
// `video()`, and it CANNOT ADDRESS THIS ENDPOINT. It builds every request as
// `https://queue.fal.run/fal-ai/${id}`, with the `fal-ai/` owner prefix hardcoded and a
// leading one stripped off whatever id you hand it — but H3 Max is published under the
// `minimax` owner, at `https://queue.fal.run/minimax/h3-max/image-to-video`. On top of
// that it sends `duration` as the string `"15s"` where this endpoint's schema requires an
// integer, and it knows nothing of `prompt_expansion_mode`, which is REQUIRED. Three
// overrides deep it maps nothing we want, so it would be a dependency and a pin trap
// (`@ai-sdk/fal@3` is spec v4 against the v3 `npm:ai@6` carries) bought for nothing. Raw
// REST for the same reason `generateVideoWithRay` above is.
//
// TWO CONSTRAINTS, both the model's rather than ours:
//   1. There is NO reference-image input. Standard H3 accepted up to nine and dropped them
//      silently whenever a frame was present; H3 Max has no such field at all. Callers
//      still pass them, so this REPORTS `referencesDropped` rather than letting them
//      evaporate — the same contract H3 had, for the same reason.
//   2. The aspect ratio comes from the FRAME. This endpoint has no `aspect_ratio` field at
//      all, so a vertical reel needs a vertical source image. (The text-to-video endpoint
//      does take one; we do not use it — every caller here animates a room photo.)
//
// `prompt_expansion_mode` stays 'balanced' deliberately. 'quality' spends up to ~30s
// rewriting the prompt BEFORE generation starts, which would spend the entire speed
// advantage this model was chosen for.
const FAL_QUEUE_BASE = 'https://queue.fal.run';
/** The fal endpoint id. NO `fal-ai/` prefix — H3 Max sits under the `minimax` owner. */
const H3MAX_ENDPOINT = 'minimax/h3-max/image-to-video';
export type H3MaxResolution = '480P' | '768P';
/** `ai_model_pricing.model_key`, one per tier because the rate differs. */
const H3MAX_PRICING_MODEL_ID: Record<H3MaxResolution, string> = {
  '480P': 'h3-max-480p',
  '768P': 'h3-max-768p',
};

export interface H3MaxVideoResult {
  /** fal CDN URL. Callers re-host it through the SSRF guard, exactly as with Ray. */
  url: string;
  mimeType: string;
  model: string;
  durationSeconds: number;
  resolution: H3MaxResolution;
  hasAudio: boolean;
  /**
   * References were supplied and this model has nowhere to put them. Callers surface
   * this; a silently ignored reference is how "why does the clip not show the product"
   * becomes unanswerable.
   */
  referencesDropped: number;
}

export async function generateVideoWithH3Max(
  prompt: string,
  config?: UnitBillingConfig & {
    /** First frame. Omit it and the endpoint generates from the prompt alone. */
    imageUrl?: string;
    /** Last frame — H3 Max interpolates first -> last, as Ray does. */
    lastFrameUrl?: string;
    /** 5-15. Clamped here to the schema's own bounds. */
    durationSeconds?: number;
    resolution?: H3MaxResolution;
    /** Passed by callers that also feed reference-taking models. Always dropped. */
    referenceUrls?: string[];
    pollTimeoutMs?: number;
    /** See generateVideoWithSeedance — false when the caller writes its own richer row. */
    logUsage?: boolean;
  },
): Promise<H3MaxVideoResult> {
  const _start = Date.now();
  const resolution: H3MaxResolution = config?.resolution ?? '768P';
  const modelKey = H3MAX_PRICING_MODEL_ID[resolution];
  // The schema's own bounds, clamped UP as well as down: 3 is not a shorter clip, it is a
  // 422 from fal arriving after the credits have already been debited.
  const seconds = Math.min(15, Math.max(5, Math.round(config?.durationSeconds ?? 10)));
  const referencesDropped = config?.referenceUrls?.length ?? 0;
  if (referencesDropped > 0) {
    console.warn(
      `[ai-client] H3 Max: ${referencesDropped} reference image(s) ignored — this endpoint ` +
      'has no reference input at all. Standard H3 was the model that took them.',
    );
  }

  const apiKey = _logSupabase
    ? (await resolveSecret(_logSupabase, 'FAL_KEY')).value
    : Deno.env.get('FAL_KEY');
  if (!apiKey) {
    throw new Error('FAL_KEY is not configured — cannot generate with H3 Max');
  }
  const authHeaders = { Authorization: `Key ${apiKey}` };

  const body: Record<string, unknown> = {
    prompt,
    prompt_expansion_mode: 'balanced',
    duration: seconds,
    resolution,
  };
  if (config?.imageUrl) body.image_url = config.imageUrl;
  if (config?.lastFrameUrl) body.end_image_url = config.lastFrameUrl;

  try {
    const submit = await fetch(`${FAL_QUEUE_BASE}/${H3MAX_ENDPOINT}`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!submit.ok) {
      throw new Error(`fal submit ${submit.status}: ${(await submit.text()).slice(0, 300)}`);
    }
    const queued = await submit.json();
    const statusUrl: string | undefined = queued?.status_url;
    const responseUrl: string | undefined = queued?.response_url;
    if (!statusUrl || !responseUrl) {
      throw new Error('fal accepted the job but returned no status/response URL');
    }
    // Both URLs come back in fal's OWN response, and the next two fetches carry the API
    // key. Handing a credential to whatever host a provider names is how a redirect or a
    // compromised response becomes a key leak, so they are pinned to the queue origin
    // before any header goes out. `@ai-sdk/fal` guards its own poll the same way.
    const onQueueHost = (u: string) => {
      try { return new URL(u).origin === FAL_QUEUE_BASE; } catch { return false; }
    };
    if (!onQueueHost(statusUrl) || !onQueueHost(responseUrl)) {
      throw new Error(
        'fal returned a status/response URL off its own queue host — refusing to send credentials',
      );
    }

    const deadline = Date.now() + (config?.pollTimeoutMs ?? 300_000);
    for (;;) {
      if (Date.now() > deadline) {
        throw new Error(`fal request ${queued?.request_id ?? '?'} timed out`);
      }
      // 1.5s, against Luma's 3s. The whole point of this model is that a 5-second clip is
      // finished in about three, so a slower tick would spend more time waiting than
      // generating and hand back the speed we switched vendors for.
      await new Promise((r) => setTimeout(r, 1_500));
      const poll = await fetch(statusUrl, { headers: authHeaders });
      if (!poll.ok) {
        throw new Error(`fal poll ${poll.status}: ${(await poll.text()).slice(0, 300)}`);
      }
      const status = (await poll.json())?.status;
      // IN_QUEUE / IN_PROGRESS / COMPLETED is the whole enum, and a FAILED job surfaces as
      // a non-2xx on the response fetch below rather than as a status value. So anything
      // unrecognised is treated as still-running and bounded by the deadline, never read
      // as success — a status we do not know is not a video.
      if (status !== 'COMPLETED') continue;

      const result = await fetch(responseUrl, { headers: authHeaders });
      if (!result.ok) {
        throw new Error(`fal result ${result.status}: ${(await result.text()).slice(0, 300)}`);
      }
      const payload = await result.json();
      const url: string | undefined = payload?.video?.url;
      if (!url) throw new Error('fal reported COMPLETED but returned no video URL');

      if (config?.logUsage !== false) void _logUnitCall({
        task: config?.task ?? 'h3max_video_generation',
        modelKey,
        units: seconds,
        latencyMs: Date.now() - _start,
        userId: config?.userId,
        workspaceId: config?.workspaceId,
      });

      return {
        url,
        mimeType: payload?.video?.content_type ?? 'video/mp4',
        model: H3MAX_ENDPOINT,
        durationSeconds: seconds,
        resolution,
        hasAudio: true,
        referencesDropped,
      };
    }
  } catch (err) {
    // Always logged, even when the caller owns the success row — see the Seedance note.
    void _logUnitCall({
      task: config?.task ?? 'h3max_video_generation',
      modelKey,
      units: 0,
      latencyMs: Date.now() - _start,
      errorMessage: err instanceof Error ? err.message : String(err),
      userId: config?.userId,
      workspaceId: config?.workspaceId,
    });
    throw err;
  }
}

// ── QwenCloud: research with the provider's own web search ─────────────────
//
// The CHALLENGER half of the B2B research validation lane (#394). Not a model swap:
// Anthropic's `web_search_20260209` and Qwen's `enable_search` are different search
// backends as well as different models, so this compares research END TO END, which
// is the only comparison worth having — a model is only as good as what it can find.
//
// OpenAI-compatible endpoint, so `extra_body` fields from their Python examples are
// simply top-level body fields here.

// Singapore by default — an EEA transfer. Alibaba runs an EU deployment scope in
// Frankfurt whose hosts look like `{workspaceId}.eu-central-1.maas.aliyuncs.com`, and
// pointing DASHSCOPE_BASE_URL there is the real fix for residency rather than the
// gate below, which is only the floor. The workspace id is part of the HOST in that
// region, so this has to be a full base URL and cannot be a region code.
const QWEN_DEFAULT_BASE = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

async function qwenBaseUrl(): Promise<string> {
  const configured = _logSupabase
    ? (await resolveSecret(_logSupabase, 'DASHSCOPE_BASE_URL')).value
    : Deno.env.get('DASHSCOPE_BASE_URL');
  return (configured || QWEN_DEFAULT_BASE).replace(/\/+$/, '');
}

export interface QwenResearchResult<T> {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Sources the provider's own search surfaced, when it reports them. */
  searchResults: unknown[];
}

/**
 * Run a forced-function research call on QwenCloud and return the parsed arguments.
 *
 * THE STRUCTURED-OUTPUT DIFFERENCE, WHICH IS THE WHOLE RISK HERE. Anthropic's forced
 * `tool_choice` hands back `input` as a parsed object. OpenAI-compatible hands back
 * `arguments` as a STRING that this function must parse.
 *
 * So a malformed reply is possible here in a way it is not on the Anthropic path, and
 * the rule is the one the vision pipeline learned the hard way: a parse failure is a
 * FAILED RUN. It is never repaired, never salvaged, never partially recovered. A
 * repaired research payload is worse than none, because it becomes rows that look
 * exactly like verified ones.
 */
export async function researchWithQwen<T = unknown>(
  opts: UnitBillingConfig & {
    model?: string;
    system: string;
    prompt: string;
    /** JSON Schema function the model is forced to call. */
    fn: { name: string; description?: string; parameters: Record<string, unknown> };
    maxTokens?: number;
    /** 'agent' (default) or 'agent_max' — multi-search + extractor, for research. */
    searchStrategy?: 'agent' | 'agent_max';
    timeoutMs?: number;
  },
): Promise<QwenResearchResult<T>> {
  const model = opts.model ?? 'qwen3.8-max';
  const _start = Date.now();

  const apiKey = _logSupabase
    ? (await resolveSecret(_logSupabase, 'DASHSCOPE_API_KEY')).value
    : Deno.env.get('DASHSCOPE_API_KEY');
  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY is not configured — the research challenger cannot run');
  }

  const baseUrl = await qwenBaseUrl();

  // Second line, not the first. The first is the endpoint above: point it at Frankfurt
  // and this is a no-op. Until then, refuse to hand identifiable customer data to a
  // provider outside the EEA. Fails closed.
  const verdict = assertTransferAllowed([opts.system, opts.prompt], {
    destinationIsEea: isEeaEndpoint(baseUrl),
    providerLabel: 'QwenCloud',
  });
  if (!verdict.allowed) {
    throw new Error(verdict.message ?? 'Blocked: personal data may not leave the EEA.');
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 90_000);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: ctl.signal,
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 8000,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.prompt },
        ],
        tools: [{ type: 'function', function: opts.fn }],
        tool_choice: { type: 'function', function: { name: opts.fn.name } },
        // Their own web search, the challenger's other half.
        enable_search: true,
        search_options: {
          // 'agent_max' searches repeatedly and may use the web extractor — the
          // research-heavy setting, which is what this lane is for.
          search_strategy: opts.searchStrategy ?? 'agent_max',
          enable_source: true,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`QwenCloud ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const body = await res.json();
    const choice = body?.choices?.[0];
    const call = choice?.message?.tool_calls?.[0];
    const raw = call?.function?.arguments;
    if (typeof raw !== 'string') {
      throw new Error(
        `QwenCloud returned no tool call for ${opts.fn.name} (finish_reason=${choice?.finish_reason})`,
      );
    }

    let data: T;
    try {
      data = JSON.parse(raw) as T;
    } catch (e) {
      // Deliberately terminal. See the docstring: repairing this produces rows
      // indistinguishable from verified ones.
      throw new Error(
        `QwenCloud returned unparseable arguments for ${opts.fn.name} — treating as a `
        + `failed run rather than repairing it: ${e instanceof Error ? e.message : e}`,
      );
    }

    const usage = body?.usage ?? {};
    const inputTokens = Number(usage.prompt_tokens ?? 0);
    const outputTokens = Number(usage.completion_tokens ?? 0);

    void _logTrackedCall({
      task: opts.task ?? 'qwen_research',
      model,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - _start,
      userId: opts.userId,
      workspaceId: opts.workspaceId,
    });

    return {
      data,
      model,
      inputTokens,
      outputTokens,
      searchResults: body?.search_info?.search_results ?? [],
    };
  } catch (err) {
    void _logTrackedCall({
      task: opts.task ?? 'qwen_research',
      model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - _start,
      errorMessage: err instanceof Error ? err.message : String(err),
      userId: opts.userId,
      workspaceId: opts.workspaceId,
    });
    throw err;
  } finally {
    clearTimeout(timer);
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

// ── OpenAI gpt-image-1 (interior grid: text-to-image + image edit) ──────────────

export const OPENAI_IMAGE_MODEL = 'gpt-image-1';
/** `ai_model_pricing.model_key` — priced per image at the medium 1024px tier. */
const OPENAI_IMAGE_PRICING_MODEL_ID = 'gpt-image-1';

export interface OpenAIImageResult {
  base64: string;
  mimeType: string;
  model: string;
}

/**
 * Generate an image from a text prompt with gpt-image-1 (/v1/images/generations).
 * The model returns base64 by default and has no `response_format` parameter.
 */
export async function generateImageWithOpenAI(
  prompt: string,
  config?: UnitBillingConfig & { model?: string; size?: '1024x1024' | '1536x1024' | '1024x1536' | 'auto'; quality?: 'low' | 'medium' | 'high' },
): Promise<OpenAIImageResult> {
  if (!OPENAI_API_KEY()) throw new Error('OPENAI_API_KEY not set');

  const modelId = config?.model ?? OPENAI_IMAGE_MODEL;
  const _start = Date.now();
  const logOpenAI = (units: number, errorMessage?: string) => _logUnitCall({
    task: config?.task ?? 'openai_image_generation',
    modelKey: OPENAI_IMAGE_PRICING_MODEL_ID,
    units,
    latencyMs: Date.now() - _start,
    ...(errorMessage ? { errorMessage } : {}),
    userId: config?.userId,
    workspaceId: config?.workspaceId,
  });

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      prompt,
      n: 1,
      size: config?.size ?? '1536x1024',
      // The pricing row is the medium tier; a different quality here is a different price.
      quality: config?.quality ?? 'medium',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    void logOpenAI(0, `HTTP ${response.status}`);
    throw new Error(`OpenAI image generation failed (${response.status}): ${err}`);
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    void logOpenAI(0, 'no image in generation response');
    throw new Error('OpenAI: no image in generation response');
  }

  void logOpenAI(1);
  return { base64: b64, mimeType: 'image/png', model: modelId };
}

/**
 * Edit an existing image with gpt-image-1 (/v1/images/edits, multipart). Without a mask
 * the whole image is re-rendered under the prompt; with a mask, transparent pixels are
 * the region to change (OpenAI's convention — the inverse of Grok's white=change).
 */
export async function editImageWithOpenAI(
  prompt: string,
  imageBytes: Uint8Array,
  config?: UnitBillingConfig & {
    model?: string;
    maskBytes?: Uint8Array;
    imageMimeType?: string;
    size?: '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
    quality?: 'low' | 'medium' | 'high';
  },
): Promise<OpenAIImageResult> {
  if (!OPENAI_API_KEY()) throw new Error('OPENAI_API_KEY not set');

  const modelId = config?.model ?? OPENAI_IMAGE_MODEL;
  const mimeType = config?.imageMimeType ?? 'image/jpeg';
  const _start = Date.now();
  const logOpenAI = (units: number, errorMessage?: string) => _logUnitCall({
    task: config?.task ?? 'openai_image_edit',
    modelKey: OPENAI_IMAGE_PRICING_MODEL_ID,
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
  form.append('size', config?.size ?? 'auto');
  form.append('quality', config?.quality ?? 'medium');
  form.append('image', new Blob([imageBytes as unknown as BlobPart], { type: mimeType }), mimeType === 'image/png' ? 'image.png' : 'image.jpg');
  if (config?.maskBytes) {
    form.append('mask', new Blob([config.maskBytes as unknown as BlobPart], { type: 'image/png' }), 'mask.png');
  }

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY()}` },
    body: form,
  });

  if (!response.ok) {
    const err = await response.text();
    void logOpenAI(0, `HTTP ${response.status}`);
    throw new Error(`OpenAI image edit failed (${response.status}): ${err}`);
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    void logOpenAI(0, 'no image in edit response');
    throw new Error('OpenAI: no image in edit response');
  }

  void logOpenAI(1);
  return { base64: b64, mimeType: 'image/png', model: modelId };
}

// ── Re-exports for convenience ──
export { z } from 'npm:zod@3';
export { google, anthropic };
export { DEFAULT_GEMINI_MODEL, DEFAULT_CLAUDE_MODEL };

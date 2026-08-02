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
import { createKlingAI } from 'npm:@ai-sdk/klingai';
import { z, type ZodType } from 'npm:zod@3';
import { createClient } from '@supabase/supabase-js';
import { MARKUP_MULTIPLIER as _MARKUP } from './pricing-constants.ts';

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

const _PRICING_PER_M_TOKENS: Record<string, { input: number; output: number }> = {
  // Anthropic Claude
  'claude-opus-4-8':   { input: 15.00, output: 75.00 },
  'claude-haiku-4-5':  { input:  1.00, output:  5.00 },
  // Google Gemini (per Google AI Studio pricing)
  // gemini-3.5-flash numbers carried forward from the 3-flash-preview
  // estimate — confirm against current Google AI Studio pricing.
  'gemini-3.5-flash':       { input: 0.50, output: 3.00 },
  'gemini-3-flash-preview': { input: 0.50, output: 3.00 },
  'gemini-3.1-pro':         { input: 2.00, output: 12.00 },
};

async function _logTrackedCall(opts: {
  task: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  errorMessage?: string;
}): Promise<void> {
  if (!_logSupabase) return;
  try {
    const matchKey = Object.keys(_PRICING_PER_M_TOKENS).find(
      (k) => opts.model === k || opts.model.startsWith(k),
    );
    const price = matchKey ? _PRICING_PER_M_TOKENS[matchKey] : null;
    const rawCost = price
      ? (opts.inputTokens / 1_000_000) * price.input +
        (opts.outputTokens / 1_000_000) * price.output
      : 0;
    const billedCost = rawCost * _MARKUP;

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
    await _logSupabase.from('ai_usage_logs').insert({
      operation_type: opts.task,
      model_name: opts.model,
      input_tokens: opts.inputTokens,
      output_tokens: opts.outputTokens,
      raw_cost_usd: rawCost,
      billed_cost_usd: billedCost,
      markup_multiplier: _MARKUP,
      input_cost_usd: price ? (opts.inputTokens / 1_000_000) * price.input * _MARKUP : 0,
      output_cost_usd: price ? (opts.outputTokens / 1_000_000) * price.output * _MARKUP : 0,
    });
  } catch (e) {
    console.warn('[ai-client] _logTrackedCall failed (non-fatal):', e);
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
      model: modelId,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - _start,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
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

export async function generateImageWithGemini(
  prompt: string | { text: string; images: (Uint8Array | string)[] },
  config?: {
    model?: GeminiImageModel;
    aspectRatio?: ImageAspectRatio;
  },
): Promise<GeminiImageResult> {
  const modelId: GeminiImageModel = config?.model ?? 'gemini-3.1-flash-image';

  // Any prompt with images must go through the raw Gemini generateContent API.
  // The Vercel AI SDK generateImage() is text-to-image only — it does not support
  // passing source images for editing and will silently ignore them, regenerating
  // the room from scratch (causing positions to change). Route ALL image-containing
  // prompts through generateMultiImageWithGemini which uses responseModalities correctly.
  if (typeof prompt === 'object' && prompt.images.length >= 1) {
    return generateMultiImageWithGemini(prompt, { model: modelId });
  }

  const { image } = await generateImage({
    model: google.image(modelId),
    prompt: prompt as any,
    aspectRatio: config?.aspectRatio ?? '16:9',
  });

  return {
    base64: image.base64,
    mimeType: image.mediaType ?? 'image/png',
    model: modelId,
  };
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
  config: { model: GeminiImageModel },
): Promise<GeminiImageResult> {
  if (!GOOGLE_API_KEY()) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set');

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
    // URL — fetch and inline
    const res = await fetch(img);
    const buf = new Uint8Array(await res.arrayBuffer());
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    return { inlineData: { mimeType, data: toBase64(buf) } };
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
    throw new Error(`Gemini multi-image generation failed: ${err}`);
  }

  const result = await response.json();
  const imagePart = result.candidates?.[0]?.content?.parts?.find(
    (p: any) => p.inlineData?.mimeType?.startsWith('image/'),
  );

  if (!imagePart?.inlineData) {
    throw new Error('Gemini multi-image: no image in response');
  }

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
  config?: {
    model?: VeoModel;
    aspectRatio?: '16:9' | '9:16' | '1:1';
    durationSeconds?: number;
    resolution?: '1280x720' | '1920x1080';
    /** Source image URL or base64 data URL for image-to-video conditioning */
    imageUrl?: string;
  },
): Promise<VeoVideoResult> {
  const modelId: VeoModel = config?.model ?? 'veo-2.0-generate-001';

  // Image-to-video: use raw Google API (the AI SDK experimental_generateVideo
  // does not support image conditioning — it silently does text-to-video only).
  if (config?.imageUrl) {
    return generateVideoWithVeoRaw(prompt, config.imageUrl, modelId, config);
  }

  // Text-to-video via AI SDK
  const { video } = await generateVideo({
    model: google.video(modelId),
    prompt,
    aspectRatio: config?.aspectRatio ?? '16:9',
    durationSeconds: config?.durationSeconds ?? 8,
    resolution: config?.resolution ?? '1280x720',
    pollTimeoutMs: 600000,
  } as any);

  return {
    base64: (video as any).base64,
    mimeType: (video as any).mimeType ?? 'video/mp4',
    model: modelId,
  };
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
  config?: { aspectRatio?: string; durationSeconds?: number; resolution?: string },
): Promise<VeoVideoResult> {
  if (!GOOGLE_API_KEY()) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set');

  // Fetch source image → base64
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch source image: ${imgRes.status}`);
  const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
  const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';

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
        return { base64: sample.video.encodedVideo, mimeType: sample.video.mimeType ?? 'video/mp4', model: modelId };
      }

      if (sample.video.uri) {
        // The URI is a generativelanguage.googleapis.com endpoint — requires API key
        const videoFetchUrl = sample.video.uri.includes('?')
          ? `${sample.video.uri}&key=${GOOGLE_API_KEY()}`
          : `${sample.video.uri}?key=${GOOGLE_API_KEY()}`;
        const vidRes = await fetch(videoFetchUrl);
        if (!vidRes.ok) throw new Error(`Veo: failed to download video (${vidRes.status}): ${await vidRes.text()}`);
        const vidBytes = new Uint8Array(await vidRes.arrayBuffer());
        let vidBinary = '';
        for (let i = 0; i < vidBytes.length; i += chunk) {
          vidBinary += String.fromCharCode(...vidBytes.subarray(i, i + chunk));
        }
        return { base64: btoa(vidBinary), mimeType: 'video/mp4', model: modelId };
      }

      throw new Error('Veo: video has neither encodedVideo nor uri');
    }
  }

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
  config?: {
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

  const visionPrompt: any = config?.imageUrl
    ? { image: config.imageUrl, text: prompt }
    : prompt;

  const { video } = await generateVideo({
    // KlingAIProvider is NOT callable — it exposes video()/videoModel(). Calling it
    // directly (klingai(modelId)) threw a TypeError on every invocation.
    model: klingai.video(modelId),
    prompt: visionPrompt,
    durationSeconds: config?.durationSeconds ?? 5,
    aspectRatio: config?.aspectRatio ?? '16:9',
    providerOptions: {
      klingai: {
        mode: config?.mode ?? 'pro',
      },
    },
    pollTimeoutMs: 600_000,
  } as any);

  return {
    base64: (video as any).base64,
    mimeType: (video as any).mimeType ?? 'video/mp4',
    model: modelId,
  };
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
  config?: { model?: string },
): Promise<GrokImageResult> {
  if (!XAI_API_KEY()) throw new Error('XAI_API_KEY not set');

  const modelId = config?.model ?? GROK_IMAGE_MODEL;

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
    throw new Error(`Grok image generation failed (${response.status}): ${err}`);
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('Grok: no image in generation response');

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
  config?: {
    model?: string;
    /** Binary PNG mask: white = change, black = keep unchanged */
    maskBytes?: Uint8Array;
    imageMimeType?: string;
  },
): Promise<GrokImageResult> {
  if (!XAI_API_KEY()) throw new Error('XAI_API_KEY not set');

  const modelId = config?.model ?? GROK_IMAGE_MODEL;
  const mimeType = config?.imageMimeType ?? 'image/jpeg';

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
    throw new Error(`Grok image edit failed (${response.status}): ${err}`);
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('Grok: no image in edit response');

  return { base64: b64, mimeType: 'image/png', model: modelId };
}

// ── Re-exports for convenience ──
export { z } from 'npm:zod@3';
export { google, anthropic };
export { DEFAULT_GEMINI_MODEL, DEFAULT_CLAUDE_MODEL };

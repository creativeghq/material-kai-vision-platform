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
const GOOGLE_API_KEY = Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY') || '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

// Polyfill process.env for npm packages that read it
(globalThis as any).process = {
  ...(globalThis as any).process,
  env: {
    ...((globalThis as any).process?.env || {}),
    GOOGLE_GENERATIVE_AI_API_KEY: GOOGLE_API_KEY,
    ANTHROPIC_API_KEY: ANTHROPIC_API_KEY,
  },
};

// ── Imports ──
import { generateText, generateImage, experimental_generateVideo as generateVideo, Output } from 'npm:ai@6';
import { createGoogleGenerativeAI } from 'npm:@ai-sdk/google@3';
import { createAnthropic } from 'npm:@ai-sdk/anthropic@3';
import { z, type ZodType } from 'npm:zod@3';

// ── Provider instances ──
const google = createGoogleGenerativeAI({ apiKey: GOOGLE_API_KEY });
const anthropic = createAnthropic({ apiKey: ANTHROPIC_API_KEY });

// ── Default models ──
const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

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

  const result = await generateText({
    model: google(modelId),
    system: config?.systemPrompt,
    prompt,
    temperature: config?.temperature ?? 0.7,
    maxTokens: config?.maxTokens ?? 4096,
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

  return {
    output: result.text,
    text: result.text,
    usage: {
      inputTokens: usage?.promptTokens ?? 0,
      outputTokens: usage?.completionTokens ?? 0,
      totalTokens: (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0),
    },
    model: modelId,
  };
}

// ── Gemini: Structured JSON output ──
export async function generateStructuredWithGemini<T>(
  prompt: string,
  schema: ZodType<T>,
  config?: AIGenerateConfig & { systemPrompt?: string },
): Promise<AIGenerateResult<T>> {
  const modelId = config?.model || DEFAULT_GEMINI_MODEL;

  const result = await generateText({
    model: google(modelId),
    system: config?.systemPrompt,
    prompt,
    temperature: config?.temperature ?? 0.3,
    maxTokens: config?.maxTokens ?? 4096,
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

  return {
    output: result.output as T,
    text: result.text,
    usage: {
      inputTokens: usage?.promptTokens ?? 0,
      outputTokens: usage?.completionTokens ?? 0,
      totalTokens: (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0),
    },
    model: modelId,
  };
}

// ── Claude: Text generation ──
export async function generateWithClaude(
  prompt: string,
  config?: AIGenerateConfig & { systemPrompt?: string },
): Promise<AIGenerateResult<string>> {
  const modelId = config?.model || DEFAULT_CLAUDE_MODEL;

  const result = await generateText({
    model: anthropic(modelId),
    system: config?.systemPrompt,
    prompt,
    temperature: config?.temperature ?? 0.7,
    maxTokens: config?.maxTokens ?? 4096,
  });

  const usage = await result.usage;

  return {
    output: result.text,
    text: result.text,
    usage: {
      inputTokens: usage?.promptTokens ?? 0,
      outputTokens: usage?.completionTokens ?? 0,
      totalTokens: (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0),
    },
    model: modelId,
  };
}

// ── Claude: Structured JSON output ──
export async function generateStructuredWithClaude<T>(
  prompt: string,
  schema: ZodType<T>,
  config?: AIGenerateConfig & { systemPrompt?: string },
): Promise<AIGenerateResult<T>> {
  const modelId = config?.model || DEFAULT_CLAUDE_MODEL;

  const result = await generateText({
    model: anthropic(modelId),
    system: config?.systemPrompt,
    prompt,
    temperature: config?.temperature ?? 0.3,
    maxTokens: config?.maxTokens ?? 4096,
    output: Output.object({ schema }),
  });

  const usage = await result.usage;

  return {
    output: result.output as T,
    text: result.text,
    usage: {
      inputTokens: usage?.promptTokens ?? 0,
      outputTokens: usage?.completionTokens ?? 0,
      totalTokens: (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0),
    },
    model: modelId,
  };
}

// ── Gemini: Image generation + editing ──
export type GeminiImageModel = 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview';
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
  const modelId: GeminiImageModel = config?.model ?? 'gemini-3.1-flash-image-preview';

  const { image } = await generateImage({
    model: google.image(modelId),
    prompt: prompt as any,
    aspectRatio: config?.aspectRatio ?? '16:9',
  });

  return {
    base64: image.base64,
    mimeType: image.mimeType ?? 'image/png',
    model: modelId,
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

  // Use image-to-video when a source image is provided
  const veoPrompt: any = config?.imageUrl
    ? { image: config.imageUrl, text: prompt }
    : prompt;

  const { video } = await generateVideo({
    model: google.video(modelId),
    prompt: veoPrompt,
    aspectRatio: config?.aspectRatio ?? '16:9',
    durationSeconds: config?.durationSeconds ?? 8,
    resolution: config?.resolution ?? '1280x720',
    pollTimeoutMs: 600000, // 10 min max
  } as any);

  return {
    base64: (video as any).base64,
    mimeType: (video as any).mimeType ?? 'video/mp4',
    model: modelId,
  };
}

// ── Re-exports for convenience ──
export { z } from 'npm:zod@3';
export { google, anthropic };
export { DEFAULT_GEMINI_MODEL, DEFAULT_CLAUDE_MODEL };

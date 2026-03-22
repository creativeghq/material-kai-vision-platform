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
    mimeType: image.mimeType ?? 'image/png',
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
  if (!GOOGLE_API_KEY) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set');

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
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${GOOGLE_API_KEY}`,
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

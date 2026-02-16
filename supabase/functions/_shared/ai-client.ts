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
import { generateText, Output } from 'npm:ai@6';
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

// ── Re-exports for convenience ──
export { z } from 'npm:zod@3';
export { google, anthropic };
export { DEFAULT_GEMINI_MODEL, DEFAULT_CLAUDE_MODEL };

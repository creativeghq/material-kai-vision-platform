/**
 * Edge-function-side module registry.
 *
 * Mirrors `src/modules/_core/registry.ts` for the Deno runtime that runs
 * Supabase edge functions. Each agent-callable module declares its
 * contributions (background agents, LLM tools) in `<slug>/manifest.ts`
 * inside this folder; the platform-level edge functions (the agent
 * runner, the agent-chat tool list builder) merge contributions from
 * enabled modules only.
 *
 * Why this exists: the previous design hardcoded
 *   `import { SocialAnalyticsSyncAgent } from '../agents/...'`
 * in `_shared/agents/registry.ts`. Toggling a module off in the DB
 * had no effect — the runner would still pick up the agent on its
 * cron tick. Same for tools: the KAI agent edge function imported
 * social tools statically, so disabling Social Media still showed
 * the tools to the LLM.
 *
 * This loader gates BOTH at request time:
 *   - Agent runner: skip if `is_module_enabled(agent.module_slug) === false`
 *   - Tool list:    omit module tools if module is off
 *
 * Module manifest contract (each `<slug>/manifest.ts` exports a
 * default `EdgeModuleManifest`):
 *
 *   {
 *     slug: 'social-media',
 *     agents: [SocialAnalyticsSyncAgent, SocialInsightsSyncAgent],
 *     toolFactories: [createSocialConnectAccountTool, …],
 *   }
 *
 * Ordering is irrelevant — the platform-level builder just unions all
 * enabled-module contributions with the platform-default set.
 */

import type { DbClient } from '../supabase-client.ts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AgentRunner } from '../agents/types.ts';

/** A constructable AgentRunner — `new Foo()`. */
export type AgentRunnerCtor = new () => AgentRunner;

/**
 * Tool factories accept a different argv per module today (some take
 * `userId`, some take `workspaceId`, some take a progress callback).
 * Keeping it `unknown[]` here lets the platform pass whatever it
 * already passes — type-tightened at the platform-side call site.
 */
export type ToolFactory = (...args: unknown[]) => unknown;

export interface EdgeModuleManifest {
  /** Must match the row in `public.modules.slug`. */
  slug: string;
  /** Background agents this module contributes. Each ctor produces one runner. */
  agents?: AgentRunnerCtor[];
  /** LLM tool factories this module contributes. */
  toolFactories?: ToolFactory[];
}

/**
 * Cache of `is_module_enabled` lookups, keyed by slug.
 * 30-second TTL to limit Supabase round-trips on hot paths
 * (tool-list construction runs on every KAI agent invocation).
 */
const ENABLED_TTL_MS = 30_000;
const enabledCache: Map<string, { enabled: boolean; expiresAt: number }> = new Map();

/**
 * Query `public.modules` for enabled rows. Cached for `ENABLED_TTL_MS`.
 * Falls back to `false` on any failure — fail-closed posture.
 */
export async function isModuleEnabled(supabase: DbClient, slug: string): Promise<boolean> {
  const cached = enabledCache.get(slug);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.enabled;

  try {
    const { data, error } = await supabase
      .from('modules')
      .select('enabled')
      .eq('slug', slug)
      .maybeSingle();
    const enabled = !error && !!data?.enabled;
    enabledCache.set(slug, { enabled, expiresAt: now + ENABLED_TTL_MS });
    return enabled;
  } catch {
    enabledCache.set(slug, { enabled: false, expiresAt: now + ENABLED_TTL_MS });
    return false;
  }
}

/**
 * Helper to build a Supabase client from env vars at edge runtime.
 * Service role only — module gating is a server-side decision.
 */
export function moduleSupabaseClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  return createClient(url, key);
}

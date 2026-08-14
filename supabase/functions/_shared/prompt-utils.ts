/**
 * Shared prompt loading utilities — THE loader for edge functions (#347 phase 3P).
 * Loads prompts from the `prompts` table so all prompts are DB-driven
 * and editable via /admin/ai-configs.
 *
 * NO CODE FALLBACK. `getGenerationPrompt` used to take a required `fallback` argument and was
 * documented as "never throws"; every caller therefore carried a hardcoded copy of its prompt.
 * That is invisible when it fires — and it fired constantly: `getGenerationPrompt(supabase,
 * 'ai_rerank', ...)` queries prompt_type='generation', but the re-ranker prompt is filed under
 * prompt_type='tool'. The lookup matched zero rows on every call, so search re-ranking ran on
 * the hardcoded string 100% of the time while "AI Search Re-ranker" sat in the table, editable
 * and unread.
 *
 * Missing and unreachable are separate errors on purpose: "add the row" and "the database is
 * down" need different reactions, and collapsing them is how an outage looks like a
 * misconfiguration for as long as nobody looks.
 *
 * Includes an in-memory cache with 5-minute TTL to avoid repeated DB
 * queries for prompts that rarely change. The Deno isolate keeps the
 * cache alive across requests until cold-start.
 */
import type { DbClient } from './supabase-client.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

/** The store answered and has no such prompt. Add it; retrying will not help. */
export class PromptNotConfigured extends Error {
  constructor(message: string) { super(message); this.name = 'PromptNotConfigured'; }
}

/** The store could not be read. The prompt may be fine; the database is not. */
export class PromptStoreUnavailable extends Error {
  constructor(message: string) { super(message); this.name = 'PromptStoreUnavailable'; }
}

// ── Prompt cache (module-level, survives across requests in same isolate) ──
const PROMPT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const promptCache = new Map<string, { prompt: string; cachedAt: number }>();

function getCachedPrompt(key: string): string | null {
  const entry = promptCache.get(key);
  if (entry && Date.now() - entry.cachedAt < PROMPT_CACHE_TTL_MS) {
    return entry.prompt;
  }
  if (entry) promptCache.delete(key); // expired
  return null;
}

function setCachedPrompt(key: string, prompt: string): void {
  promptCache.set(key, { prompt, cachedAt: Date.now() });
}

/**
 * Interpolate {{var}} placeholders in a prompt template. Uses the platform's
 * standard double-brace syntax (same convention as flow-engine + the email
 * renderer). Unknown placeholders are left untouched so a typo in the DB row
 * is visible rather than silently blanked.
 */
export function renderPromptTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? `{{${key}}}` : String(v);
  });
}

/**
 * Load an agent system prompt from the database.
 * prompt_type = 'agent', category = agentType
 */
export async function getAgentSystemPrompt(
  supabase: DbClient,
  agentType: string,
): Promise<string> {
  const cacheKey = `agent:${agentType}`;
  const cached = getCachedPrompt(cacheKey);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('prompts')
    .select('system_prompt')
    .eq('prompt_type', 'agent')
    .eq('category', agentType)
    .eq('is_active', true)
    .eq('status', 'active')
    .single();

  if (error || !data?.system_prompt) {
    console.error(`❌ CRITICAL: No prompt found for agent '${agentType}':`, error);
    throw new Error(`Agent prompt not found in database: ${agentType}. Please add it via /admin/ai-configs.`);
  }

  setCachedPrompt(cacheKey, data.system_prompt);
  return data.system_prompt;
}

/**
 * Load a tool-specific system prompt from the database.
 * prompt_type = 'tool', category = toolName
 */
export async function getToolPrompt(
  supabase: DbClient,
  toolName: string,
): Promise<string> {
  const cacheKey = `tool:${toolName}`;
  const cached = getCachedPrompt(cacheKey);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('prompts')
    .select('system_prompt')
    .eq('prompt_type', 'tool')
    .eq('category', toolName)
    .eq('is_active', true)
    .eq('status', 'active')
    .single();

  if (error || !data?.system_prompt) {
    console.error(`❌ CRITICAL: No prompt found for tool '${toolName}':`, error);
    throw new Error(`Tool prompt not found in database: ${toolName}. Please add it via /admin/ai-configs.`);
  }

  setCachedPrompt(cacheKey, data.system_prompt);
  return data.system_prompt;
}

/**
 * Load a prompt by (type, category). Reads `prompt_text` first — that is the column
 * /admin/ai-configs writes — then `system_prompt` for legacy rows. Reading system_prompt only
 * is what previously made admin edits to generation prompts inert.
 *
 * @throws PromptNotConfigured    no active row matches
 * @throws PromptStoreUnavailable the prompts table could not be read
 */
export async function loadPrompt(
  supabase: DbClient,
  promptType: string,
  category: string,
  subcategory?: string,
): Promise<string> {
  const cacheKey = `${promptType}:${category}:${subcategory ?? '-'}`;
  const cached = getCachedPrompt(cacheKey);
  if (cached) return cached;

  let query = supabase
    .from('prompts')
    .select('prompt_text, system_prompt')
    .eq('prompt_type', promptType)
    .eq('category', category)
    .eq('is_active', true)
    .eq('status', 'active');
  // Only filter when asked. A caller that passes no subcategory means "the row for this
  // category", not "the row whose subcategory is null".
  if (subcategory !== undefined) query = query.eq('subcategory', subcategory);
  const { data, error } = await query.order('version', { ascending: false }).limit(1);

  // PGRST116 is "no rows" from .single(); we use .limit(1) so any error here is a real
  // reachability failure, never an empty result. supabase-js RESOLVES on an RLS denial rather
  // than throwing, so this check is what stands between a denied read and "prompt not found".
  if (error) {
    throw new PromptStoreUnavailable(
      `Could not read prompts for ${promptType}/${category}: ${error.message}`,
    );
  }

  const text = data?.[0]?.prompt_text || data?.[0]?.system_prompt;
  if (!text) {
    throw new PromptNotConfigured(
      `No active prompt for prompt_type='${promptType}', category='${category}'. ` +
      `Add it in /admin/ai-configs. There is no hardcoded fallback by design.`,
    );
  }

  setCachedPrompt(cacheKey, text);
  return text;
}

/**
 * Load a prompt that is genuinely OPTIONAL, returning null when there is no such row.
 *
 * This is not the banned code-fallback pattern and the difference is exact: only
 * PromptNotConfigured becomes null. PromptStoreUnavailable still throws, so a database outage
 * can never be mistaken for "this override is not configured". Use it only where absence is a
 * documented, expected state and the fallback is ANOTHER DB PROMPT — never a hardcoded string.
 */
export async function tryLoadPrompt(
  supabase: DbClient,
  promptType: string,
  category: string,
  subcategory?: string,
): Promise<string | null> {
  try {
    return await loadPrompt(supabase, promptType, category, subcategory);
  } catch (err) {
    if (err instanceof PromptNotConfigured) return null;
    throw err;
  }
}

/**
 * Load a generation prompt. prompt_type = 'generation', category = promptName.
 *
 * The `fallback` parameter is GONE. It made every caller carry a copy of its own prompt, and
 * the copy won silently whenever the lookup missed — which for 'ai_rerank' was every single
 * call, because that prompt is filed under prompt_type='tool'.
 */
export async function getGenerationPrompt(
  supabase: DbClient,
  promptName: string,
): Promise<string> {
  return loadPrompt(supabase, 'generation', promptName);
}

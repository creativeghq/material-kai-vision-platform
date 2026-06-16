/**
 * Shared prompt loading utilities.
 * Loads prompts from the `prompts` table so all prompts are DB-driven
 * and editable via /admin/ai-configs.
 *
 * Includes an in-memory cache with 5-minute TTL to avoid repeated DB
 * queries for prompts that rarely change. The Deno isolate keeps the
 * cache alive across requests until cold-start.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
 * Load a generation prompt from the database with a hardcoded fallback.
 * prompt_type = 'generation', category = promptName
 * Never throws — returns fallback if DB row is missing.
 */
export async function getGenerationPrompt(
  supabase: SupabaseClient,
  promptName: string,
  fallback: string,
): Promise<string> {
  const cacheKey = `generation:${promptName}`;
  const cached = getCachedPrompt(cacheKey);
  if (cached) return cached;

  // Read prompt_text FIRST — that's the column the canonical admin editor
  // (/admin/ai-configs) writes for generation prompts. system_prompt is kept as
  // a fallback for legacy rows. Reading system_prompt-only here is what made
  // admin edits to generation prompts inert.
  const { data, error } = await supabase
    .from('prompts')
    .select('prompt_text, system_prompt')
    .eq('prompt_type', 'generation')
    .eq('category', promptName)
    .eq('is_active', true)
    .eq('status', 'active')
    .single();

  const dbText = data?.prompt_text || data?.system_prompt;
  if (error || !dbText) {
    console.warn(`⚠️ No DB prompt for '${promptName}', using hardcoded fallback`);
    setCachedPrompt(cacheKey, fallback);
    return fallback;
  }

  setCachedPrompt(cacheKey, dbText);
  return dbText;
}

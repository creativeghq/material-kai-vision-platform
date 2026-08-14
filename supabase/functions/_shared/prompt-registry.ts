/**
 * The one way an edge function gets a prompt (#347 phase 3P).
 *
 * Every prompt sent to a model comes from the `prompts` table. There is NO code fallback — no
 * `DEFAULT_PROMPT`, no `?? '...'`, no `catch { return HARDCODED }`.
 *
 * WHY
 * ---
 * A hardcoded fallback is invisible when it fires. On the Python side, `segmentation_service`
 * read the DB, caught every exception, logged at DEBUG and returned a 9,119-character constant:
 * an admin editing that prompt in the UI would have seen it save and changed nothing, forever,
 * while the system reported perfect health.
 *
 * The edge functions had it worse — 82 prompts across 15 files and not one of them read the
 * table at all, so /admin/ai-configs was a UI over prompts that nothing was using.
 *
 * TWO FAILURES, TWO ERRORS
 * ------------------------
 *   PromptNotConfigured   — the query worked and there is no such row. Add it; retrying is futile.
 *   PromptStoreUnavailable — the query failed. The prompt may be fine; the database is not.
 *
 * Collapsing both into `null` is what let an outage look like a misconfiguration.
 *
 * NOTE ON supabase-js: it RESOLVES on an RLS denial rather than throwing, so `error` is checked
 * explicitly here. A discarded result would flow on as "no prompt found".
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Prompts shipped with the platform live under this workspace. */
export const GLOBAL_WORKSPACE = '00000000-0000-0000-0000-000000000000';

const CACHE_TTL_MS = 5 * 60 * 1000;

export class PromptNotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptNotConfigured';
  }
}

export class PromptStoreUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptStoreUnavailable';
  }
}

export interface PromptKey {
  promptType: string;
  category: string;
  stage?: string | null;
  subcategory?: string | null;
  workspaceId?: string | null;
}

const cache = new Map<string, { text: string; at: number }>();

// Lazy, NOT captured at module load: the bootstrap populates Deno.env at handler entry, so a
// module-load read gets undefined (CLAUDE.md, Secrets).
function client(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) {
    throw new PromptStoreUnavailable(
      'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set, so the prompt store cannot be read.',
    );
  }
  return createClient(url, key);
}

function cacheKey(k: PromptKey): string {
  return [k.promptType, k.category, k.stage ?? '-', k.subcategory ?? '-',
    k.workspaceId ?? '-'].join('|');
}

async function selectOne(
  sb: SupabaseClient,
  promptType: string,
  category: string,
  stage: string | null | undefined,
  subcategory: string | null | undefined,
  workspaceId: string,
  isCustom: boolean | null,
): Promise<string | null> {
  let q = sb.from('prompts')
    .select('prompt_text, version')
    .eq('prompt_type', promptType)
    .eq('category', category)
    .eq('workspace_id', workspaceId)
    .eq('is_active', true);
  if (stage != null) q = q.eq('stage', stage);
  if (subcategory != null) q = q.eq('subcategory', subcategory);
  if (isCustom != null) q = q.eq('is_custom', isCustom);

  const { data, error } = await q.order('version', { ascending: false }).limit(1);
  // supabase-js resolves on an RLS denial. An unchecked result here would be indistinguishable
  // from "this prompt does not exist", which is the wrong error and the wrong fix.
  if (error) {
    throw new PromptStoreUnavailable(
      `Could not read prompts for ${promptType}/${stage ?? '-'}/${category}: ${error.message}`,
    );
  }
  const text = data?.[0]?.prompt_text;
  return typeof text === 'string' && text.trim() ? text : null;
}

/**
 * Resolve a prompt, most specific first. Every step requires `is_active`.
 *
 *   1. workspace + custom      2. workspace + default      3. the global workspace
 *
 * @throws PromptNotConfigured   no active row matches
 * @throws PromptStoreUnavailable the table could not be read
 */
export async function loadPrompt(key: PromptKey): Promise<string> {
  const ck = cacheKey(key);
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.text;

  const ws = key.workspaceId || GLOBAL_WORKSPACE;
  const sb = client();

  const attempts: Array<[string, boolean | null]> = [[ws, true], [ws, false]];
  if (ws !== GLOBAL_WORKSPACE) attempts.push([GLOBAL_WORKSPACE, null]);

  for (const [workspace, isCustom] of attempts) {
    const text = await selectOne(
      sb, key.promptType, key.category, key.stage, key.subcategory, workspace, isCustom,
    );
    if (text) {
      cache.set(ck, { text, at: Date.now() });
      return text;
    }
  }

  throw new PromptNotConfigured(
    `No active prompt for prompt_type='${key.promptType}', stage='${key.stage ?? '-'}', ` +
    `category='${key.category}' (workspace ${ws}). Add it in /admin/ai-configs. There is no ` +
    `hardcoded fallback by design — see supabase/functions/_shared/prompt-registry.ts.`,
  );
}

/**
 * Fill `{name}` placeholders, throwing when a value has no slot in the template.
 *
 * "Are there braces left?" is not a usable check — prompts are full of JSON examples. "Did this
 * substitution actually happen?" is, and it is what catches a placeholder renamed in the admin
 * UI without updating the caller: otherwise the prompt ships with an unfilled hole and the value
 * is silently dropped.
 */
export function render(template: string, values: Record<string, unknown>): string {
  const missing = Object.keys(values).filter((name) => !template.includes(`{${name}}`));
  if (missing.length) {
    throw new PromptNotConfigured(
      `Prompt template has no placeholder for ${missing.join(', ')}. Either the caller passes a ` +
      `value the prompt no longer uses, or a placeholder was renamed in /admin/ai-configs.`,
    );
  }
  let out = template;
  for (const [name, value] of Object.entries(values)) {
    out = out.split(`{${name}}`).join(value == null ? '' : String(value));
  }
  return out;
}

/** Drop the cache — for tests and for the admin save path. */
export function clearPromptCache(): void {
  cache.clear();
}

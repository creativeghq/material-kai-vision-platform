/**
 * Chat Starter Prompts
 *
 * Starter prompts live in the shared `prompts` table with prompt_type='chat_starter'.
 * They're shown in the chat composer's "Starter Prompts" picker so users can pick a
 * carefully-worded template (that reliably triggers the intended agent skill) instead
 * of prompting from scratch each time.
 */

import { supabase } from '@/integrations/supabase/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StarterVariable {
  key:          string;
  default:      string;
  description?: string;
}

export interface StarterConfig {
  variables?:        StarterVariable[];
  group?:            string;                   // UI group label ("B2B Research", etc.)
  visibility?:       'all' | 'admin';
  skill_hint?:       string | null;            // Expected skill slug, for UI badge
  credit_estimate?:  string | null;            // e.g. "1-2", "15-20"
  requires_image?:   boolean;
}

export interface ChatStarter {
  id:            string;
  subcategory:   string;   // unique slug within (agent, workspace)
  name:          string;
  description:   string | null;
  prompt_text:   string;
  category:      string;   // agent id: 'kai' | 'interior-designer'
  configuration: StarterConfig;
  is_default:    boolean;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * List starter prompts available to a given agent + role.
 * Admin sees all; non-admin sees only visibility='all'.
 * Falls back silently to [] on any DB error — this is a convenience UI, not critical path.
 */
export async function listChatStarters(
  agentId: string,
  isAdmin: boolean,
): Promise<ChatStarter[]> {
  const { data, error } = await supabase
    .from('prompts')
    .select('id, subcategory, name, description, prompt_text, category, configuration, is_default')
    .eq('prompt_type', 'chat_starter')
    .eq('category', agentId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('name',       { ascending: true });

  if (error) {
    console.warn('[chatStarters] listChatStarters failed:', error.message);
    return [];
  }

  const rows = (data ?? []) as ChatStarter[];

  // RBAC: drop admin-only templates for non-admin users
  if (!isAdmin) {
    return rows.filter(r => (r.configuration?.visibility ?? 'all') !== 'admin');
  }
  return rows;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Substitute {variable} placeholders in a starter's prompt_text.
 * Leaves unknown placeholders untouched so the user can see what's missing.
 */
export function substituteVariables(
  template: string,
  values:   Record<string, string>,
): string {
  return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, key) => {
    const v = values[key];
    return v !== undefined && v !== '' ? v : match;
  });
}

/**
 * Group starters by configuration.group label (falls back to "Other").
 * Preserves the input array's sort order within each group.
 */
export function groupStarters(starters: ChatStarter[]): Record<string, ChatStarter[]> {
  const out: Record<string, ChatStarter[]> = {};
  for (const s of starters) {
    const group = s.configuration?.group ?? 'Other';
    (out[group] ??= []).push(s);
  }
  return out;
}

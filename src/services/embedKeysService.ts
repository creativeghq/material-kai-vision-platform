/**
 * Embed keys (#321 M1, #258) — the keys a workspace pastes into its own website to render
 * products and 3D models through `products-3d-api`.
 *
 * Storage is `material_kai_keys`, whose RLS admits only workspace owners/admins
 * (`is_workspace_admin`), so these calls need no manual workspace filter to be SAFE — but they
 * carry one anyway, because a missing filter would otherwise return every key the caller can
 * administer across all their workspaces, and this UI is scoped to the active one.
 *
 * **These keys are publishable, not secret.** They ship in the page source of the customer's
 * site — that is what they are for. The controls that matter are the origin allowlist, the
 * per-minute quota, and the fact that `products-3d-api` only ever serves storefront-published
 * rows. The UI says so out loud, because a key labelled "secret" that is pasted into public HTML
 * teaches the wrong lesson about every other key on that page.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

// Re-exported so callers have one import for "embed keys", while the helpers themselves stay in a
// module with no client import — see the header of src/utils/embedOrigins.ts.
export { normalizeOriginList, isWildcardOriginList } from '@/utils/embedOrigins';

export type EmbedKey = Tables<'material_kai_keys'>;

export interface EmbedKeyInput {
  key_name: string;
  description?: string | null;
  /** Browser origins allowed to use the key. `['*']` = any site. Empty = no browser may use it. */
  allowed_origins: string[];
  rate_limit_per_minute: number;
}

/** Sensible ceiling for a per-key quota — high enough for a busy shop, low enough to be a cap. */
export const MAX_RATE_LIMIT_PER_MINUTE = 600;

/**
 * Mint a key value.
 *
 * `crypto.getRandomValues` rather than `Math.random()`: the value is public, but it must still be
 * unguessable, or anyone could burn a stranger's quota by iterating candidates. The `mk_embed_`
 * prefix makes it identifiable in a page source and in a support ticket.
 */
export function generateEmbedKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `mk_embed_${body}`;
}

export const embedKeysService = {
  async list(workspaceId: string): Promise<EmbedKey[]> {
    const { data, error } = await supabase
      .from('material_kai_keys')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async create(workspaceId: string, input: EmbedKeyInput): Promise<EmbedKey> {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('material_kai_keys')
      .insert({
        workspace_id: workspaceId,
        api_key: generateEmbedKey(),
        key_name: input.key_name.trim(),
        description: input.description?.trim() || null,
        allowed_origins: input.allowed_origins,
        rate_limit_per_minute: clampRate(input.rate_limit_per_minute),
        is_active: true,
        created_by: auth.user?.id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, patch: Partial<EmbedKeyInput> & { is_active?: boolean }): Promise<void> {
    const { error } = await supabase
      .from('material_kai_keys')
      .update({
        ...(patch.key_name !== undefined ? { key_name: patch.key_name.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
        ...(patch.allowed_origins !== undefined ? { allowed_origins: patch.allowed_origins } : {}),
        ...(patch.rate_limit_per_minute !== undefined
          ? { rate_limit_per_minute: clampRate(patch.rate_limit_per_minute) }
          : {}),
        ...(patch.is_active !== undefined ? { is_active: patch.is_active } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
  },

  /**
   * Delete a key. There is no soft-delete twin: `is_active = false` already IS the reversible
   * "turn it off", so a second disabled-ish state would only make "is this key live?" ambiguous.
   */
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('material_kai_keys').delete().eq('id', id);
    if (error) throw error;
  },
};

function clampRate(value: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 60;
  return Math.min(n, MAX_RATE_LIMIT_PER_MINUTE);
}

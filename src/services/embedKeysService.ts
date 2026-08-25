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

/**
 * A key row.
 *
 * Widened past the generated types on purpose. `types:generate` needs a Supabase access token
 * nobody has locally and CI never regenerates the file, so `Tables<'material_kai_keys'>` is
 * frozen at the schema of whenever it was last produced by hand — it is missing every column
 * added since, including the seven below, which are all live and NOT NULL in the database.
 *
 * The failure mode this prevents is the quiet one: without the widening, `key.key_kind` is a type
 * error at best, and at worst a caller writes `(key as any).key_kind` and loses the union — so a
 * `tools` key gets handed a catalogue snippet with nothing to say it is wrong. Hand-editing
 * `types.ts` is not the fix (it is generated, and the next real regeneration silently drops the
 * edit); stating the delta here, next to the union it needs, is.
 *
 * Delete a line from this intersection when the generated file genuinely carries that column.
 */
export type EmbedKey = Tables<'material_kai_keys'> & {
  key_kind: EmbedKeyKind;
  tools_enabled: boolean;
  paid_tools_enabled: boolean;
  chat_enabled: boolean;
  daily_usd_cap: number;
  spend_usd: number;
  spend_day: string | null;
};

/**
 * Which slice of the published catalog a key may read.
 *
 * Mirrors the `material_kai_keys_scope_type_check` CHECK — a value this union allows but the
 * constraint rejects fails at insert time, so the two must stay in step.
 */
export type EmbedScopeType = 'all' | 'categories' | 'products' | 'blueprints';

/**
 * What a key GRANTS, which is a different question from what it is scoped to.
 *
 * `catalog` is the original: serve this workspace's published products or blueprints. `tools` is
 * for an embedder who has no catalogue at all — an architect putting a heat-pump sizer on their
 * blog — and serves NONE of it, ever. The lead still lands in this workspace either way, because
 * the key is the tenancy binding.
 */
export type EmbedKeyKind = 'catalog' | 'tools';

export interface EmbedKeyInput {
  key_name: string;
  key_kind?: EmbedKeyKind;
  /** May a CATALOGUE key also run the public tool surface? Meaningless for a tools key, which always can. */
  tools_enabled?: boolean;
  /**
   * May this key run tools that cost the platform money per call?
   *
   * Default false. The zero-cost calculators are always available; anything with a real upstream
   * bill is opt-in, for the same reason `allow_generation` is — a key handed out for a free
   * calculator must not be able to start spending because somebody pressed a different button.
   */
  paid_tools_enabled?: boolean;
  description?: string | null;
  /** Browser origins allowed to use the key. `['*']` = any site. Empty = no browser may use it. */
  allowed_origins: string[];
  rate_limit_per_minute: number;
  scope_type: EmbedScopeType;
  /** Category, product or blueprint ids per `scope_type`. Must be empty iff scope_type is 'all'. */
  scope_values: string[];
  /**
   * May this key spend credits on an AI impression when the catalog cannot satisfy a spec?
   *
   * Default false, and it stayed false for every key ever created through this UI — because the
   * column had no control. The spec builder's "see it" stage was therefore off for every merchant
   * who did not go into the database by hand, which is all of them. The default stays false: a
   * merchant who never asked cannot be billed, and a leaked key cannot be turned into a spending
   * endpoint. But it now has to be a CHOICE rather than an absence.
   */
  allow_generation?: boolean;
  /** Per-key ceiling on those generations per day. Meaningless while `allow_generation` is false. */
  generation_daily_cap?: number;
  /**
   * ONE daily ceiling in USD for everything on this key that costs money — the ask turn and every
   * paid tool draw on the same budget.
   *
   * Denominated in money rather than calls on purpose: a model turn ranges three orders of
   * magnitude, so a per-call cap is not a budget, it is a coin toss.
   */
  daily_usd_cap?: number;
}

export interface EmbedScopeOption {
  id: string;
  label: string;
}

/**
 * The catalog scope a key can be limited to.
 *
 * Categories come from `material_categories`, a GLOBAL taxonomy with no workspace column — so the
 * list is the same for every tenant, and the scope only ever means "this category *within my
 * workspace*". The server applies the workspace filter independently, so picking a category can
 * never widen a key past its own tenant.
 */
export async function listScopeCategories(): Promise<EmbedScopeOption[]> {
  const { data, error } = await supabase
    .from('material_categories')
    .select('id, name, display_name')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, label: c.display_name || c.name }));
}

/** Type-ahead over the workspace's own products, for an explicit product allowlist. */
export async function searchScopeProducts(workspaceId: string, term: string): Promise<EmbedScopeOption[]> {
  const q = term.trim();
  let query = supabase
    .from('products')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true })
    .limit(20);
  if (q) query = query.ilike('name', `%${q}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, label: p.name ?? '(unnamed)' }));
}

/**
 * The workspace's own configurators, for a blueprint-scoped key (#382 Phase 1).
 *
 * Only rows this workspace OWNS. Platform starters are deliberately absent: they carry
 * `workspace_id IS NULL` and our default rates, so serving one through a tenant's key would quote
 * a visitor prices that tenant never set. The DB refuses it too
 * (`blueprints_embed_publish_requires_workspace`) — this is the same rule read from the UI side so
 * the picker cannot offer what the constraint would reject.
 *
 * Unpublished blueprints ARE offered. Scoping a key to one is how a merchant sets up before
 * flipping it live, and the endpoint checks publication independently on every request.
 */
export async function listScopeBlueprints(workspaceId: string): Promise<EmbedScopeOption[]> {
  const { data, error } = await supabase
    .from('blueprints')
    .select('id, title, is_embed_published')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .order('title', { ascending: true })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((b) => ({
    id: b.id,
    // The published state is part of the label, because a key scoped to an unpublished blueprint
    // serves nothing and looks identical to one that works.
    label: b.is_embed_published ? b.title : `${b.title} (not published)`,
  }));
}

/** Sensible ceiling for a per-key quota — high enough for a busy shop, low enough to be a cap. */
export const MAX_RATE_LIMIT_PER_MINUTE = 600;

/**
 * Default and ceiling for the daily AI-generation cap.
 *
 * The default MIRRORS the fallback `products-3d-api` applies when the column is null (`?? 20`), so
 * a key created here and a key created any other way behave the same. The ceiling exists because
 * this is the one embed control that spends money on a stranger's click: 200/day at 6 credits is
 * already a deliberate budget, and a merchant who wants more should have to ask rather than
 * mistype a zero.
 */
export const DEFAULT_GENERATION_DAILY_CAP = 20;

/**
 * Default and ceiling for the ONE daily money budget on a key.
 *
 * $0.50 buys roughly a hundred answer turns at the measured ~$0.005 each, or several hundred
 * catalogue searches — enough that a normal day never touches it, low enough that a key left on a
 * busy page cannot quietly run up a bill. The ceiling exists for the same reason the generation one
 * does: a merchant who wants more should have to ask rather than mistype a zero.
 */
export const DEFAULT_DAILY_USD_CAP = 0.5;
export const MAX_DAILY_USD_CAP = 25;

function clampUsdCap(v: number | undefined): number {
  const n = Number(v ?? DEFAULT_DAILY_USD_CAP);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_DAILY_USD_CAP;
  return Math.min(n, MAX_DAILY_USD_CAP);
}
export const MAX_GENERATION_DAILY_CAP = 200;

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

/**
 * Embed telemetry for one workspace, already aggregated.
 *
 * Counts come from the SQL summary rather than by pulling rows and tallying them here — the same
 * reason prices are derived in SQL. `by_event` is keyed by the event types the widget emits
 * (`embed_view`, `embed_model_load`, `embed_configure`, `embed_ar_launch`, `embed_add_to_cart`); a
 * type with no events is simply absent, not zero.
 */
export interface EmbedAnalyticsSummary {
  days: number;
  total: number;
  by_event: Record<string, number>;
  by_key: Array<{ embed_key_id: string; events: number }>;
  top_pages: Array<{ page: string; events: number }>;
  daily: Array<{ day: string; events: number }>;
  /**
   * What the widget SPENT, alongside what it did.
   *
   * `visualize` is the only action on the embed surface that costs money, and it is triggered by an
   * anonymous stranger on the merchant's own website and charged to the merchant's pool. Until the
   * writer started stamping `source` / `embed_key_id` / `workspace_id` on the usage row, that spend
   * was indistinguishable from an operator generating a product shot in-app — so a merchant could
   * see their daily cap but never what it had cost them, and nobody could say which key was
   * burning credits.
   *
   * `by_key` covers only rows written since that attribution shipped; older embed generations are
   * counted nowhere, because inferring which historical row came from a widget would be a guess
   * dressed as a number.
   */
  generation: {
    count: number;
    credits: number;
    billed_usd: number;
    by_key: Array<{ embed_key_id: string; count: number; credits: number }>;
  };
}

export const embedKeysService = {
  /**
   * Usage for the workspace's embeds. Runs SECURITY INVOKER, so a caller only ever sees their own
   * workspace's rows — the RLS policy is the access control, not a filter this code remembers.
   */
  async analytics(workspaceId: string, days = 30): Promise<EmbedAnalyticsSummary> {
    const { data, error } = await supabase.rpc('get_embed_analytics_summary', {
      p_workspace_id: workspaceId,
      p_days: days,
    });
    if (error) throw error;
    return data as unknown as EmbedAnalyticsSummary;
  },

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
        // Normalized together: the CHECK requires values to be empty for 'all' and non-empty
        // otherwise, so sending a stale list alongside 'all' is a constraint violation rather than
        // a harmless extra field.
        // A TOOLS key is scoped to nothing, and saying so explicitly beats leaving whatever the
        // form last held: it serves no catalogue by construction, so a stale product list on the
        // row would be a claim the endpoint then ignores — a discrepancy somebody would eventually
        // have to reconcile.
        scope_type: input.key_kind === 'tools' ? 'all' : input.scope_type,
        scope_values: input.key_kind === 'tools' || input.scope_type === 'all' ? [] : input.scope_values,
        key_kind: input.key_kind ?? 'catalog',
        tools_enabled: input.key_kind === 'tools' ? true : (input.tools_enabled ?? false),
        paid_tools_enabled: input.paid_tools_enabled ?? false,
        daily_usd_cap: clampUsdCap(input.daily_usd_cap),
        allow_generation: input.allow_generation ?? false,
        generation_daily_cap: clampDailyCap(input.generation_daily_cap),
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
        // Scope moves as a PAIR or not at all — updating one half would leave the row in a state
        // the CHECK rejects (e.g. type 'all' still carrying its old values).
        ...(patch.scope_type !== undefined
          ? {
            scope_type: patch.scope_type,
            scope_values: patch.scope_type === 'all' ? [] : (patch.scope_values ?? []),
          }
          : {}),
        ...(patch.allow_generation !== undefined ? { allow_generation: patch.allow_generation } : {}),
        ...(patch.generation_daily_cap !== undefined
          ? { generation_daily_cap: clampDailyCap(patch.generation_daily_cap) }
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

/**
 * Clamp the daily generation cap, floor 1.
 *
 * Zero is NOT the off switch — `allow_generation` is. A cap of 0 reads as "never", but
 * `consume_embed_generation_quota` grants the first call of each new day before it consults the
 * cap at all, so a merchant who typed 0 to mean "stop" would still be billed once a day and would
 * be right to call that a bug. Refusing 0 here keeps the one honest off switch the only off switch.
 */
function clampDailyCap(value: number | undefined): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_GENERATION_DAILY_CAP;
  return Math.min(n, MAX_GENERATION_DAILY_CAP);
}

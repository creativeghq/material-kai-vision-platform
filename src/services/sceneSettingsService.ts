/**
 * How a workspace's 3D surfaces look (#335) — read through one derivation.
 *
 * WHAT IS STORED IS A CHOICE, NOT A LIGHT. The rigs themselves (`LIGHTING_PRESETS`) are code: they
 * carry HDRI names, sun angles and light positions a renderer reads. What a tenant picks is which
 * rig, plus the few numbers beside it — exposure, camera framing, whether the environment shows
 * behind the product.
 *
 * THE LADDER IS RESOLVED IN SQL. `resolve_scene_settings(workspace, product, embed_key)` answers
 * embed key → product → workspace default → code defaults, and nothing here re-implements that
 * precedence. This is the third setting in the platform with that shape (pricing markup and
 * catalogue scope are the others), and the reason it is a function rather than a convention is
 * that three copies of a precedence rule eventually disagree about one case.
 */
import { supabase } from '@/integrations/supabase/client';
import type { PresetKey } from '@/components/features/lighting/lightingPresets';

export interface SceneSettings {
  workspace_id: string;
  product_id: string | null;
  embed_key_id: string | null;
  preset: PresetKey;
  exposure: number;
  /** Camera distance as a multiple of the model's size. Null = auto-fit, the historic behaviour. */
  camera_zoom: number | null;
  show_background: boolean;
}

/** What every surface used before this table existed, so an unset workspace sees no change. */
export const SCENE_DEFAULTS: Omit<SceneSettings, 'workspace_id'> = {
  product_id: null,
  embed_key_id: null,
  preset: 'natural_daylight',
  exposure: 1,
  camera_zoom: null,
  show_background: false,
};

export const sceneSettingsService = {
  /** The winning settings for a surface. One RPC — the precedence lives in SQL. */
  async resolve(
    workspaceId: string,
    productId?: string | null,
    embedKeyId?: string | null,
  ): Promise<SceneSettings> {
    const { data, error } = await supabase.rpc('resolve_scene_settings', {
      p_workspace_id: workspaceId,
      p_product_id: productId ?? null,
      p_embed_key_id: embedKeyId ?? null,
    });
    if (error) throw error;
    return { workspace_id: workspaceId, ...SCENE_DEFAULTS, ...(data as object) } as SceneSettings;
  },

  /**
   * The row for ONE scope, or null when that scope has never been set.
   *
   * Deliberately not the resolved answer: an editor has to show whether THIS scope has its own
   * value or is inheriting, and a resolved value would make "inherited" indistinguishable from
   * "set to the same thing" — so clearing an override would look like it did nothing.
   */
  async forScope(
    workspaceId: string,
    scope: { productId?: string | null; embedKeyId?: string | null } = {},
  ): Promise<SceneSettings | null> {
    let q = supabase
      .from('scene_settings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .limit(1);
    q = scope.productId ? q.eq('product_id', scope.productId) : q.is('product_id', null);
    q = scope.embedKeyId ? q.eq('embed_key_id', scope.embedKeyId) : q.is('embed_key_id', null);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? [])[0] as SceneSettings) ?? null;
  },

  /** Set or update one scope. */
  async save(
    workspaceId: string,
    scope: { productId?: string | null; embedKeyId?: string | null },
    values: Partial<Pick<SceneSettings, 'preset' | 'exposure' | 'camera_zoom' | 'show_background'>>,
  ): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('scene_settings')
      .upsert(
        {
          workspace_id: workspaceId,
          product_id: scope.productId ?? null,
          embed_key_id: scope.embedKeyId ?? null,
          created_by: auth.user?.id ?? null,
          updated_at: new Date().toISOString(),
          ...values,
        },
        { onConflict: 'workspace_id,product_id,embed_key_id' },
      );
    if (error) throw error;
  },

  /** Drop an override so the scope inherits again. */
  async clear(
    workspaceId: string,
    scope: { productId?: string | null; embedKeyId?: string | null },
  ): Promise<void> {
    let q = supabase.from('scene_settings').delete().eq('workspace_id', workspaceId);
    q = scope.productId ? q.eq('product_id', scope.productId) : q.is('product_id', null);
    q = scope.embedKeyId ? q.eq('embed_key_id', scope.embedKeyId) : q.is('embed_key_id', null);
    const { error } = await q;
    if (error) throw error;
  },
};

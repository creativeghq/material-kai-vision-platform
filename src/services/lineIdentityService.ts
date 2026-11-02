/** "Which one is this line?" — the options a quote or order line may choose from (#347 phase 5.2). */
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

import {
  projectIdentity,
  rankIdentityOptions,
  type LineIdentityOption,
} from './lineIdentityRules';

export type { LineIdentityOption } from './lineIdentityRules';

export const lineIdentityService = {
  /**
   * Identity options for a product's line. Best-effort: a line must remain editable when the
   * registry is unreachable, so this returns [] rather than throwing — the operator keeps a
   * free-text description and loses only the assistance.
   */
  async optionsFor(productId: string | null | undefined): Promise<LineIdentityOption[]> {
    if (!productId) return [];
    const { data, error } = await supabase.rpc('get_line_identity_options', { p_product_id: productId });
    if (error) {
      console.warn('[line-identity] options unavailable:', error.message);
      return [];
    }
    return (data ?? []) as LineIdentityOption[];
  },

  /**
   * Each line's NAME — series plus chosen variant — from SQL `compose_line_name`, keyed by
   * `key`. Best-effort: a missing name falls back to the bare one, so an empty map on error.
   */
  async lineNames(rows: Array<{
    key: string; productId: string | null | undefined; attributes: unknown; name: string | null | undefined;
  }>): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (rows.length === 0) return out;
    const { data, error } = await supabase.rpc('get_line_names', {
      p_rows: rows.map((r) => ({
        key: r.key, product_id: r.productId ?? null, attributes: r.attributes ?? {}, name: r.name ?? null,
      })) as unknown as Json,
    });
    if (error) {
      console.warn('[line-identity] line names unavailable:', error.message);
      return out;
    }
    for (const r of data ?? []) if (r.line_name) out.set(r.row_key, r.line_name);
    return out;
  },

  rank: rankIdentityOptions,
  project: projectIdentity,
};

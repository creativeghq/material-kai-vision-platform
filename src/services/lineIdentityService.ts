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

  async check(rows: LineVariantRow[]): Promise<Map<string, LineVariantCheck>> {
    const out = new Map<string, LineVariantCheck>();
    const asked = rows.filter((r) => r.productId);
    if (asked.length === 0) return out;
    const { data, error } = await supabase.rpc('check_line_variants', {
      p_rows: asked.map((r) => ({
        key: r.key, product_id: r.productId, attributes: r.attributes ?? {}, text: r.text ?? null,
      })) as unknown as Json,
    });
    if (error) throw new Error(`Could not check colour and size: ${error.message}`);
    for (const r of (data ?? []) as Array<{ row_key: string; status: LineVariantCheck['status']; message: string | null; attributes: Record<string, string> }>) {
      out.set(r.row_key, { status: r.status, message: r.message, attributes: r.attributes ?? {} });
    }
    return out;
  },

  async problems(rows: LineVariantRow[]): Promise<string[]> {
    const res = await lineIdentityService.check(rows);
    return [...res.values()].filter((r) => r.status !== 'ok').map((r) => r.message ?? 'A line has no colour or size chosen');
  },

  rank: rankIdentityOptions,
  project: projectIdentity,
};

export interface LineVariantRow {
  key: string;
  productId: string | null | undefined;
  attributes?: unknown;
  text?: string | null;
}

export interface LineVariantCheck {
  status: 'ok' | 'incomplete' | 'invalid';
  message: string | null;
  attributes: Record<string, string>;
}

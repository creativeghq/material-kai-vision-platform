import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';
import { normalizeTaricInput, formatTaricCode } from '@/lib/taric';

/**
 * EU TARIC commodity codes — search, validation and classification.
 *
 * The single client-side entry point for anything customs-code shaped. Search and validation go
 * straight to `search_taric_codes` (reference data, readable by any authenticated user);
 * classification goes through the `taric-classify` edge function because it spends credits and
 * needs the service role to reconcile ownership.
 *
 * Why validation matters here rather than at the border: since 1 July 2026 a low-value import
 * (including IOSS consignments) is charged €3 of duty per tariff sub-heading, and only a
 * declarable line — TARIC product line suffix 80 — may appear on the declaration. A 6-digit HS
 * code or an intermediate line is rejected, so a free-text box that accepts anything is a
 * compliance problem, not a UX one.
 */

export interface TaricCode {
  code: string;
  cn_code: string;
  chapter: string;
  description_en: string | null;
  description_el: string | null;
  declarable: boolean;
  breadcrumb: string | null;
  score: number;
}

export type TaricStatus = 'pending' | 'suggested' | 'confirmed' | 'failed';

export interface TaricSuggestion {
  taric_code: string | null;
  taric_code_suggested: string | null;
  taric_confidence: number | null;
  taric_status: TaricStatus;
  taric_source: string | null;
  taric_reasoning: string | null;
}


export { normalizeTaricInput, formatTaricCode };


export interface TaricCategoryRule {
  id: string;
  category_key: string;
  material_match: string | null;
  code_prefix: string;
  notes: string | null;
  is_confirmed: boolean;
  confirmed_at: string | null;
  priority: number;
}

/** '6907' -> '6907000000'. Every nomenclature level is stored zero-padded to ten digits. */
export function headingToCode(prefix: string): string {
  return (prefix ?? '').replace(/[^0-9]/g, '').padEnd(10, '0');
}

export const taricService = {
  /**
   * Free-text or code-prefix search. A numeric query is treated as a code lookup; anything else
   * runs full-text (EN + EL) with a trigram fallback.
   */
  async search(query: string, opts: { chapters?: string[]; limit?: number; declarableOnly?: boolean } = {}): Promise<TaricCode[]> {
    const { data, error } = await supabase.rpc('search_taric_codes', {
      p_query: query,
      p_chapters: opts.chapters ?? null,
      p_limit: opts.limit ?? 25,
      p_declarable: opts.declarableOnly === false ? null : true,
    });
    if (error) throw error;
    return (data ?? []) as TaricCode[];
  },

  /** Exact lookup, used to render a stored code and to tell a valid one from a stale one. */
  async lookup(code: string): Promise<TaricCode | null> {
    const normalized = normalizeTaricInput(code);
    if (!normalized) return null;
    const rows = await this.search(normalized, { limit: 1, declarableOnly: false });
    return rows.find((r) => r.code === normalized) ?? null;
  },

  /**
   * Ask the classifier for a suggestion. Never writes `taric_code` — the result lands in
   * `taric_code_suggested` for a human to confirm.
   */
  async classify(productIds: string[], opts: { chapters?: string[]; force?: boolean } = {}): Promise<any> {
    const { data, error } = await supabase.functions.invoke('taric-classify', {
      body: { product_ids: productIds, chapters: opts.chapters, force: opts.force },
    });
    if (error) throw await edgeError(error);
    return data;
  },

  /** Accept a suggestion: it becomes the product's code and the suggestion is cleared. */
  async confirmSuggestion(productId: string, code: string): Promise<void> {
    const normalized = normalizeTaricInput(code);
    if (!normalized) throw new Error('Not a valid TARIC code');
    const { error } = await supabase.from('products').update({
      taric_code: normalized,
      taric_code_suggested: null,
      taric_status: 'confirmed',
      taric_source: 'manual',
    }).eq('id', productId);
    if (error) throw error;
  },

  /** Reject a suggestion without accepting anything — back to unclassified. */
  async rejectSuggestion(productId: string): Promise<void> {
    const { error } = await supabase.from('products').update({
      taric_code_suggested: null,
      taric_confidence: null,
      taric_status: 'pending',
      taric_reasoning: null,
    }).eq('id', productId);
    if (error) throw error;
  },


  // ── Category rules ──────────────────────────────────────────────────────────────────────
  // The classification axis: category (+ material) picks the heading, a measured attribute picks
  // the declarable code. Confirming a rule is a ONE-TIME act that every product in the category
  // inherits — which is the whole reason this exists rather than a guess per product.

  async listCategoryRules(): Promise<TaricCategoryRule[]> {
    const { data, error } = await supabase
      .from('taric_category_rules').select('*')
      .order('category_key').order('priority');
    if (error) throw error;
    return (data ?? []) as TaricCategoryRule[];
  },

  /** Headings referenced by the rules, resolved to their nomenclature descriptions. */
  async headingDescriptions(prefixes: string[]): Promise<Record<string, string>> {
    const codes = [...new Set(prefixes.map(headingToCode))].filter(Boolean);
    if (codes.length === 0) return {};
    const { data, error } = await supabase
      .from('taric_codes').select('code, description_en, description_el').in('code', codes);
    if (error) throw error;
    return Object.fromEntries(
      (data ?? []).map((r: any) => [r.code, r.description_en ?? r.description_el ?? '']),
    );
  },

  /**
   * Sign a rule off (or withdraw it). Only a confirmed rule may be APPLIED automatically —
   * an unconfirmed one can still resolve, but its output stays a suggestion.
   */
  async setRuleConfirmed(id: string, confirmed: boolean): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('taric_category_rules').update({
      is_confirmed: confirmed,
      confirmed_by: confirmed ? auth?.user?.id ?? null : null,
      confirmed_at: confirmed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
  },

  /** Reference-table health, for the admin import screen. */
  async stats(): Promise<{ total: number; declarable: number; last_import: string | null }> {
    const { data, error } = await supabase.functions.invoke('taric-reference-sync', {
      body: { action: 'stats' },
    });
    if (error) throw await edgeError(error);
    return data as { total: number; declarable: number; last_import: string | null };
  },

  /** Import a CSV/TSV nomenclature export. Admin-only, enforced by the edge function. */
  async importReference(content: string, source: 'taric_eu' | 'gr_national'): Promise<any> {
    const { data, error } = await supabase.functions.invoke('taric-reference-sync', {
      body: { action: 'import', source, content },
    });
    if (error) throw await edgeError(error);
    return data;
  },

  /**
   * Import by URL instead of upload — the server fetches it through the SSRF guard.
   *
   * CIRCABC file links are unauthenticated, so a pasted link removes the download-then-upload
   * round trip entirely. It is also the same value the monthly cron uses, which is why
   * `remember` exists: one paste turns a manual import into a recurring one.
   */
  async importReferenceFromUrl(
    url: string,
    source: 'taric_eu' | 'gr_national',
    opts: { remember?: boolean } = {},
  ): Promise<any> {
    const { data, error } = await supabase.functions.invoke('taric-reference-sync', {
      body: { action: 'import', source, url },
    });
    if (error) throw await edgeError(error);

    if (opts.remember) {
      // Best-effort: the import already succeeded, and failing to persist the URL must not be
      // reported as an import failure. It only costs the operator the automation, not the data.
      const { error: saveErr } = await supabase.functions.invoke('platform-secrets-admin', {
        body: { action: 'save', key: 'TARIC_REFERENCE_URL', value: url },
      });
      if (saveErr) return { ...data, remembered: false };
      return { ...data, remembered: true };
    }
    return data;
  },
};

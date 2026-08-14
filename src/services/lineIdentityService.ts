/**
 * "Which one is this line?" — the options a quote or order line may choose from (#347 phase 5.2).
 *
 * Every value here is DERIVED IN SQL by `get_line_identity_options`, for the same reason money is:
 * the answer needs the field registry, the manufacturer-authoritative facts, and what is actually
 * on the shelf, and re-assembling those in TypeScript would be a second derivation that drifts
 * from the first. This module shapes the call and nothing else.
 *
 * What the resolver decides, so no caller re-decides it:
 *  - WHICH fields are identity — `material_metadata_fields.role = 'identity'`, scoped by
 *    `is_global` or the product's category. Not a hardcoded ['size','color'] pair, which is what
 *    the quote line used to carry and is why an order could never say anything else.
 *  - WHICH values are candidates — manufacturer facts first (`products_effective_facts` already
 *    resolves that precedence), then the product's own metadata, plus real warehouse dimensions
 *    for size.
 *  - Whether the field is a CHOICE at all: a field the product can only be one of is a fact, and
 *    the resolver withholds it rather than render a select with one option.
 */
import { supabase } from '@/integrations/supabase/client';

export interface LineIdentityOption {
  field_name: string;
  label: string;
  field_type: string;
  /** Every value this field may take for this product, already de-duplicated and sorted. */
  options: string[];
  /** The subset physically in stock. Empty for non-size fields. */
  stocked: string[];
}

/** The two fields with dedicated columns on quote_items / order_items / invoice_items. */
const SIZE_KEYS = ['available_sizes', 'size', 'format_code'];
const COLOR_KEYS = ['color', 'available_colors', 'colors', 'primary_color'];

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
   * Stocked values first, then the rest — an operator picking a size that exists is the common
   * case, and burying it under catalogue sizes nobody can ship is how a line gets promised on
   * stock that was never there.
   */
  rank(opt: LineIdentityOption): string[] {
    if (!opt.stocked?.length) return opt.options;
    const inStock = new Set(opt.stocked);
    return [...opt.options.filter((v) => inStock.has(v)), ...opt.options.filter((v) => !inStock.has(v))];
  },

  /**
   * Project the attribute map onto the two dedicated columns.
   *
   * `selected_attributes` is the whole truth; `selected_size` / `selected_color` are the slices
   * the PDF templates and the warehouse read. Derived here, once, so the two can never disagree
   * — writing them independently is how a line ends up labelled 600x600 while its attributes say
   * 300x300.
   */
  project(attrs: Record<string, string>): { selected_size: string | null; selected_color: string | null } {
    const pick = (keys: string[]) => {
      for (const k of keys) {
        const v = attrs[k];
        if (v && v.trim()) return v.trim();
      }
      return null;
    };
    return { selected_size: pick(SIZE_KEYS), selected_color: pick(COLOR_KEYS) };
  },
};

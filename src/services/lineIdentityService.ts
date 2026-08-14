/**
 * "Which one is this line?" — the options a quote or order line may choose from (#347 phase 5.2).
 *
 * Every value here is DERIVED IN SQL by `get_line_identity_options`, for the same reason money is:
 * the answer needs the field registry, the manufacturer-authoritative facts, and what is actually
 * on the shelf, and re-assembling those in TypeScript would be a second derivation that drifts
 * from the first. This module shapes the call and nothing else; the pure rules live in
 * `lineIdentityRules` so they stay testable without a database client in scope.
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

  rank: rankIdentityOptions,
  project: projectIdentity,
};

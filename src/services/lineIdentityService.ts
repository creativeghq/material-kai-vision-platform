/** "Which one is this line?" — the options a quote or order line may choose from (#347 phase 5.2). */
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

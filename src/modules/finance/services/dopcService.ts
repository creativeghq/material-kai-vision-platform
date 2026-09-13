/**
 * Declarations of performance and conformity (#430) — CPR (EU) 2024/3110 art. 16.
 *
 * Keyed on the MANUFACTURER's unique identification code of the product type, because that is what
 * art. 16(2) links on; several of our SKUs can share one declaration. Held per language, original
 * and translation together, and versioned — a past sale was made against the version in force then.
 */
import { supabase } from '@/integrations/supabase/client';

export type DopcStatus =
  | 'ok'
  | 'missing'
  | 'unlinked'
  | 'translation_missing'
  | 'translation_only'
  | 'not_found';

export interface DopcVerdict {
  status: DopcStatus;
  product_type_code?: string;
  versions?: number;
  current_version?: string | null;
  language?: string;
  reason: string;
}

export interface DopcDocument {
  id: string;
  workspace_id: string;
  product_type_code: string;
  manufacturer_name: string | null;
  version: string;
  language_code: string;
  is_original: boolean;
  issued_on: string | null;
  superseded_at: string | null;
  storage_bucket: string | null;
  storage_object_path: string | null;
  source_url: string | null;
  notes: string | null;
}

export interface DeclaredPerformance {
  id: string;
  dopc_id: string;
  essential_characteristic: string;
  declared_value: string;
  harmonised_specification: string | null;
  position: number;
}

/**
 * The literal word Annex V §9(b) requires where no performance is declared.
 *
 * A blank, a 0 or an em-dash is wrong on the face of the document. This is the platform's own "a
 * metric is a value or a stated reason there is no value" rule, written into law.
 */
export const NO_PERFORMANCE_DECLARED = 'NULL';

export const dopcService = {
  /** What we hold for a product, and what art. 16(4) says is still missing. */
  async statusFor(productId: string, language = 'el'): Promise<DopcVerdict> {
    const { data, error } = await supabase.rpc('product_dopc_status' as never, {
      p_product: productId,
      p_language: language,
    } as never);
    if (error) throw error;
    return data as unknown as DopcVerdict;
  },

  /** Every version we hold for a product type, superseded ones included. */
  async listForType(workspaceId: string, productTypeCode: string): Promise<DopcDocument[]> {
    const { data, error } = await supabase
      .from('dopc_documents')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('product_type_code', productTypeCode)
      .order('version', { ascending: false })
      .order('language_code');
    if (error) throw error;
    return (data ?? []) as DopcDocument[];
  },

  /** The declared-performance table of one version. */
  async performances(dopcId: string): Promise<DeclaredPerformance[]> {
    const { data, error } = await supabase
      .from('dopc_declared_performances')
      .select('*')
      .eq('dopc_id', dopcId)
      .order('position');
    if (error) throw error;
    return (data ?? []) as DeclaredPerformance[];
  },
};

/**
 * How a declared value is printed.
 *
 * An absent performance is the literal string `NULL` and is passed through unchanged — never
 * softened into a dash, a blank or a zero, any of which makes the document non-compliant.
 */
export function formatDeclaredValue(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  return v === '' ? NO_PERFORMANCE_DECLARED : v;
}

/** Whether the DoPC position should stop someone rather than merely inform them. */
export function dopcNeedsAttention(v: DopcVerdict | null): boolean {
  return v != null && v.status !== 'ok' && v.status !== 'not_found';
}

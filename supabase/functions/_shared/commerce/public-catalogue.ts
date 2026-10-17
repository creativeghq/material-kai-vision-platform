import { vatPctForCat } from '../vatVocabulary.generated.ts';

/** The only lifecycle state a public surface may show; ingestion creates `draft`. */
export const PUBLIC_PRODUCT_STATUS = 'active';

/** Used only when a workspace has no finance_settings row at all. */
const VAT_WHEN_UNCONFIGURED = 24;

// deno-lint-ignore no-explicit-any
type Db = { from: (t: string) => any };

export async function loadDefaultVatRate(supabase: Db, workspaceId: string): Promise<number> {
  const { data, error } = await supabase.from('finance_settings')
    .select('default_vat_rate').eq('workspace_id', workspaceId).maybeSingle();
  if (error) throw new Error(`finance_settings read failed: ${error.message}`);
  const rate = Number(data?.default_vat_rate ?? VAT_WHEN_UNCONFIGURED);
  return Number.isFinite(rate) ? rate : VAT_WHEN_UNCONFIGURED;
}

/** The ONE public VAT derivation: the product's AADE category, else the workspace default. */
export function productVatPct(vatCategory: string | number | null | undefined, defaultRate: number): number {
  return vatPctForCat(vatCategory, defaultRate);
}

/** `product_prices` is unique per (workspace, product, variant_key); a listing is keyed the same way. */
export function listingKey(productId: string, variantKey: string | null | undefined): string {
  return variantKey ? `${productId}::${variantKey}` : productId;
}

/** Inverse of SQL `_variant_key(attrs)` (`k=v;k=v`); values come back lowercased, as stored. */
export function variantAttrsFromKey(variantKey: string): Record<string, string> {
  return Object.fromEntries(variantKey.split(';').filter(Boolean).map((kv) => {
    const at = kv.indexOf('=');
    return at < 0 ? [kv, ''] : [kv.slice(0, at), kv.slice(at + 1)];
  }));
}

export function normaliseVariantKey(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s === '' ? null : s;
}

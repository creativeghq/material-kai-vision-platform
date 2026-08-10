/**
 * Product embed readiness (#341 join 5).
 *
 * "What does this product still need before the SDK can carry it" — derived in SQL by
 * `get_product_embed_readiness`, formatted here. Nothing in this file decides whether a
 * requirement is met; it reads the answer and turns it into sentences.
 *
 * WHY IT IS NOT A SCORE. Every requirement below is needed by a DIFFERENT downstream stage, and a
 * product missing all of them still sells: the spec builder quotes it as a request and the AI draws
 * an impression. So this reports what is missing and what that costs — never "you may not publish
 * this". The only hard gate the platform actually has is a published price, and it is marked as
 * such.
 *
 * THE SCOPE QUESTION IS NOT ANSWERED HERE. "Which of my keys can serve this product" is decided by
 * `embed_scope_covers_product`, the same SQL function `products-3d-api` gates on — so this panel
 * cannot promise a merchant something the endpoint then 404s.
 */
import { supabase } from '@/integrations/supabase/client';

export interface ProductEmbedReadiness {
  product_id: string;
  workspace_id: string;
  has_attributes: boolean;
  attribute_count: number;
  has_published_price: boolean;
  has_model: boolean;
  model_formats: string[];
  has_usdz: boolean;
  option_group_count: number;
  option_groups_matching_model: number;
  covering_key_ids: string[];
}

export interface ReadinessRequirement {
  key: 'price' | 'attributes' | 'model' | 'options' | 'key' | 'usdz';
  label: string;
  met: boolean;
  /** What stops working while this is missing — the reason it is worth doing. */
  consequence: string;
  detail?: string;
  /** The one requirement the embed genuinely refuses to serve without. */
  hardGate?: boolean;
}

/** Readiness for a set of products, keyed by product id. Batch-shaped for the list column. */
export async function readinessFor(productIds: string[]): Promise<Map<string, ProductEmbedReadiness>> {
  const out = new Map<string, ProductEmbedReadiness>();
  if (productIds.length === 0) return out;
  const { data, error } = await supabase.rpc('get_product_embed_readiness', { p_product_ids: productIds });
  if (error) throw error;
  for (const row of (data ?? []) as ProductEmbedReadiness[]) out.set(row.product_id, row);
  return out;
}

/**
 * The checklist, in the order a merchant should act on it: the hard gate first, then the things
 * that unlock a stage each, then the polish.
 */
export function requirementsOf(r: ProductEmbedReadiness): ReadinessRequirement[] {
  return [
    {
      key: 'price',
      label: 'Published price',
      met: r.has_published_price,
      hardGate: true,
      consequence: 'Without it the embed cannot return this product at all — it is the only hard gate.',
      detail: r.has_published_price ? undefined : 'Set a price and publish it to the storefront.',
    },
    {
      key: 'attributes',
      label: 'Attributes filled in',
      met: r.has_attributes,
      consequence:
        'The spec builder matches on attributes and builds its question list from them. With none, every visitor spec falls through to a quote request instead of a price.',
      detail: r.has_attributes ? `${r.attribute_count} attribute${r.attribute_count === 1 ? '' : 's'}` : undefined,
    },
    {
      key: 'model',
      label: '3D model',
      met: r.has_model,
      consequence: 'Feeds the viewer, AR, the configurator and the room planner. Without one the widget falls back to the product photo.',
      detail: r.has_model ? r.model_formats.join(', ').toUpperCase() : 'Upload a .glb — it is measured on the way in.',
    },
    {
      key: 'options',
      label: 'Configurable options',
      met: r.option_group_count > 0,
      consequence: 'Options are what make the embed a configurator rather than a picture. Each one targets a material in the model.',
      detail:
        r.option_group_count === 0
          ? undefined
          : r.has_model && r.option_groups_matching_model < r.option_group_count
            // The silent zero: an option that renders, is selectable, is priced, and changes nothing.
            ? `${r.option_group_count} group${r.option_group_count === 1 ? '' : 's'} — ${r.option_group_count - r.option_groups_matching_model} target a material this model does not have, so choosing them changes nothing on screen`
            : `${r.option_group_count} group${r.option_group_count === 1 ? '' : 's'}`,
    },
    {
      key: 'key',
      label: 'Covered by an embed key',
      met: r.covering_key_ids.length > 0,
      consequence: 'A key is how the product reaches someone else\'s website. Without one it is only visible inside the platform.',
      detail:
        r.covering_key_ids.length > 0
          ? `${r.covering_key_ids.length} key${r.covering_key_ids.length === 1 ? '' : 's'} can serve it`
          : 'Create one at Profile → Keys, scoped to this product or its category.',
    },
    {
      key: 'usdz',
      label: 'iPhone AR (USDZ)',
      met: r.has_usdz,
      consequence: 'iOS Quick Look needs a USDZ file. Android AR and the web viewer work from the GLB alone.',
      detail: r.has_usdz ? undefined : 'Optional — needs converting the GLB, which the platform cannot do yet.',
    },
  ];
}

/** How far along, for the list column. Counts only what the merchant can act on today. */
export function readinessSummary(r: ProductEmbedReadiness): { met: number; total: number; blocked: boolean } {
  // USDZ is excluded: nothing in the platform can produce one, so counting it would permanently
  // report every product as incomplete for a reason nobody can fix (the asset pipeline, #321).
  const actionable = requirementsOf(r).filter((q) => q.key !== 'usdz');
  return {
    met: actionable.filter((q) => q.met).length,
    total: actionable.length,
    blocked: !r.has_published_price,
  };
}

/** The two-line snippet a merchant pastes, or null when no key can serve this product yet. */
export async function embedSnippetFor(r: ProductEmbedReadiness, appOrigin: string): Promise<string | null> {
  if (r.covering_key_ids.length === 0) return null;
  // Read the key BY ID rather than re-deciding which keys qualify — the qualifying set came from
  // the same SQL rule the endpoint gates on, and re-filtering here would reintroduce the second
  // opinion this whole derivation exists to avoid. RLS scopes the read to the workspace.
  const { data, error } = await supabase
    .from('material_kai_keys')
    .select('api_key')
    .in('id', r.covering_key_ids)
    .limit(1)
    .maybeSingle();
  if (error || !data?.api_key) return null;
  return [
    `<script src="${appOrigin}/embed/materialkai-product.js" defer></script>`,
    `<materialkai-product api-key="${data.api_key}" product-id="${r.product_id}"></materialkai-product>`,
  ].join('\n');
}
